// Workable: a hiring site many small and mid-size companies and nonprofits use. Each
// company's job widget is public (no key), with descriptions.
import {
  fetchJson, isInternTitle, guessType, guessSetting, guessLevel, htmlToText, isWebLink, toTime,
  type ImportedJob, type SourceResult,
} from './shared.js';

// account names (the part after apply.workable.com/), checked 2026-11-16.
// to add one, add it here (a wrong name logs "HTTP 404")
const ACCOUNTS = ['huggingface', 'raspberrypi', 'everlaw'];

// only the fields we use (the real response has more)
type WorkableJob = {
  title: string;
  shortcode: string;
  employment_type: string | null;
  telecommuting: boolean | null;
  url: string;
  published_on: string | null;
  created_at: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;   // HTML
};

export async function fetchWorkable(): Promise<SourceResult> {
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  for (const account of ACCOUNTS) {
    try {
      const body = (await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${account}?details=true`)) as { name?: string; jobs: WorkableJob[] };
      for (const job of body.jobs ?? []) {
        try {
          if (typeof job.shortcode !== 'string' || typeof job.title !== 'string' || !isWebLink(job.url)) continue;
          if (isInternTitle(job.title) || /intern/i.test(job.employment_type ?? '')) jobs.push(toImportedJob(job, account, body.name?.trim() || account));
        } catch {
          console.error(`workable ${account}: skipped one job that couldn't be read`);
        }
      }
    } catch (err) {
      console.error(`workable ${account} failed:`, err);
      allFetchesWorked = false;
    }
  }
  return { jobs, allFetchesWorked };
}

function toImportedJob(job: WorkableJob, account: string, name: string): ImportedJob {
  const location = [job.city, job.state, job.country].filter((p) => typeof p === 'string' && p.trim() !== '').join(', ') || null;
  const description = htmlToText(job.description);
  return {
    source: 'workable',
    external_id: `${account}:${job.shortcode}`,
    title: job.title.trim(),
    organization: name,
    type: guessType(job.title),
    level: guessLevel(job.title, description),
    location,
    setting: job.telecommuting ? 'remote' : guessSetting(location),
    paid: null,
    pay_text: null,
    deadline: null,
    description,
    requirements: [],
    apply_url: job.url,
    posted_at: toTime(job.published_on ?? job.created_at),
  };
}
