/**
 * Retries a fixed list of national parks that failed on the first pipeline
 * run due to Wikidata's public SPARQL endpoint returning transient 502s
 * under load. Adds a delay + a couple retries per landmark to be polite
 * to the shared endpoint instead of hammering it again.
 */
import 'dotenv/config';
import { runPipeline } from '../src/pipeline.js';
import { NATIONAL_PARKS } from './seed-national-parks.js';
import { db } from '../src/db/client.js';

const FAILED_NAMES = [
  'Everglades National Park', 'Great Basin National Park', 'Great Sand Dunes National Park and Preserve',
  'Great Smoky Mountains National Park', 'Guadalupe Mountains National Park', 'Haleakalā National Park',
  'Hawaiʻi Volcanoes National Park', 'Hot Springs National Park', 'Indiana Dunes National Park',
  'Isle Royale National Park', 'Joshua Tree National Park', 'Katmai National Park and Preserve',
  'Kenai Fjords National Park', 'Kings Canyon National Park', 'Kobuk Valley National Park',
  'Lake Clark National Park and Preserve', 'Lassen Volcanic National Park', 'Mammoth Cave National Park',
  'Mesa Verde National Park', 'Mount Rainier National Park', 'New River Gorge National Park and Preserve',
  'North Cascades National Park', 'Olympic National Park', 'Petrified Forest National Park',
  'Pinnacles National Park', 'Redwood National and State Parks', 'Rocky Mountain National Park',
  'Saguaro National Park', 'Sequoia National Park', 'Shenandoah National Park',
  'Theodore Roosevelt National Park', 'Virgin Islands National Park', 'Voyageurs National Park',
  'White Sands National Park', 'Wind Cave National Park', 'Wrangell–St. Elias National Park and Preserve',
  'Yellowstone National Park', 'Yosemite National Park', 'Zion National Park',
];

const targets = NATIONAL_PARKS.filter(p => FAILED_NAMES.includes(p.name));
console.log(`Retrying ${targets.length} parks (expected ${FAILED_NAMES.length})\n`);

const results = { ok: [], failed: [] };

async function withRetries(park, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await runPipeline(park.id, { skipTts: true });
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  retry ${i}/${attempts - 1} for ${park.name} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
}

for (const park of targets) {
  try {
    await withRetries(park);
    results.ok.push(park.name);
  } catch (err) {
    console.error(`  ✗ FAILED ${park.name}: ${err.message}`);
    results.failed.push({ name: park.name, error: err.message });
  }
  await new Promise(r => setTimeout(r, 1500)); // be polite between landmarks
}

console.log('\n=== Retry Summary ===');
console.log(`✓ Success: ${results.ok.length}`);
console.log(`✗ Failed:  ${results.failed.length}`);
if (results.failed.length) results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));

await db.end();
