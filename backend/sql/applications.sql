-- frontend/plans.md Task B7: the Application tracker's list, saved with each account,
-- so it follows a student to any device. Paste this whole file into Supabase -> SQL Editor -> Run.
-- Run it after jobs.sql: job_id below links to the jobs table.
-- Safe to run more than once: "if not exists" skips what's already there.


-- 1. one row per job a student keeps on their Application tracker (/applications).
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),

  -- whose tracker it is: their id in Supabase Auth. if that login is deleted, their
  -- tracker goes too. (auth.users, not profiles: nothing creates profile rows yet)
  student_id    uuid not null references auth.users(id) on delete cascade,

  -- a real job from our jobs table. null when it isn't one of ours (see example_id).
  -- if that job is deleted later, the row stays (with the title saved below), just unlinked
  job_id        uuid references public.jobs(id) on delete set null,

  -- the made-up example jobs in frontend/src/data/opportunities.js (numbered 1, 2, 3...),
  -- which the Feed's listing posts can still save. null for real jobs
  example_id    integer check (example_id between 1 and 1000),

  -- what the tracker card shows, copied when the job is saved, so the card still makes
  -- sense if the job changes or disappears. for real jobs the backend copies these from
  -- the jobs table itself (it never takes the browser's word for them)
  title         text not null check (char_length(title) between 1 and 300),
  organization  text not null default '' check (char_length(organization) <= 300),
  deadline      date,

  -- which column it's in. decision D8 (2026-11-15): the tracker's 3 columns
  status        text not null default 'saved' check (status in ('saved', 'preparing', 'submitted')),
  notes         text not null default '' check (char_length(notes) <= 5000),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- a job can only be on someone's tracker once. Postgres never counts two nulls as the
  -- same, so these don't stop a tracker from holding both real jobs and examples
  unique (student_id, job_id),
  unique (student_id, example_id),

  -- a row is a real job OR an example, never both
  check (job_id is null or example_id is null)
);


-- 2. RLS on, no policies (the same as jobs and profiles).
-- only our backend reads and writes it, with the secret key (which skips RLS), and its
-- routes only ever touch the logged-in student's own rows. With no policy, the publishable
-- key in the browser can't read or change anyone's tracker through <SUPABASE_URL>/rest/v1.
alter table public.applications enable row level security;
