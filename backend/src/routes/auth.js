/**
 * Auth scaffold: email/password accounts + JWT.
 * Not yet wired into the app UI — exists so subscription_tier has an
 * identity to attach to once a payment provider (RevenueCat/Stripe) is
 * connected. See middleware/auth.js for the request-time token check.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';
import { attachUser, requireAuth, requireJwtSecret } from '../middleware/auth.js';

const router = Router();
const TOKEN_TTL = '30d';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!isValidEmail(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Valid email and password (min 8 chars) required' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await db.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, subscription_tier, created_at`,
      [email.toLowerCase(), passwordHash]
    );

    const token = jwt.sign({ sub: user.id, email: user.email }, requireJwtSecret(), { expiresIn: TOKEN_TTL });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!isValidEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { rows: [user] } = await db.query(
      `SELECT id, email, password_hash, subscription_tier FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, requireJwtSecret(), { expiresIn: TOKEN_TTL });
    res.json({
      token,
      user: { id: user.id, email: user.email, subscription_tier: user.subscription_tier },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', attachUser, requireAuth, async (req, res, next) => {
  try {
    const { rows: [user] } = await db.query(
      `SELECT id, email, subscription_tier, created_at FROM users WHERE id = $1`,
      [req.user.sub]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
