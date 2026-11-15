# ScoutSearch

A job board for high school and college students: internships, co-ops, and research
positions. An Oasis @ Northeastern group project. Accessibility (WCAG) is a priority on
every page.

**What works today:**
- logging in and signing up with Supabase (email and password, or Google), plus password reset;
- Opportunities (`/discovery`) with search and filters, and an Application tracker (`/applications`);
- a Resume builder (`/resume`) that prints to PDF, the Feed, and Settings (appearance and accessibility).

The job listings and people on the pages are still made-up examples. The backend can
already import real internships (see "Backend" below), but the pages don't show them yet.

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

**2. Login settings.** In Supabase, go to Authentication → URL Configuration:
- set the Site URL to `http://localhost:5173`;
- add `http://localhost:5173/**` as a redirect URL;
- turn on email and password logins (Google is optional).

**3. Secrets.** Never commit these files. They're in `.gitignore`.
- **`backend/secrets.env`:** copy `backend/secrets.env.example` to `secrets.env`, then fill it in.
  The example explains each value: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_KEY`, and the
  importer's keys (`USAJOBS_*`, `ADZUNA_*`), which aren't used yet.
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
- To pull in real internships from Greenhouse and Lever, run `cd backend && npm run import-jobs`
  by hand. It saves them to the `jobs` table and closes the ones a company took down.
- The routes, rules and what's planned next are in `backend/plans.md`.

## Checks

```bash
cd frontend && npm run lint && npm run build
cd backend && npx tsc --noEmit
```

## Where people's things are saved

Your resume and Application tracker are saved in your browser (localStorage), under your
account. On a shared computer, the next person to log in gets their own, not yours. Logging
out doesn't delete yours: it's there again when you log back in on that browser. It doesn't
follow you to other devices yet (frontend/plans.md, F15).

## Deploy (Vercel)

1. Create a Vercel project with:
   - root folder `frontend`;
   - build command `npm run build`;
   - output folder `dist`;
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in the project's settings.
2. In Supabase, add the Vercel address to Authentication → URL Configuration.
3. Until the backend is hosted somewhere, anything that needs it (like Messages) says it
   can't reach the server.

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
