/**
 * Content refresh pipeline.
 * For a given landmark:
 *   1. Check if Wikipedia article changed since last fetch (revision ID diff)
 *   2. Pull new review tips from Google Places
 *   3. If anything changed: re-draft narration (injecting tips into the prompt)
 *   4. Re-run Polly TTS on changed scripts
 *   5. Store new content as status='pending' — admin must approve before it goes live
 *   6. Log everything to content_refresh_log
 */

import 'dotenv/config';
import { db } from './db/client.js';
import { fetchPageSections, detectFactType } from './sources/wikipedia.js';
import { getLatestWikiRevision, fetchPlaceReviews } from './sources/reviews.js';
import { draftNarrationScripts } from './llm/draft-narration.js';
import { synthesizeAllVariants } from './tts/polly.js';

export async function refreshLandmark(landmarkId, { skipTts = true, force = false } = {}) {
  const { rows: [landmark] } = await db.query(
    'SELECT * FROM landmarks WHERE id = $1', [landmarkId]
  );
  if (!landmark) throw new Error(`Landmark not found: ${landmarkId}`);

  console.log(`\n[refresh] ${landmark.name}`);

  // Get last known Wikipedia revision
  const { rows: [lastFact] } = await db.query(`
    SELECT wiki_revision FROM landmark_facts
    WHERE landmark_id = $1 AND source = 'wikipedia'
    ORDER BY fetched_at DESC LIMIT 1
  `, [landmarkId]);

  const prevRev = lastFact?.wiki_revision ?? null;

  // Check current Wikipedia revision
  const currentRev = landmark.wikipedia_en
    ? await getLatestWikiRevision(landmark.wikipedia_en)
    : null;

  const wikiChanged = currentRev && currentRev.revid !== prevRev;
  console.log(`  Wikipedia: ${wikiChanged ? `CHANGED (${prevRev} → ${currentRev.revid})` : 'unchanged'}`);

  // Pull review tips (always — new reviews since last run)
  const tips = await fetchPlaceReviews(landmark);
  console.log(`  Reviews pulled: ${tips.length}`);

  // Store new review tips
  for (const tip of tips) {
    await db.query(`
      INSERT INTO landmark_reviews (landmark_id, source, review_text, author, rating, review_date, tip_extracted)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [landmarkId, tip.source, tip.review_text, tip.author ?? null, tip.rating ?? null, tip.review_date ?? null, tip.tip_extracted ?? null]);
  }

  const shouldRegen = force || wikiChanged || tips.some(t => t.tip_extracted);

  // Create refresh log entry
  const { rows: [log] } = await db.query(`
    INSERT INTO content_refresh_log
      (landmark_id, wikipedia_rev, prev_wiki_rev, wiki_changed, reviews_added, scripts_regen, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING id
  `, [landmarkId, currentRev?.revid ?? null, prevRev, wikiChanged, tips.length, shouldRegen]);

  if (!shouldRegen) {
    console.log('  No changes — skipping re-generation');
    await db.query(`UPDATE content_refresh_log SET status='completed' WHERE id=$1`, [log.id]);
    return { changed: false, landmark };
  }

  console.log('  Re-generating narration...');

  // Re-fetch Wikipedia content if changed
  let factText = '';
  let sources = [];
  if (landmark.wikipedia_en) {
    const sections = await fetchPageSections(landmark.wikipedia_en);
    if (sections?.extract) {
      factText += sections.extract;
      sources.push({ source: 'wikipedia', source_url: sections.source_url, fact_type: detectFactType(sections.extract) });

      // Update fact record with new revision
      await db.query(`
        UPDATE landmark_facts SET wiki_revision = $1, fetched_at = NOW()
        WHERE landmark_id = $2 AND source = 'wikipedia'
      `, [currentRev?.revid ?? null, landmarkId]);
    }
  }

  // Append review tips as additional sourced facts
  const concreteTips = tips.filter(t => t.tip_extracted);
  if (concreteTips.length) {
    factText += '\n\nRECENT VISITOR TIPS (from reviews — cite as "recent visitor reports"):\n';
    factText += concreteTips.map(t => `- ${t.tip_extracted}`).join('\n');
    sources.push({ source: 'google_places', source_url: 'https://maps.google.com', fact_type: 'verified' });
  }

  if (!factText.trim()) {
    await db.query(`UPDATE content_refresh_log SET status='completed', error='no_content' WHERE id=$1`, [log.id]);
    return { changed: false, landmark };
  }

  const scripts = await draftNarrationScripts({ landmark, facts: factText, sources });
  if (!scripts) {
    await db.query(`UPDATE content_refresh_log SET status='completed', error='insufficient_content' WHERE id=$1`, [log.id]);
    return { changed: false, landmark };
  }

  // TTS
  let audioMap = {};
  if (!skipTts && process.env.AWS_ACCESS_KEY_ID) {
    audioMap = await synthesizeAllVariants({ landmarkId: landmark.id, scripts });
  }

  // Store new content as pending (keeps old published content live until admin approves)
  const contentMap = {
    ambient:             { type: 'ambient',   variant: null,        length: 'short', script: scripts.ambient_short },
    deep_dive_history:   { type: 'deep_dive', variant: 'history',   length: 'long',  script: scripts.deep_dive_history },
    deep_dive_geography: { type: 'deep_dive', variant: 'geography', length: 'long',  script: scripts.deep_dive_geography },
    deep_dive_culture:   { type: 'deep_dive', variant: 'culture',   length: 'long',  script: scripts.deep_dive_culture },
  };

  let firstContentId = null;
  for (const [key, meta] of Object.entries(contentMap)) {
    if (!meta.script) continue;
    const audioUrl = audioMap[key === 'ambient' ? 'ambient_short' : key] ?? null;

    const { rows: [content] } = await db.query(`
      INSERT INTO landmark_content
        (landmark_id, content_type, variant, length, script, fact_type, sources, audio_url, tts_provider, language, region, status, version)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,'en','US','pending',
        COALESCE((SELECT MAX(version) FROM landmark_content WHERE landmark_id=$1 AND content_type=$2 AND (variant=$3 OR (variant IS NULL AND $3 IS NULL))), 0) + 1
      RETURNING id
    `, [
      landmark.id, meta.type, meta.variant, meta.length,
      meta.script, scripts.fact_type,
      JSON.stringify(sources.map(s => ({ source: s.source, url: s.source_url }))),
      audioUrl, audioUrl ? 'polly' : null,
    ]);
    if (!firstContentId) firstContentId = content.id;
  }

  await db.query(`
    UPDATE content_refresh_log SET status='completed', new_content_id=$1 WHERE id=$2
  `, [firstContentId, log.id]);

  console.log(`  ✓ New content pending review (${wikiChanged ? 'wiki updated' : ''}${concreteTips.length ? ` + ${concreteTips.length} tips` : ''})`);
  return { changed: true, landmark, newContentId: firstContentId };
}

export async function refreshAll({ skipTts = true, force = false } = {}) {
  const { rows: landmarks } = await db.query(`
    SELECT id, name FROM landmarks ORDER BY name
  `);

  console.log(`\nRefreshing ${landmarks.length} landmarks...`);
  const results = { changed: [], unchanged: [], failed: [] };

  for (const lm of landmarks) {
    try {
      const r = await refreshLandmark(lm.id, { skipTts, force });
      if (r.changed) results.changed.push(lm.name);
      else results.unchanged.push(lm.name);
    } catch (e) {
      console.error(`  ✗ ${lm.name}: ${e.message}`);
      results.failed.push({ name: lm.name, error: e.message });
    }
  }

  return results;
}
