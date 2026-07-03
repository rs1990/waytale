-- WayTale schema v3: user accounts (subscription groundwork) + sponsors/local recommendations (ad groundwork)

-- Users: backend auth scaffold. No app UI wired to this yet — this exists so
-- premium-content gating and RevenueCat/Stripe entitlements have somewhere
-- to attach once a payment provider is actually connected.
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- Sponsors: businesses paying for placement (affiliate links, map pins,
-- nearby-recommendation cards). Kept separate from landmark_content so ad
-- content never mixes with narration content in a single query/table.
CREATE TABLE IF NOT EXISTS sponsors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  category     TEXT,          -- 'restaurant' | 'hotel' | 'tour_operator' | etc.
  website_url  TEXT,
  contact_email TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Local recommendations: sponsored (or organic) nearby-business cards shown
-- on LandmarkDetailScreen. Same pending/reviewed/published gate as
-- landmark_content so sponsored content gets the same human review before
-- it ships — protects against FTC disclosure issues and low-quality placements.
CREATE TABLE IF NOT EXISTS local_recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landmark_id   UUID NOT NULL REFERENCES landmarks(id) ON DELETE CASCADE,
  sponsor_id    UUID REFERENCES sponsors(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  affiliate_url TEXT,
  image_url     TEXT,
  sponsored     BOOLEAN NOT NULL DEFAULT false,  -- must be surfaced as "Sponsored" in UI when true
  priority      INTEGER NOT NULL DEFAULT 0,      -- higher = shown first among published items
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'published', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recommendations_landmark_idx ON local_recommendations (landmark_id);
CREATE INDEX IF NOT EXISTS recommendations_status_idx   ON local_recommendations (status);
