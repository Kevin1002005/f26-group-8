// Workable: a hiring site many small and mid-size companies and nonprofits use. Each
// company's job widget is public (no key), with descriptions.
import {
  fetchJson, isInternTitle, guessType, guessSetting, guessLevel, htmlToText, isWebLink, toTime,
  isGone, isOutsideUS, atMostAtOnce, boardsResult, boardInId, BOARDS_AT_ONCE,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { boardsFor } from './found-boards.js';

// account names (the part after apply.workable.com/), checked 2026-11-16.
// to add one, add it here (a wrong name logs "no board there").
// More are read from found-boards.json (found-boards.ts), which npm run find-boards fills
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
  // the hand-picked accounts, then the found ones (see greenhouse.ts: same order every run)
  const accounts = boardsFor('workable', ACCOUNTS.map((id) => ({ id, name: id }))).map((board) => board.id);
  const jobsByAccount: ImportedJob[][] = accounts.map(() => []);
  // the accounts whose calls failed this time (their old jobs stay open, see boardsResult)
  const failed = new Set<string>();
  await atMostAtOnce(accounts, BOARDS_AT_ONCE, async (account, index) => {
    const jobs = jobsByAccount[index]!;
    try {
      const body = (await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`)) as { name?: string; jobs: WorkableJob[] };
      // no list at all means the answer changed shape, not "no jobs": count it as failed
      if (!Array.isArray(body?.jobs)) throw new Error('the answer had no job list');
      for (const job of body.jobs) {
        try {
          if (typeof job.shortcode !== 'string' || typeof job.title !== 'string' || !isWebLink(job.url)) continue;
          // a job clearly in another country is skipped (see isOutsideUS in shared.ts)
          if (isOutsideUS([job.city, job.state, job.country].filter((part) => typeof part === 'string').join(', ') || null)) continue;
          if (isInternTitle(job.title) || /intern/i.test(job.employment_type ?? '')) jobs.push(toImportedJob(job, account, body.name?.trim() || account));
        } catch {
          console.error(`workable ${account}: skipped one job that couldn't be read`);
        }
      }
    } catch (err) {
      // the company closed this account: no jobs here now, not a failure (see greenhouse.ts)
      if (isGone(err)) {
        console.log(`workable ${account}: no board there any more (npm run find-boards takes it off the list)`);
        return;
      }
      console.error(`workable ${account} failed:`, err);
      failed.add(account);
    }
  });
  return boardsResult('workable', jobsByAccount.flat(), accounts.length, failed, boardInId);
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
