// Adzuna: a job search engine that collects postings from many sites, in every field (so it
// helps students outside tech). It collects from other sites, so it's an "aggregator" in
// import-runner.ts: jobs we already have from a direct source are skipped.
// docs: https://developer.adzuna.com/docs/search
//
// needs ADZUNA_APP_ID and ADZUNA_APP_KEY in secrets.env (free from developer.adzuna.com).
// The free plan has a daily limit, and each search below is one request, so it only runs from
// the importer (npm run import-jobs), not from Opportunities' Refresh button.
import {
  fetchJson, isInternTitle, guessType, guessSetting, guessLevel, htmlToText, isWebLink, toTime,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { stateCode } from '../places.js';

// Three kinds of search, each one request:
//  1. SEARCHES: any field, anywhere in the US
//  2. one per field (FIELD_WORDS) near each city in CITIES: internships whose title says "intern"
//     and whose post uses one of the field's words. The GitHub lists we import are nearly all
//     tech, so without these a Finance student in Worcester found almost nothing (2026-11:
//     Adzuna had 408 finance internships within 60 km of Worcester; we had 0)
//  3. the same per field, anywhere in the US, newest first, NATIONWIDE_PAGES pages of 50
//     (added 2026-11-17: a Biology or Psychology student found only a few dozen jobs, because
//     the cities above are all these fields had)
// That's 4 + 18 fields x 2 cities + 18 fields x 2 pages = 76 requests per import. Adzuna's free
// plan allows about 250 a day and 2,500 a month (check your key's limits on developer.adzuna.com),
// so about one import a day. That's also why Adzuna only runs from the importer, not from Refresh.
const SEARCHES = ['intern', 'internship', 'co-op', 'research assistant undergraduate'];

// The words each field's internships use, one line per major in frontend/src/data/majors.js
// (the same names as MAJOR_WORDS in fit.ts). Adzuna matches any ONE of the words, anywhere in
// the post. An AI drafted these lists (2026-11); fix any word that brings in the wrong jobs
const FIELD_WORDS: Record<string, string> = {
  'Computer Science': 'software developer programming web frontend backend cloud cybersecurity',
  'Data Science': 'data analytics analyst statistics sql visualization',
  'Computer or Electrical Engineering': 'electrical hardware embedded firmware circuit electronics semiconductor',
  'Mechanical Engineering': 'mechanical manufacturing cad solidworks aerospace automotive',
  'Civil or Environmental Engineering': 'civil structural construction transportation infrastructure geotechnical',
  'Biology': 'biology biotech laboratory genetics molecular ecology',
  'Chemistry': 'chemistry chemical laboratory pharmaceutical materials',
  'Health Sciences or Nursing': 'healthcare clinical patient nursing hospital medical',
  'Psychology': 'psychology behavioral counseling therapy',
  'Business': 'business operations strategy consulting management sales',
  'Finance or Accounting': 'finance accounting accountant audit tax treasury',
  'Economics': 'economics economic economist policy',
  'Marketing or Communications': 'marketing communications social content brand media',
  'Design': 'design designer ux graphic figma creative',
  'Mathematics or Statistics': 'mathematics statistics actuarial quantitative modeling',
  'Political Science or Public Policy': 'policy government political legislative advocacy',
  'Environmental Science': 'environmental sustainability climate energy conservation',
  'Education': 'education teaching tutor teacher curriculum',
};
// The cities our students are near, and how far around each one to look, in kilometers
// (Adzuna counts in km: 50 km is about 30 miles). Add a city here to cover it (18 more requests)
const CITIES = ['Boston, MA', 'Worcester, MA'];
const DISTANCE_KM = '50';
// how many pages of 50 each field's nationwide search reads (each page is one more request per field)
const NATIONWIDE_PAGES = 2;
// Adzuna's free plan allows about 25 requests a minute, so we wait between them
const WAIT_MS = Number(process.env.ADZUNA_WAIT_MS ?? 2500);

// only the fields we use (the real response has more)
type AdzunaJob = {
  id: string | number;
  title: string;
  description: string | null;        // a short piece of the description
  created: string | null;
  redirect_url: string;
  company?: { display_name?: string } | null;
  // area is the place from the country down: ["US", "Massachusetts", "Worcester County", "Worcester"]
  location?: { display_name?: string; area?: string[] } | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number | null;   // "1" = Adzuna's guess, not the employer's
};

export async function fetchAdzuna(): Promise<SourceResult> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) {
    console.log('adzuna: skipped, ADZUNA_APP_ID and ADZUNA_APP_KEY are not in secrets.env');
    return { jobs: [], allFetchesWorked: false };
  }
  // every search: its name (for the log), what it asks Adzuna for, and which page of answers
  const searches: { name: string; ask: Record<string, string>; page: number }[] = [
    ...SEARCHES.map((what) => ({ name: what, ask: { what }, page: 1 })),
    ...CITIES.flatMap((where) => Object.entries(FIELD_WORDS).map(([field, words]) => ({
      name: `${field} near ${where}`,
      // title_only: "intern" has to be in the title; what_or: any one of the field's words
      ask: { title_only: 'intern', what_or: words, where, distance: DISTANCE_KM },
      page: 1,
    }))),
    // anywhere in the US, newest first (sort_by=date), so each import brings the latest ones
    ...Object.entries(FIELD_WORDS).flatMap(([field, words]) => Array.from({ length: NATIONWIDE_PAGES }, (_, i) => ({
      name: `${field} anywhere, page ${i + 1}`,
      ask: { title_only: 'intern', what_or: words, sort_by: 'date' },
      page: i + 1,
    }))),
  ];
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  for (const [i, { name: search, ask, page }] of searches.entries()) {
    if (i > 0) await new Promise((done) => setTimeout(done, WAIT_MS));
    try {
      const query = new URLSearchParams({ app_id: id, app_key: key, results_per_page: '50', 'content-type': 'application/json', ...ask });
      // the page number is part of the address: /search/1 is the first 50, /search/2 the next 50
      const body = (await fetchJson(`https://api.adzuna.com/v1/api/jobs/us/search/${page}?${query}`)) as { results: AdzunaJob[] };
      for (const job of body.results ?? []) {
        try {
          if (job.id === undefined || typeof job.title !== 'string' || !isWebLink(job.redirect_url)) continue;
          const title = htmlToText(job.title) ?? job.title;   // titles can have <strong> in them
          if (isInternTitle(title) || /\bresearch assistant\b/i.test(title)) jobs.push(toImportedJob(job, title));
        } catch {
          console.error('adzuna: skipped one job that couldn\'t be read');
        }
      }
    } catch (err) {
      console.error(`adzuna "${search}" failed:`, err);
      allFetchesWorked = false;
    }
  }
  return { jobs, allFetchesWorked };
}

function toImportedJob(job: AdzunaJob, title: string): ImportedJob {
  const location = locationOf(job.location);
  const description = htmlToText(job.description);
  const real = String(job.salary_is_predicted ?? '0') !== '1';
  const low = Number(job.salary_min);
  const high = Number(job.salary_max);
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  const payText = real && Number.isFinite(low) && low > 0
    ? (Number.isFinite(high) && high > low ? `${money(low)}–${money(high)} per year` : `${money(low)} per year`)
    : null;
  return {
    source: 'adzuna',
    external_id: String(job.id),
    title: title.trim(),
    organization: job.company?.display_name?.trim() || 'Company not listed',
    type: /\bresearch\b/i.test(title) && !isInternTitle(title) ? 'research' : guessType(title),
    level: guessLevel(title, description),
    location,
    setting: guessSetting(location),
    paid: payText ? true : null,
    pay_text: payText,
    deadline: null,
    description,
    requirements: [],
    apply_url: job.redirect_url,
    posted_at: toTime(job.created),
  };
}

// Adzuna writes a place as "Worcester, Worcester County", without the state. Its area list has
// the state second ("US", "Massachusetts", ...), so we write "Worcester, MA" the way the other
// sources do, and places.ts can find it on the map. Anything else stays as Adzuna wrote it
function locationOf(location: AdzunaJob['location']): string | null {
  const shown = location?.display_name?.trim() || null;
  const stateName = location?.area?.[1];
  const state = stateName ? stateCode(stateName) : null;
  const city = shown?.split(',')[0]?.trim();
  if (state && city && city !== stateName) return `${city}, ${state}`;
  return shown;
}
