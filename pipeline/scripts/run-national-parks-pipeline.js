/**
 * Runs the content pipeline for all 63 official U.S. National Parks
 * (see seed-national-parks.js). Same pattern as run-pipeline.js, different
 * target list. skipTts by default — AWS Polly credentials are currently
 * invalid; audio gets backfilled separately once that's fixed.
 *
 * Usage: node scripts/run-national-parks-pipeline.js [--tts]
 */

import 'dotenv/config';
import { runPipeline } from '../src/pipeline.js';
import { NATIONAL_PARKS } from './seed-national-parks.js';
import { db } from '../src/db/client.js';

const withTts = process.argv.includes('--tts');
const skipTts = !withTts;

console.log(`\nWayTale National Parks Pipeline`);
console.log(`Parks: ${NATIONAL_PARKS.length} | TTS: ${withTts ? 'ON (Amazon Polly)' : 'OFF'}\n`);

const results = { ok: [], failed: [], no_content: [] };

for (const park of NATIONAL_PARKS) {
  try {
    const result = await runPipeline(park.id, { skipTts });
    if (result.status === 'no_content') {
      results.no_content.push(park.name);
    } else {
      results.ok.push(park.name);
    }
  } catch (err) {
    console.error(`  ✗ FAILED ${park.name}: ${err.message}`);
    results.failed.push({ name: park.name, error: err.message });
  }
}

console.log('\n=== National Parks Pipeline Summary ===');
console.log(`✓ Success:     ${results.ok.length}`);
console.log(`⚠ No content: ${results.no_content.length}`);
console.log(`✗ Failed:     ${results.failed.length}`);
if (results.failed.length) {
  results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}

await db.end();
