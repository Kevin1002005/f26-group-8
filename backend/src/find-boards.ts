// npm run find-boards (from backend/): finds the company job boards that the GitHub lists we
// import link to, checks that each one is still there, and saves them in
// job-sources/found-boards.json. The importer and Refresh then read every one of those
// companies' boards directly (found-boards.ts says why: more internships, outside tech too, and
// with descriptions).
//
// It only reads public pages (the GitHub lists, and the companies' public job boards), so it needs
// no keys and never touches our database. It takes a few minutes. Run it every few weeks
// (companies don't switch hiring sites often), look over what changed, and commit found-boards.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchSimplify } from './job-sources/simplify.js';
import { fetchCo0oper } from './job-sources/co0oper.js';
import { fetchSpeedyApply } from './job-sources/speedyapply.js';
import { fetchJson, atMostAtOnce, isGone } from './job-sources/shared.js';
import { MOST_BOARDS, isBoardId, type Board, type BoardSite } from './job-sources/found-boards.js';

// FOUND_BOARDS_FILE: another file instead (the same setting found-boards.ts reads; the tests use it)
const FILE = process.env.FOUND_BOARDS_FILE || new URL('./job-sources/found-boards.json', import.meta.url);
const SITES: BoardSite[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable'];
// how many boards are checked at the same time (gentle on their servers, but not all day)
const CHECKS_AT_ONCE = 6;

// vanshb03's list: the same file vanshb03.ts reads. (vanshb03.ts itself isn't used here because
// it needs the database, for the short links it follows)
const VANSH_LIST_URL = 'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json';

// how to spot each hiring site's board in a job's link, and where the board's id is in it
// ([^/?#&]+ means "everything up to the next / ? # or &"). Only https links, and not the EU
// versions of the sites (job-boards.eu.greenhouse.io, jobs.eu.lever.co): those boards are in Europe
const BOARD_LINKS: Record<BoardSite, RegExp[]> = {
  // boards.greenhouse.io/stripe/jobs/123, job-boards.greenhouse.io/stripe/jobs/123, and the
  // form some companies put on their own site: boards.greenhouse.io/embed/job_app?for=stripe&token=123
  greenhouse: [
    /^https:\/\/(?:boards|job-boards)\.greenhouse\.io\/embed\/job_app\?(?:[^#]*&)?for=([^&#]+)/i,
    /^https:\/\/(?:boards|job-boards)\.greenhouse\.io\/([^/?#&]+)/i,
  ],
  lever: [/^https:\/\/jobs\.lever\.co\/([^/?#&]+)/i],
  ashby: [/^https:\/\/jobs\.ashbyhq\.com\/([^/?#&]+)/i],
  smartrecruiters: [/^https:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#&]+)/i],
  workable: [/^https:\/\/apply\.workable\.com\/([^/?#&]+)/i],
};
// parts of those addresses that aren't a company's name (apply.workable.com/j/<code> has no
// company in it, and boards.greenhouse.io/embed/... is the form above)
const NOT_COMPANIES = new Set(['j', 'api', 'embed', 'jobs', 'oneclick-ui', 'careers', 'v1', 'search']);

// each site's public board address, to check that a board is there. The same boards the sources
// read, but asking for as little as possible
const CHECK_URL: Record<BoardSite, (id: string) => string> = {
  greenhouse: (id) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(id)}/jobs`,
  lever: (id) => `https://api.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json&limit=1`,
  ashby: (id) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(id)}`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=1`,
  workable: (id) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(id)}`,
};

// one board while we work: its id as written in the links, how many listings link to it, and
// the company names those listings use (the most used one is saved)
type Found = { id: string; links: number; names: Map<string, number>; before: boolean };

// ---------- 1. every job link in the GitHub lists, with its company's name ----------
async function listLinks(): Promise<{ name: string; url: string }[]> {
  const links: { name: string; url: string }[] = [];
  let listsRead = 0;
  // the lists our importer already reads (their own code reads them, so they're read the same way)
  for (const [list, fetchList] of [['simplify', fetchSimplify], ['co0oper', fetchCo0oper], ['speedyapply', fetchSpeedyApply]] as const) {
    const result = await fetchList();
    if (result.jobs.length === 0) {
      console.error(`${list}: no jobs read, so its links are left out this time`);
      continue;
    }
    listsRead++;
    for (const job of result.jobs) links.push({ name: job.organization, url: job.apply_url });
    console.log(`${list}: ${result.jobs.length} jobs`);
  }
  // vanshb03's file, read directly: each listing's company_name and url
  try {
    const body = await fetchJson(VANSH_LIST_URL);
    if (!Array.isArray(body)) throw new Error('the answer had no list');
    let count = 0;
    for (const listing of body as { company_name?: unknown; url?: unknown; active?: unknown }[]) {
      if (listing?.active !== true || typeof listing.company_name !== 'string' || typeof listing.url !== 'string') continue;
      links.push({ name: listing.company_name, url: listing.url });
      count++;
    }
    listsRead++;
    console.log(`vanshb03: ${count} jobs`);
  } catch (err) {
    console.error('vanshb03: could not be read, so its links are left out this time:', (err as Error).message);
  }
  if (listsRead === 0) throw new Error('none of the GitHub lists could be read');
  return links;
}

// ---------- 2. the boards those links point to ----------
function boardsIn(links: { name: string; url: string }[], found: Map<BoardSite, Map<string, Found>>) {
  for (const { name, url } of links) {
    for (const site of SITES) {
      const match = BOARD_LINKS[site].map((pattern) => pattern.exec(url)).find((m) => m);
      if (!match) continue;
      let id: string;
      try {
        id = decodeURIComponent(match[1]!).trim();
      } catch {
        break;   // a broken %-code in the link: not a board we can read
      }
      if (NOT_COMPANIES.has(id.toLowerCase()) || !isBoardId(id)) break;
      const boards = found.get(site)!;
      const key = id.toLowerCase();
      const board = boards.get(key) ?? { id, links: 0, names: new Map(), before: false };
      board.links++;
      const company = name.trim();
      if (company) board.names.set(company, (board.names.get(company) ?? 0) + 1);
      boards.set(key, board);
      break;   // a link is on one site only
    }
  }
}

// the boards saved last time, so a board stays listed even when it's missing from today's lists
// (the GitHub lists only show a company while it has a tech internship open)
function boardsBefore(found: Map<BoardSite, Map<string, Found>>) {
  let saved: Partial<Record<BoardSite, Board[]>> = {};
  try {
    saved = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    console.log('no found-boards.json yet: starting a new one');
  }
  for (const site of SITES) {
    for (const board of Array.isArray(saved[site]) ? saved[site]! : []) {
      if (typeof board?.id !== 'string' || !isBoardId(board.id)) continue;
      const key = board.id.toLowerCase();
      const existing = found.get(site)!.get(key);
      if (existing) {
        existing.before = true;
      } else {
        const names = new Map<string, number>();
        if (typeof board.name === 'string' && board.name.trim()) names.set(board.name.trim(), 1);
        found.get(site)!.set(key, { id: board.id, links: 0, names, before: true });
      }
    }
  }
}

// ---------- 3. is each board still there? ----------
// 'yes', 'gone' (the company closed it: taken off the list), or 'unsure' (the site didn't answer:
// a board from last time is kept, a new one waits for the next run)
async function check(site: BoardSite, id: string): Promise<'yes' | 'gone' | 'unsure'> {
  try {
    const body = await fetchJson(CHECK_URL[site](id)) as { jobs?: unknown; content?: unknown };
    if (site === 'lever') return Array.isArray(body) ? 'yes' : 'unsure';
    // SmartRecruiters answers even for a company that isn't there (with no postings), so a company
    // with no postings at all is left off. (It comes back once a list links to one of its jobs)
    if (site === 'smartrecruiters') return Array.isArray(body?.content) && body.content.length > 0 ? 'yes' : 'gone';
    return Array.isArray(body?.jobs) ? 'yes' : 'unsure';
  } catch (err) {
    return isGone(err) ? 'gone' : 'unsure';
  }
}

// ---------- 4. save the file: one board per line, so a change is easy to read in git ----------
function save(kept: Record<BoardSite, Board[]>) {
  const lines = ['{', '  "about": "Company job boards that npm run find-boards (backend/src/find-boards.ts) found in the GitHub lists. The importer and Refresh read each one: see job-sources/found-boards.ts",'];
  lines.push(`  "checked": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`);
  SITES.forEach((site, i) => {
    lines.push(`  ${JSON.stringify(site)}: [`);
    kept[site].forEach((board, j) => {
      lines.push(`    ${JSON.stringify({ id: board.id, name: board.name })}${j < kept[site].length - 1 ? ',' : ''}`);
    });
    lines.push(`  ]${i < SITES.length - 1 ? ',' : ''}`);
  });
  lines.push('}', '');
  writeFileSync(FILE, lines.join('\n'));
}

async function main() {
  const found = new Map<BoardSite, Map<string, Found>>(SITES.map((site) => [site, new Map()]));
  boardsIn(await listLinks(), found);
  boardsBefore(found);

  const kept = {} as Record<BoardSite, Board[]>;
  for (const site of SITES) {
    // the most-linked first, so if there are more than MOST_BOARDS, the least-linked are left out
    const boards = [...found.get(site)!.values()].sort((a, b) => b.links - a.links || a.id.localeCompare(b.id)).slice(0, MOST_BOARDS);
    const results: ('yes' | 'gone' | 'unsure')[] = [];
    await atMostAtOnce(boards, CHECKS_AT_ONCE, async (board, i) => {
      results[i] = await check(site, board.id);
    });
    const keep = boards.filter((board, i) => results[i] === 'yes' || (results[i] === 'unsure' && board.before));
    const gone = boards.filter((_, i) => results[i] === 'gone').length;
    const unsure = boards.filter((board, i) => results[i] === 'unsure' && !board.before).length;
    console.log(`${site}: ${keep.length} boards (${boards.filter((b) => !b.before).length} new, ${gone} gone, ${unsure} new ones didn't answer and wait for next time)`);
    // the most used company name for each board; sorted by id so the file's order doesn't jump around
    kept[site] = keep
      .map((board) => ({ id: board.id, name: [...board.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? board.id }))
      .sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
  }
  save(kept);
  console.log('saved backend/src/job-sources/found-boards.json: look over the changes, then commit it');
}

main().catch((err) => {
  console.error('find-boards failed, so found-boards.json was not changed:', err);
  process.exitCode = 1;
});
