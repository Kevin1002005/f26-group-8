-- frontend/plans.md Task B8: the Resume builder's resume, saved with each account, so it
-- follows a student to any device. Paste this whole file into Supabase -> SQL Editor -> Run.
-- Safe to run more than once: "if not exists" skips what's already there.


-- 1. one resume per student: the whole resume as one JSON value, in the shared contract's
-- shape: { contact, education[], experience[], projects[], skills[] }.
-- the backend checks every box before saving (backend/src/resumes.ts), so only that shape
-- ever gets in. The checks here are a second lock: it has to be a JSON object, and not huge.
create table if not exists public.resumes (
  -- whose resume it is: their id in Supabase Auth. if that login is deleted, it goes too
  student_id  uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 100000),
  updated_at  timestamptz not null default now()
);


-- 2. RLS on, no policies (the same as applications): only our backend reads and writes it,
-- and only ever the logged-in student's own resume.
alter table public.resumes enable row level security;
