import rateLimit from 'express-rate-limit';

// Public routes: generous enough for normal app usage (map panning triggers
// several /landmarks/nearby calls), tight enough to stop unmetered abuse of
// the Postgres/PostGIS-backed endpoints.
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes are already gated by X-Admin-Key, but a stricter limiter
// blunts brute-force key guessing.
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
