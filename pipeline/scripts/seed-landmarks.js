/**
 * Seeds 10 US landmarks for Phase 0 validation.
 * Exported as a plain array — no DB calls here so importing this
 * module doesn't touch the connection pool.
 */

export const SEED_LANDMARKS = [
  { id: 'Q8733',    name: 'Statue of Liberty',         region: 'Northeast' },
  { id: 'Q18013',   name: 'Golden Gate Bridge',         region: 'West Coast' },
  { id: 'Q19588',   name: 'Grand Canyon',               region: 'Southwest' },
  { id: 'Q9248',    name: 'Yellowstone National Park',  region: 'Rocky Mountains' },
  { id: 'Q1626630', name: 'Alcatraz Island',            region: 'West Coast' },
  { id: 'Q9161',    name: 'Mount Rushmore',             region: 'Great Plains' },
  { id: 'Q80994',   name: 'Niagara Falls',              region: 'Northeast' },
  { id: 'Q12185',   name: 'Lincoln Memorial',           region: 'DC' },
  { id: 'Q22731',   name: 'Yosemite National Park',     region: 'West Coast' },
  { id: 'Q51685',   name: 'Space Needle',               region: 'Pacific Northwest' },
];
