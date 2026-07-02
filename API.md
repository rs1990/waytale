# WayTale API Reference

All endpoints return JSON. Status codes:
- `200` — Success
- `400` — Bad request (validation error)
- `401` — Unauthorized (admin endpoints)
- `404` — Not found
- `500` — Server error

---

## Public Endpoints (Mobile App)

### GET /health

Health check.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

### GET /landmarks/nearby

Returns landmarks within a radius of a GPS point.

**Query Parameters:**
- `lat` (required, float): Latitude of user position
- `lon` (required, float): Longitude of user position
- `radius` (optional, float, default: 5): Search radius in kilometers
- `limit` (optional, int, default: 20): Max results

**Example:**
```
GET /landmarks/nearby?lat=37.7749&lon=-122.4194&radius=10&limit=30
```

**Response:**
```json
{
  "landmarks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "wikidata_id": "Q44440",
      "name": "Golden Gate Bridge",
      "description": "suspension bridge spanning the Golden Gate strait",
      "latitude": 37.8199,
      "longitude": -122.4783,
      "category": ["bridge", "structure"],
      "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/GGB.jpg",
      "distance_m": 5234,
      "content_count": 4
    }
  ]
}
```

**Notes:**
- Results sorted by distance (closest first)
- `distance_m`: Haversine distance from query point
- `content_count`: Number of published content items (if 0, no audio available yet)

---

### GET /landmarks/:id

Get full details of a single landmark.

**Parameters:**
- `:id` — UUID or Wikidata ID (e.g., `Q44440` or `550e8400-e29b-41d4-a716-446655440000`)

**Example:**
```
GET /landmarks/Q44440
```

**Response:**
```json
{
  "landmark": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "wikidata_id": "Q44440",
    "name": "Golden Gate Bridge",
    "description": "...",
    "latitude": 37.8199,
    "longitude": -122.4783,
    "category": ["bridge", "structure"],
    "country_code": "US",
    "language": "en",
    "wikipedia_en": "Golden_Gate_Bridge",
    "image_url": "...",
    "created_at": "2026-07-02T14:30:00Z",
    "updated_at": "2026-07-02T14:30:00Z"
  }
}
```

---

### GET /landmarks/:id/content

Get published narration content for a landmark.

**Parameters:**
- `:id` — UUID or Wikidata ID
- `type` (optional): `ambient` | `deep_dive`
- `variant` (optional): `history` | `geography` | `culture`
- `length` (optional): `short` | `long`

**Examples:**
```
GET /landmarks/Q44440/content
GET /landmarks/Q44440/content?type=ambient
GET /landmarks/Q44440/content?type=deep_dive&variant=history
```

**Response:**
```json
{
  "content": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "landmark_id": "550e8400-e29b-41d4-a716-446655440000",
      "content_type": "ambient",
      "variant": null,
      "length": "short",
      "script": "You're approaching the Golden Gate Bridge, one of the most photographed structures in the world. Built in 1937...",
      "fact_type": "verified",
      "sources": [
        {
          "source": "wikipedia",
          "url": "https://en.wikipedia.org/wiki/Golden_Gate_Bridge"
        }
      ],
      "audio_url": "https://cdn.waytale.com/audio/550e8400-e29b-41d4-a716-446655440000_ambient_short.mp3",
      "tts_provider": "polly",
      "language": "en",
      "region": "US",
      "version": 1,
      "status": "published",
      "created_at": "2026-07-02T12:00:00Z",
      "updated_at": "2026-07-02T12:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440222",
      "landmark_id": "550e8400-e29b-41d4-a716-446655440000",
      "content_type": "deep_dive",
      "variant": "history",
      "length": "long",
      "script": "The Golden Gate Bridge was conceived in the 1920s... [3-5 minute narration]",
      "fact_type": "verified",
      "sources": [
        {"source": "wikipedia", "url": "https://en.wikipedia.org/wiki/Golden_Gate_Bridge"}
      ],
      "audio_url": "https://cdn.waytale.com/audio/550e8400-e29b-41d4-a716-446655440000_deep_dive_history.mp3",
      "tts_provider": "polly",
      "language": "en",
      "region": "US",
      "version": 1,
      "status": "published",
      "created_at": "2026-07-02T12:00:00Z",
      "updated_at": "2026-07-02T12:00:00Z"
    }
  ]
}
```

**Notes:**
- Only returns `status: 'published'` — pending/rejected content never served to app
- If `type`, `variant`, or `length` specified, filters to matching items
- `fact_type: 'legend'` or `'mixed'` means the content contains folklore (app shows warning badge)
- `sources` is array of `{source, url}` — every fact is traceable

---

### GET /landmarks/along-route

Get landmarks within a buffer of a polyline route.

**Query Parameters:**
- `points` (required): Route as `lat,lon|lat,lon|...` (pipe-separated)
- `radius` (optional, default: 2): Search radius in kilometers

**Example:**
```
GET /landmarks/along-route?points=37.7749,-122.4194|37.8,-122.4&radius=3
```

**Response:**
```json
{
  "landmarks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "wikidata_id": "Q44440",
      "name": "Golden Gate Bridge",
      "latitude": 37.8199,
      "longitude": -122.4783,
      "description": "...",
      "image_url": "...",
      "category": ["bridge"],
      "distance_to_route_m": 450
    }
  ]
}
```

**Notes:**
- Returns landmarks within `radius` km of the polyline
- Useful for route planning — show relevant landmarks along a chosen route

---

## Routing Endpoints

### POST /route/score

Score route options by time, landmarks, and estimated crowds.

**Request Body:**
```json
{
  "origin": {
    "lat": 37.7749,
    "lon": -122.4194
  },
  "destination": {
    "lat": 37.8199,
    "lon": -122.4783
  },
  "departureTime": "2026-07-02T14:30:00Z"
}
```

**Response:**
```json
{
  "departure": "2026-07-02T14:30:00Z",
  "routes": [
    {
      "id": "direct",
      "label": "Best balance",
      "duration_minutes": 25,
      "distance_km": 12,
      "points": [
        [37.7749, -122.4194],
        [37.8, -122.42],
        [37.8199, -122.4783]
      ],
      "landmark_count": 5,
      "landmarks": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "name": "Golden Gate Bridge",
          "latitude": 37.8199,
          "longitude": -122.4783,
          "distance_to_route_m": 200
        }
      ],
      "crowd_penalty": 0,
      "score": 78
    },
    {
      "id": "scenic_north",
      "label": "Most landmarks",
      "duration_minutes": 38,
      "distance_km": 18,
      "points": [[...], [...], [...]],
      "landmark_count": 8,
      "landmarks": [...],
      "crowd_penalty": 5,
      "score": 71
    },
    {
      "id": "scenic_south",
      "label": "Fastest",
      "duration_minutes": 19,
      "distance_km": 10,
      "points": [[...], [...], [...]],
      "landmark_count": 2,
      "landmarks": [...],
      "crowd_penalty": 8,
      "score": 45
    }
  ]
}
```

**Scoring Formula:**
```
score = timeScore + landmarkScore - crowdPenalty
  timeScore = max(0, 50 - duration_minutes)
  landmarkScore = min(landmark_count * 10, 50)
  crowdPenalty = weekend(8) + peak_hours(7) + high_landmark_density(5)
```

**Notes:**
- Returns 2–3 options (stub provider — future: Google Directions API)
- Routes are pre-sorted by score; labels assigned to top 3
- `crowd_penalty` based on time-of-day + day-of-week (no live data yet)

---

## Admin Endpoints

**All admin endpoints require header:**
```
X-Admin-Key: <ADMIN_API_KEY from backend/.env>
```

### GET /admin/landmarks

List all landmarks with content counts.

**Response:**
```json
{
  "landmarks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "wikidata_id": "Q44440",
      "name": "Golden Gate Bridge",
      "description": "...",
      "latitude": 37.8199,
      "longitude": -122.4783,
      "wikipedia_en": "Golden_Gate_Bridge",
      "updated_at": "2026-07-02T12:00:00Z",
      "published_count": 4,
      "pending_count": 0,
      "reviewed_count": 0,
      "review_tips_count": 3,
      "last_refresh": "2026-07-02T14:00:00Z"
    }
  ]
}
```

---

### GET /admin/pending

List all pending content items awaiting review.

**Response:**
```json
{
  "pending": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "content_type": "ambient",
      "variant": null,
      "length": "short",
      "script": "New narration with updated facts...",
      "fact_type": "verified",
      "sources": "[{\"source\": \"wikipedia\", \"url\": \"...\"}]",
      "audio_url": "file:///local/cache/550e8400_ambient_short.mp3",
      "version": 2,
      "created_at": "2026-07-02T15:00:00Z",
      "landmark_name": "Golden Gate Bridge",
      "landmark_id": "550e8400-e29b-41d4-a716-446655440000",
      "wikidata_id": "Q44440",
      "published_script": "Previous narration from v1..."
    }
  ]
}
```

**Notes:**
- `published_script` is the old version (for diff comparison)
- Admin UI shows word-level diff

---

### GET /admin/refresh-log

Refresh history for all landmarks.

**Query Parameters:**
- `limit` (optional, default: 50): Max results

**Response:**
```json
{
  "log": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440333",
      "landmark_id": "550e8400-e29b-41d4-a716-446655440000",
      "landmark_name": "Golden Gate Bridge",
      "triggered_at": "2026-07-02T15:00:00Z",
      "triggered_by": "admin",
      "wikipedia_rev": "1234567890",
      "prev_wiki_rev": "1234567889",
      "wiki_changed": true,
      "reviews_added": 2,
      "scripts_regen": true,
      "new_content_id": "660e8400-e29b-41d4-a716-446655440111",
      "status": "completed",
      "error": null
    }
  ]
}
```

---

### GET /admin/reviews/:landmarkId

Get all review tips pulled for a landmark.

**Response:**
```json
{
  "reviews": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440444",
      "landmark_id": "550e8400-e29b-41d4-a716-446655440000",
      "source": "google_places",
      "review_text": "Fantastic views! Best time to visit is early morning before crowds...",
      "author": "John D.",
      "rating": 5,
      "review_date": "2026-06-15",
      "tip_extracted": "Best time to visit is early morning before crowds",
      "fetched_at": "2026-07-02T14:00:00Z"
    }
  ]
}
```

**Notes:**
- `tip_extracted` is the concrete fact (hours, prices, access)
- Full `review_text` available for context
- Only extracted tips are injected into LLM prompt for narration

---

### POST /admin/landmark/:id/refresh

Trigger a refresh for a single landmark.

**Request Body (optional):**
```json
{
  "force": false,
  "skipTts": true
}
```

**Response:**
```json
{
  "success": true,
  "changed": true,
  "landmark": {
    "name": "Golden Gate Bridge",
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### POST /admin/refresh-all

Refresh all landmarks.

**Request Body (optional):**
```json
{
  "force": false,
  "skipTts": true
}
```

**Response:**
```json
{
  "success": true,
  "changed": ["Golden Gate Bridge", "Alcatraz Island"],
  "unchanged": ["Space Needle", "Mount Rushmore"],
  "failed": [
    {
      "name": "Grand Canyon",
      "error": "Wikidata ID not found"
    }
  ]
}
```

---

### POST /admin/content/:id/approve

Mark pending content as reviewed (editorial pass).

**Response:**
```json
{
  "success": true
}
```

---

### POST /admin/content/:id/publish

Publish reviewed content (becomes live to app).

Automatically archives previous published version.

**Response:**
```json
{
  "success": true
}
```

---

### POST /admin/content/:id/reject

Reject pending content (status: rejected, kept for audit).

**Response:**
```json
{
  "success": true
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "lat and lon are required"
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

### 404 Not Found

```json
{
  "error": "Landmark not found"
}
```

### 500 Server Error

```json
{
  "error": "Internal server error"
}
```

---

## Rate Limits (Future)

Currently none. Planned:
- Public endpoints: 100 req/min per IP
- Admin endpoints: 10 req/min per key

---

## SDK Examples

### JavaScript/Node.js

```js
const api = 'http://localhost:3001';

// Get nearby landmarks
const res = await fetch(`${api}/landmarks/nearby?lat=37.7&lon=-122.4&radius=5`);
const { landmarks } = await res.json();

// Get content for landmark
const content = await fetch(`${api}/landmarks/${landmarks[0].id}/content`);
const { content: scripts } = await content.json();
```

### React Native (Expo)

```jsx
import { useEffect, useState } from 'react';

export function useNearbyLandmarks(location) {
  const [landmarks, setLandmarks] = useState([]);

  useEffect(() => {
    if (!location) return;
    fetch(`http://10.0.0.167:3001/landmarks/nearby?lat=${location.lat}&lon=${location.lon}`)
      .then(r => r.json())
      .then(d => setLandmarks(d.landmarks))
      .catch(console.error);
  }, [location.lat, location.lon]);

  return landmarks;
}
```
