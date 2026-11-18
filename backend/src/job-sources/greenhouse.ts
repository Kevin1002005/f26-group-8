// Greenhouse: a hiring site many companies use. Their job boards are public, no key needed,
// but each call only covers one company.
// docs: https://developers.greenhouse.io/job-board.html
import {
  fetchJson, isInternTitle, guessType, guessSetting, toDate, toTime, htmlToText, isWebLink,
  isGone, isOutsideUS, atMostAtOnce, boardsResult, boardInId, BOARDS_AT_ONCE,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { boardsFor } from './found-boards.js';

// board tokens: the company's name in boards.greenhouse.io/<token>.
// checked 2026-11-13: each of these had at least 2 intern jobs listed.
// to add a company, add its token here (a wrong token just logs "no board there").
// Hundreds more are read from found-boards.json (found-boards.ts), which npm run find-boards fills
const BOARDS = [
  'stripe', 'coinbase', 'lyft', 'pinterest', 'databricks',
  'samsara', 'figma', 'cloudflare', 'airbnb', 'datadog',
];

// only the fields we use (the real response has more)
export type GreenhouseJob = {
  id: number;
  title: string;
  company_name: string | null;
  absolute_url: string;
  location: { name: string } | null;
  content: string | null;               // the description, as HTML with < > written as &lt; &gt;
  application_deadline: string | null;  // usually null
  first_published?: string | null;      // when the company first posted it
};


// Each board is read in two steps:
//   1. its list of jobs, titles and places only. Small, even for a company with thousands of jobs
//   2. the full post of each internship on it (in the US), one at a time
// (Asking for the list WITH every description is one call, but for a big company like Anduril
// it's over 40 MB, more than we read at once (MOST_BYTES in shared.ts), and a few of those at
// the same time could use up the server's memory during Refresh)
export async function fetchGreenhouse(): Promise<SourceResult> {
  // the hand-picked boards, then the found ones (no company twice)
  const boards = boardsFor('greenhouse', BOARDS.map((id) => ({ id, name: id }))).map((board) => board.id);
  // each board's jobs in its own spot, so the list comes out in the same order every run
  // (the boards finish in a different order each time, since a few run at once)
  const jobsByBoard: ImportedJob[][] = boards.map(() => []);
  // the boards whose calls failed this time (their old jobs stay open, see boardsResult)
  const failed = new Set<string>();

  // a few companies at a time (BOARDS_AT_ONCE), not all at once, so we don't flood their servers
  await atMostAtOnce(boards, BOARDS_AT_ONCE, async (board, index) => {
    const jobs = jobsByBoard[index]!;
    // encodeURIComponent: the board name goes inside the address, so it can't change the address
    const boardUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`;
    try {
      // 1. the list (no descriptions)
      const body = (await fetchJson(boardUrl)) as { jobs: GreenhouseJob[] };
      // no list at all means the answer changed shape, not "no jobs": count it as failed
      if (!Array.isArray(body?.jobs)) throw new Error('the answer had no job list');

      // the internships in the US. "as { jobs: GreenhouseJob[] }" above only tells TypeScript
      // what to expect, and nothing checks it while running, so a job missing what our table
      // requires (or that's null) is skipped instead of making the whole save fail
      const internships = body.jobs.filter((job) =>
        typeof job?.id === 'number' && typeof job.title === 'string' && isWebLink(job.absolute_url)
        && isInternTitle(job.title) && !isOutsideUS(typeof job.location?.name === 'string' ? job.location.name : null));

      // 2. each internship's full post (the list doesn't have the description)
      for (const listed of internships) {
        let job: GreenhouseJob;
        try {
          job = (await fetchJson(`${boardUrl}/${listed.id}`)) as GreenhouseJob;
        } catch (err) {
          // taken down since step 1: it's gone, so it's just left out
          if (isGone(err)) continue;
          throw err;   // anything else: this board failed (the catch at the bottom)
        }
        // a job that can't be read at all (a location that's a number, so .trim() throws) is
        // skipped on its own, so it doesn't lose the rest of this company's jobs
        try {
          if (typeof job?.id !== 'number' || typeof job.title !== 'string' || !isWebLink(job.absolute_url)) continue;
          jobs.push(toImportedJob(job, board));
        } catch {
          console.error(`greenhouse ${board}: skipped one job that couldn't be read`);
        }
      }
    } catch (err) {
      if (isGone(err)) {
        // the list itself is gone: the company closed this board (or moved to another hiring
        // site), so it has no jobs here now and its old ones can be closed. Not a failure
        console.log(`greenhouse ${board}: no board there any more (npm run find-boards takes it off the list)`);
        return;
      }
      // one company failing shouldn't stop the others. The jobs already read from it are still
      // saved, and its old ones stay open until a run that reads it all (see boardsResult)
      console.error(`greenhouse ${board} failed:`, err);
      failed.add(board);
    }
  });

  return boardsResult('greenhouse', jobsByBoard.flat(), boards.length, failed, boardInId);
}


// turns one Greenhouse job into one row for our jobs table
export function toImportedJob(job: GreenhouseJob, board: string): ImportedJob {
  const location = job.location?.name?.trim() || null;

  return {
    source: 'greenhouse',
    // put the board in front of the id, so two companies can never end up with the same id
    external_id: `${board}:${job.id}`,
    title: job.title.trim(),
    organization: job.company_name?.trim() || board,
    type: guessType(job.title),
    // Greenhouse doesn't say who can apply. Company internships are almost always for
    // college students, so 'college' is the closest fit.
    level: 'college',
    location,
    setting: guessSetting(location),   // e.g. "Hybrid - New York, NY" -> 'hybrid'
    paid: null,       // pay is only written inside the description, if at all
    pay_text: null,
    deadline: toDate(job.application_deadline),
    description: htmlToText(job.content, { escaped: true }),   // escaped: see htmlToText in shared.ts
    requirements: [],
    apply_url: job.absolute_url,
    // first_published, not updated_at: updated_at changes every time the company edits the post
    posted_at: toTime(job.first_published),
  };
}
