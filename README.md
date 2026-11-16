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

**2. Login settings.** In Supabase, go to Authentication → URL Configuration:
- set the Site URL to `http://localhost:5173`;
- add `http://localhost:5173/**` as a redirect URL;
- turn on email and password logins (Google is optional).

**3. Secrets.** Never commit these files. They're in `.gitignore`.
- **`backend/secrets.env`:** copy `backend/secrets.env.example` to `secrets.env`, then fill it in.
  The example explains each value: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_KEY`, and the
  importer's keys. `JSEARCH_API_KEY` is optional. `USAJOBS_*` and `ADZUNA_*` aren't used yet.
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

- `GET /api/jobs` lists open jobs. It takes `type`, `level`, `setting`, `paid`, `q` (search)
  and `page` (50 jobs per page).
- `GET /api/jobs/:id` returns one job.
- `/api/applications` (GET, POST, PATCH `/:id`, DELETE `/:id`) is your Application tracker
  (our jobs, the Feed's examples, and jobs typed in from other sites, with notes), and
  `/api/resumes/me` (GET, PUT) is your resume. Both need you to be logged in, and only ever
  touch your own.
- To pull in real internships, run `cd backend && npm run import-jobs` by hand, on a computer
  with `backend/secrets.env`. It saves them to the `jobs` table and closes the ones a company
  took down. JSearch only runs if `JSEARCH_API_KEY` is set. Without it, the importer says it
  skipped JSearch and ends with an error code on purpose: old JSearch jobs aren't closed.
- The live site shows whatever is in Supabase's `jobs` table, so run the importer before a demo.
- The routes, rules and what's planned next are in `backend/plans.md`.

## Checks

```bash
cd frontend && npm run lint && npm run build
cd backend && npx tsc --noEmit
```

## Where people's things are saved

Your resume and Application tracker are saved with your account (the `resumes` and
`applications` tables), so they're the same on every device you log in on.

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

`frontend/vercel.json` already has the rule that passes `/api/...` to the backend. It's the
first one in `rewrites`:

```json
{ "source": "/api/(.*)", "destination": "https://backend-address-goes-here.invalid/api/$1" }
```

Replace `backend-address-goes-here.invalid` with your backend's address, like
`scoutsearch-api.onrender.com` (no `https://`, nothing after it), then commit and push.
Vercel redeploys by itself.

Until then the live site can't reach the backend: Opportunities says "Couldn't load
opportunities", and the tracker and Resume builder say "Not saved to your account yet" (they
still work in the browser). The placeholder ends in `.invalid` on purpose: that ending is
reserved and can never belong to anyone. A made-up name on `onrender.com` could be claimed by a
stranger, who would then receive everyone's login tokens.

JSON doesn't allow comments, so that rule can't explain itself inside the file. This section
is where it's explained.

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
- **Redirect URLs:** keep `http://localhost:5173/**`, and add:
  - `https://YOUR-PROJECT.vercel.app/**`, for the live site;
  - `https://*-YOUR-VERCEL-ACCOUNT.vercel.app/**`, for preview addresses.

Log in, sign up, and password reset send people back to whichever address they're on, so it
has to be on this list.

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
changes there. If the Supabase project ever moves to a custom domain, add that domain to
`connect-src` in the same header.
