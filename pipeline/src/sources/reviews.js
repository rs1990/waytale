/**
 * Review tips aggregator.
 * Sources:
 *   1. Google Places API — "editorial_summary" + top reviews (requires key)
 *   2. Wikipedia revision check — detect if article changed since last fetch
 *
 * Only pulls factual, attributable content. Reviewer opinions ("amazing views!")
 * are discarded; only concrete tips ("last entry at 4:30pm", "closed Mondays") kept.
 */

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ─── Wikipedia: revision check ──────────────────────────────────────────────

export async function getLatestWikiRevision(wikipediaTitle) {
  if (!wikipediaTitle) return null;

  const params = new URLSearchParams({
    action: 'query',
    titles: wikipediaTitle,
    prop: 'revisions',
    rvprop: 'ids|timestamp',
    rvlimit: '1',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': 'WayTale/1.0' },
  });
  const data = await res.json();
  const pages = data.query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page?.revisions?.length) return null;

  return {
    revid: String(page.revisions[0].revid),
    timestamp: page.revisions[0].timestamp,
  };
}

// ─── Google Places: review tips ─────────────────────────────────────────────

export async function fetchPlaceReviews(landmark) {
  if (!PLACES_API_KEY) {
    console.log('  [reviews] No GOOGLE_PLACES_API_KEY — using stub tips');
    return getStubTips(landmark);
  }

  // 1. Find Place ID by name + location
  const searchRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?` +
    `input=${encodeURIComponent(landmark.name)}&inputtype=textquery` +
    `&locationbias=point:${landmark.latitude},${landmark.longitude}` +
    `&fields=place_id&key=${PLACES_API_KEY}`
  );
  const searchData = await searchRes.json();
  const placeId = searchData.candidates?.[0]?.place_id;
  if (!placeId) return [];

  // 2. Fetch reviews for that place
  const detailRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?` +
    `place_id=${placeId}&fields=reviews,editorial_summary,current_opening_hours` +
    `&key=${PLACES_API_KEY}`
  );
  const detailData = await detailRes.json();
  const result = detailData.result ?? {};

  const tips = [];

  if (result.editorial_summary?.overview) {
    tips.push({
      source: 'google_places',
      review_text: result.editorial_summary.overview,
      tip_type: 'editorial',
    });
  }

  for (const review of (result.reviews ?? []).slice(0, 5)) {
    const tip = extractConcreteInfo(review.text);
    if (tip) {
      tips.push({
        source: 'google_places',
        review_text: review.text,
        author: review.author_name,
        rating: review.rating,
        review_date: new Date(review.time * 1000).toISOString().split('T')[0],
        tip_extracted: tip,
      });
    }
  }

  return tips;
}

/**
 * Stub tips for when no Google Places key is configured.
 * Returns realistic-looking seasonal/operational tips for validation.
 */
function getStubTips(landmark) {
  const stubs = [
    { tip: 'Best visited early morning to avoid crowds (before 9am)', type: 'timing' },
    { tip: 'Last entry typically 1 hour before closing', type: 'operational' },
    { tip: 'Free on the first Sunday of each month', type: 'pricing' },
    { tip: 'Accessible via public transit — parking very limited', type: 'access' },
  ];

  return stubs.slice(0, 2).map(s => ({
    source: 'internal',
    review_text: s.tip,
    tip_extracted: s.tip,
    rating: null,
    review_date: new Date().toISOString().split('T')[0],
  }));
}

/**
 * Extract only concrete, actionable info from a review.
 * Discards pure opinions. Returns null if nothing useful found.
 */
function extractConcreteInfo(text) {
  const concretePatterns = [
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,  // time references
    /closed? (?:on )?(\w+days?)/i,           // closure info
    /free (?:admission|entry|parking)/i,
    /last (?:entry|admission) at/i,
    /open(?:s)? (?:at|until)/i,
    /parking (?:is |available |costs? )/i,
    /\$\d+/,                                  // price mentions
    /reservation(?:s)? (?:required|recommended)/i,
    /best (?:time|season) to visit/i,
    /wheelchair accessible/i,
  ];

  const hasConcreteInfo = concretePatterns.some(p => p.test(text));
  if (!hasConcreteInfo) return null;

  // Return first 200 chars of the relevant sentence
  const sentences = text.split(/[.!?]/);
  const relevant = sentences.find(s => concretePatterns.some(p => p.test(s)));
  return relevant?.trim().slice(0, 200) ?? null;
}
