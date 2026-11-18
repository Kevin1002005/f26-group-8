-- plans.md Task JB1. Paste this whole file into Supabase -> SQL Editor -> Run.
-- Run profiles.sql first: posted_by below links to the profiles table.
-- Run it before roles.sql: verify_employer in roles.sql changes rows in this table.
-- (Postgres only looks for the table when that function actually runs, but keeping the
-- order means nobody can call it before the table is there.)
-- Safe to run more than once. But "if not exists" means a column you change inside
-- "create table" later won't be applied to the table that already exists: use a separate
-- "alter table" step for that, like step 3 below.


-- 1. one table for every job, whether an employer posted it or the importer pulled it in.
create table if not exists public.jobs (
  -- a random uuid instead of 1, 2, 3 (the contract says ids are uuid strings)
  id            uuid primary key default gen_random_uuid(),

  -- fields from the shared contract's Job
  title         text not null,
  organization  text not null,
  type          text not null check (type in ('internship', 'co-op', 'research', 'program')),
  level         text not null check (level in ('high-school', 'college', 'both')),

  -- outside sources often leave these out, so they can be null.
  -- a check like "setting in (...)" still passes when the value is null.
  location      text,
  setting       text check (setting in ('remote', 'hybrid', 'on-site')),
  paid          boolean,
  pay_text      text,
  deadline      date,         -- a real date type, so "hide past deadlines" is a simple compare
  description   text,

  -- a list of strings, like requirements in opportunities.js.
  -- an empty list instead of null, so the frontend's .map() doesn't crash on outside jobs.
  requirements  text[] not null default '{}',

  apply_url     text,
  -- the employer who posted it. if their profile is deleted, their jobs go too
  -- (nobody else could edit or close them).
  posted_by     uuid references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- new columns for JB1a
  -- (if you add a source here, also add it to step 4 below, which updates the existing table)
  source        text not null check (source in ('employer', 'greenhouse', 'lever', 'usajobs', 'adzuna', 'jsearch', 'simplify', 'ashby', 'smartrecruiters', 'workable',
    'nsf', 'precollege', 'vanshb03', 'co0oper', 'speedyapply', 'web')),
  external_id   text,         -- the job's id on the outside site. null for employer jobs
  -- defaults to 'pending' so a job is hidden unless something deliberately opens it
  status        text not null default 'pending' check (status in ('pending', 'open', 'closed')),
  last_seen_at  timestamptz,  -- when the importer last saw it. null for employer jobs

  -- JB1b: an outside job can only be in here once, so re-imports update the row instead of copying it.
  -- employer jobs all have external_id = null, and Postgres never counts two nulls as duplicates,
  -- so this doesn't stop employers from posting more than one job.
  -- keep this a plain unique rule (not a partial index): the importer's
  -- .upsert(rows, { onConflict: 'source,external_id' }) only works with a plain one.
  unique (source, external_id),

  -- employer jobs have an owner and no outside id. outside jobs are the other way round,
  -- and must link to the original posting (plans.md: "links out to the original posting").
  check (
    (source = 'employer' and posted_by is not null and external_id is null)
    or
    (source <> 'employer' and posted_by is null and external_id is not null and apply_url is not null)
  )
);


-- 2. JB1c: RLS on, no policies (same as profiles).
-- our backend uses the secret key, which skips RLS. the publishable key can't read or write here,
-- so pending (unverified) jobs can't leak out through <SUPABASE_URL>/rest/v1/jobs.
alter table public.jobs enable row level security;


-- 3. apply_url has to be a normal web link (http:// or https://).
-- the frontend opens it in a new tab, and a link like "javascript:..." would run code
-- on our site instead. employers will type this field themselves (JB5), so the database
-- checks it, not just our routes.
-- it's an "alter table" step (not inside "create table" above) so it also gets added to
-- the table we already made. drop-then-add makes it safe to run again.
alter table public.jobs drop constraint if exists jobs_apply_url_is_web_link;
alter table public.jobs add constraint jobs_apply_url_is_web_link
  check (apply_url is null or apply_url ~* '^https?://');   -- ~* = matches this pattern, any case


-- 4. the list of allowed sources (with 'jsearch' added, then on 2026-11-16 'simplify', 'ashby',
-- 'smartrecruiters', and 'workable', then on 2026-11-17 'nsf', 'precollege', 'vanshb03', 'co0oper',
-- and 'speedyapply', and later that day 'web': jobs found with "Search the web" on Opportunities).
-- the table already exists, so the new list inside "create table" above isn't applied to it
-- (see the note at the top). This replaces the old rule on the existing table.
-- jobs_source_check is the name Postgres gave the "check (source in ...)" rule above
-- (<table>_<column>_check). drop-then-add makes it safe to run again.
alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs add constraint jobs_source_check
  check (source in ('employer', 'greenhouse', 'lever', 'usajobs', 'adzuna', 'jsearch', 'simplify', 'ashby', 'smartrecruiters', 'workable',
  'nsf', 'precollege', 'vanshb03', 'co0oper', 'speedyapply', 'web'));


-- 5. only jobs for high schoolers and college undergrads.
-- a title with PhD, doctoral, postdoc, master's, MBA, graduate, or grad in it is refused,
-- whether the importer or (later) an employer adds it.
-- \m and \M mean "start of a word" and "end of a word", so "undergraduate" is still allowed.
-- '' is how you write one ' inside SQL text, so [''’] means "a ' or a ’".
-- this is the SAME list as NOT_FOR_OUR_STUDENTS in backend/src/job-sources/shared.ts.
-- change both together: the importer filters first so one bad job can't fail a whole save.
-- (descriptions like "currently pursuing a PhD" are only checked by the importer: that's too
-- fuzzy for a database rule.)
--
-- first remove imported jobs already in the table that break the rule, or adding it fails.
-- Supabase warns that this is destructive: it only deletes imported jobs (never employer
-- posts), and the importer would skip them anyway, so nothing we want is lost.
delete from public.jobs
where source <> 'employer'
  and title ~* '\m(ph\.?\s?d|doctoral|postdoctoral|post-?docs?|master[''’]?s|mba|graduate|grad)\M';

alter table public.jobs drop constraint if exists jobs_title_for_our_students;
alter table public.jobs add constraint jobs_title_for_our_students
  check (title !~* '\m(ph\.?\s?d|doctoral|postdoctoral|post-?docs?|master[''’]?s|mba|graduate|grad)\M');

-- 6. Added 2026-11-16: when each job was posted, so students can see how new a listing is.
-- imported jobs: the date the company's job site gives (Greenhouse's first_published, Lever's
-- createdAt, JSearch's posted date). The importer fills it in on its next run, so run it after this.
-- null = the site didn't say (the Opportunities page then shows when ScoutSearch found the job).
-- employer jobs: when they were posted on ScoutSearch. That's their created_at, so the update
-- copies it for the ones already here, and "default now()" fills it in for new ones.
alter table public.jobs add column if not exists posted_at timestamptz;
update public.jobs set posted_at = created_at where source = 'employer' and posted_at is null;
alter table public.jobs alter column posted_at set default now();

-- 7. Added 2026-11-16: when Refresh on Opportunities last checked the job sites (one row).
-- The backend only starts a new check if the last one started over 30 minutes ago, for the whole
-- site, so nobody can make our server hammer the job sites (backend/src/jobs.ts, POST /refresh).
create table if not exists public.job_refreshes (
  id           int primary key default 1 check (id = 1),   -- only ever one row
  started_at   timestamptz not null default 'epoch',
  finished_at  timestamptz,
  worked       boolean
);
insert into public.job_refreshes (id) values (1) on conflict (id) do nothing;
alter table public.job_refreshes enable row level security;

-- 8. Added 2026-11-17: AI tags (backend/src/ai-tags.ts). After each import, a free AI model reads
-- the public job posts and tags which majors each one fits and which skills it names. Best fit on
-- Opportunities uses them. Only job posts are sent to the AI, never anything about a student.
-- ai_tagged_at = when it was tagged (null = not yet, so the next run picks it up)
alter table public.jobs add column if not exists ai_majors text[] not null default '{}';
alter table public.jobs add column if not exists ai_skills text[] not null default '{}';
alter table public.jobs add column if not exists ai_tagged_at timestamptz;
-- the jobs waiting for tags, newest first, found quickly
create index if not exists jobs_waiting_for_ai_tags on public.jobs (posted_at desc) where ai_tagged_at is null and status = 'open';

-- 9. Added 2026-11-17 (optional, for speed): the open jobs in the order Opportunities and the
-- public job list show them, so the database doesn't re-sort every open job for each page
create index if not exists jobs_open_newest on public.jobs (posted_at desc nulls last, created_at desc, id) where status = 'open';
