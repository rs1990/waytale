/**
 * Bulk content activation.
 *
 * 1. Dedupes pending content: repeated pipeline runs (no unique constraint
 *    on landmark_content) left multiple pending rows per
 *    (landmark_id, content_type, variant). Keeps the newest, rejects the rest.
 * 2. Auto-approves + publishes the canonical row when fact_type = 'verified'
 *    (mirrors the approve/publish transitions in backend/src/routes/admin.js).
 * 3. Content tagged 'legend' or 'mixed' is only moved to 'reviewed' — the
 *    admin's human fact-check gate is the app's actual differentiator
 *    (sourced narration vs. invented folklore) and isn't bypassed here.
 *
 * Usage: node scripts/bulk-publish.js
 */

import 'dotenv/config';
import { db } from '../src/db/client.js';

const { rows: pending } = await db.query(`
  SELECT id, landmark_id, content_type, variant, fact_type, created_at
  FROM landmark_content
  WHERE status = 'pending'
  ORDER BY landmark_id, content_type, variant, created_at DESC
`);

const groups = new Map();
for (const row of pending) {
  const key = `${row.landmark_id}|${row.content_type}|${row.variant ?? ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

let rejected = 0;
let approved = 0;
let published = 0;

for (const [, rows] of groups) {
  const [canonical, ...dupes] = rows; // newest first (ORDER BY created_at DESC)

  for (const dupe of dupes) {
    await db.query(
      `UPDATE landmark_content SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [dupe.id]
    );
    rejected++;
  }

  await db.query(
    `UPDATE landmark_content SET status = 'reviewed', updated_at = NOW() WHERE id = $1`,
    [canonical.id]
  );
  approved++;

  if (canonical.fact_type === 'verified') {
    await db.query('BEGIN');
    try {
      await db.query(`
        UPDATE landmark_content SET status = 'archived', updated_at = NOW()
        WHERE landmark_id = $1 AND content_type = $2
          AND (variant = $3 OR (variant IS NULL AND $3::text IS NULL))
          AND status = 'published'
      `, [canonical.landmark_id, canonical.content_type, canonical.variant]);

      await db.query(
        `UPDATE landmark_content SET status = 'published', updated_at = NOW() WHERE id = $1`,
        [canonical.id]
      );
      await db.query('COMMIT');
      published++;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
}

console.log(`\n=== Bulk Publish Summary ===`);
console.log(`Duplicate pending rows rejected: ${rejected}`);
console.log(`Approved (reviewed):             ${approved}`);
console.log(`Published (verified fact_type):  ${published}`);
console.log(`Left in 'reviewed' for manual publish (legend/mixed): ${approved - published}`);

await db.end();
