# ScoutSearch

A job board for high school and college students: internships, co-ops, and research
positions. An Oasis @ Northeastern group project. Accessibility (WCAG) is a priority on
every page.

**What works today:**
- logging in and signing up with Supabase (email and password, or Google), plus password reset;
- Opportunities (`/discovery`): real internships, co-ops, research positions, and programs from
  the backend (Greenhouse, Lever, and JSearch), with search, filters, and an Application tracker
  (`/applications`) saved with your account;
- a Resume builder (`/resume`) that prints to PDF and is saved with your account, the Feed, and
  Settings (appearance and accessibility).

The people and posts on the Feed, Profile, and Network pages are still made-up examples.

## Layout

- `frontend/`: React 19, Vite 8, react-router. Pages are in `src/pages/`, shared pieces in
  `src/components/`, and routes in `src/App.jsx`. All styles are in `src/index.css`.
- `backend/`: Express 5 and TypeScript (run with `tsx`, no build step), using Supabase (Postgres).
  - `src/app.ts`: the server, on port 3000.
  - `src/auth.ts`: the old `/auth/signup` and `/auth/login` routes.
  - `src/jobs.ts`: `/api/jobs`.
  - `src/import-jobs.ts` and `src/job-sources/`: the job importer.
  - `src/middleware.ts`: the login token check.
  - `sql/`: the database setup.
- `backend/plans.md` and `frontend/plans.md` hold the task lists and the API contract.

The `package.json` at the top of the repo is left over and isn't used to run anything.

## Set up on your computer

You need Node 22 or newer, and access to the team's Supabase project.

**1. Database.** In Supabase, open SQL Editor and run these files in this order. Each one is
safe to run again.
1. `backend/sql/profiles.sql`
2. `backend/sql/jobs.sql`
3. `backend/sql/roles.sql`
4. `backend/sql/applications.sql` (the Application tracker; needs `jobs.sql` first)
5. `backend/sql/resumes.sql` (the Resume builder)
6. `backend/sql/student_profiles.sql` (the welcome guide, Profile, and Edit profile)
7. `backend/sql/feed.sql` (the Feed: posts, comments, likes, and follows)

**2. Login settings.** In Supabase, go to Authentication → URL Configuration:
- set the Site URL to `http://localhost:5173`;
- add `http://localhost:5173/**` as a redirect URL;
- turn on email and password logins (Google is optional).

**3. Secrets.** Never commit these files. They're in `.gitignore`.
- **`backend/secrets.env`:** copy `backend/secrets.env.example` to `secrets.env`, then fill it in.
  The example explains each value: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_KEY`, and the
  importer's keys, which are all optional (a source without its key skips itself): `JSEARCH_API_KEY`,
  `USAJOBS_API_KEY` + `USAJOBS_EMAIL`, and `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`. `AI_API_KEY` (a free
  Google Gemini key) turns on the AI tags for job posts (also optional).
- **`frontend/.env.local`:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use only
  the **publishable** key here, never the secret one: anything starting with `VITE_` is copied
  into the website, where anyone can read it.

**4. Run it**, in two terminals:

```bash
cd backend && npm install && npm run dev      # http://localhost:3000
cd frontend && npm install && npm run dev     # http://localhost:5173
```

The frontend's `/api/...` requests go to the backend through Vite's proxy (`vite.config.js`).

## Backend

- `GET /api/jobs/for-me` (logged in) is what Opportunities uses: every filter (major, who it's for,
  where, pay, posted, deadline, must mention / leave out, city, hidden companies), sorting (newest,
  best fit, deadline, company), 50 a page, and each job's best-fit score and reasons
  (`backend/src/fit.ts`, from your profile and resume). `POST /api/jobs/refresh` checks the job sites
  for new listings (the sources without a daily limit), at most once every 30 minutes for the site.
- `/api/feed` is the Feed: posts, comments, likes, and follows. Everyone logged in sees every post;
  only the writer can delete theirs.
- `GET /api/jobs` lists open jobs, newest posted first (`posted_at`, the date the company's job
  site gives). It takes `type`, `level`, `setting`, `paid`, `q` (search) and `page` (50 jobs per page).
- `GET /api/jobs/:id` returns one job.
- `/api/applications` (GET, POST, PATCH `/:id`, DELETE `/:id`) is your Application tracker
  (our jobs, the Feed's examples, and jobs typed in from other sites, with notes), and
  `/api/resumes/me` (GET, PUT) is your resume. Both need you to be logged in, and only ever
  touch your own.
- `/api/student-profile/me` (GET, PUT) is your profile: what you fill in on the welcome guide
  (`/welcome`) and Edit profile. New accounts are sent to the guide until they finish or skip it
  (`onboarded_at`). It's its own table, separate from `profiles`. The Profile page shows it, plus
  the education, experience, and projects from your resume.
- `GET /api/account/export` and `DELETE /api/account` are Settings' "Download my data" and
  "Delete my account". Deleting removes the Supabase login, and the profile, tracker, and resume
  go with it (their tables are set to `on delete cascade`).
- The importer's sources are in `backend/src/import-runner.ts`: Greenhouse, Lever, Ashby,
  SmartRecruiters, and Workable company boards, USAJOBS, NSF ETAP (research programs), precollege-finder
  (high school programs), the SimplifyJobs, vanshb03, CO0Oper, and SpeedyApply GitHub lists, JSearch, and
  Adzuna. To add a company, add it to the list at the top of its file in `backend/src/job-sources/`.
- The company-board sources also read every board in `backend/src/job-sources/found-boards.json`
  (about 690 companies). `cd backend && npm run find-boards` fills that file. It looks through the
  GitHub lists for links to company job boards, checks that each board is still there, and saves
  them. It needs no keys and doesn't touch the database. Run it every few weeks, then commit the file.
  Only jobs in the US (or that might be) are kept. If one company's board fails, only that company's
  old jobs stay open, and the rest are closed as usual.
- Adzuna searches every major nationwide, plus near Boston and Worcester. That's 76 requests per import,
  so about one import a day fits its free plan. Its jobs (and JSearch's) stay listed for 14 days after
  they last showed up in a search, because each search only sends back its newest results.
- After each import, `backend/src/ai-tags.ts` has a free AI model (Gemini, if `AI_API_KEY` is set) tag
  the new jobs with the majors and skills they fit. Best fit (`backend/src/fit.ts`) uses the tags. Only
  public job posts are sent, never anything about a student. Run `jobs.sql` step 8 first.
  (Step 9, an index that makes the job lists faster, is optional.)
- To pull in real internships, run `cd backend && npm run import-jobs` by hand, on a computer
  with `backend/secrets.env`. It saves them to the `jobs` table and closes the ones a company
  took down. JSearch only runs if `JSEARCH_API_KEY` is set. Without it, the importer says it
  skipped JSearch and ends with an error code on purpose: old JSearch jobs aren't closed.
- The live site shows whatever is in Supabase's `jobs` table, so run the importer before a demo.
  It also fills in each job's posting date, so run it again after running `jobs.sql` (step 6).
- **"Search the web"** on Opportunities (`backend/src/web-search.ts`): once a student types a search,
  they can ask Gemini (with Google Search) for more postings. Only the typed words are sent, never the
  profile (the Data Policy says so). Every link it gives is checked on its hiring site's own job feed
  (Greenhouse, Lever, Ashby, SmartRecruiters, Workable: `backend/src/job-sources/web.ts`), so made-up and
  closed postings are dropped. The real ones are saved for everyone as source `web`, and each import
  checks them again. It needs `AI_API_KEY` on Render and `jobs.sql` step 4 run again (it adds `web`).
  Limits: 10 searches per student per day and 200 for the whole site (`WEB_SEARCHES_PER_STUDENT`,
  `WEB_SEARCHES_PER_DAY`), and at most 3 running at once. If the free key can't use Google Search,
  the message under the button says web search isn't available (the search isn't counted, and web
  search rests for 10 minutes). The company name shown for a find comes from the hiring site or
  `found-boards.json`, never from the AI.
- The routes, rules and what's planned next are in `backend/plans.md`.

### Keeping jobs up to date (automatic)

`.github/workflows/update-jobs.yml` has GitHub run the importer by itself: the sources with no daily
limit every 6 hours, and everything (Adzuna too) once a day at about 6 AM Boston time. It runs on
GitHub's computers, so it doesn't use the Render server's memory. Every run reads the company boards
in the committed `found-boards.json` (to add new ones, run `npm run find-boards` and commit the file).
To turn it on in a copy of the repo (a fork):

1. **Actions** tab: if GitHub asks, click the button that turns workflows on for the fork.
2. **Settings → Secrets and variables → Actions → Secrets:** add `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY` (the same values as `backend/secrets.env`), plus any of `ADZUNA_APP_ID`,
   `ADZUNA_APP_KEY`, `USAJOBS_API_KEY`, `USAJOBS_EMAIL`, `JSEARCH_API_KEY` (or `OPENWEBNINJA_API_KEY`),
   and `AI_API_KEY`. A source whose key is missing is just left out.
3. **Same page → Variables:** add `RUN_JOB_IMPORTS` with the value `true`. Copies without it skip the job.
   If `AI_API_KEY` is a Groq key instead of Gemini, also add `AI_BASE_URL` and `AI_MODEL` here
   (and `AI_JOBS_PER_RUN` to tag more or fewer jobs per run).
4. Try it: **Actions → Update job listings → Run workflow**. The log says what each source saved.

GitHub pauses scheduled runs in a repo that gets no pushes for 60 days. By hand, the same options work:
`npm run import-jobs -- --quick` (only the no-limit sources) and `-- --skip-unset`.

## Checks

```bash
cd frontend && npm run lint && npm run build
cd backend && npx tsc --noEmit
```

## Where people's things are saved

Your profile, resume, and Application tracker are saved with your account (the
`student_profiles`, `resumes`, and `applications` tables), so they're the same on every device
you log in on.

Your profile and resume share a few parts (name, city, first school, skills), kept in step by
`frontend/src/data/profile-resume-sync.js`: change one in the welcome guide, Edit profile, or the
Resume builder, and the other updates. The top bar and your Feed posts use your profile's name
and headline.

Each browser also keeps its own copy (localStorage), under your account's id. That's what
makes pages open right away, and what keeps them working when the server can't be reached:
your changes wait on that device and are sent as soon as it's back. The tracker page and the
Resume builder each have a line saying "Saved to your account." (or why not yet).
- On a shared computer, the next person to log in gets their own, not yours. Logging out
  doesn't delete your copy, and a change that was still waiting is sent the next time you log
  in on that browser, never to someone else's account.
- A resume or tracker saved in a browser before accounts kept them is moved to the account
  automatically, the first time you open the page.
- If your resume was saved on another device since this one last saved it, the Resume
  builder doesn't save over it. It asks which version to keep.

## Privacy and legal pages

`/privacy-policy`, `/cookie-policy`, and `/terms-of-service` are open to everyone, and every
page links to them in its footer. They describe only what the site really does (checked
2026-11-16): **no cookies, no analytics, no ads, no trackers**, and fonts hosted by the site
itself (`frontend/public/fonts/`), so visitors' browsers only ever contact our own site and
Supabase. That's also why there's no cookie banner: there's nothing optional to agree to.

The facts they're built from are in **`frontend/src/data/legal.js`**: who runs the site, the
contact email, the services we use, and the full list of what's saved in the browser. Anything
still `null` there shows on the pages as a highlighted **[To fill in: ...]**, under a "Draft"
note that disappears once everything is filled in. Paragraphs marked "Needs legal review" need
someone who knows the law. **If the site starts storing something new, or adds a service (above
all analytics or ads), update `legal.js` and the pages first**: anything optional would need a
real consent choice before it loads.

## Deploy

The site has two parts:
- **The frontend goes on Vercel.**
- **The backend runs on Render or Railway.** Vercel passes the site's `/api/...` requests to
  it, so the browser only ever talks to the site's own address. That means no CORS setup, and
  the Content-Security-Policy below stays strict.

### 1. Backend (Render or Railway)

Create a web service from the GitHub repo:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm run start:host` (the host sets the settings below, so it doesn't read `secrets.env`) |
| Node version | 22 or newer (`package.json` asks for it) |

Set these environment variables on the host:
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: the same values as in `secrets.env`. These stay
  on the host and never go on Vercel.
- `JWT_KEY`: only needed for the old `/auth/signup` and `/auth/login` routes.

The host sets `PORT` itself, and the backend uses it.

To check it, open the backend's address: the home page says `ABOUT`, and `/api/jobs` shows the
jobs as JSON. Render's free plan stops the server when nobody uses it for a while, so the
first visit afterward takes up to a minute.

### 2. Connect the site to the backend

`frontend/vercel.json` has the rule that passes `/api/...` to the backend. It's the first one
in `rewrites`, and points at our Render service:

```json
{ "source": "/api/(.*)", "destination": "https://scoutsearch-4grg.onrender.com/api/$1" }
```

If the backend ever moves, change that address (keep `https://` and `/api/$1`), then commit
and push: Vercel redeploys by itself. Only ever put an address we own there: Vercel sends
everyone's login tokens to it. (JSON doesn't allow comments, so this section explains the rule.)

### 3. Frontend (Vercel)

Import the repo into Vercel:
- **Root directory:** `frontend`. This is required: the `package.json` at the top of the repo
  is a leftover.
- **Framework:** Vite, which fills in the build command `npm run build` and the output folder `dist`.
- **Environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, for both
  Production and Preview. Set them **before** the first build: Vite copies them into the site
  as it builds, so after changing one, redeploy.

Vercel puts the `main` branch live. Every other branch you push gets its own preview address.

### 4. Supabase

In Authentication → URL Configuration:
- **Site URL:** the live Vercel address.
- **Redirect URLs:** keep `http://localhost:5173/**`, and add `https://YOUR-PROJECT.vercel.app/**`
  for the live site.
- **Preview addresses:** don't add a wildcard like `https://*-YOUR-VERCEL-ACCOUNT.vercel.app/**`
  to the real project. Supabase sends password-reset and Google login codes to any address on
  this list, so a wildcard trusts every address that matches it (the 2026-11-17 security audit).
  To test log in on a preview, add that one preview's exact address for a while, or use a
  second Supabase project just for previews.

Log in, sign up, and password reset send people back to whichever address they're on, so it
has to be on this list.

### Security settings to check (from the 2026-11-17 security audit)

These live in the dashboards, not in the code, so only someone with access can check them:
- **Supabase → Authentication → Attack Protection:** turn on CAPTCHA (Cloudflare Turnstile is
  free). Without it, anyone can use up the project's hourly email allowance with fake sign-ups or
  reset requests, and then real students get no emails. **Turn it on only after** the site sends
  the CAPTCHA token (`captchaToken` in `signUp`, `signInWithPassword`, and `resetPasswordForEmail`,
  plus the Turnstile address in the CSP in `frontend/vercel.json`): with CAPTCHA on and no token,
  Supabase refuses every sign-up and log in.
- **Supabase → Authentication → Sign In / Providers → Email:** keep **Confirm email** on, so
  nobody can sign up with someone else's address (an address nobody confirmed could otherwise end
  up linked to that person's Google login; the audit couldn't check how Supabase links them).
- **Supabase → Authentication → URL Configuration:** no wildcard addresses (see above).
- **Supabase → Project Settings → Data API:** note the **Max Rows** value (1000 by default). The
  Feed shows at most 50 comments per post, so it stays under it.
- **Render:** the old `/auth/signup` and `/auth/login` are only on the Render address. They're
  limited to 2 at a time and 20 a minute now, but nothing uses them: deleting them
  (`backend/plans.md` Task S5) removes the risk.

### 5. Check the live site
- Open a deep link like `/discovery` directly, and refresh it.
- Sign up, log in (email and Google), and log out.
- Send yourself a password reset email: its link must open the Vercel site, not localhost.
- Opportunities loads real jobs. Save one, and it shows on My applications, with "Saved to
  your account." under the title. Log in on a second device (or a private window): it's there
  too. Same for a change in the Resume builder.
- The browser console (F12) shows no red errors.

  Preview addresses are the exception: you may see one about `vercel.live`. That's Vercel's
  comment toolbar, which the security policy blocks. It's harmless, and you can turn the
  toolbar off in the project's settings.

### Security headers

`frontend/vercel.json` makes Vercel send security headers with every page, including a
Content-Security-Policy that says what the site may load. That includes the two small inline
blocks in `frontend/index.html` (the theme `<script>` and the `<style>` after it), which are
listed by their fingerprint (`sha256-...`).

**If you change either block,** even by one space, run `npm run build` in `frontend/`, then
print the new fingerprints:

```bash
node -e "const h=require('fs').readFileSync('dist/index.html','utf8').replace(/\r\n?/g,'\n');const f=(t)=>'sha256-'+require('crypto').createHash('sha256').update(t).digest('base64');console.log('script-src', f(h.match(/<script>([\s\S]*?)<\/script>/)[1]));console.log('style-src ', f(h.match(/<style>([\s\S]*?)<\/style>/)[1]))"
```

Replace the old ones in `vercel.json`. Otherwise Vercel blocks the theme script, and pages
briefly show the wrong colors.

Read them from `dist/`, not the source: the build compacts the `<style>`, so its fingerprint
changes there. Fonts may only come from the site itself (`font-src 'self'`), so a font added
from Google Fonts or another site would be blocked: put its files in `frontend/public/fonts/`. If the Supabase project ever moves to a custom domain, add that domain to
`connect-src` in the same header.
