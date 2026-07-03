/**
 * Admin API routes.
 * All endpoints require X-Admin-Key header (set in .env).
 * These are never exposed to the mobile app — admin dashboard only.
 */

import { Router } from 'express';
import { db } from '../db/client.js';

const router = Router();

// Simple API key guard
router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

/**
 * GET /admin/landmarks
 * All landmarks with content status summary + last refresh.
 */
router.get('/landmarks', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        l.id, l.wikidata_id, l.name, l.description, l.latitude, l.longitude,
        l.wikipedia_en, l.updated_at,
        COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'published') AS published_count,
        COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'pending')   AS pending_count,
        COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'reviewed')  AS reviewed_count,
        MAX(cr.triggered_at) AS last_refresh,
        COUNT(DISTINCT lr.id) AS review_tips_count
      FROM landmarks l
      LEFT JOIN landmark_content lc ON lc.landmark_id = l.id
      LEFT JOIN content_refresh_log cr ON cr.landmark_id = l.id
      LEFT JOIN landmark_reviews lr ON lr.landmark_id = l.id
      GROUP BY l.id
      ORDER BY l.name
    `);
    res.json({ landmarks: rows });
  } catch (err) { next(err); }
});

/**
 * GET /admin/pending
 * All pending content items awaiting review with diff vs. current published version.
 */
router.get('/pending', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        lc.id, lc.content_type, lc.variant, lc.length,
        lc.script, lc.fact_type, lc.sources, lc.audio_url,
        lc.version, lc.created_at,
        l.name AS landmark_name, l.id AS landmark_id, l.wikidata_id,
        pub.script AS published_script
      FROM landmark_content lc
      JOIN landmarks l ON l.id = lc.landmark_id
      LEFT JOIN landmark_content pub ON (
        pub.landmark_id = lc.landmark_id
        AND pub.content_type = lc.content_type
        AND (pub.variant = lc.variant OR (pub.variant IS NULL AND lc.variant IS NULL))
        AND pub.status = 'published'
        AND pub.version = lc.version - 1
      )
      WHERE lc.status = 'pending'
      ORDER BY l.name, lc.content_type, lc.variant
    `);
    res.json({ pending: rows });
  } catch (err) { next(err); }
});

/**
 * GET /admin/refresh-log
 * Recent refresh history for all landmarks.
 */
router.get('/refresh-log', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit ?? 50, 10);
    const { rows } = await db.query(`
      SELECT
        cr.*, l.name AS landmark_name
      FROM content_refresh_log cr
      JOIN landmarks l ON l.id = cr.landmark_id
      ORDER BY cr.triggered_at DESC
      LIMIT $1
    `, [limit]);
    res.json({ log: rows });
  } catch (err) { next(err); }
});

/**
 * GET /admin/reviews/:landmarkId
 * All review tips pulled for a landmark.
 */
router.get('/reviews/:landmarkId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM landmark_reviews
      WHERE landmark_id = $1
      ORDER BY fetched_at DESC
    `, [req.params.landmarkId]);
    res.json({ reviews: rows });
  } catch (err) { next(err); }
});

/**
 * POST /admin/landmark/:id/refresh
 * Triggers a content refresh for one landmark.
 * Body: { force?: boolean, skipTts?: boolean }
 */
router.post('/landmark/:id/refresh', async (req, res, next) => {
  try {
    const { force = false, skipTts = true } = req.body ?? {};

    // Dynamically import pipeline (avoids loading at server boot)
    const { refreshLandmark } = await import(
      new URL('../../../../pipeline/src/refresh.js', import.meta.url).href
    );

    const result = await refreshLandmark(req.params.id, { force, skipTts });
    res.json({ success: true, changed: result.changed, landmark: result.landmark.name });
  } catch (err) { next(err); }
});

/**
 * POST /admin/refresh-all
 * Refresh all landmarks (checks Wikipedia + reviews for each).
 */
router.post('/refresh-all', async (req, res, next) => {
  try {
    const { force = false, skipTts = true } = req.body ?? {};
    const { refreshAll } = await import(
      new URL('../../../../pipeline/src/refresh.js', import.meta.url).href
    );
    const results = await refreshAll({ force, skipTts });
    res.json({ success: true, ...results });
  } catch (err) { next(err); }
});

/**
 * POST /admin/content/:id/approve
 * Approve pending content → status becomes 'reviewed'.
 */
router.post('/content/:id/approve', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE landmark_content SET status='reviewed', updated_at=NOW() WHERE id=$1 AND status='pending'`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * POST /admin/content/:id/publish
 * Publish reviewed content → status='published', old published → 'archived'.
 */
router.post('/content/:id/publish', async (req, res, next) => {
  try {
    // Get this content's landmark + type/variant so we can archive the old one
    const { rows: [item] } = await db.query(
      'SELECT * FROM landmark_content WHERE id=$1', [req.params.id]
    );
    if (!item) return res.status(404).json({ error: 'Content not found' });
    if (item.status === 'published') return res.json({ success: true, note: 'already published' });

    await db.query('BEGIN');

    // Archive existing published version
    await db.query(`
      UPDATE landmark_content SET status='archived', updated_at=NOW()
      WHERE landmark_id=$1 AND content_type=$2
        AND (variant=$3 OR (variant IS NULL AND $3::text IS NULL))
        AND status='published'
    `, [item.landmark_id, item.content_type, item.variant]);

    // Publish this one
    await db.query(
      `UPDATE landmark_content SET status='published', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );

    await db.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await db.query('ROLLBACK');
    next(err);
  }
});

/**
 * POST /admin/content/:id/reject
 * Reject pending content.
 */
router.post('/content/:id/reject', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE landmark_content SET status='rejected', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * Sponsors + local recommendations (ad/affiliate placements).
 * Same pending/reviewed/published gate as landmark_content — see
 * pipeline/src/db/schema-v3.sql for the reasoning.
 */

router.get('/sponsors', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM sponsors ORDER BY name`);
    res.json({ sponsors: rows });
  } catch (err) { next(err); }
});

router.post('/sponsors', async (req, res, next) => {
  try {
    const { name, category, website_url, contact_email } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows: [sponsor] } = await db.query(
      `INSERT INTO sponsors (name, category, website_url, contact_email) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, category ?? null, website_url ?? null, contact_email ?? null]
    );
    res.status(201).json({ sponsor });
  } catch (err) { next(err); }
});

router.get('/recommendations', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT lr.*, l.name AS landmark_name, s.name AS sponsor_name
      FROM local_recommendations lr
      JOIN landmarks l ON l.id = lr.landmark_id
      LEFT JOIN sponsors s ON s.id = lr.sponsor_id
      ORDER BY lr.created_at DESC
    `);
    res.json({ recommendations: rows });
  } catch (err) { next(err); }
});

router.post('/recommendations', async (req, res, next) => {
  try {
    const { landmark_id, sponsor_id, title, description, affiliate_url, image_url, sponsored, priority } = req.body ?? {};
    if (!landmark_id || !title) return res.status(400).json({ error: 'landmark_id and title are required' });
    const { rows: [rec] } = await db.query(
      `INSERT INTO local_recommendations
         (landmark_id, sponsor_id, title, description, affiliate_url, image_url, sponsored, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [landmark_id, sponsor_id ?? null, title, description ?? null, affiliate_url ?? null, image_url ?? null, !!sponsored, priority ?? 0]
    );
    res.status(201).json({ recommendation: rec });
  } catch (err) { next(err); }
});

router.post('/recommendations/:id/approve', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE local_recommendations SET status='reviewed', updated_at=NOW() WHERE id=$1 AND status='pending'`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/recommendations/:id/publish', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE local_recommendations SET status='published', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/recommendations/:id/reject', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE local_recommendations SET status='rejected', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
