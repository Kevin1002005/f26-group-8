// plans.md Task JB3: the routes anyone can use to read jobs (no login needed).
//   GET /api/jobs        a page of open jobs, with filters and search
//   GET /api/jobs/:id    one job
// and one for logged-in students (Opportunities uses it):
//   GET /api/jobs/for-me every filter, sorting (newest, best fit, deadline, company),
//                        and how well each job fits you (fit.ts)
//   POST /api/jobs/refresh  check the job sites for new listings (at most every 30 minutes)
// the employer and admin routes (JB5) get added to this file later.
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';
import { fitFor, mentions, studentFrom } from './fit.js';
import { refreshSources, runImport } from './import-runner.js';

const router = express.Router();

// the columns we send to the frontend: the contract's Job, plus source and status.
// external_id and last_seen_at are only for the importer, so they stay out.
const JOB_COLUMNS =
  'id, title, organization, type, level, location, setting, paid, pay_text, deadline, ' +
  'description, requirements, apply_url, posted_by, created_at, posted_at, source, status';

const PAGE_SIZE = 50;

// the values each filter allows: the same lists as the checks in backend/sql/jobs.sql
const TYPES = ['internship', 'co-op', 'research', 'program'];
const LEVELS = ['high-school', 'college', 'both'];
const SETTINGS = ['remote', 'hybrid', 'on-site'];
const PAID = ['true', 'false'];

// what a uuid looks like: 8-4-4-4-12 hex digits
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// reads one filter from the URL, e.g. the "co-op" in ?type=co-op. Returns:
//   undefined -> the filter wasn't used (missing, or empty like ?type=)
//   a string  -> one of the allowed values
//   null      -> anything else, which the route turns into a 400
function readFilter(value: unknown, allowed: string[]): string | undefined | null {
  if (value === undefined || value === '') return undefined;
  // typeof matters: ?type=a&type=b gives a list, not a string
  if (typeof value !== 'string' || !allowed.includes(value)) return null;
  return value;
}

// today as YYYY-MM-DD, in Boston time (where our students are).
// 'en-CA' just happens to write dates as YYYY-MM-DD. without timeZone it would use whatever
// clock the server runs on, and servers often run on UTC, which turns into "tomorrow"
// at 7pm Boston time and would hide jobs due today too early.
function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}


// JB3b: GET /api/jobs?type=&level=&setting=&paid=&q=&page=
router.get('/', async (req, res) => {
  const type = readFilter(req.query.type, TYPES);
  const level = readFilter(req.query.level, LEVELS);
  const setting = readFilter(req.query.setting, SETTINGS);
  const paid = readFilter(req.query.paid, PAID);

  if (type === null || level === null || setting === null || paid === null) {
    return res.status(400).json({ error: 'Unknown filter value' });
  }

  // page=1 is the first 50 jobs, page=2 the next 50, and so on. no page means page 1.
  // at most 4 digits, so nobody can ask the database to skip billions of rows
  const pageText = req.query.page || '1';
  if (typeof pageText !== 'string' || !/^[1-9]\d{0,3}$/.test(pageText)) {
    return res.status(400).json({ error: 'Unknown page' });
  }
  const page = Number(pageText);

  // search words: keep only letters, digits, spaces and hyphens.
  // q goes inside a filter string where commas, dots, brackets, quotes, % and * all have
  // special meanings, so leaving any of them in could break the query or change what it does.
  // (\p{L} = any letter, including accented ones. \p{M} = accent marks typed as their own
  // character, which some languages need too (Hindi's vowel signs). \p{N} = any digit.
  // \s = any kind of space: a tab, or the no-break space in text pasted from a web page,
  // so "software engineer" doesn't get glued into "softwareengineer".)
  // normalize('NFC') first joins a letter with an accent typed separately into one letter,
  // so "José" typed that way still matches the "José" saved in the database.
  // Array.from(...).slice counts letters, not code units: a plain .slice(0, 100) can cut a
  // rare letter in half, and supabase-js can't put half a letter in a web address (it throws)
  const qText = req.query.q ?? '';
  if (typeof qText !== 'string') {
    return res.status(400).json({ error: 'Unknown search' });
  }
  const cleaned = qText.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
  const q = Array.from(cleaned).slice(0, 100).join('');

  let query = supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    // pending jobs wait for an admin, closed ones are gone: only open jobs are listed
    .eq('status', 'open')
    // hide past deadlines: keep jobs with no deadline, or one that's today or later
    .or(`deadline.is.null,deadline.gte.${today()}`);

  if (type) query = query.eq('type', type);
  if (setting) query = query.eq('setting', setting);
  // paid=false means "says it's unpaid". jobs that don't say (null) match neither
  if (paid) query = query.eq('paid', paid === 'true');

  if (level) {
    // a job marked 'both' fits high schoolers AND college students, so it shows up for either
    query = level === 'both'
      ? query.eq('level', 'both')
      : query.in('level', [level, 'both']);
  }

  if (q) {
    // the search word anywhere in the title or the company name, ignoring upper/lower case
    query = query.or(`title.ilike.%${q}%,organization.ilike.%${q}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: jobs, error } = await query
    // newest first, by when the company posted it (posted_at, jobs.sql step 6). Jobs whose
    // site didn't say go after the ones that did, newest found first. every job saved by the
    // same import has the exact same created_at, so id breaks the last tie. without it, the
    // order among them could change between requests, and the same job could show up on
    // page 1 AND page 2.
    .order('posted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id')
    // range counts from 0 and includes both ends: page 1 = rows 0 to 49
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error('job list failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  // fewer than 50 jobs back means this is the last page
  res.json({ jobs });
});


// ---------- GET /api/jobs/for-me ----------
// Opportunities' list, for a logged-in student. It loads every open job once (kept for a minute,
// see openJobs), then filters, sorts, and scores them here in code. That lets it match whole
// words ("AI" isn't in "maintain"), and sort by how well each job fits you, across ALL the jobs.
//
// ?type= &level= &setting= &paid=true   the same as GET /api/jobs
// &q=            search words, in the title, company, or location
// &include=      words the job must mention, with commas between ("python,spanish")
// &exclude=      words it must NOT mention ("phd,us citizen")
// &posted=       day | week | month (when the company posted it)
// &deadline=     has (it has one) | soon (due in the next 2 weeks)
// &location=     a city or state, like "Boston" or "CA"
// &hide=         a company to leave out (repeat it for more: &hide=A&hide=B)
// &major=only    only jobs that fit your major (from your profile)
// &sort=         newest (the default) | fit | deadline | company
// &page=         1, 2, 3... (50 jobs a page)
// -> { jobs: [each job, plus fit: { score, reasons }], total, more, major }

// How long the list of open jobs is kept before asking the database again. A minute, so a
// student changing filters doesn't load thousands of jobs every time. (Tests set it to 0)
const CACHE_MS = Number(process.env.JOBS_CACHE_SECONDS ?? 60) * 1000;
type ListedJob = Record<string, unknown> & {
  id: string; title: string; organization: string; type: string; level: string; setting: string | null;
  paid: boolean | null; location: string | null; deadline: string | null; posted_at: string | null;
  description: string | null; requirements: string[] | null;
  ai_majors?: string[] | null; ai_skills?: string[] | null;
};
type OpenJob = { job: ListedJob; text: string };
// each open job, with all its words in lower case (text), for matching
let openJobsCache: { at: number; jobs: OpenJob[] } | null = null;
// Best fit also reads each job's AI tags (ai-tags.ts). If jobs.sql step 8 hasn't been run yet,
// those columns don't exist, so we ask without them instead of breaking Opportunities
const AI_COLUMNS = ', ai_majors, ai_skills';
let aiColumnsMissing = false;

// The load that's running right now, if one is. Students who ask while it runs wait for that
// same load instead of starting their own: 20 students opening Opportunities in the same
// second used to mean 20 full copies of every job in memory at once (over 1 GB in the stress test)
let openJobsLoading: Promise<OpenJob[] | null> | null = null;

// Every open job, newest posted first. null if the database can't be reached
async function openJobs(): Promise<OpenJob[] | null> {
  if (openJobsCache && Date.now() - openJobsCache.at < CACHE_MS) return openJobsCache.jobs;
  if (!openJobsLoading) {
    // .finally runs when the load ends either way, so the next miss starts a fresh one
    openJobsLoading = loadOpenJobs().finally(() => { openJobsLoading = null; });
  }
  return openJobsLoading;
}

// Loads every open job (Supabase sends at most 1000 rows a call, so it asks 1000 at a time)
async function loadOpenJobs(): Promise<OpenJob[] | null> {
  const jobs: OpenJob[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('jobs')
      .select(JOB_COLUMNS + (aiColumnsMissing ? '' : AI_COLUMNS))
      .eq('status', 'open')
      .or(`deadline.is.null,deadline.gte.${today()}`)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + 999);
    // 42703 = "that column doesn't exist". If it's one of the AI columns, ask again from the
    // start without them (any other missing column is a real problem, reported below)
    if (error && error.code === '42703' && /ai_/.test(error.message) && !aiColumnsMissing) {
      console.error('jobs.sql step 8 (AI tags) hasn\'t been run yet, so Best fit works without AI tags');
      aiColumnsMissing = true;
      return loadOpenJobs();
    }
    if (error) {
      console.error('open jobs lookup failed:', error);
      return null;
    }
    for (const job of data as unknown as ListedJob[]) {
      const words = [job.title, job.organization, job.description ?? '', ...(job.requirements ?? [])].join(' ');
      jobs.push({ job, text: words.toLowerCase() });
    }
    if (data.length < 1000) break;
  }
  openJobsCache = { at: Date.now(), jobs };
  return jobs;
}

// Forget the kept list, so the next request sees new jobs right away (after a Refresh import)
export function forgetOpenJobs() {
  openJobsCache = null;
}

// A list of words from ?include= or ?exclude=: split at commas, only letters, digits, spaces,
// and + # . - (so "C++" and "C#" work), at most 8 words of 40 letters. null if it isn't text
function readWords(value: unknown): string[] | null {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') return null;
  return [...new Set(value.split(',')
    .map((w) => w.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s+#.-]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((w) => w !== '')
    .map((w) => Array.from(w).slice(0, 40).join('')))].slice(0, 8);
}

// A company list from ?hide= (one, or several). null if it isn't text
function readCompanies(value: unknown): string[] | null {
  if (value === undefined || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  if (!list.every((v) => typeof v === 'string')) return null;
  return [...new Set((list as string[]).map((v) => v.trim().toLowerCase()).filter((v) => v !== '' && v.length <= 200))].slice(0, 50);
}

// Cleans a search or location box the same way GET /api/jobs cleans its search (see there)
function cleanBox(value: string, allowed: RegExp, most: number): string {
  return Array.from(value.normalize('NFC').replace(allowed, '').replace(/\s+/g, ' ').trim().toLowerCase()).slice(0, most).join('');
}

router.get('/for-me', authenticateToken, async (req, res) => {
  const type = readFilter(req.query.type, TYPES);
  const level = readFilter(req.query.level, LEVELS);
  const setting = readFilter(req.query.setting, SETTINGS);
  const paid = readFilter(req.query.paid, PAID);
  const posted = readFilter(req.query.posted, ['day', 'week', 'month']);
  const deadline = readFilter(req.query.deadline, ['has', 'soon']);
  const sortChoice = readFilter(req.query.sort, ['newest', 'fit', 'deadline', 'company']);
  const major = readFilter(req.query.major, ['only']);
  const include = readWords(req.query.include);
  const exclude = readWords(req.query.exclude);
  const hide = readCompanies(req.query.hide);
  if (type === null || level === null || setting === null || paid === null || posted === null || deadline === null
    || sortChoice === null || major === null || include === null || exclude === null || hide === null) {
    return res.status(400).json({ error: 'Unknown filter value' });
  }
  const sort = sortChoice ?? 'newest';
  const pageText = req.query.page || '1';
  if (typeof pageText !== 'string' || !/^[1-9]\d{0,3}$/.test(pageText)) {
    return res.status(400).json({ error: 'Unknown page' });
  }
  const page = Number(pageText);
  const qText = req.query.q ?? '';
  const locationText = req.query.location ?? '';
  if (typeof qText !== 'string' || typeof locationText !== 'string') {
    return res.status(400).json({ error: 'Unknown search' });
  }
  const q = cleanBox(qText, /[^\p{L}\p{M}\p{N}\s-]/gu, 100);
  const location = cleanBox(locationText, /[^\p{L}\p{M}\p{N}\s,.'-]/gu, 60);

  // the student (for best fit and "only my major") and the jobs, all at once
  const me = req.user!.id;
  const [profile, resume, all] = await Promise.all([
    supabase.from('student_profiles').select('data').eq('student_id', me).maybeSingle(),
    supabase.from('resumes').select('data').eq('student_id', me).maybeSingle(),
    openJobs(),
  ]);
  if (profile.error || resume.error) {
    console.error('student lookup for fit failed:', profile.error ?? resume.error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (all === null) return res.status(500).json({ error: 'Database error' });
  const student = studentFrom(profile.data?.data, resume.data?.data);
  if (major === 'only' && student.majorWords.length === 0) {
    return res.status(400).json({ error: 'Add your major to your profile first' });
  }

  const day = 24 * 60 * 60 * 1000;
  const postedDays: Record<string, number> = { day: 1, week: 7, month: 31 };
  const postedSince = posted ? Date.now() - (postedDays[posted] ?? 0) * day : 0;
  // "due soon" = by 2 weeks from today (Boston time, like the rest of this file)
  const soon = new Date(Date.parse(today() + 'T12:00:00Z') + 14 * day).toISOString().slice(0, 10);

  // 1. filter, and work out each job's fit
  const kept: { job: ListedJob; score: number | null; reasons: string[] }[] = [];
  for (const { job, text } of all) {
    if (type && job.type !== type) continue;
    // a job for "both" fits high schoolers AND college students
    if (level && level !== 'both' && job.level !== level && job.level !== 'both') continue;
    if (level === 'both' && job.level !== 'both') continue;
    if (setting && job.setting !== setting) continue;
    if (paid && job.paid !== (paid === 'true')) continue;
    if (postedSince && !(job.posted_at && Date.parse(job.posted_at) >= postedSince)) continue;
    if (deadline === 'has' && !job.deadline) continue;
    if (deadline === 'soon' && !(job.deadline && job.deadline <= soon)) continue;
    if (q && !q.split(' ').every((w) => [job.title, job.organization, job.location ?? ''].join(' ').toLowerCase().includes(w))) continue;
    if (location && !(job.location ?? '').toLowerCase().includes(location)) continue;
    if (hide.includes(job.organization.toLowerCase())) continue;
    if (!include.every((w) => mentions(text, w))) continue;
    if (exclude.some((w) => mentions(text, w))) continue;
    const fit = fitFor(job, text, student);
    if (major === 'only' && !fit.majorMatch) continue;
    kept.push({ job, score: fit.score, reasons: fit.reasons });
  }

  // 2. sort. The list is already newest posted first, and .sort() keeps that order for ties
  if (sort === 'fit') kept.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (sort === 'deadline') kept.sort((a, b) => (a.job.deadline ?? '9999-12-31').localeCompare(b.job.deadline ?? '9999-12-31'));
  if (sort === 'company') kept.sort((a, b) => a.job.organization.localeCompare(b.job.organization) || a.job.title.localeCompare(b.job.title));

  // 3. one page of 50
  const from = (page - 1) * PAGE_SIZE;
  res.json({
    jobs: kept.slice(from, from + PAGE_SIZE).map(({ job, score, reasons }) => ({ ...job, fit: { score, reasons } })),
    total: kept.length,
    more: from + PAGE_SIZE < kept.length,
    major: student.major,
  });
});


// ---------- Refresh: check the job sites for new listings ----------
//   POST /api/jobs/refresh   start a check (the company boards, NSF, the GitHub lists, and USAJOBS
//                            if its key is set: refreshSources in import-runner.ts), then AI tags
//                            -> 202 { started: true, refresh } or 200 { started: false, refresh }
//   GET  /api/jobs/refresh   how the last check went -> { refresh }
// refresh = { last_started_at, running, worked, next_at (when the next check can start) }
// Only one check every 30 minutes for the whole site (the job_refreshes table, jobs.sql step 7),
// so pressing Refresh over and over can't make our server hammer the job sites. Logged in only.
const REFRESH_EVERY_MS = 30 * 60 * 1000;
type RefreshRow = { started_at: string; finished_at: string | null; worked: boolean | null };

function refreshInfo(row: RefreshRow | null) {
  const started = row ? Date.parse(row.started_at) : 0;
  const finished = row?.finished_at ? Date.parse(row.finished_at) : 0;
  const recent = started > 0 && Date.now() - started < REFRESH_EVERY_MS;
  return {
    last_started_at: started > 0 ? row!.started_at : null,
    // a check that's been "running" for 30 minutes stopped somewhere (the server restarted)
    running: recent && finished < started,
    worked: row?.worked ?? null,
    next_at: new Date(Math.max(Date.now(), started + REFRESH_EVERY_MS)).toISOString(),
  };
}

async function readRefresh(): Promise<RefreshRow | null | undefined> {
  const { data, error } = await supabase.from('job_refreshes').select('started_at, finished_at, worked').eq('id', 1).maybeSingle();
  if (error) {
    console.error('refresh lookup failed:', error);
    return undefined;
  }
  return data;
}

router.get('/refresh', authenticateToken, async (req, res) => {
  const row = await readRefresh();
  if (row === undefined) return res.status(500).json({ error: 'Database error' });
  res.json({ refresh: refreshInfo(row) });
});

router.post('/refresh', authenticateToken, async (req, res) => {
  const now = new Date();
  // "take the turn": one update that only matches if the last check started over 30 minutes
  // ago. Two people pressing Refresh at the same moment can't both get it
  const { data: claimed, error } = await supabase
    .from('job_refreshes')
    .update({ started_at: now.toISOString(), finished_at: null, worked: null })
    .eq('id', 1)
    .lt('started_at', new Date(now.getTime() - REFRESH_EVERY_MS).toISOString())
    .select('started_at, finished_at, worked');
  if (error) {
    console.error('refresh claim failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  let row: RefreshRow | null | undefined = claimed[0];
  if (!row) {
    row = await readRefresh();
    if (row === undefined) return res.status(500).json({ error: 'Database error' });
    if (row) {
      // checked less than 30 minutes ago (or checking right now): not an error, it says when
      return res.json({ started: false, refresh: refreshInfo(row) });
    }
    // no row at all yet (jobs.sql step 7 didn't add it): add it, and take the turn
    const { error: insertError } = await supabase.from('job_refreshes').insert({ id: 1, started_at: now.toISOString() });
    if (insertError) {
      if (insertError.code === '23505') return res.json({ started: false, refresh: refreshInfo(await readRefresh() ?? null) });
      console.error('refresh insert failed:', insertError);
      return res.status(500).json({ error: 'Database error' });
    }
    row = { started_at: now.toISOString(), finished_at: null, worked: null };
  }

  // start it without waiting (it can take a minute or two), and answer right away
  const finish = async (worked: boolean) => {
    // so the next list has the new jobs, without waiting for the kept copy to run out
    forgetOpenJobs();
    const { error: finishError } = await supabase
      .from('job_refreshes')
      .update({ finished_at: new Date().toISOString(), worked })
      .eq('id', 1)
      .eq('started_at', row!.started_at);
    if (finishError) console.error('refresh finish failed:', finishError);
  };
  runImport(refreshSources())
    .then((worked) => finish(worked))
    .catch((err) => {
      console.error('refresh import failed:', err);
      return finish(false);
    });
  res.status(202).json({ started: true, refresh: refreshInfo(row) });
});


// JB5a goes HERE, above /:id: GET /mine has to come first, or Express would
// treat "mine" as a job id and send it to the route below.


// JB3c: GET /api/jobs/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // check the shape first. something like "abc" would make Postgres throw
  // "invalid input syntax for type uuid", which we'd turn into a 500,
  // even though it really just means there's no such job.
  if (!UUID.test(id)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    // pending jobs stay hidden until an admin verifies the employer.
    // closed jobs are still shown (the frontend can say "this listing is closed"),
    // so a link a student saved doesn't suddenly turn into "not found".
    .neq('status', 'pending')
    .maybeSingle();

  if (error) {
    console.error('job lookup failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job });
});

export default router;
