import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import authRouter from './auth.js';
import jobsRouter from './jobs.js';
import applicationsRouter from './applications.js';
import resumesRouter from './resumes.js';
import accountRouter from './account.js';

const app: Express = express();
// by default Express adds "X-Powered-By: Express" to every answer, which tells attackers
// exactly what to look up. Express's own security guide says to turn it off
app.disable('x-powered-by');
app.use(express.json());


app.get('/', (req: Request, res: Response) => {
  res.send('ABOUT');
});

app.use('/auth', authRouter);

// JB3a: job routes. under /api because the frontend's Vite proxy only forwards /api
// (see the shared contract in plans.md). /auth moves under /api too, in Task S4.
app.use('/api/jobs', jobsRouter);

// B7 and B8 (frontend/plans.md): each student's Application tracker and resume, saved with
// their account. Both need you to be logged in (they use authenticateToken themselves)
app.use('/api/applications', applicationsRouter);
app.use('/api/resumes', resumesRouter);

// Download my data, and Delete my account (the Settings page, and the Privacy Policy)
app.use('/api/account', accountRouter);

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




