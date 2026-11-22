import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import authRouter from './auth.js';
import jobsRouter, { openJobs } from './jobs.js';
import applicationsRouter from './applications.js';
import resumesRouter from './resumes.js';
import accountRouter from './account.js';
import studentProfileRouter from './student-profile.js';
import webSearchRouter from './web-search.js';

const app: Express = express();
// by default Express adds "X-Powered-By: Express" to every answer, which tells attackers
// exactly what to look up. Express's own security guide says to turn it off
app.disable('x-powered-by');
app.use(express.json());

// Answers under /api are about one student (or change often), so browsers and anything in
// between must not keep a copy (no-store). Otherwise a shared computer's browser cache could
// still hold someone's resume or profile after they log out
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// The old /auth routes (plans.md Task S5 will delete them): nothing on the site uses them any
// more, but each request makes the server do a slow password hash, and signup adds a row.
// Until they're deleted: at most 2 at a time and 20 a minute for the WHOLE site (no real user
// needs more), and usernames of at most 100 letters. Anything past that gets 429
// (Tests that check the routes' own race handling raise both limits with LEGACY_AUTH_AT_ONCE and
// LEGACY_AUTH_PER_MINUTE, like JOBS_CACHE_SECONDS. Missing or empty = the safe defaults)
const limitFromEnv = (name: string, fallback: number) => Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;
const LEGACY_AUTH_AT_ONCE = limitFromEnv('LEGACY_AUTH_AT_ONCE', 2);
const LEGACY_AUTH_PER_MINUTE = limitFromEnv('LEGACY_AUTH_PER_MINUTE', 20);
let legacyAuthInFlight = 0;
let legacyAuthWindow = { start: Date.now(), count: 0 };
function legacyAuthGuard(req: Request, res: Response, next: NextFunction) {
  if (Date.now() - legacyAuthWindow.start > 60_000) legacyAuthWindow = { start: Date.now(), count: 0 };
  const username = req.body?.username;
  if (typeof username === 'string' && username.length > 100) return res.status(400).json({ error: 'Username is too long' });
  if (legacyAuthInFlight >= LEGACY_AUTH_AT_ONCE || legacyAuthWindow.count >= LEGACY_AUTH_PER_MINUTE) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }
  legacyAuthWindow.count++;
  legacyAuthInFlight++;
  // 'close' fires when the answer is sent (or the client leaves), so the slot is given back
  res.on('close', () => { legacyAuthInFlight--; });
  next();
}


app.get('/', (req: Request, res: Response) => {
  res.send('ABOUT');
});

// GET /api/health: a tiny "are you awake?" address. It answers { ok: true } right away, with no
// login. The website calls it the moment any page opens (frontend/src/wake-server.js): on Render's
// free plan the server sleeps when nobody has used it for a while, and waking it takes up to a
// minute, so this starts the wake-up while the student is still reading or typing.
// It's under /api because the website only passes /api/... on to this server (frontend/vercel.json)
// When /api/health last started loading the jobs (see below), in milliseconds
let lastWarmUp = 0;
app.get('/api/health', (req: Request, res: Response) => {
  // It also starts loading every open job (openJobs in jobs.ts), without waiting for it. Loading them
  // is the slow part of Opportunities' first answer (thousands of jobs, 1000 at a time), so after a
  // wake-up, the first student used to wait for it on top of the wake-up itself. This request is
  // usually the one that wakes the server, so the jobs are ready by the time Opportunities asks.
  // openJobs keeps them for 5 minutes, and a student who asks while they're loading waits for that
  // same load instead of starting another.
  // At most once a minute, though: anyone can call this address without logging in, and if a load
  // fails (the database is slow), nothing is kept, so without the limit every call would start a
  // whole new load. Opportunities itself still loads the jobs whenever it needs them
  if (Date.now() - lastWarmUp > 60_000) {
    lastWarmUp = Date.now();
    openJobs().catch((error) => console.error('loading the open jobs failed:', error));
  }
  res.json({ ok: true });
});

app.use('/auth', legacyAuthGuard, authRouter);

// JB3a: job routes. under /api because the frontend's Vite proxy only forwards /api
// (see the shared contract in plans.md). /auth moves under /api too, in Task S4.
app.use('/api/jobs', jobsRouter);

// B7 and B8 (frontend/plans.md): each student's Application tracker and resume, saved with
// their account. Both need you to be logged in (they use authenticateToken themselves)
app.use('/api/applications', applicationsRouter);
app.use('/api/resumes', resumesRouter);
// each student's own profile (the welcome guide and the My info page)
app.use('/api/student-profile', studentProfileRouter);
// (There used to be /api/feed here, for the Feed's posts, comments, likes, and follows. The Feed
// was taken out in 2026-11, along with its routes, so nobody can post with no page to moderate
// it, and its tables were deleted from the database)

// Download my data, and Delete my account (the Settings page, and the Privacy Policy)
app.use('/api/account', accountRouter);

// "Search the web" on Opportunities: an AI looks for more internships on the web (web-search.ts)
app.use('/api/web-search', webSearchRouter);

// catch-all error handler: has to come after all the routes so it catches their errors.
// Express knows this is an error handler because it takes 4 arguments (err comes first),
// so we keep "next" even though we don't use it.
// Without this, Express sends back its default HTML error page with a stack trace,
// which shows the user details about our code they shouldn't see.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // express.json() marks its errors with a status, e.g. 400 when the client sends broken JSON.
  // that's the client's mistake, so pass the 4xx along instead of blaming the server with a 500
  const status = (err as { status?: number })?.status;
  const clientMistake = typeof status === 'number' && status >= 400 && status < 500;

  if (clientMistake) {
    // don't print the whole error for these: when the JSON is broken, the error carries the
    // request's raw text (err.body), so a log in with one typo in its JSON would put that
    // person's password in our terminal. the kind of mistake (like "entity.parse.failed")
    // is enough to see what happened
    console.error(`request refused (${status}):`, (err as { type?: string }).type ?? 'bad request');
  } else {
    // log the real error in the terminal so we can see what went wrong
    console.error(err);
  }

  // if a response already started sending, we can't send a new one,
  // so hand it back to Express to close the connection
  if (res.headersSent) {
    return next(err);
  }
  if (clientMistake) {
    return res.status(status).json({ error: 'Bad request' });
  }
  // anything else is our fault: send the client a generic message, same style as the rest of our errors
  res.status(500).json({ error: 'Server error' });
});

// no express.static here: the frontend is its own Vite app (npm run dev in frontend/),
// and the old express.static('frontend') pointed at backend/frontend, which doesn't exist
// the port: hosts like Render and Railway pick one and pass it in as PORT.
// on your computer there's no PORT, so it's 3000 (where the Vite proxy sends /api)
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // shows up in the host's logs, so you can see the server really started
  console.log(`backend listening on port ${port}`);
});




