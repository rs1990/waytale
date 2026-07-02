# WayTale Database Schema & Queries

PostgreSQL 16 + PostGIS 3.4

---

## Schema Overview

### landmarks
Core landmark records — immutable once created.

```sql
CREATE TABLE landmarks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wikidata_id  TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  location     GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
                 ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
               ) STORED,
  category     TEXT[],
  country_code TEXT NOT NULL DEFAULT 'US',
  language     TEXT NOT NULL DEFAULT 'en',
  wikipedia_en TEXT,
  image_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX landmarks_location_idx ON landmarks USING GIST (location);
CREATE INDEX landmarks_wikidata_idx ON landmarks (wikidata_id);
```

**Key Fields:**
- `location` — PostGIS POINT for spatial queries (auto-generated from lat/lon)
- `wikipedia_en` — Page title for Wikipedia API calls
- `category` — Array of tags (e.g., `['monument', 'statue', 'historic']`)

**Queries:**
```sql
-- All landmarks in a region
SELECT * FROM landmarks WHERE country_code = 'US' ORDER BY name;

-- Landmarks within 5km of a point (FAST - uses GIST index)
SELECT id, name, latitude, longitude,
       ST_Distance(location, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography) AS dist_m
FROM landmarks
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography, 5000)
ORDER BY dist_m
LIMIT 20;

-- By Wikidata ID
SELECT * FROM landmarks WHERE wikidata_id = 'Q44440';
```

---

### landmark_content
Pre-generated narration scripts + audio URLs. Versioned + status-tracked.

```sql
CREATE TABLE landmark_content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id  UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('ambient', 'deep_dive')),
  variant      TEXT,   -- 'history' | 'geography' | 'culture' (NULL for ambient)
  length       TEXT CHECK (length IN ('short', 'long')),
  script       TEXT NOT NULL,
  fact_type    TEXT NOT NULL CHECK (fact_type IN ('verified', 'legend', 'mixed')),
  sources      JSONB  NOT NULL DEFAULT '[]',
  audio_url    TEXT,
  tts_provider TEXT,   -- 'polly' | 'google' | 'elevenlabs'
  language     TEXT NOT NULL DEFAULT 'en',
  region       TEXT NOT NULL DEFAULT 'US',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'reviewed', 'published', 'rejected', 'archived')),
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX content_landmark_idx ON landmark_content (landmark_id);
CREATE INDEX content_status_idx   ON landmark_content (status);
CREATE INDEX content_type_idx     ON landmark_content (content_type, variant, length);
```

**Key Fields:**
- `status` — Editorial workflow: pending → reviewed → published (old versions archived)
- `variant` — Content flavor: history / geography / culture (NULL = ambient narration)
- `fact_type` — Verified facts vs. legend content (UI shows badges for legend)
- `sources` — JSONB array of `{source: string, url: string}`
- `version` — Auto-incremented per landmark+content_type+variant
- `audio_url` — CDN path to pre-generated audio file

**Queries:**
```sql
-- All published content for a landmark
SELECT * FROM landmark_content
WHERE landmark_id = 'uuid' AND status = 'published'
ORDER BY content_type, variant;

-- Pending content awaiting review
SELECT lc.*, l.name AS landmark_name FROM landmark_content lc
JOIN landmarks l ON l.id = lc.landmark_id
WHERE lc.status = 'pending'
ORDER BY lc.created_at DESC;

-- Content with legend/folklore
SELECT * FROM landmark_content
WHERE landmark_id = 'uuid' AND fact_type IN ('legend', 'mixed');

-- Content count summary per landmark
SELECT landmark_id, content_type,
       COUNT(*) FILTER (WHERE status = 'published') AS published,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending
FROM landmark_content
GROUP BY landmark_id, content_type;

-- Latest version per content type
SELECT DISTINCT ON (landmark_id, content_type) *
FROM landmark_content
WHERE status IN ('published', 'reviewed')
ORDER BY landmark_id, content_type, version DESC;
```

---

### landmark_facts
Raw sourced facts before LLM processing. Audit trail.

```sql
CREATE TABLE landmark_facts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,  -- 'wikipedia' | 'wikidata' | 'wikivoyage'
  source_url  TEXT,
  raw_text    TEXT NOT NULL,
  fact_type   TEXT NOT NULL DEFAULT 'verified'
                CHECK (fact_type IN ('verified', 'legend')),
  wiki_revision TEXT,  -- Wikipedia revision ID (for detecting updates)
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX facts_landmark_idx ON landmark_facts (landmark_id);
```

**Purpose:** Stores original facts before LLM rewrites them. Traceable back to source.

**Queries:**
```sql
-- All facts for a landmark
SELECT * FROM landmark_facts WHERE landmark_id = 'uuid' ORDER BY fetched_at DESC;

-- Facts from specific source
SELECT * FROM landmark_facts WHERE landmark_id = 'uuid' AND source = 'wikipedia';

-- Detect legend content
SELECT * FROM landmark_facts WHERE landmark_id = 'uuid' AND fact_type = 'legend';

-- Latest fetch per source
SELECT DISTINCT ON (landmark_id, source) *
FROM landmark_facts
ORDER BY landmark_id, source, fetched_at DESC;
```

---

### landmark_reviews (v2)
Review tips pulled from Google Places or other review APIs.

```sql
CREATE TABLE landmark_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id   UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('google_places', 'tripadvisor', 'internal', 'wikipedia_edit')),
  review_text   TEXT NOT NULL,
  author        TEXT,
  rating        SMALLINT,
  review_date   DATE,
  tip_extracted TEXT,  -- Concrete actionable tip (no opinions)
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX reviews_landmark_idx ON landmark_reviews (landmark_id);
CREATE INDEX reviews_source_idx   ON landmark_reviews (source);
```

**Key Field:** `tip_extracted` — Only concrete facts ("last entry 4:30pm"), opinions discarded.

**Queries:**
```sql
-- Recent tips for a landmark
SELECT * FROM landmark_reviews
WHERE landmark_id = 'uuid'
ORDER BY fetched_at DESC
LIMIT 10;

-- Concrete tips that influenced narration
SELECT * FROM landmark_reviews
WHERE landmark_id = 'uuid' AND tip_extracted IS NOT NULL;
```

---

### content_refresh_log (v2)
Audit trail of every content refresh attempt.

```sql
CREATE TABLE content_refresh_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id     UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  triggered_at    TIMESTAMPTZ DEFAULT NOW(),
  triggered_by    TEXT DEFAULT 'admin',
  wikipedia_rev   TEXT,   -- Current Wikipedia revision ID
  prev_wiki_rev   TEXT,   -- Previous revision (NULL = first run)
  wiki_changed    BOOLEAN DEFAULT false,
  reviews_added   INTEGER DEFAULT 0,
  scripts_regen   BOOLEAN DEFAULT false,
  new_content_id  UUID REFERENCES landmark_content(id),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error           TEXT
);

CREATE INDEX refresh_log_landmark_idx ON content_refresh_log (landmark_id);
CREATE INDEX refresh_log_time_idx     ON content_refresh_log (triggered_at DESC);
```

**Purpose:** Track what triggered updates, what changed, whether scripts were re-generated.

**Queries:**
```sql
-- Refresh history for a landmark
SELECT * FROM content_refresh_log
WHERE landmark_id = 'uuid'
ORDER BY triggered_at DESC
LIMIT 20;

-- Updates where Wikipedia article changed
SELECT * FROM content_refresh_log
WHERE wiki_changed = true
ORDER BY triggered_at DESC;

-- Refreshes that regenerated scripts
SELECT * FROM content_refresh_log
WHERE scripts_regen = true
ORDER BY triggered_at DESC;

-- Recent failed refreshes (to investigate)
SELECT * FROM content_refresh_log
WHERE status = 'failed'
ORDER BY triggered_at DESC
LIMIT 10;
```

---

## Common Queries

### App: Get all content for a landmark

```sql
SELECT * FROM landmark_content
WHERE landmark_id = $1 AND status = 'published'
ORDER BY content_type, COALESCE(variant, ''), length;
```

### App: Nearby landmarks (main map view)

```sql
SELECT id, wikidata_id, name, description, latitude, longitude, image_url,
       ST_Distance(location, $1::geography) AS distance_m,
       COUNT(lc.id) FILTER (WHERE lc.status = 'published') AS content_count
FROM landmarks l
LEFT JOIN landmark_content lc ON lc.landmark_id = l.id
WHERE ST_DWithin(l.location, $1::geography, $2 * 1000)
GROUP BY l.id
ORDER BY distance_m
LIMIT $3;
```

Parameters: `$1` = geography point, `$2` = radius_km, `$3` = limit

### Admin: Pending content with published diff

```sql
SELECT
  lc.id, lc.content_type, lc.variant, lc.fact_type,
  lc.script, lc.sources, lc.audio_url, lc.version,
  l.name, l.id AS landmark_id,
  pub.script AS published_script
FROM landmark_content lc
JOIN landmarks l ON l.id = lc.landmark_id
LEFT JOIN landmark_content pub ON (
  pub.landmark_id = lc.landmark_id
  AND pub.content_type = lc.content_type
  AND (pub.variant = lc.variant OR (pub.variant IS NULL AND lc.variant IS NULL))
  AND pub.status = 'published'
)
WHERE lc.status = 'pending'
ORDER BY l.name, lc.content_type;
```

### Admin: Publish a piece of content (with auto-archive)

```sql
BEGIN;

-- Archive current published version
UPDATE landmark_content SET status = 'archived', updated_at = NOW()
WHERE landmark_id = $1 AND content_type = $2
  AND (variant = $3 OR (variant IS NULL AND $3::text IS NULL))
  AND status = 'published';

-- Publish new version
UPDATE landmark_content SET status = 'published', updated_at = NOW()
WHERE id = $4;

COMMIT;
```

Parameters: `$1` = landmark_id, `$2` = content_type, `$3` = variant, `$4` = new content id

---

## Indexing Strategy

### Why GIST for Geospatial?

**GIST (Generalized Search Tree)** is optimized for spatial data:
- Nearby queries: `ST_DWithin(location, point, radius)` → O(log n)
- Efficiently handles PostGIS geography types
- Better cache locality than BRIN for small-to-medium datasets

```sql
CREATE INDEX landmarks_location_idx ON landmarks USING GIST (location);
```

**Alternative: BRIN**
- Better for very large tables (>10M rows)
- Lower memory footprint
- Less CPU per query, but slower per-query
- Recommended when landmarks exceed 100k

### Key Indexes

| Column | Index Type | Why |
|--------|-----------|-----|
| `landmark_content.landmark_id` | B-tree | FK lookups, filter by landmark |
| `landmark_content.status` | B-tree | Frequent "WHERE status = 'published'" |
| `landmark_content(content_type, variant)` | B-tree composite | Filter by type + variant |
| `landmark_reviews.landmark_id` | B-tree | FK lookups for review display |
| `landmark_facts.landmark_id` | B-tree | FK lookups for audit trail |
| `content_refresh_log(triggered_at DESC)` | B-tree | Most recent refreshes first |

---

## Data Integrity

### Foreign Keys

All FKs have `ON DELETE CASCADE`:
- Delete a landmark → deletes all its content, facts, reviews, refresh logs
- Safe for testing; safe in production with care

### Constraints

- `landmark_content.status` limited to valid states (no garbage data)
- `fact_type` in ('verified', 'legend', 'mixed') — cannot accidentally create invalid types
- `content_type` in ('ambient', 'deep_dive') — fixed vocabulary

### Transactions

Content publishing uses explicit transactions:

```sql
BEGIN;
  -- Archive old
  UPDATE landmark_content SET status = 'archived' WHERE ...;
  -- Publish new
  UPDATE landmark_content SET status = 'published' WHERE ...;
COMMIT;
```

Ensures both happen atomically. If server crashes mid-publish, old version stays published (safe).

---

## Maintenance

### Backup Strategy

```bash
# Full backup
pg_dump waytale > waytale_full_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump -Fc waytale > waytale_$(date +%Y%m%d).dump

# Restore
pg_restore -d waytale waytale_2026-07-02.dump
```

### Cleanup: Archive Old Content

Archived content grows over time. Periodic cleanup:

```sql
DELETE FROM landmark_content
WHERE status = 'archived'
AND created_at < NOW() - INTERVAL '90 days'
AND (
  SELECT COUNT(*) FROM landmark_content lc2
  WHERE lc2.landmark_id = landmark_content.landmark_id
    AND lc2.status = 'published'
) > 0;
```

Keep 90+ days for audit trail, but only if newer published version exists.

### Query Performance

Check slow queries:

```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- 1s threshold
SELECT pg_reload_conf();

-- View slow logs
tail -f /var/log/postgresql/postgresql.log | grep "duration:"
```

### Statistics

Keep query planner informed:

```sql
ANALYZE landmarks;
ANALYZE landmark_content;
```

Or enable auto-analyze:

```sql
ALTER TABLE landmarks SET (autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE landmark_content SET (autovacuum_analyze_scale_factor = 0.01);
```

---

## Replication (Multi-Region)

For production at scale:

```
Write Primary (us-west-2)
  ↓ replication
Read Replicas (us-east-1, eu-west-1)
  ↓ used by backend load balancers
```

**Setup (AWS RDS):**
1. Create primary DB instance
2. Create read replica (multi-region)
3. Point backend read queries to replica (connection pooling)
4. Write queries always hit primary

```js
// backend connection pooling
const primary = new Pool({ connectionString: process.env.DATABASE_URL_WRITE });
const replica = new Pool({ connectionString: process.env.DATABASE_URL_READ });

// In Express routes
app.get('/landmarks/nearby', async (req, res) => {
  const result = await replica.query(...);  // read from replica
});

app.post('/admin/content/:id/publish', async (req, res) => {
  await primary.query(...);  // write to primary
});
```

---

## PostGIS Cheat Sheet

```sql
-- Distance between two points (meters)
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
  ST_SetSRID(ST_MakePoint(-122.4783, 37.8199), 4326)::geography
);

-- Points within radius (km)
SELECT * FROM landmarks
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
  2000  -- 2km in meters
);

-- Create geography from coordinates
ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography

-- Nearest 5 landmarks to a point (ordered by distance)
SELECT id, name,
       ST_Distance(location, point) AS dist_m
FROM landmarks
ORDER BY location <-> point
LIMIT 5;

-- Landmarks along a linestring (polyline)
SELECT * FROM landmarks
WHERE ST_DWithin(
  location,
  ST_GeomFromText('LINESTRING(...)', 4326)::geography,
  1000  -- 1km buffer
);
```
