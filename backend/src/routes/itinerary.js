/**
 * Multi-day itinerary builder.
 * Heuristic stub layer — same spirit as routes.js's straight-line route
 * generator: no external routing/directions API, just a nearest-neighbor
 * greedy day-splitter over landmarks pulled from the pre-generated cache.
 */

import { Router } from 'express';
import { db } from '../db/client.js';

const router = Router();

const MODE_PROFILES = {
  walking: { speedKmh: 4.5, dwellMinutes: 20, stopsPerDay: 5 },
  cycling: { speedKmh: 15,  dwellMinutes: 15, stopsPerDay: 6 },
  driving: { speedKmh: 35,  dwellMinutes: 20, stopsPerDay: 7 },
  transit: { speedKmh: 18,  dwellMinutes: 20, stopsPerDay: 5 },
};

const TOUR_HOURS_PER_DAY = 6;
const TRAVEL_BUDGET_FRACTION = 0.35;
const MAX_RADIUS_KM = 80;

/**
 * POST /itinerary/build
 * Body: { origin: {lat, lon}, days, mode, interests?: string[] }
 */
router.post('/build', async (req, res, next) => {
  try {
    const { origin, interests } = req.body;
    let { days, mode } = req.body;

    if (!origin?.lat || !origin?.lon) {
      return res.status(400).json({ error: 'origin {lat, lon} is required' });
    }

    days = Math.min(Math.max(parseInt(days, 10) || 3, 1), 7);
    if (!MODE_PROFILES[mode]) mode = 'walking';
    const profile = MODE_PROFILES[mode];

    const dayRadiusKm = profile.speedKmh * TOUR_HOURS_PER_DAY * TRAVEL_BUDGET_FRACTION;
    const searchRadiusKm = Math.min(dayRadiusKm * days, MAX_RADIUS_KM);

    let candidates = await fetchCandidates(origin, searchRadiusKm, interests);
    let lowData = false;

    const targetCount = days * profile.stopsPerDay;
    if (interests?.length && candidates.length < targetCount) {
      const unfiltered = await fetchCandidates(origin, searchRadiusKm, null);
      const seen = new Set(candidates.map((c) => c.id));
      for (const c of unfiltered) {
        if (!seen.has(c.id)) { candidates.push(c); seen.add(c.id); }
      }
      lowData = true;
    }

    const itinerary = buildDays(origin, candidates, days, profile, dayRadiusKm);
    if (itinerary.some((d) => d.stop_count === 0)) lowData = true;

    res.json({ origin, mode, days, low_data: lowData, itinerary });
  } catch (err) {
    next(err);
  }
});

async function fetchCandidates(origin, radiusKm, interests) {
  const params = [origin.lat, origin.lon, radiusKm * 1000];
  let interestClause = '';

  if (interests?.length) {
    params.push(interests.map((i) => `%${i}%`));
    interestClause = `AND (l.name ILIKE ANY($4::text[]) OR l.description ILIKE ANY($4::text[]))`;
  }

  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT
        l.id, l.name, l.description, l.latitude, l.longitude,
        l.category, l.image_url,
        ST_Distance(l.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m,
        (
          SELECT COUNT(*) FROM landmark_content lc
          WHERE lc.landmark_id = l.id AND lc.status IN ('reviewed', 'published')
        ) AS content_count
      FROM landmarks l
      WHERE ST_DWithin(
        l.location,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $3
      )
      ${interestClause}
    ) candidates
    ORDER BY (content_count > 0) DESC, distance_m ASC
    LIMIT 100
  `, params);

  return rows;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildDays(origin, candidates, days, profile, dayRadiusKm) {
  const used = new Set();
  const result = [];

  for (let day = 1; day <= days; day++) {
    const stops = [];
    let cursor = { latitude: origin.lat, longitude: origin.lon };

    while (stops.length < profile.stopsPerDay) {
      let nearest = null;
      let nearestDist = Infinity;

      for (const c of candidates) {
        if (used.has(c.id)) continue;
        const distFromOrigin = haversineKm(origin.lat, origin.lon, c.latitude, c.longitude);
        if (distFromOrigin > dayRadiusKm) continue;

        const distFromCursor = haversineKm(cursor.latitude, cursor.longitude, c.latitude, c.longitude);
        if (distFromCursor < nearestDist) {
          nearest = c;
          nearestDist = distFromCursor;
        }
      }

      if (!nearest) break;
      used.add(nearest.id);
      stops.push(nearest);
      cursor = nearest;
    }

    const points = [[origin.lat, origin.lon], ...stops.map((s) => [s.latitude, s.longitude])];
    let distanceKm = 0;
    for (let i = 1; i < points.length; i++) {
      distanceKm += haversineKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    const travelMinutes = (distanceKm / profile.speedKmh) * 60;
    const dwellTotalMinutes = stops.length * profile.dwellMinutes;

    result.push({
      day,
      stop_count: stops.length,
      distance_km: Math.round(distanceKm * 10) / 10,
      estimated_duration_minutes: Math.round(travelMinutes + dwellTotalMinutes),
      points,
      landmarks: stops,
    });
  }

  return result;
}

export default router;
