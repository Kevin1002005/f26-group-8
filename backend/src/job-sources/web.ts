// Jobs found by "Search the web" on Opportunities (web-search.ts), saved as source 'web'.
//
// The AI only suggests links. A link is only trusted when it's a posting on a hiring site with a
// public job feed (Greenhouse, Lever, Ashby, SmartRecruiters, Workable): this file reads that
// posting from the site's own feed, the same way the importer reads company boards. So:
//   - a link the AI made up, or a posting that's closed, is left out (the feed doesn't have it)
//   - the title, company, place, and description come from the hiring site, not from the AI
//   - our server only ever calls those sites' feed addresses, never a web page the AI picked
// The importer re-checks every saved web job the same way (fetchWebFinds, the 'web' source), and
// closes the ones that are gone.
import { supabase } from '../db.js';
import {
  fetchJson, isGone, isWebLink, isInternTitle, isForOurStudents, isOutsideUS, atMostAtOnce, BOARDS_AT_ONCE,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { boardsFor, isBoardId, type BoardSite } from './found-boards.js';
import { toImportedJob as greenhouseJob, type GreenhouseJob } from './greenhouse.js';
import { toImportedJob as leverJob, type LeverJob } from './lever.js';
import { toImportedJob as ashbyJob, type AshbyJob } from './ashby.js';
import { toImportedJob as smartJob, type SmartPosting } from './smartrecruiters.js';
import { toImportedJob as workableJob, type WorkableJob } from './workable.js';

// one posting on one hiring site: which site, the company's board, and the posting's id there
export type Posting = { site: BoardSite; board: string; id: string };

// The posting a link points to, or null if it isn't a posting on one of those sites.
// Only https links, and the id has to look like that site's ids
export function postingIn(url: string): Posting | null {
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  if (link.protocol !== 'https:') return null;
  const host = link.hostname.toLowerCase();
  const parts = link.pathname.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return ''; }
  });
  let posting: Posting | null = null;
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    // boards.greenhouse.io/stripe/jobs/123, or the form companies put on their own site:
    // boards.greenhouse.io/embed/job_app?for=stripe&token=123
    if (parts[0] === 'embed') {
      const board = link.searchParams.get('for') ?? '';
      const token = link.searchParams.get('token') ?? '';
      if (/^\d{1,20}$/.test(token)) posting = { site: 'greenhouse', board, id: token };
    } else if (parts[1] === 'jobs' && /^\d{1,20}$/.test(parts[2] ?? '')) {
      posting = { site: 'greenhouse', board: parts[0]!, id: parts[2]! };
    }
  } else if (host === 'jobs.lever.co') {
    // jobs.lever.co/palantir/<id>, where the id is a long code like 1a2b3c4d-....
    if (/^[0-9a-f-]{36}$/i.test(parts[1] ?? '')) posting = { site: 'lever', board: parts[0]!, id: parts[1]!.toLowerCase() };
  } else if (host === 'jobs.ashbyhq.com') {
    if (/^[0-9a-f-]{36}$/i.test(parts[1] ?? '')) posting = { site: 'ashby', board: parts[0]!, id: parts[1]!.toLowerCase() };
  } else if (host === 'jobs.smartrecruiters.com') {
    // jobs.smartrecruiters.com/Equinox/744000012345678-marketing-intern: the number is the id
    const id = /^(\d{1,20})(?:-|$)/.exec(parts[1] ?? '')?.[1];
    if (id) posting = { site: 'smartrecruiters', board: parts[0]!, id };
  } else if (host === 'apply.workable.com') {
    // apply.workable.com/huggingface/j/ABC123
    if (parts[1] === 'j' && /^[A-Za-z0-9]{1,20}$/.test(parts[2] ?? '')) posting = { site: 'workable', board: parts[0]!, id: parts[2]! };
  }
  // the board goes into a feed address, so it has to be a safe board name (found-boards.ts)
  return posting && posting.board && isBoardId(posting.board) ? posting : null;
}

// how a web job's external_id is written: "greenhouse:stripe:123", so the importer can check it again
export const webId = (p: Posting) => `${p.site}:${p.board}:${p.id}`;
function postingFromId(externalId: string): Posting | null {
  const [site, board, ...rest] = externalId.split(':');
  const id = rest.join(':');
  if (!['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable'].includes(site ?? '') || !board || !id || !isBoardId(board)) return null;
  return { site: site as BoardSite, board, id };
}

// a job for our students: an internship, co-op, research position, or program (not a full-time
// job, and not one for grad students), and not clearly outside the US
const STUDENT_TITLE = /\b(research (assistant|program|intern|scholar)s?|undergraduate|summer (program|scholars?|academy)|reu|apprentice(ship)?s?)\b/i;
export function isWebJobForOurStudents(job: ImportedJob): boolean {
  return (isInternTitle(job.title) || STUDENT_TITLE.test(job.title))
    && isForOurStudents(job.title, job.description)
    && !isOutsideUS(job.location);
}

// a company's name for the sites whose feeds don't say it (Lever, Ashby): the name in
// found-boards.json, or else the board's own name made readable ("lambda-labs" -> "Lambda Labs").
// Never the name the AI wrote: the AI only suggests links, and a name it made up (or was talked
// into) would be shown to every student as the employer
const boardNames = new Map<BoardSite, Map<string, string>>();
function companyName(site: BoardSite, board: string): string {
  // found-boards.json is read once per site, not once per posting (it doesn't change while running)
  if (!boardNames.has(site)) boardNames.set(site, new Map(boardsFor(site, []).map((b) => [b.id.toLowerCase(), b.name])));
  const found = boardNames.get(site)!.get(board.toLowerCase());
  if (found) return found;
  return board.replace(/[-_.]+/g, ' ').trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || board;
}

// Ashby and Workable have no "one posting" feed, only the whole board: kept per run (or per web
// search), so checking five postings from one company reads its board once
export type BoardCache = Map<string, Promise<unknown>>;
function wholeBoard(cache: BoardCache, url: string, waitMs: number): Promise<unknown> {
  if (!cache.has(url)) cache.set(url, fetchJson(url, {}, waitMs));
  return cache.get(url)!;
}

// Reads one posting from its hiring site's feed:
//   a job (source 'web', the hiring site's details)  it's there and open
//   'gone'    the feed says there's no such posting (made up, or taken down)
//   'failed'  the site didn't answer properly, so we can't tell
// cache: whole boards already read (pass one Map for a whole run or search). waitMs: how long to
// wait for each feed (web search waits less, so a student isn't kept waiting)
export async function checkPosting(p: Posting, cache: BoardCache = new Map(), waitMs = 60_000): Promise<ImportedJob | 'gone' | 'failed'> {
  const board = encodeURIComponent(p.board);
  try {
    let job: ImportedJob | null = null;
    if (p.site === 'greenhouse') {
      const posting = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${encodeURIComponent(p.id)}`, {}, waitMs) as GreenhouseJob;
      if (typeof posting?.id !== 'number' || typeof posting.title !== 'string') return 'failed';
      job = greenhouseJob(posting, p.board);
      // one posting's feed may leave the company's name out: then the name we know for the board
      if (job.organization === p.board) job.organization = companyName('greenhouse', p.board);
    } else if (p.site === 'lever') {
      const posting = await fetchJson(`https://api.lever.co/v0/postings/${board}/${encodeURIComponent(p.id)}?mode=json`, {}, waitMs) as LeverJob;
      if (typeof posting?.id !== 'string' || typeof posting.text !== 'string') return 'failed';
      job = leverJob(posting, companyName('lever', p.board));
    } else if (p.site === 'smartrecruiters') {
      const posting = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${board}/postings/${encodeURIComponent(p.id)}`, {}, waitMs) as SmartPosting;
      if (typeof posting?.id !== 'string' || typeof posting.name !== 'string') return 'failed';
      // SmartRecruiters says the country: one outside the US is left out
      const country = posting.location?.country?.trim().toLowerCase();
      if (country && country !== 'us') return 'gone';
      job = smartJob(posting, p.board);
    } else if (p.site === 'ashby') {
      const body = await wholeBoard(cache, `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`, waitMs) as { jobs?: AshbyJob[] };
      if (!Array.isArray(body?.jobs)) return 'failed';
      const posting = body.jobs.find((j) => typeof j?.id === 'string' && j.id.toLowerCase() === p.id && j.isListed !== false);
      if (!posting || typeof posting.title !== 'string') return 'gone';
      job = ashbyJob(posting, p.board, companyName('ashby', p.board));
    } else {
      const body = await wholeBoard(cache, `https://apply.workable.com/api/v1/widget/accounts/${board}?details=true`, waitMs) as { name?: string; jobs?: WorkableJob[] };
      if (!Array.isArray(body?.jobs)) return 'failed';
      // Workable's codes are letters and digits; "abc123" in a link is the same posting as "ABC123"
      const posting = body.jobs.find((j) => typeof j?.shortcode === 'string' && j.shortcode.toUpperCase() === p.id.toUpperCase());
      if (!posting || typeof posting.title !== 'string') return 'gone';
      job = workableJob(posting, p.board, typeof body.name === 'string' && body.name.trim() ? body.name.trim() : p.board);
    }
    // no usable link to apply on: nothing a student can do with it, and the database would refuse
    // it (and a missing one would crash the importer), so it counts as gone. Every importer checks this
    if (!isWebLink(job.apply_url)) return 'gone';
    // the hiring site's details, saved as a web find under its own id
    return { ...job, source: 'web', external_id: webId(p) };
  } catch (err) {
    return isGone(err) ? 'gone' : 'failed';
  }
}

// The 'web' source, for the importer: every open web find, checked again. The ones still there come
// back (and stay open), the gone ones don't (so they're closed), and the ones whose site didn't
// answer stay open until a run that can check them (keepOpen)
export async function fetchWebFinds(): Promise<SourceResult> {
  const saved: { external_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('jobs')
      .select('external_id')
      .eq('source', 'web')
      .eq('status', 'open')
      .order('id')
      .range(from, from + 999);
    if (error) {
      console.error('web: reading the saved web finds failed', error);
      return { jobs: [], allFetchesWorked: false };
    }
    saved.push(...data);
    if (data.length < 1000) break;
  }
  const cache: BoardCache = new Map();
  const results: (ImportedJob | null)[] = saved.map(() => null);
  const failed = new Set<string>();
  await atMostAtOnce(saved, BOARDS_AT_ONCE, async ({ external_id }, index) => {
    const posting = postingFromId(external_id);
    if (!posting) return;   // not written the way web-search.ts writes them: closed
    const checked = await checkPosting(posting, cache);
    if (checked === 'failed') failed.add(external_id);
    else if (checked !== 'gone' && isWebJobForOurStudents(checked)) results[index] = checked;
  });
  if (failed.size > 0) console.log(`web: ${failed.size} of ${saved.length} saved web finds couldn't be checked, so they stay open`);
  return {
    jobs: results.filter((job): job is ImportedJob => job !== null),
    allFetchesWorked: failed.size <= saved.length / 2,
    keepOpen: failed.size > 0 ? (job) => failed.has(job.external_id) : undefined,
  };
}
