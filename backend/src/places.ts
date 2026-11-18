// Where places are on the map, so Opportunities can show jobs "within 25 miles of Worcester"
// instead of only jobs whose location happens to have the word "Worcester" in it
// (GET /api/jobs/for-me in jobs.ts). The old way missed Framingham and Boston (20 and 40 miles
// away), and found Worcester, England.
//
// data/us-places.tsv lists about 34,000 US cities and towns, one per line:
//   name <tab> state <tab> latitude <tab> longitude <tab> population
// It's made from the US Census Bureau's free lists (public domain) by data/build-us-places.mjs.
// The server reads it from disk the first time it's needed, so finding a place never asks
// another website, and nothing a student types leaves our server.
// Places outside the US (Worcester, England; Toronto) aren't in it, so they never count as near.
import { readFileSync } from 'node:fs';

// A city on the map. city is how we show it ("Worcester"), state its two-letter code ("MA"),
// pop how many people live there (Census estimate; 0 when the Census has none)
export type Place = { city: string; state: string; lat: number; lng: number; pop: number };

// Every state's two-letter code and full name, plus DC and Puerto Rico (the Census lists both)
export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
// the other way round: "massachusetts" -> "MA"
const STATE_BY_NAME = new Map(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));

// Short names job lists use, and big cities they write without a state ("NYC", "SF", "Boston").
// Only these count without a state: "London" or "Paris" on their own are almost always abroad
const ALIASES: Record<string, [string, string]> = {
  'nyc': ['new york', 'NY'], 'new york city': ['new york', 'NY'], 'new york': ['new york', 'NY'], 'manhattan': ['new york', 'NY'],
  'brooklyn': ['new york', 'NY'], 'sf': ['san francisco', 'CA'], 'san francisco': ['san francisco', 'CA'],
  'bay area': ['san francisco', 'CA'], 'sf bay area': ['san francisco', 'CA'], 'san francisco bay area': ['san francisco', 'CA'],
  'south sf': ['south san francisco', 'CA'], 'south san francisco': ['south san francisco', 'CA'], 'silicon valley': ['san jose', 'CA'],
  'la': ['los angeles', 'CA'], 'los angeles': ['los angeles', 'CA'], 'san jose': ['san jose', 'CA'], 'san diego': ['san diego', 'CA'],
  'seattle': ['seattle', 'WA'], 'boston': ['boston', 'MA'], 'greater boston': ['boston', 'MA'], 'chicago': ['chicago', 'IL'],
  'austin': ['austin', 'TX'], 'houston': ['houston', 'TX'], 'dallas': ['dallas', 'TX'], 'atlanta': ['atlanta', 'GA'],
  'denver': ['denver', 'CO'], 'philadelphia': ['philadelphia', 'PA'], 'pittsburgh': ['pittsburgh', 'PA'], 'miami': ['miami', 'FL'],
  'dc': ['washington', 'DC'], 'd c': ['washington', 'DC'], 'washington dc': ['washington', 'DC'], 'washington d c': ['washington', 'DC'],
  'washington': ['washington', 'DC'],
  // the Census calls it "Boise City"
  'boise': ['boise city', 'ID'],
};
// The short name for a key, or undefined. Object.hasOwn, not ALIASES[key]: a plain object also
// "has" the names every JavaScript object has, so ALIASES['constructor'] would be a function, and
// a job listed in "Constructor" (or a student typing it) would crash the lookup that follows
const aliasFor = (key: string): [string, string] | undefined => (Object.hasOwn(ALIASES, key) ? ALIASES[key] : undefined);

// Countries that come after a two-letter code that looks like a state's: "Toronto, ON, Canada"
// is fine anyway (ON isn't a state), but "Bangalore, IN, India" would look like Indiana
const ABROAD = new Set(['canada', 'uk', 'united kingdom', 'gb', 'england', 'scotland', 'ireland', 'india', 'france', 'germany',
  'mexico', 'china', 'japan', 'spain', 'italy', 'netherlands', 'australia', 'brazil', 'singapore', 'israel', 'switzerland']);
// Countries and big cities abroad that share a name with a small US town (England, AR; London,
// KY; Paris, TX). A student typing one on its own means the one abroad, so it isn't looked up on
// our US map: the box then matches the words in each job's location ("London, UK"), the old way.
// "Paris, TX" with its state still works
const ABROAD_NAMES = new Set([...ABROAD, 'london', 'paris', 'toronto', 'montreal', 'ottawa', 'markham', 'mississauga', 'berlin',
  'munich', 'dublin', 'amsterdam', 'zurich', 'madrid', 'barcelona', 'edinburgh', 'tokyo', 'singapore', 'sydney', 'bangalore',
  'bengaluru', 'mumbai', 'beijing', 'shanghai', 'hong kong', 'tel aviv', 'mexico city', 'sao paulo']);


// A name the way the file writes it: lower case, no accents or dots, one space between words,
// and "Saint"/"Ft."/"Mt." written one way. (data/build-us-places.mjs does exactly the same)
export function nameKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\./g, ' ').replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^saint /, 'st ').replace(/^ft /, 'fort ').replace(/^mt /, 'mount ');
}

// "MA", "Massachusetts", "MASSACHUSETTS", or "D.C." -> the state's code. null if it's not a state.
// A two-letter code only counts in capitals in a job's location (", or" isn't Oregon), but
// students typing in the box can write "ma" (anyCase)
export function stateCode(text: string, anyCase = false): string | null {
  // "MA 02110" -> "MA", "MO (Headquarters)" -> "MO"
  const t = text.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\d{5}(-\d{4})?$/, '').trim();
  const letters = t.replace(/[.\s]/g, '');
  if (letters.length === 2 && (anyCase || letters === letters.toUpperCase()) && Object.hasOwn(STATES, letters.toUpperCase())) {
    return letters.toUpperCase();
  }
  return STATE_BY_NAME.get(t.toLowerCase().replace(/\s+/g, ' ')) ?? null;
}


// The file, read once: name -> every place with that name, the most people first
let byName: Map<string, Place[]> | null = null;
function places(): Map<string, Place[]> {
  if (byName) return byName;
  byName = new Map();
  // If the file is missing (say, a deploy without it), the map stays empty: every place is then
  // "not found", and Opportunities matches the words in each job's location, the old way, instead
  // of every Opportunities load failing
  let text = '';
  try {
    text = readFileSync(new URL('../data/us-places.tsv', import.meta.url), 'utf8');
  } catch (err) {
    console.error('places: backend/data/us-places.tsv could not be read, so distance search is off:', err instanceof Error ? err.message : err);
  }
  for (const line of text.split('\n')) {
    const [name, state, lat, lng, pop] = line.split('\t');
    if (!name || !state || !lat || !lng) continue;
    // "st louis" -> "St Louis", for showing it ("Near St Louis, MO")
    const city = name.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase());
    const list = byName.get(name) ?? [];
    list.push({ city, state, lat: Number(lat), lng: Number(lng), pop: Number(pop) || 0 });
    byName.set(name, list);
  }
  return byName;
}

// The place with this name in this state, or null
function lookUp(city: string, state: string): Place | null {
  return places().get(nameKey(city))?.find((p) => p.state === state) ?? null;
}


// ---------- A job's location ----------

// The places a location lists, each cleaned up: "Remote - Boston, MA · New York, NY - Hybrid"
// -> ["Boston, MA", "New York, NY"]. A location can list several ("Boston, MA · Johnston, RI",
// "SF | NYC", "Austin, TX; Remote"). Only the first 400 letters are read: imported locations are
// already cut to 400 (shared.ts), and these patterns get slow on very long runs of spaces
function piecesOf(location: string): string[] {
  const pieces: string[] = [];
  for (const piece of location.slice(0, 400).split(/[·|;\n]|\s\/\s/)) {
    // "Remote - Boston, MA", "Hybrid in Boston, MA", "New York, NY - Hybrid", "Boise, ID +1 more"
    // -> just the place
    const part = piece
      .replace(/^\s*(remote|hybrid|on-?site|in-?office)\b[\s:,–-]*(in\s+)?/i, '')
      .replace(/\s*[-–(]\s*(remote|hybrid|on-?site|in-?office)\)?\s*$/i, '')
      .replace(/\s*\+\s*\d+\s*more\s*$/i, '')
      .trim();
    if (part) pieces.push(part);
  }
  return pieces;
}

// Where a job is: every US place in its location text. "Boston, MA · Johnston, RI" gives two,
// "Remote" or "London, UK" none. Kept per location text, since thousands of jobs share a few
// hundred locations (emptied if it ever gets big, like the patterns in fit.ts)
const jobPlaces = new Map<string, Place[]>();
export function placesIn(location: string | null): Place[] {
  if (!location) return [];
  const kept = jobPlaces.get(location);
  if (kept) return kept;
  if (jobPlaces.size >= 20000) jobPlaces.clear();

  const found: Place[] = [];
  for (const part of piecesOf(location)) {
    // Workday style: "US-MA-Boston"
    const workday = part.match(/^US-([A-Z]{2})-(.+)$/);
    if (workday) {
      const place = lookUp(workday[2]!, workday[1]!);
      if (place) found.push(place);
      continue;
    }
    const bits = part.split(',').map((b) => b.trim()).filter((b) => b !== '');
    if (bits.length === 1) {
      // no comma: "NYC", "SF", or "Boston MA"
      const alias = aliasFor(nameKey(bits[0]!));
      const spaced = bits[0]!.match(/^(.+?)\s+([A-Z]{2})$/);
      const place = alias ? lookUp(alias[0], alias[1]) : spaced && stateCode(spaced[2]!) ? lookUp(spaced[1]!, spaced[2]!) : null;
      if (place) found.push(place);
      continue;
    }
    // "Needham, MA, United States", or a list like "Boston, MA, New York, NY":
    // every bit that's a state, with the bit before it as the city
    let anyState = false;
    for (let i = 1; i < bits.length; i++) {
      const state = stateCode(bits[i]!);
      if (!state) continue;
      if (/^[A-Z]{2}$/.test(bits[i]!) && ABROAD.has((bits[i + 1] ?? '').toLowerCase())) continue;
      anyState = true;
      const alias = aliasFor(nameKey(bits[i - 1]!));
      const place = lookUp(bits[i - 1]!, state) ?? (alias && alias[1] === state ? lookUp(alias[0], alias[1]) : null);
      if (place) found.push(place);
      i++;   // the next bit can't be a city's state
    }
    // no states at all, like "New York, Chicago": only the short names and big cities in ALIASES
    if (!anyState) {
      for (const bit of bits) {
        const alias = aliasFor(nameKey(bit));
        const place = alias ? lookUp(alias[0], alias[1]) : null;
        if (place) found.push(place);
      }
    }
  }
  jobPlaces.set(location, found);
  return found;
}

// Which states a job is in: the states of its places, plus states it names without a city we
// know ("MA", "Remote - MA", "Worcester County, MA", "Massachusetts, US"). For a state search
// ("MA" in the box). A bit that's followed by a state is a city, not a state, so "Washington, DC"
// is in DC, not Washington state, and "New York, NY" counts once
export function statesIn(location: string | null): string[] {
  if (!location) return [];
  const found = new Set(placesIn(location).map((p) => p.state));
  for (const part of piecesOf(location)) {
    const bits = part.split(',').map((b) => b.trim()).filter((b) => b !== '');
    // one bit that's a short name ("Washington", "NYC") is a city: placesIn has it already
    if (bits.length === 1 && aliasFor(nameKey(bits[0]!))) continue;
    bits.forEach((bit, i) => {
      const state = stateCode(bit);
      if (!state) return;
      if (/^[A-Z]{2}$/.test(bit) && ABROAD.has((bits[i + 1] ?? '').toLowerCase())) return;
      if (i + 1 < bits.length && stateCode(bits[i + 1]!)) return;   // "Washington, DC": a city
      found.add(state);
    });
  }
  return [...found];
}


// ---------- What a student types in "City or state" ----------

export type Where = { kind: 'city'; place: Place } | { kind: 'state'; state: string };

// "Worcester", "worcester, ma", "Worcester MA", "MA", "Massachusetts", "NYC" -> a city or a state.
// A city without a state can mean several (Worcester is in MA, PA, NY, and VT): it picks the
// one in preferStates (the student's home state) if there is one that's at least a tenth the size
// of the biggest, or else the biggest. (So a student from Massachusetts typing "Springfield" gets
// Springfield, MA, but one typing "Phoenix" gets Phoenix, AZ, not the village of Phoenix, NY).
// home is the student's own city, if we found it: typing its name always means it, however small
// null if it isn't a US place we know (a ZIP code, a country, a typo)
export function findPlace(typed: string, preferStates: string[] = [], home: Place | null = null): Where | null {
  const text = typed.slice(0, 100).trim();
  if (!text) return null;
  const key = nameKey(text);
  const alias = aliasFor(key);
  // "LA" is Los Angeles here: a student typing it means the city more often than Louisiana.
  // ("New York" and "Washington" are cities too; type "NY" or "WA" for the state)
  if (alias) {
    const place = lookUp(alias[0], alias[1]);
    if (place) return { kind: 'city', place };
  }
  const state = stateCode(text, true);
  if (state && key !== 'washington') return { kind: 'state', state };

  // "Worcester, MA" or "Worcester MA"
  const comma = text.match(/^(.+?),\s*(.+)$/);
  const spaced = text.match(/^(.+?)\s+([A-Za-z]{2})$/);
  for (const match of [comma, spaced]) {
    if (!match) continue;
    const [, city, st] = match;
    const code = st ? stateCode(st, true) : null;
    if (city && code) {
      const place = lookUp(city, code);
      if (place) return { kind: 'city', place };
    }
  }
  // a comma, but not "city, state": not something we can find
  if (comma) return null;

  // just a city: their own city first, then (unless it usually means somewhere abroad, see
  // ABROAD_NAMES) the biggest one, or the one in their home state
  if (home && nameKey(home.city) === key) return { kind: 'city', place: home };
  if (ABROAD_NAMES.has(key)) return null;
  const all = places().get(key);
  if (!all || all.length === 0) return null;
  const biggest = all[0]!;
  const place = all.find((p) => preferStates.includes(p.state) && p.pop * 10 >= biggest.pop) ?? biggest;
  return { kind: 'city', place };
}


// ---------- Distance ----------

// How far apart two places are, in miles, from their map positions.
// (The "haversine" formula: distance across a ball, since the Earth isn't flat)
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3959 * Math.asin(Math.sqrt(h));   // 3959 miles = the Earth's radius
}

// How far the closest of a job's places is from here. Infinity if it has none we know
export function closestMiles(jobPlaces: Place[], here: Place): number {
  let closest = Infinity;
  for (const p of jobPlaces) closest = Math.min(closest, milesBetween(p, here));
  return closest;
}
