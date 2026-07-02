import { Router } from 'express';

const router = Router();

/**
 * GET /geocode/search?q=golden+gate+bridge
 * Proxies OpenStreetMap Nominatim so the client never talks to it directly —
 * lets us set the required identifying User-Agent and keeps rate limiting
 * server-side (Nominatim's usage policy caps free use at ~1 req/sec).
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q ?? '').trim();
    if (!q) return res.json({ places: [] });

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '0');

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'WayTale/1.0 (rsm7@illinois.edu)' },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Geocoding service unavailable' });
    }

    const results = await upstream.json();
    const places = results.map((r) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    }));

    res.json({ places });
  } catch (err) {
    next(err);
  }
});

export default router;
