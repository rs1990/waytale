/**
 * 10 US landmarks with verified Wikidata IDs.
 * No DB calls here — plain export so importing doesn't touch the pool.
 */

export const SEED_LANDMARKS = [
  { id: 'Q9202',   name: 'Statue of Liberty',         region: 'Northeast' },
  { id: 'Q44440',  name: 'Golden Gate Bridge',         region: 'West Coast' },
  { id: 'Q220289', name: 'Grand Canyon National Park', region: 'Southwest' },
  { id: 'Q351',    name: 'Yellowstone National Park',  region: 'Rocky Mountains' },
  { id: 'Q131354', name: 'Alcatraz Island',            region: 'West Coast' },
  { id: 'Q83497',  name: 'Mount Rushmore',             region: 'Great Plains' },
  { id: 'Q34404',  name: 'Niagara Falls',              region: 'Northeast' },
  { id: 'Q213559', name: 'Lincoln Memorial',           region: 'DC' },
  { id: 'Q180402', name: 'Yosemite National Park',     region: 'West Coast' },
  { id: 'Q5317',   name: 'Space Needle',               region: 'Pacific Northwest' },
];
