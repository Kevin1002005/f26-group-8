// JSearch: an API (sold through RapidAPI) that searches Google for Jobs, which collects
// postings from company career pages and job boards. One search covers many companies,
// unlike Greenhouse and Lever, where each call is one company.
// docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
//
// needs JSEARCH_API_KEY in secrets.env (the "X-RapidAPI-Key", after subscribing to the
// free Basic plan). The free plan only allows about 200 requests A MONTH, and every
// search below is one request, so keep SEARCHES short and run the importer by hand.
import {
  fetchJson, isInternTitle, guessType, guessSetting, guessLevel, toDate, toTime, isWebLink,
  type ImportedJob, type SourceResult,
} from './shared.js';

// each search is written like you'd type it into Google.
// to add one, add a line here (each costs one request from the monthly limit).
const SEARCHES = [
  'software engineering intern in Boston, MA',
  'data science intern',
  'research assistant internship',
  'high school summer internship',
];

// only the fields we use (the real response has more).
// anything could be missing, so most fields allow null
type JSearchJob = {
  job_id: string;
  job_title: string;
  employer_name: string | null;
  job_description: string | null;            // already plain text, not HTML
  job_apply_link: string | null;              // the original posting
  job_city: string | null;
  job_state: string | null;
  job_is_remote: boolean | null;
  job_offer_expiration_datetime_utc: string | null;
  job_posted_at_datetime_utc?: string | null;  // when it was posted
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_period: string | null;           // "HOUR", "YEAR"...
  job_highlights: { Qualifications?: unknown } | null;
};

// JSearch moved from /search to /search-v2 in fall 2026. v2 puts the list in data.jobs,
// the old one put it straight in data, so we accept both.
type JSearchBody = {
  data?: { jobs?: JSearchJob[] } | JSearchJob[];
};


export async function fetchJSearch(): Promise<SourceResult> {
  const apiKey = process.env.JSEARCH_API_KEY;
  // without a key, skip JSearch instead of crashing, so Greenhouse and Lever still import.
  // allFetchesWorked: false means the importer won't close old JSearch jobs either.
  if (!apiKey) {
    console.log('jsearch: skipped, JSEARCH_API_KEY is not in secrets.env');
    return { jobs: [], allFetchesWorked: false };
  }

  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;

  // one search at a time (not all at once): JSearch answers 429 if we ask too fast
  for (const search of SEARCHES) {
    try {
      // URLSearchParams escapes the spaces and commas in the search for us
      const query = new URLSearchParams({
        query: search,
        num_pages: '1',              // about 10 jobs. more pages can cost more of the limit
        country: 'us',
        employment_types: 'INTERN',
      });
      const body = (await fetchJson(`https://jsearch.p.rapidapi.com/search-v2?${query}`, {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      })) as JSearchBody;

      const list = Array.isArray(body.data) ? body.data : body.data?.jobs ?? [];

      for (const job of list) {
        // "as JSearchBody" above only tells TypeScript what to expect. nothing checks it
        // while running, so skip a job that's missing what our table requires, instead of
        // letting one bad row make the whole save fail.
        // (jobs.sql: outside jobs must have an external_id and an http(s) apply_url)
        if (typeof job.job_id !== 'string' || typeof job.job_title !== 'string' || !isWebLink(job.job_apply_link)) {
          continue;
        }
        // employment_types=INTERN already asks for internships, but JSearch sometimes
        // mixes in other jobs, so check the title too (plans.md JB2a)
        if (isInternTitle(job.job_title)) {
          jobs.push(toImportedJob(job, job.job_apply_link));
        }
      }
    } catch (err) {
      // one search failing shouldn't stop the others
      console.error(`jsearch "${search}" failed:`, err);
      allFetchesWorked = false;
    }
  }

  return { jobs, allFetchesWorked };
}


// turns one JSearch job into one row for our jobs table.
// applyUrl is passed in separately because isWebLink above already checked it's a real link
function toImportedJob(job: JSearchJob, applyUrl: string): ImportedJob {
  // "Boston, MA". filter(Boolean) drops the missing parts, so it's never ", MA"
  const location = [job.job_city, job.job_state].filter(Boolean).join(', ') || null;

  // some titles have the company and site stuck on the end:
  // "Software Engineer Intern | PTC | Handshake" -> keep only "Software Engineer Intern".
  // (this also helps mergeSimilarJobs see it's the same job as the company's own post)
  const title = job.job_title.split(' | ')[0]!.trim() || job.job_title.trim();
  const description = job.job_description?.trim() || null;

  return {
    source: 'jsearch',
    external_id: job.job_id,
    title,
    // organization can't be null in jobs.sql. Google for Jobs almost always has the
    // employer, but just in case
    organization: job.employer_name?.trim() || 'Unknown employer',
    type: guessType(title),
    // 'high-school', 'college', or 'both', from what the post says (see shared.ts)
    level: guessLevel(title, description),
    location,
    // JSearch has a real remote flag. if it's not remote, fall back to reading the location
    setting: job.job_is_remote ? 'remote' : guessSetting(location),
    // true only if a salary is listed. no salary listed doesn't mean unpaid, so that's null
    paid: job.job_min_salary || job.job_max_salary ? true : null,
    pay_text: payText(job),
    deadline: toDate(job.job_offer_expiration_datetime_utc),
    description,
    requirements: qualifications(job),
    apply_url: applyUrl,
    posted_at: toTime(job.job_posted_at_datetime_utc),
  };
}

// "$20 - $30 per hour", "$25 per hour", or null when no salary is listed
function payText(job: JSearchJob): string | null {
  const amounts = [job.job_min_salary, job.job_max_salary]
    .filter((n): n is number => typeof n === 'number' && n > 0);
  if (amounts.length === 0) return null;

  // min and max are often the same number, so only show it once
  const unique = [...new Set(amounts)].map((n) => `$${n.toLocaleString('en-US')}`);
  const period = job.job_salary_period ? ` per ${job.job_salary_period.toLowerCase()}` : '';
  return unique.join(' - ') + period;
}

// JSearch pulls a "Qualifications" list out of many postings. It's the closest thing
// to our requirements column. Keep only real strings, so a strange answer can't break the save
function qualifications(job: JSearchJob): string[] {
  const list = job.job_highlights?.Qualifications;
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
