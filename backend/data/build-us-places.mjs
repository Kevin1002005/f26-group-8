// Builds backend/data/us-places.tsv, the list of US cities and towns places.ts uses for
// "within 25 miles of Worcester" on Opportunities. You only need it to update the list
// (the Census Bureau puts out new files about once a year).
//
// 1. Download these three free files from the US Census Bureau (public domain) into a folder
//    of their own, and unzip the two .zip files:
//      https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip
//      https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cousubs_national.zip
//      https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv
// 2. From backend/:
//      node data/build-us-places.mjs <folder>/2024_Gaz_place_national.txt <folder>/2024_Gaz_cousubs_national.txt data/us-places.tsv <folder>/sub-est2024.csv
//
// The "place" file has every city, town, and village with its map position. New England towns
// (Needham, MA) are "county subdivisions" instead, so that file is read too, for New England, NY,
// NJ, and PA. The population file decides which one comes first when several share a name, so
// "Cambridge" on its own means Cambridge, MA (118,000 people), not Cambridge, MD (13,000).
import { readFileSync, writeFileSync } from 'node:fs';

const [placeFile, cousubFile, outFile, popFile] = process.argv.slice(2);
if (!placeFile || !cousubFile || !outFile || !popFile) {
  console.log('usage: node data/build-us-places.mjs <place file> <cousub file> <out file> <population file>');
  process.exit(1);
}

// population by Census id (a place: state + place, a county subdivision: state + county + cousub)
const population = new Map();
for (const line of readFileSync(popFile, 'latin1').split(/\r?\n/).slice(1)) {
  const f = line.split(',');
  if (f[0] === '162' || f[0] === '170') population.set(f[1] + f[3], Number(f[15]));
  if (f[0] === '061') population.set(f[1] + f[2] + f[4], Number(f[15]));
}
// New England (towns are county subdivisions, not "places"), plus NY, NJ, PA
const COUSUB_STATES = new Set(['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NY', 'NJ', 'PA']);

// must match nameKey in backend/src/places.ts
function nameKey(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\./g, ' ').replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^saint /, 'st ').replace(/^ft /, 'fort ').replace(/^mt /, 'mount ');
}

// The names a Census name goes by: "Worcester city" -> ["Worcester"];
// "Nashville-Davidson metropolitan government (balance)" -> ["Nashville-Davidson", "Nashville"];
// "San Buenaventura (Ventura) city" -> ["San Buenaventura", "Ventura"]
function namesOf(raw) {
  let name = raw.replace(/\s*\(balance\)\s*$/, '').trim();
  // the lower-case words on the end say what kind of place it is ("city", "town", "CDP"): drop them
  const words = name.split(' ');
  let stripped = false;
  while (words.length > 1 && (/^\p{Ll}+$/u.test(words.at(-1)) || words.at(-1) === 'CDP' || words.at(-1) === 'CCD')) {
    words.pop();
    stripped = true;
  }
  name = words.join(' ');
  const names = [];
  const inner = name.match(/\(([^)]+)\)/);
  const outer = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  names.push(outer);
  if (inner) names.push(inner[1]);
  // a city and county run as one: "Louisville/Jefferson County" -> also "Louisville"
  if (stripped && /[-/]/.test(outer) && /government|urban county|\(balance\)/.test(raw)) names.push(outer.split(/[-/]/)[0]);
  if (/^Urban /.test(outer)) names.push(outer.slice(6));   // "Urban Honolulu" -> also "Honolulu"
  return names;
}

// Every name in one Census file, with its state, map position, land area, and population
function read(file, isPlace) {
  const rows = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const head = lines[0].split('\t').map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.split('\t').map((x) => x.trim());
    const st = f[col('USPS')];
    if (!isPlace && !COUSUB_STATES.has(st)) continue;
    const raw = f[col('NAME')];
    if (!isPlace && /\b(CCD|precinct|district|unorganized|township \d)/i.test(raw)) continue;
    const lat = Number(f[col('INTPTLAT')]);
    const lng = Number(f[col('INTPTLONG')]);
    const aland = Number(f[col('ALAND')]);
    const pop = population.get(f[col('GEOID')]) ?? 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    for (const n of namesOf(raw)) {
      const key = nameKey(n);
      if (key.length >= 2 && !/^\d/.test(key)) rows.push({ key, st, lat, lng, aland, pop, isPlace });
    }
  }
  return rows;
}

const all = [...read(placeFile, true), ...read(cousubFile, false)];
// one row per name + state. A place beats a county subdivision (keeping the bigger population of
// the two); two subdivisions with the same name in one state (and no place) are ambiguous, so
// neither is kept
const byKey = new Map();
const cousubCount = new Map();
for (const r of all) {
  const k = r.key + '|' + r.st;
  if (!r.isPlace) cousubCount.set(k, (cousubCount.get(k) ?? 0) + 1);
  const had = byKey.get(k);
  if (!had || (r.isPlace && !had.isPlace) || (r.isPlace === had.isPlace && r.pop > had.pop)) byKey.set(k, { ...r, pop: Math.max(r.pop, had?.pop ?? 0) });
  else had.pop = Math.max(had.pop, r.pop);
}
const kept = [...byKey.entries()].filter(([k, r]) => r.isPlace || cousubCount.get(k) === 1).map(([, r]) => r);
// sorted by name, then the likeliest one first (the most people), so a city typed without a
// state picks the first one
kept.sort((a, b) => a.key.localeCompare(b.key) || b.pop - a.pop || Number(b.isPlace) - Number(a.isPlace) || b.aland - a.aland);
// name, state, latitude, longitude, population (places.ts uses the population to rank same-name towns)
const out = kept.map((r) => `${r.key}\t${r.st}\t${r.lat.toFixed(3)}\t${r.lng.toFixed(3)}\t${r.pop}`).join('\n') + '\n';
writeFileSync(outFile, out);
console.log(`wrote ${kept.length} places (${Buffer.byteLength(out)} bytes) to ${outFile}`);
