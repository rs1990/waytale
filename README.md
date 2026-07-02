# WayTale — GPS-Based Landmark Audio Tour App

An AI-powered mobile app that narrates the geography, history, and culture of landmarks as users travel. Built on a **pre-generated content pipeline** (Wikipedia → Claude → TTS cache) that ensures fast, accurate, and sourced narration at scale.

**Live repo:** https://github.com/rs1990/waytale

---

## Features

### Phase 1 (Current)
- **Real-time GPS tracking** — Expo Geolocation + MapView
- **Nearby landmarks** — PostGIS spatial queries from a seeded cache
- **Smart route scoring** — 2–3 route options with time + landmark count + crowd heuristic
- **Live geofence triggers** — Audio narration plays when entering 250m radius of a landmark
- **Deep-dive content** — 3–5 min narration in history / geography / culture tabs
- **Source citations** — Every fact linked to Wikipedia/Wikidata with clickable links
- **Legend tagging** — Folklore/legend content clearly marked

### Phase 2–5 (Roadmap)
- Offline itinerary downloads (gated by subscription tier)
- Interest-based personalization (history, culture, food, nature)
- Admin refresh system pulling Wikipedia updates + Google Places review tips
- Subscription tiers (freemium + premium content)
- Regional expansion (international landmarks, multi-language support)

---

## Architecture

### High-Level Data Flow

```
User's Phone (Expo)
    ↓ GPS + route intent
Backend (Express + PostGIS)
    ↓ spatial queries + route scoring
Pre-Generated Content Cache (PostgreSQL)
    ↓ [published status only]
App displays narration + audio
```

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 0: Content Pipeline (Admin-only, runs offline)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Wikidata SPARQL          Wikipedia REST API        Reviews API  │
│       ↓                          ↓                      ↓        │
│  [Landmark metadata]   [Sourced facts + text]   [Concrete tips]  │
│       └──────────────────────────┬──────────────────────┘        │
│                                  ↓                              │
│                    Claude AI (LLM narration draft)               │
│                    - Injects facts + tips only                   │
│                    - Tags: fact_type (verified|legend|mixed)    │
│                    - Outputs 4 script variants                   │
│                                  ↓                              │
│                      Amazon Polly TTS Synthesis                  │
│                      (Premium: Neural, Long-tail: Standard)      │
│                                  ↓                              │
│              PostgreSQL Content Cache (status: pending)          │
│              (Admin reviews scripts + sources)                   │
│                                  ↓                              │
│            Admin Dashboard (http://localhost:4000)              │
│            [Approve / Publish / Reject]                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Runtime: Mobile App + Backend                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Expo App (React Native)      Backend (Node.js Express)         │
│  ├─ MapScreen                 ├─ GET /landmarks/nearby          │
│  ├─ RouteScreen              ├─ POST /route/score               │
│  ├─ LandmarkDetailScreen     └─ GET /landmarks/:id/content      │
│  └─ TourScreen                                                   │
│       ↓                                ↓                         │
│   GPS position            PostGIS spatial queries               │
│   Route selection         Pre-generated cache                   │
│   Geofence triggers    (status: published only)                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Tech | Why |
|-----------|------|-----|
| **Mobile** | React Native (Expo) | Cross-platform iOS/Android, fast iteration |
| **Maps/GPS** | Expo Location, react-native-maps | Native device integration, no build needed |
| **Backend** | Express.js + Node.js | Lightweight, easy async, ideal for spatial queries |
| **Database** | PostgreSQL + PostGIS | Spatial indexing, GIST indexes for fast geofence queries |
| **Cache** | Redis (optional) | Future: crowd-level caching, session management |
| **LLM** | Claude (Anthropic) | Sourced-fact drafting only (no invention) |
| **TTS** | Amazon Polly | Cost-efficient at scale, tiered quality (Neural/Standard) |
| **Sources** | Wikipedia + Wikidata SPARQL | Verifiable, public domain, rich metadata |
| **Admin UI** | React + Vite | Fast dev server, word-level diff viewer |

---

## Project Structure

```
WayTale/
├── app/                          # React Native Expo app
│   ├── src/
│   │   ├── screens/              # Map, Route, Tour, LandmarkDetail
│   │   ├── services/             # API, GPS, Audio, Location
│   │   ├── hooks/                # useLocation, useNearbyLandmarks
│   │   ├── components/           # LandmarkPin, AudioPlayer
│   │   └── navigation/           # AppNavigator (stack + bottom tabs)
│   ├── App.js
│   ├── app.json                  # Expo config + permissions
│   └── package.json
│
├── backend/                      # Express API server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── landmarks.js      # GET /landmarks/nearby, :id, :id/content
│   │   │   ├── routes.js         # POST /route/score
│   │   │   └── admin.js          # /admin/* endpoints (key-gated)
│   │   ├── middleware/
│   │   │   └── cors.js           # CORS for localhost:19006 (Expo web)
│   │   └── index.js              # Express app + listen
│   └── package.json
│
├── pipeline/                     # Content generation (offline, admin-only)
│   ├── src/
│   │   ├── sources/
│   │   │   ├── wikidata.js       # SPARQL landmark fetching
│   │   │   ├── wikipedia.js      # REST API fact fetching + legend detection
│   │   │   └── reviews.js        # Google Places + Wikipedia revision tracking
│   │   ├── llm/
│   │   │   └── draft-narration.js # Claude: facts → scripts
│   │   ├── tts/
│   │   │   └── polly.js          # Amazon Polly: scripts → audio files
│   │   ├── db/
│   │   │   ├── client.js         # pg Pool connection
│   │   │   ├── schema.sql        # v1: landmarks, content, facts
│   │   │   └── schema-v2.sql     # v2: reviews, refresh_log
│   │   ├── pipeline.js           # Main orchestrator
│   │   └── refresh.js            # Refresh (Wikipedia change detection + re-draft)
│   ├── scripts/
│   │   ├── seed-landmarks.js     # 10 US landmark IDs
│   │   ├── run-pipeline.js       # Batch runner (all or single landmark)
│   │   └── admin-review.js       # CLI script approval tool
│   └── package.json
│
├── admin/                        # React web dashboard
│   ├── src/
│   │   ├── App.jsx               # Tabs: Landmarks, Pending, Refresh Log
│   │   ├── api.js                # Admin API client (key-gated)
│   │   └── components/
│   │       ├── StatusBadge.jsx
│   │       └── DiffView.jsx       # Word-level diff renderer
│   ├── vite.config.js
│   ├── index.html
│   └── package.json
│
├── docker-compose.yml            # Postgres (arm64 + schema auto-init) + Redis
├── launch.sh                      # One-command launcher
├── README.md                      # This file
├── ARCHITECTURE.md               # Detailed system design
├── API.md                        # REST endpoint reference
├── DATABASE.md                   # Schema, indexes, queries
├── DEPLOYMENT.md                 # Production setup guide
└── .gitignore
```

---

## Quick Start

### Prerequisites
- macOS or Linux (Docker)
- Node.js v22+
- Docker Desktop (running)
- iOS/Android phone with Expo Go app

### 1. Install & Verify

```bash
cd "/Users/maverick/Desktop/Claude dev/WayTale"
npm --version && node --version && docker --version
```

### 2. Configure APIs

```bash
# Fill in pipeline/.env
nano pipeline/.env
# Required: ANTHROPIC_API_KEY=sk-ant-...
# Optional: AWS_*, GOOGLE_PLACES_API_KEY
```

### 3. One-Command Launch

```bash
./launch.sh
```

This:
- Starts Docker + PostgreSQL + Redis
- Polls until DB is ready
- Launches Express backend (port 3001) + admin dashboard (port 4000)
- Shows Expo QR code

**On phone:** Open Expo Go → scan QR → app loads.

### 4. Seed Content (First Time Only)

In a new terminal:

```bash
cd pipeline
node scripts/run-pipeline.js          # ~3 min, fetches 10 landmarks
node scripts/admin-review.js          # approve scripts (press 'a')
```

### 5. Verify

- **App:** Map shows nearby landmarks (if within geofence radius)
- **Backend:** `curl http://localhost:3001/health` → `{"status":"ok"}`
- **Admin:** http://localhost:4000 → see 10 landmarks in table

---

## Key Concepts

### Content Cache Philosophy

**Never generate narration live.** Every user path hits the same landmarks → generate once, cache forever.

Pipeline flow:
1. **Fetch sourced facts** (Wikipedia, Wikidata, reviews)
2. **LLM drafts** scripts from those facts only (no invention)
3. **TTS runs once** per script, store audio file on CDN
4. **Admin reviews** before publishing
5. **App reads published content only** — instant, zero latency

Result: 100,000 users at a landmark = same TTS cost as 10 users.

### Fact vs. Legend Tagging

Every script is tagged:
- `fact_type: "verified"` — all facts from Wikipedia/Wikidata
- `fact_type: "legend"` — contains folklore, clearly marked in narration
- `fact_type: "mixed"` — blend of verified + legend

App UI shows a badge if legend content is present. Users always know what's fact vs. story.

### Admin Refresh Loop

When you click **"🔄 Pull All Updates"** in admin dashboard:
1. Fetches Wikipedia **revision ID** → detects if article changed since last refresh
2. Pulls Google Places **reviews** → extracts concrete tips only (hours, pricing, access)
3. If anything changed: re-drafts narration injecting new tips as sourced facts
4. Stores **new version as pending** — old live content stays live
5. Admin reviews diff, approves/rejects before users see it

---

## Development Guide

### Running Components Separately

```bash
# Terminal 1: containers
docker-compose up

# Terminal 2: backend
cd backend && node src/index.js

# Terminal 3: admin dashboard
cd admin && npm run dev

# Terminal 4: Expo
cd app && npx expo start
# Press 's' for web, 'a' for Android, 'i' for iOS simulator
```

### Testing Geofence Triggers

Landmarks are seeded with real coordinates:
- Statue of Liberty: 40.6892, -74.0445
- Golden Gate Bridge: 37.8199, -122.4783
- etc.

**Simulator approach:** Use Expo Go on your phone, walk near real landmarks, narration should trigger at 250m radius.

**Debug mode:** In `TourScreen.js`, lower `TRIGGER_RADIUS_M` to test without walking far.

### Database Queries

**Find all pending content:**
```sql
SELECT lc.*, l.name FROM landmark_content lc
JOIN landmarks l ON l.id = lc.landmark_id
WHERE lc.status = 'pending'
ORDER BY l.name;
```

**Find landmarks within 2km of a point:**
```sql
SELECT * FROM landmarks
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography, 2000)
ORDER BY location <-> ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography
LIMIT 20;
```

### Environment Variables

**app/.env:**
```
EXPO_PUBLIC_API_URL=http://<your-mac-ip>:3001
```

**backend/.env:**
```
DATABASE_URL=postgresql://waytale:waytale_dev@localhost:5432/waytale
ADMIN_API_KEY=change_me_before_production
```

**pipeline/.env:**
```
ANTHROPIC_API_KEY=sk-ant-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
GOOGLE_PLACES_API_KEY=...
```

---

## API Reference

### Public Endpoints (mobile app)

**GET /landmarks/nearby?lat=37.7&lon=-122.4&radius=5**
```json
{
  "landmarks": [
    {
      "id": "uuid",
      "wikidata_id": "Q8733",
      "name": "Statue of Liberty",
      "latitude": 40.6892,
      "longitude": -74.0445,
      "category": ["monument", "statue"],
      "image_url": "https://...",
      "distance_m": 1200,
      "content_count": 3
    }
  ]
}
```

**GET /landmarks/:id/content?type=ambient&variant=history**
```json
{
  "content": [
    {
      "id": "uuid",
      "content_type": "ambient|deep_dive",
      "variant": "history|geography|culture",
      "length": "short|long",
      "script": "...",
      "fact_type": "verified|legend|mixed",
      "audio_url": "s3://...",
      "sources": [{"source": "wikipedia", "url": "..."}]
    }
  ]
}
```

**POST /route/score**
```json
{
  "origin": {"lat": 37.7, "lon": -122.4},
  "destination": {"lat": 37.8, "lon": -122.5},
  "departureTime": "2026-07-02T14:30:00Z"
}
```
Returns 2–3 scored routes with landmark counts + crowd penalties.

### Admin Endpoints (localhost:4000 → backend /admin/*)

All require `X-Admin-Key` header.

**GET /admin/landmarks** — Table with counts
**GET /admin/pending** — Pending items with diffs
**POST /admin/landmark/:id/refresh** — Trigger refresh
**POST /admin/refresh-all** — Bulk refresh
**POST /admin/content/:id/approve|publish|reject**

See `backend/src/routes/admin.js` for full reference.

---

## Database Schema

### landmarks
```sql
id (UUID, PK)
wikidata_id (TEXT, UNIQUE)
name, description, latitude, longitude
location (PostGIS POINT geography)
wikipedia_en, image_url
country_code, language
created_at, updated_at
```

**Indexes:** `location (GIST)`, `wikidata_id`

### landmark_content
```sql
id (UUID, PK)
landmark_id (FK)
content_type (ambient | deep_dive)
variant (history | geography | culture | NULL)
length (short | long)
script (TEXT)
fact_type (verified | legend | mixed)
sources (JSONB)
audio_url, tts_provider
status (pending | reviewed | published | rejected | archived)
version (INTEGER)
language, region
created_at, updated_at
```

**Indexes:** `landmark_id`, `status`, `content_type`, `variant`

### landmark_facts
```sql
id (UUID, PK)
landmark_id (FK)
source (wikipedia | wikidata | wikivoyage)
source_url, raw_text
fact_type (verified | legend)
wiki_revision (TEXT)
fetched_at
```

### landmark_reviews (v2)
```sql
id (UUID, PK)
landmark_id (FK)
source (google_places | tripadvisor | wikipedia_edit)
review_text, author, rating, review_date
tip_extracted (concrete info only, no opinions)
fetched_at
```

### content_refresh_log (v2)
```sql
id (UUID, PK)
landmark_id (FK)
triggered_at, triggered_by
wikipedia_rev, prev_wiki_rev
wiki_changed, reviews_added, scripts_regen
new_content_id (FK to landmark_content)
status (pending | completed | failed)
error (TEXT)
```

---

## Deployment

See `DEPLOYMENT.md` for:
- AWS RDS setup (PostgreSQL)
- S3 for audio file storage + CloudFront CDN
- Lambda or EC2 for backend
- GitHub Actions CI/CD
- Environment config for production

---

## Roadmap

| Phase | Status | What |
|-------|--------|------|
| **0** | ✅ Done | Content pipeline (Wikipedia → Claude → TTS) |
| **1** | ✅ Done | Expo app + real-time GPS + nearby landmarks |
| **2** | 📋 Next | Smart routing (time + crowd-aware) |
| **3** | 📋 Soon | Live geofence triggers + auto-pause |
| **4** | 📋 Soon | On-demand deep-dive stories + source links |
| **5** | 📋 Later | Offline itinerary downloads (gated by subscription) |
| **Int'l** | 📋 Future | Multi-language, regional data providers, per-country pricing |

---

## Contributing

1. Fork: https://github.com/rs1990/waytale
2. Branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m "feat: description"`
4. Push: `git push origin feature/your-feature`
5. PR to `main`

Code style:
- No semicolons (modern JS)
- Minimal comments (self-documenting names)
- Prefer functional components (React)
- SQL: explicit column lists, indexes on FK + filtering columns

---

## License

MIT

---

## Contact

**GitHub:** https://github.com/rs1990/waytale  
**Issues:** https://github.com/rs1990/waytale/issues
