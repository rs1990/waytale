import jwt from 'jsonwebtoken';

/**
 * Decodes a bearer token if present and attaches req.user.
 * Never blocks the request — routes that need to require auth should
 * check req.user themselves. This lets premium-gating be added to
 * individual routes later without changing the auth flow.
 */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), requireJwtSecret());
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

export function requireJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
}
