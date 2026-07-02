/**
 * Wikidata SPARQL client.
 * Fetches landmark metadata (coords, description, Wikipedia link, categories)
 * from public Wikidata endpoint — no API key required.
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export async function fetchLandmarkByWikidataId(wikidataId) {
  const sparql = `
    SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?wikipedia ?image WHERE {
      BIND(wd:${wikidataId} AS ?item)
      ?item p:P625/psv:P625 ?coord .
      ?coord wikibase:geoLatitude  ?lat ;
             wikibase:geoLongitude ?lon .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL {
        ?wikipedia schema:about ?item ;
                   schema:isPartOf <https://en.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 1
  `;

  return sparqlQuery(sparql);
}

export async function fetchLandmarksNearPoint(lat, lon, radiusKm = 20, limit = 50) {
  const sparql = `
    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?lat ?lon ?wikipedia ?image WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coords .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      ?item wdt:P31 ?type .
      FILTER(?type IN (wd:Q570116, wd:Q33506, wd:Q839954, wd:Q1081138, wd:Q4989906, wd:Q16831714))
      ?item p:P625/psv:P625 ?coord .
      ?coord wikibase:geoLatitude  ?lat ;
             wikibase:geoLongitude ?lon .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL {
        ?wikipedia schema:about ?item ;
                   schema:isPartOf <https://en.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT ${limit}
  `;

  return sparqlQuery(sparql);
}

async function sparqlQuery(sparql) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'WayTale/1.0 (waytale-app; mailto:admin@waytale.com)',
    },
  });

  if (!res.ok) {
    throw new Error(`Wikidata SPARQL error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.results.bindings.map(parseBinding);
}

function parseBinding(b) {
  const wikidataId = b.item?.value?.split('/entity/')[1];
  const wikipediaTitle = b.wikipedia?.value
    ? decodeURIComponent(b.wikipedia.value.replace('https://en.wikipedia.org/wiki/', '').replace(/_/g, ' '))
    : null;

  return {
    wikidata_id: wikidataId,
    name: b.itemLabel?.value ?? 'Unknown',
    description: b.itemDescription?.value ?? null,
    latitude:  parseFloat(b.lat?.value),
    longitude: parseFloat(b.lon?.value),
    wikipedia_en: wikipediaTitle,
    image_url: b.image?.value ?? null,
  };
}
