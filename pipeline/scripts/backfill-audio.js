/**
 * Backfills audio for landmark_content rows that have a script but no
 * audio_url yet. Reuses the same synthesizeAudio() the main pipeline
 * uses, and the same contentType key convention (see src/pipeline.js),
 * so filenames stay consistent with anything already in audio_cache.
 *
 * Usage: node scripts/backfill-audio.js [--premium]
 */

import 'dotenv/config';
import { db } from '../src/db/client.js';
import { synthesizeAudio } from '../src/tts/polly.js';

const premium = process.argv.includes('--premium');

function ttsKey(row) {
  return row.content_type === 'ambient' ? 'ambient_short' : `deep_dive_${row.variant}`;
}

const { rows } = await db.query(`
  SELECT id, landmark_id, content_type, variant, script
  FROM landmark_content
  WHERE audio_url IS NULL AND status != 'rejected'
  ORDER BY landmark_id, content_type, variant
`);

console.log(`\nWayTale Audio Backfill`);
console.log(`${rows.length} content rows missing audio.\n`);

let ok = 0;
let failed = 0;

for (const row of rows) {
  const contentType = ttsKey(row);
  try {
    const audioUrl = await synthesizeAudio({
      landmarkId: row.landmark_id,
      contentType,
      script: row.script,
      premium,
    });
    await db.query(
      `UPDATE landmark_content SET audio_url = $1, tts_provider = 'polly', updated_at = NOW() WHERE id = $2`,
      [audioUrl, row.id]
    );
    ok++;
  } catch (err) {
    console.error(`  ✗ FAILED ${row.landmark_id}/${contentType}: ${err.message}`);
    failed++;
  }
}

console.log(`\n=== Backfill Summary ===`);
console.log(`✓ Synthesized: ${ok}`);
console.log(`✗ Failed:      ${failed}`);

await db.end();
