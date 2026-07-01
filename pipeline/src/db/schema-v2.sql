-- WayTale schema v2: review tips + content refresh tracking

-- Review tips pulled from Google Places or user feedback
CREATE TABLE IF NOT EXISTS landmark_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id   UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('google_places', 'tripadvisor', 'internal', 'wikipedia_edit')),
  review_text   TEXT NOT NULL,
  author        TEXT,
  rating        SMALLINT,
  review_date   DATE,
  tip_extracted TEXT,          -- LLM-extracted actionable tip from the review
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_landmark_idx ON landmark_reviews (landmark_id);
CREATE INDEX IF NOT EXISTS reviews_source_idx   ON landmark_reviews (source);

-- Tracks each content refresh attempt: what changed, what was re-generated
CREATE TABLE IF NOT EXISTS content_refresh_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id     UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  triggered_at    TIMESTAMPTZ DEFAULT NOW(),
  triggered_by    TEXT DEFAULT 'admin',
  wikipedia_rev   TEXT,         -- Wikipedia revision ID at time of fetch
  prev_wiki_rev   TEXT,         -- previous revision ID (null = first fetch)
  wiki_changed    BOOLEAN DEFAULT false,
  reviews_added   INTEGER DEFAULT 0,
  scripts_regen   BOOLEAN DEFAULT false,
  new_content_id  UUID REFERENCES landmark_content(id),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  error           TEXT
);

CREATE INDEX IF NOT EXISTS refresh_log_landmark_idx ON content_refresh_log (landmark_id);
CREATE INDEX IF NOT EXISTS refresh_log_time_idx     ON content_refresh_log (triggered_at DESC);

-- Store Wikipedia revision ID per landmark so we know when it changed
ALTER TABLE landmark_facts ADD COLUMN IF NOT EXISTS wiki_revision TEXT;
