# WayTale System Architecture

## Overview

WayTale is a **three-tier system** separated by concern:

1. **Content Pipeline (Offline, Admin-only)** — Generates and caches narration
2. **Backend API (Always-on)** — Serves cached content + spatial queries
3. **Mobile App (Runtime)** — GPS-driven playback + user experience

The key insight: **generate once, serve infinitely.** Content is frozen at publish time, not generated per-request.

---

## Phase 0: Content Pipeline

### Purpose
Transform raw sourced facts into publishable audio narration, with editorial review step.

### Data Flow

```
Wikidata SPARQL API
  └─ Fetch landmark metadata (coords, Wikipedia link, image)
     + Get Wikipedia article title

Wikipedia REST API
  └─ Fetch page summary + full extract
     + Detect if content contains legend/folklore

Google Places API (optional)
  └─ Fetch recent reviews for the landmark
     + Extract ONLY concrete tips (hours, prices, access)
     + Discard pure opinions ("amazing!" → thrown away)

All sourced facts + tips
  └─ Claude AI (LLM)
     ├─ Given ONLY the sourced facts + tips
     ├─ Draft 4 narration variants:
     │  ├─ ambient_short (60–90s for geofence trigger)
     │  ├─ deep_dive_history (3–5 min)
     │  ├─ deep_dive_geography (3–5 min)
     │  └─ deep_dive_culture (3–5 min)
     └─ Tag each as fact_type: verified | legend | mixed

Scripts
  └─ Amazon Polly TTS
     ├─ Generate audio file (once per script)
     ├─ Tier quality: Neural (high-traffic) / Standard (long-tail)
     └─ Store on local disk or S3 CDN

Persist to PostgreSQL
  └─ landmark_content table
     ├─ status: 'pending' (awaiting review)
     ├─ scripts, audio_url, fact_type, sources (JSON)
     └─ version field (allows content updates without losing old versions)

Admin Review (CLI or Web Dashboard)
  └─ Read pending scripts + sources
     ├─ Approve → status: 'reviewed'
     ├─ Publish → status: 'published' (old version archived)
     └─ Reject → status: 'rejected' (stays in DB for audit trail)
```

### Key Design: No Live Generation

❌ **Don't do this:**
```js
app.get('/landmark/:id/narration', async (req, res) => {
  // WRONG: new LLM call per request
  const facts = await fetchWikipedia(req.params.id);
  const script = await callClaude(facts);  // SLOW + EXPENSIVE
  const audio = await callPolly(script);   // EVERY TIME
  res.send(audio);
});
```

✅ **Do this:**
```js
app.get('/landmark/:id/content', async (req, res) => {
  // CORRECT: read from cache
  const content = await db.query(
    'SELECT * FROM landmark_content WHERE landmark_id = $1 AND status = $2',
    [req.params.id, 'published']
  );
  res.json(content);  // instant
});
```

**Result:** 
- 1st user @ landmark: LLM + TTS costs = fixed price
- 100,000th user @ same landmark: cost = $0 (just serving a file)

### Refresh Cycle (Phase 2+)

Admin clicks "Pull Updates" — system:

1. **Check Wikipedia revision** — if article changed since last fetch, pull new text
2. **Fetch review tips** — Google Places reviews (extract concrete facts only)
3. **If anything changed:**
   - Re-draft narration with new facts injected
   - Store new version as status='pending'
   - OLD published content stays live (no user-facing change)
4. **Admin reviews** the diff (old script vs. new script) + sources
5. **Publish** when confident — old version archived

This ensures users never see unreviewed content.

---

## Phase 1: Backend API

### Tech: Express.js + PostgreSQL + PostGIS

### Responsibilities

1. **Spatial queries** — "What landmarks are near this GPS point?"
2. **Route scoring** — "Which route option has the best balance of time + landmarks + crowds?"
3. **Content serving** — "Give me the published narration for landmark X"
4. **Admin API** — Content refresh + review workflow

### Database: PostGIS Spatial Indexing

**Landmarks table** has a `location` column (PostGIS POINT geography):

```sql
CREATE INDEX landmarks_location_idx ON landmarks USING GIST (location);
```

**GIST** = Generalized Search Tree. Enables fast radius queries:

```sql
SELECT * FROM landmarks
WHERE ST_DWithin(location, $1::geography, 2000)  -- 2km radius
ORDER BY location <-> $1  -- closest first
LIMIT 20;
```

This is **O(log n)**, not O(n). Critical for real-time app queries.

### API Endpoints

#### Mobile App (Public)

**GET /landmarks/nearby?lat=X&lon=Y&radius=5**
- Spatial query: all landmarks within 5km of user position
- Returns landmark metadata + content_count (indicates if audio available)

**GET /landmarks/:id/content?type=ambient&variant=history**
- Fetch published content for a landmark
- Filter by content_type + variant
- Returns script + audio_url + sources

**POST /route/score**
- Input: origin lat/lon, destination lat/lon, departure time
- Stub provider (Phase 2 will swap in real Directions API)
- Returns 2–3 route options scored by: time + landmark count + crowd heuristic
- No live data → time-of-day/day-of-week heuristic for crowd penalty

#### Admin (Key-gated)

**GET /admin/landmarks**
- Table view: all landmarks, published/pending counts, last refresh time

**GET /admin/pending**
- List all pending content items with diff vs. current live version (word-level)

**POST /admin/landmark/:id/refresh**
- Trigger refresh for single landmark
- Calls pipeline/src/refresh.js dynamically

**POST /admin/refresh-all**
- Refresh all landmarks (watch Wikipedia revision IDs + Google Places)

**POST /admin/content/:id/approve|publish|reject**
- Status transitions: pending → reviewed → published (archived old)

### Connection Pool

```js
// backend/src/db/client.js
import pg from 'pg';
const db = new Pool({ connectionString: process.env.DATABASE_URL });
```

Keep pool connection open for lifetime of Express process. Never call `pool.end()` per-request.

---

## Phase 1: Mobile App (React Native / Expo)

### Tech: React Native (Expo) + Expo Location + react-native-maps

### Screen Flow

```
AppNavigator (Stack Navigator)
├─ MapScreen (initial route)
│  └─ Shows map + nearby landmarks (PostGIS query every 5s as user moves)
│     └─ Tap landmark pin → navigate to LandmarkDetailScreen
│
├─ LandmarkDetailScreen
│  └─ Ambient narration + 3 deep-dive tabs (history / geography / culture)
│     └─ Tap "Plan Route" → RouteScreen
│
├─ RouteScreen
│  └─ Input: destination as lat,lon (autocomplete future work)
│     Output: 2–3 scored routes from /route/score
│     └─ Select route → TourScreen
│
└─ TourScreen (live tour mode)
   └─ Watches GPS, triggers ambient narration at geofence (250m radius)
      └─ Stationary detection: auto-pause/resume narration
      └─ "Tell me more" → back to LandmarkDetailScreen
```

### Real-Time Location

```js
// services/location.js
export async function watchLocation(onLocation, onError) {
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 20,  // update every 20m movement
      timeInterval: 5000,     // or every 5s
    },
    (loc) => onLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude })
  );
}
```

**Not polling** → event-driven. When user moves 20m, callback fires immediately.

### Geofence Triggers

In `TourScreen.js`:

```js
function checkGeofence(userLat, userLon, landmark) {
  const TRIGGER_RADIUS_M = 250;
  return isWithinRadius(userLat, userLon, landmark.latitude, landmark.longitude, TRIGGER_RADIUS_M);
}
```

Uses **Haversine formula** (no PostGIS needed on device):

```
distance = R * 2 * atan2(√a, √(1-a))
  where a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
```

O(1) per landmark, runs every GPS update. Triggers narration when user enters 250m zone.

### Audio Playback

```js
// services/audio.js
import { Audio } from 'expo-av';

await playAudio(audioUrl);    // streams from S3 or local file
await pauseAudio();
await resumeAudio();
await stopAudio();
```

Audio continues in background (config: `staysActiveInBackground: true`).

---

## Data Model: Content Versioning

### Why Version Content?

Users might have old versions cached. Instead of overwriting, we **version**:

```sql
landmark_content:
  id: uuid
  landmark_id: uuid
  content_type: 'ambient' | 'deep_dive'
  variant: 'history' | 'geography' | 'culture' | null
  version: integer (auto-incremented)
  status: 'pending' | 'reviewed' | 'published' | 'archived' | 'rejected'
```

**Scenario:**
1. v1 (published): "Statue of Liberty was built in 1886..."
2. Admin finds error, pulls updates
3. v2 (pending): "...was built in 1885..." (typo fix)
4. Admin approves + publishes v2
5. v1 auto-archived (searchable for audit trail)
6. App sees only v2 (published)

---

## Deployment Model (Future)

### Cloud Architecture

```
CDN (CloudFront)
  └─ Serves static audio files from S3

S3
  └─ Stores audio files (indexed by landmark_id + variant)

RDS PostgreSQL
  └─ Managed database (auto-backup, replication)

Lambda (or EC2)
  └─ Express backend (stateless, auto-scales with requests)

GitHub Actions
  └─ CI/CD: test pipeline → deploy backend → publish new content
```

### Environment Tiers

```
Development    (localhost:3001, docker-compose)
  └─ Local PostgreSQL, logs to terminal

Staging        (staging.waytale.com)
  └─ RDS dev instance, test admin workflow

Production     (app.waytale.com)
  └─ RDS prod instance, CloudFront CDN, Lambda auto-scale
```

---

## Scaling Considerations

### Database Scaling

**PostGIS query:** Nearby landmarks at user position (10–20ms with GIST index)

At **1 million concurrent users:**
- Each user queries `/landmarks/nearby` every 10 seconds
- = 100,000 queries/sec
- **Solution:** Read replicas (RDS) + connection pooling (PgBouncer)

### Content Pipeline Scaling

**Refresh all landmarks** (10 → 10,000 landmarks):
- Sequential: 3 min × 10,000 = 30,000 min (20 days) ❌
- Parallel: 50 landmarks in parallel = 6 hours ✅

**Solution:** Add a job queue (Celery, Bull.js) to refresh in parallel.

### TTS Scaling

**Amazon Polly:** $0.02 per 100k words

At launch: $0.02 (10 landmarks × 1000 words each)  
At 1M users: Still $0.02 (same cached audio)  
At 10,000 landmarks: $2.00

**Tiered quality:** Premium voices (Neural, $0.10 per 100k) for flagship landmarks, Standard ($0.02) for long-tail.

---

## Security Model

### API Keys

**Admin API:** Key-gated with `X-Admin-Key` header
- Backend checks `process.env.ADMIN_API_KEY`
- Never expose to frontend or mobile app

**Claude API key:** Server-side only (backend `env` variable)
- Never in JavaScript bundle

**AWS credentials:** Server-side only
- Backend assumes IAM role (no hardcoded keys in production)

### Database

**Content** served by status (only 'published' returned to app)
- Pending content never exposed via GET /landmarks/:id/content

**Secrets:**
- `.env` files **gitignored**
- RDS encrypted at rest
- Backups encrypted (AWS default)

### GPS Data

**Never stored.** Location updates are transient:
- Used to query `/landmarks/nearby`
- Discarded after response
- No location history logged

---

## Failure Modes & Recovery

### Network Down (App)
- Offline mode: use pre-downloaded itinerary cache (Phase 5)
- No narration triggered until back online

### PostgreSQL Outage (Backend)
- Connection pool rejects new requests → 503
- Clients retry with exponential backoff
- Read replicas available for failover (RDS)

### Wikipedia API Rate Limit
- Pipeline backs off: wait 60s, retry
- Admin dashboard shows refresh status

### LLM API Error
- Pipeline catches, logs error, moves to next landmark
- Admin sees "failed" in refresh log

### TTS Service Down
- Audio files already cached from previous runs
- App serves audio from cache indefinitely
- New refresh waits for TTS to come back online

---

## Metrics & Observability

### Key Metrics to Track

```
App Layer
  └─ Geofence trigger latency (should be <1s)
  └─ Audio playback errors
  └─ GPS accuracy (HDOP)

API Layer
  └─ /landmarks/nearby query time (should be <50ms)
  └─ /route/score time
  └─ Error rate (401, 404, 5xx)

Database
  └─ Connection pool utilization
  └─ PostGIS spatial index hit rate
  └─ Replication lag (if replicas used)

Pipeline
  └─ Refresh duration per landmark
  └─ LLM API latency + tokens
  └─ TTS cost per landmark
```

### Logs

```
Backend: logs/backend.log
Admin: logs/admin.log
Docker: docker logs waytale-db-1 | docker logs waytale-redis-1
```

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **PostgreSQL + PostGIS not MongoDB** | Spatial indexing (GIST) is critical. MongoDB geo queries are slower + less mature. |
| **Pre-generated cache, not live LLM** | Cost scales with *landmarks*, not *users*. 100k users at one landmark = 1 TTS call. |
| **React Native (Expo), not Flutter** | Faster dev iteration, no build step, easier to share web admin UI logic. |
| **Amazon Polly, not Google Cloud TTS** | Cheaper for long-tail landmarks, Neural voices for premium content. |
| **Wikidata SPARQL + Wikipedia REST** | Wikidata = structured coords + metadata; Wikipedia = narrative facts. Complementary. |
| **Content versioning + status workflow** | Protects old content, enables admin review, audit trail for compliance. |
| **Haversine formula on device** | Fast O(1), no server round-trip for every geofence check. |

---

## Future Extensions

1. **Live crowd data** (Google Popular Times API)
   - Replace heuristic with real-time estimates
   - Adjust route scoring dynamically

2. **User-generated annotations** (Phase 6)
   - Append user tips to landmark content
   - Moderated crowd-sourced enrichment

3. **Multi-language support** (Phase Int'l)
   - Wikidata in local languages (richer than English)
   - Per-region TTS voices
   - Per-country data providers

4. **Subscription tiers** (Phase 5)
   - Free: ambient narration only
   - Premium: deep-dive + offline packs
   - B2B: white-label for rental car companies

5. **Offline-first sync** (Phase 5)
   - Download itinerary before trip
   - Sync landmarks visited back to cloud
   - Trip summary + sharing
