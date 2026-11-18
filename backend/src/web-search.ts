// "Search the web" on Opportunities: POST /api/web-search { q }
//
// When a student's search finds too little, they can ask an AI (Google's Gemini, with Google Search)
// to look for more internships, co-ops, research positions, and programs on the web.
//
// What's sent (the Data Policy, frontend/src/pages/DataPolicy.jsx, says the same): ONLY the words the
// student typed in the search bar. Nothing from their profile or resume, not their name, email, or
// school. We use the free Gemini key, and Google may use what's sent to improve its products, which
// is why the profile never goes. The profile is still used, here on our own server, to work out
// each found job's Best fit, the same way the Opportunities list does.
//
// What comes back: the AI only suggests links. Each one is checked on its hiring site's own job feed
// (job-sources/web.ts), so a made-up or closed posting is left out, and our server never opens a
// page the AI picked. The real ones are saved for every student (source 'web'), and the importer
// checks them again and closes them once they're gone.
//
// -> 200 { jobs: [each job, with fit], added (how many are new to ScoutSearch), checked }
//    400 no search words, 429 the day's searches are used up, 503 web search isn't available
import { Router, type Request, type Response } from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';
import { JOB_COLUMNS, openJobs, forgetOpenJobs } from './jobs.js';
import { studentFrom, fitFor, type FitJob } from './fit.js';
import { atMostAtOnce, jobKey, simplifyUrl, storableJob, readCapped, type ImportedJob } from './job-sources/shared.js';
import { postingIn, checkPosting, webId, isWebJobForOurStudents, type Posting, type BoardCache } from './job-sources/web.js';

const router = Router();

// ---------- limits ----------
// The free Gemini key has a daily limit, and each search is one request to it, so: at most 10
// searches a day per student, 200 a day for the whole site, and one at a time per student.
// (Kept in the server's memory, so they start over if the server restarts. Tests raise them with
// WEB_SEARCHES_PER_STUDENT and WEB_SEARCHES_PER_DAY)
const limitFromEnv = (name: string, fallback: number) => Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;
const PER_STUDENT = limitFromEnv('WEB_SEARCHES_PER_STUDENT', 10);
const PER_DAY = limitFromEnv('WEB_SEARCHES_PER_DAY', 200);
let countsDay = '';
let siteCount = 0;
const studentCounts = new Map<string, number>();
const running = new Set<string>();
// at most 3 searches running at once for the whole site: each one can read several whole company
// boards, and they all share this one server's memory (more than that waits a minute)
const MOST_AT_ONCE = 3;
// when Gemini says the setup itself is wrong (a bad key, a model that can't search: 400/401/403/404),
// web search rests for 10 minutes instead of using up every student's searches on a broken setup
let restUntil = 0;
// today in Boston ("2026-11-17"), so the counts start over at midnight there
const bostonDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// How long each step may take, so a student isn't left waiting (and the request isn't cut off on
// the way): Gemini 40 seconds, each Google redirect 6, each hiring-site feed 10, and no new checks
// start once 30 seconds of checking have gone by. Usually the whole search takes 10-20 seconds
const GEMINI_WAIT_MS = 40_000;
const REDIRECT_WAIT_MS = 6_000;
const FEED_WAIT_MS = 10_000;
const CHECKING_TIME_MS = 30_000;

// ---------- the AI ----------
// Web search needs Google's own Gemini service (Google Search is part of it). If AI_BASE_URL points
// at another AI service (Groq, see ai-tags.ts), web search is off. AI_SEARCH_MODEL picks another model
const GOOGLE_AI = 'https://generativelanguage.googleapis.com/v1beta';
function searchSettings(): { key: string; model: string } | null {
  const key = process.env.AI_API_KEY;
  const base = process.env.AI_BASE_URL;
  if (!key || (base && !base.startsWith('https://generativelanguage.googleapis.com/'))) return null;
  return { key, model: process.env.AI_SEARCH_MODEL || process.env.AI_MODEL || 'gemini-3.5-flash-lite' };
}

// The search words: letters, digits, spaces, and - & + # . , ' / (so "C++", "R&D", and "co-op"
// work), at most 100 letters. null if there aren't at least 2 letters. (No quotes, so the words
// can't close the quote they're put in below)
function cleanSearch(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const q = Array.from(value.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s\-&+#.,'/]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, 100).join('').trim();
  return q.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 ? q : null;
}

// What we ask: only the search words, and where to look. The hiring sites are the ones
// job-sources/web.ts can check, so the AI's links can be trusted once they're checked
const SITES = 'boards.greenhouse.io, job-boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, jobs.smartrecruiters.com, apply.workable.com';
function promptFor(q: string): string {
  return [
    `Use Google Search to find job postings that are open right now, in the United States, for high school or college undergraduate students: internships, co-ops, research positions, or summer programs. The search: "${q}".`,
    `Only list postings on these hiring sites: ${SITES}. Give each posting's own page (like https://boards.greenhouse.io/company/jobs/123), not a search page or a company's home page.`,
    'Answer with only JSON, no other words: {"jobs": [{"title": "...", "company": "...", "url": "https://..."}]}. At most 10 jobs. Leave out any you aren\'t sure is still open.',
  ].join('\n\n');
}

// The AI service said no (out of free requests: 429; a model that can't search: 400; ...)
class AiProblem extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// Asks Gemini, with Google Search on. Gives back the links it named (with the company it said)
// and the pages Google Search found (redirect links, see whereTo)
async function askGemini(key: string, model: string, q: string) {
  const res = await fetch(`${GOOGLE_AI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(GEMINI_WAIT_MS),
    // the key goes in a header (not the address), so it never shows up in a log of addresses
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: promptFor(q) }] }], tools: [{ google_search: {} }] }),
  });
  if (!res.ok) throw new AiProblem(res.status);
  // a normal answer is a few kilobytes: reading stops (and the search fails) past 5 MB, even when
  // the answer doesn't say its size up front
  let raw: string;
  try {
    raw = await readCapped(res, 5_000_000);
  } catch {
    throw new AiProblem(502);
  }
  const body = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: unknown }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: unknown } }[] } }[];
  };
  const answer = body.candidates?.[0];
  const text = (answer?.content?.parts ?? []).map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  const links: { url: string; company?: string }[] = [];
  // the JSON in the answer (often inside ``` fences): from the first { to the last }
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { jobs?: { url?: unknown; company?: unknown }[] };
    for (const job of Array.isArray(parsed?.jobs) ? parsed.jobs.slice(0, 20) : []) {
      if (typeof job?.url === 'string') links.push({ url: job.url, company: typeof job.company === 'string' ? job.company : undefined });
    }
  } catch {
    // not JSON after all: any https links written in the answer still count (without a . or ,
    // that only ends the sentence)
    for (const match of text.matchAll(/https:\/\/[^\s"'<>)\]]+/g)) if (links.length < 20) links.push({ url: match[0].replace(/[.,;:!?]+$/, '') });
  }
  const redirects = (answer?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk?.web?.uri)
    .filter((uri): uri is string => typeof uri === 'string')
    .slice(0, 15);
  return { links, redirects };
}

// Google Search's results come as redirect links (vertexaisearch.cloud.google.com/grounding-api-redirect/...).
// This asks only that one address where the link goes, without following it, and gives back where
// it points (or null). Only Google's redirect address is ever asked, nothing the AI wrote
async function whereTo(uri: string): Promise<string | null> {
  let link: URL;
  try {
    link = new URL(uri);
  } catch {
    return null;
  }
  if (link.protocol !== 'https:' || link.hostname !== 'vertexaisearch.cloud.google.com' || !link.pathname.startsWith('/grounding-api-redirect/')) return null;
  try {
    const res = await fetch(link.href, { redirect: 'manual', signal: AbortSignal.timeout(REDIRECT_WAIT_MS) });
    await res.body?.cancel();
    const to = res.headers.get('location');
    return res.status >= 300 && res.status < 400 && to ? new URL(to, link).href : null;
  } catch {
    return null;
  }
}

// the words of a job, for Best fit (the same as loadOpenJobs in jobs.ts)
const jobText = (job: FitJob & { organization: string; description?: string | null; requirements?: string[] | null }) =>
  [job.title, job.organization, job.description ?? '', ...(job.requirements ?? [])].join(' ').toLowerCase();

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const me = req.user!.id;
  const q = cleanSearch(req.body?.q);
  if (!q) return res.status(400).json({ error: 'Type what you\'re looking for first (at least 2 letters).' });
  const settings = searchSettings();
  if (!settings) return res.status(503).json({ error: 'Web search isn\'t set up on this server yet.' });

  // today's counts (a new day starts them over)
  if (bostonDay() !== countsDay) {
    countsDay = bostonDay();
    siteCount = 0;
    studentCounts.clear();
  }
  if (Date.now() < restUntil) return res.status(503).json({ error: 'Web search isn\'t available right now. Try again later.' });
  if (running.has(me)) return res.status(429).json({ error: 'Your last web search is still running.' });
  if ((studentCounts.get(me) ?? 0) >= PER_STUDENT) {
    return res.status(429).json({ error: `You've used today's ${PER_STUDENT} web searches. Try again tomorrow.` });
  }
  if (siteCount >= PER_DAY) return res.status(429).json({ error: 'Web search is used up for today. Try again tomorrow.' });
  // checked before counting, so waiting for a free turn doesn't use up a search
  if (running.size >= MOST_AT_ONCE) return res.status(503).json({ error: 'Web search is busy right now. Try again in a minute.' });
  // counted before asking, so a search that fails still counts (otherwise retrying could use up the key)
  studentCounts.set(me, (studentCounts.get(me) ?? 0) + 1);
  siteCount++;
  running.add(me);

  try {
    // 1. ask the AI (only the search words go)
    let asked: Awaited<ReturnType<typeof askGemini>>;
    try {
      asked = await askGemini(settings.key, settings.model, q);
    } catch (err) {
      // the search words aren't logged: only what went wrong
      const status = err instanceof AiProblem ? err.status : 0;
      console.error('web search: the AI service failed:', status ? `HTTP ${status}` : (err as Error).name);
      // the setup is wrong, not the student's search: give the search back, and rest a while
      if ([400, 401, 403, 404].includes(status)) {
        studentCounts.set(me, Math.max(0, (studentCounts.get(me) ?? 1) - 1));
        siteCount = Math.max(0, siteCount - 1);
        restUntil = Date.now() + 10 * 60_000;
        console.error('web search: resting for 10 minutes (check AI_API_KEY, and that the model can use Google Search)');
      }
      return res.status(503).json({ error: status === 429 ? 'Web search is busy right now. Try again in a few minutes.' : 'Web search isn\'t available right now. Try again later.' });
    }

    // 2. the postings its links point to. Google Search's own results (its redirect links, first
    // asked where they go) come first, then the links the AI wrote, so made-up links can't crowd
    // out the ones Google really found. Checking stops starting new work after CHECKING_TIME_MS
    const checkUntil = Date.now() + CHECKING_TIME_MS;
    const postings = new Map<string, Posting>();
    const add = (url: string | null) => {
      const posting = url ? postingIn(url) : null;
      if (!posting || postings.size >= 15) return;
      const id = webId(posting);
      if (!postings.has(id)) postings.set(id, posting);
    };
    const resolved: (string | null)[] = [];
    await atMostAtOnce(asked.redirects, 4, async (uri, i) => {
      if (Date.now() < checkUntil) resolved[i] = await whereTo(uri);
    });
    for (const url of resolved) add(url ?? null);
    for (const { url } of asked.links) add(url);

    // 3. each one read from its hiring site's own feed (made-up and closed ones drop out here).
    // One board cache for the whole search, so five postings at one company read its board once
    const list = [...postings.values()];
    const checked: (ImportedJob | null)[] = list.map(() => null);
    const cache: BoardCache = new Map();
    const today = bostonDay();
    await atMostAtOnce(list, 4, async (posting, i) => {
      if (Date.now() >= checkUntil) return;
      const result = await checkPosting(posting, cache, FEED_WAIT_MS);
      if (typeof result !== 'object') return;
      // cleaned first (like the importer), then filtered, so the filters see what gets saved
      let job: ImportedJob;
      try {
        job = storableJob(result);
      } catch {
        return;
      }
      // a posting whose deadline has passed is left out (the main list hides those too)
      if (job.deadline && job.deadline < today) return;
      if (isWebJobForOurStudents(job)) checked[i] = job;
    });
    const found = checked.filter((job): job is ImportedJob => job !== null);

    // 4. the ones we already list are shown as they are; only the new ones are saved
    const open = await openJobs();
    if (!open) return res.status(500).json({ error: 'Database error' });
    const listed = new Map<string, (typeof open.jobs)[number]['job']>();
    for (const { job } of open.jobs) {
      listed.set(jobKey(job), job);
      if (typeof job.apply_url === 'string') listed.set(simplifyUrl(job.apply_url), job);
    }
    const already = found.map((job) => listed.get(jobKey(job)) ?? listed.get(simplifyUrl(job.apply_url)) ?? null);
    const fresh = found.filter((_, i) => already[i] === null);
    let saved: Record<string, unknown>[] = [];
    if (fresh.length > 0) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .upsert(fresh.map((job) => ({ ...job, status: 'open', last_seen_at: now })), { onConflict: 'source,external_id' })
        .select(JOB_COLUMNS);
      if (error) {
        // 23514: the database refused the source name 'web' (jobs.sql step 4 hasn't been run again)
        console.error(error.code === '23514' ? 'web search: saving failed: run jobs.sql step 4 again (it adds the \'web\' source)' : 'web search: saving failed', error);
        return res.status(500).json({ error: 'Database error' });
      }
      saved = data as unknown as Record<string, unknown>[];
      // so the Opportunities list has them right away
      forgetOpenJobs();
    }

    // 5. Best fit for each, from the student's profile and resume (on our server only)
    const [profile, resume] = await Promise.all([
      supabase.from('student_profiles').select('data').eq('student_id', me).maybeSingle(),
      supabase.from('resumes').select('data').eq('student_id', me).maybeSingle(),
    ]);
    if (profile.error || resume.error) {
      console.error('web search: student lookup for fit failed:', profile.error ?? resume.error);
      return res.status(500).json({ error: 'Database error' });
    }
    const student = studentFrom(profile.data?.data, resume.data?.data);
    const rows = [...already.filter((job) => job !== null), ...saved] as (FitJob & Record<string, unknown> & { id: string; organization: string })[];
    // the same job twice (two links to one posting) shows once
    const seen = new Set<string>();
    const jobs = rows.filter((job) => !seen.has(job.id) && seen.add(job.id)).map((job) => {
      const fit = fitFor(job, jobText(job), student);
      return { ...job, fit: { score: fit.score, reasons: fit.reasons } };
    });
    console.log(`web search: ${list.length} postings checked, ${found.length} real and for our students, ${saved.length} new`);
    res.json({ jobs, added: saved.length, checked: list.length });
  } finally {
    running.delete(me);
  }
});

export default router;
