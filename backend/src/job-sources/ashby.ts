// Ashby: a hiring site many startups use. Like Greenhouse and Lever, each company's job board
// is public (no key), and each call covers one company.
// docs: https://developers.ashbyhq.com/docs/public-job-posting-api
import {
  fetchJson, isInternTitle, guessType, guessSetting, guessLevel, isWebLink, toTime,
  isGone, isOutsideUS, atMostAtOnce, boardsResult, boardInId, BOARDS_AT_ONCE,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { boardsFor } from './found-boards.js';

// board names (the part after jobs.ashbyhq.com/), and the company's name to show.
// checked 2026-11-16: Ramp, Notion, and OpenAI had intern roles. A wrong name logs "no board there".
// More are read from found-boards.json (found-boards.ts), which npm run find-boards fills
const BOARDS = [
  { board: 'ramp', name: 'Ramp' },
  { board: 'notion', name: 'Notion' },
  { board: 'openai', name: 'OpenAI' },
  { board: 'plaid', name: 'Plaid' },
  { board: 'benchling', name: 'Benchling' },
  { board: 'zip', name: 'Zip' },
];

// only the fields we use (the real response has more)
type AshbyJob = {
  id: string;
  title: string;
  employmentType: string | null;          // 'Intern', 'FullTime', ...
  location: string | null;
  isListed: boolean | null;
  isRemote: boolean | null;
  workplaceType: string | null;           // 'Remote', 'Hybrid', 'OnSite'
  jobUrl: string;
  publishedAt: string | null;
  descriptionPlain: string | null;
  compensation?: { compensationTierSummary?: string | null } | null;
};

const SETTINGS: Record<string, ImportedJob['setting']> = { Remote: 'remote', Hybrid: 'hybrid', OnSite: 'on-site' };

export async function fetchAshby(): Promise<SourceResult> {
  // the hand-picked boards, then the found ones (see greenhouse.ts: same order every run)
  const boards = boardsFor('ashby', BOARDS.map(({ board, name }) => ({ id: board, name })));
  const jobsByBoard: ImportedJob[][] = boards.map(() => []);
  // the boards whose calls failed this time (their old jobs stay open, see boardsResult)
  const failed = new Set<string>();
  await atMostAtOnce(boards, BOARDS_AT_ONCE, async ({ id: board, name }, index) => {
    const jobs = jobsByBoard[index]!;
    try {
      const body = (await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`)) as { jobs: AshbyJob[] };
      // no list at all means the answer changed shape, not "no jobs": count it as failed
      if (!Array.isArray(body?.jobs)) throw new Error('the answer had no job list');
      for (const job of body.jobs) {
        try {
          if (typeof job.id !== 'string' || typeof job.title !== 'string' || !isWebLink(job.jobUrl) || job.isListed === false) continue;
          // a job clearly in another country is skipped (see isOutsideUS in shared.ts)
          if (isOutsideUS(job.location ?? null)) continue;
          if (job.employmentType === 'Intern' || isInternTitle(job.title)) jobs.push(toImportedJob(job, board, name));
        } catch {
          console.error(`ashby ${board}: skipped one job that couldn't be read`);
        }
      }
    } catch (err) {
      // the company closed this board: no jobs here now, not a failure (see greenhouse.ts)
      if (isGone(err)) {
        console.log(`ashby ${board}: no board there any more (npm run find-boards takes it off the list)`);
        return;
      }
      console.error(`ashby ${board} failed:`, err);
      failed.add(board);
    }
  });
  return boardsResult('ashby', jobsByBoard.flat(), boards.length, failed, boardInId);
}

function toImportedJob(job: AshbyJob, board: string, name: string): ImportedJob {
  const location = job.location?.trim() || null;
  const pay = job.compensation?.compensationTierSummary?.trim() || null;
  const description = job.descriptionPlain?.trim() || null;
  return {
    source: 'ashby',
    external_id: `${board}:${job.id}`,
    title: job.title.trim(),
    organization: name,
    type: guessType(job.title),
    level: guessLevel(job.title, description),
    location,
    // Object.hasOwn: only the names in SETTINGS (see lever.ts)
    setting: Object.hasOwn(SETTINGS, job.workplaceType ?? '') ? SETTINGS[job.workplaceType!]! : (job.isRemote ? 'remote' : guessSetting(location)),
    paid: pay ? true : null,
    pay_text: pay,
    deadline: null,
    description,
    requirements: [],
    apply_url: job.jobUrl,
    posted_at: toTime(job.publishedAt),
  };
}
