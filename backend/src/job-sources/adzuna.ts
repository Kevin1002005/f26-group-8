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

// each search is one request: keep the list short
const SEARCHES = ['intern', 'internship', 'co-op', 'research assistant undergraduate'];

// only the fields we use (the real response has more)
type AdzunaJob = {
  id: string | number;
  title: string;
  description: string | null;        // a short piece of the description
  created: string | null;
  redirect_url: string;
  company?: { display_name?: string } | null;
  location?: { display_name?: string } | null;
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
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  for (const search of SEARCHES) {
    try {
      const query = new URLSearchParams({ app_id: id, app_key: key, results_per_page: '50', what: search, 'content-type': 'application/json' });
      const body = (await fetchJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${query}`)) as { results: AdzunaJob[] };
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
  const location = job.location?.display_name?.trim() || null;
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
