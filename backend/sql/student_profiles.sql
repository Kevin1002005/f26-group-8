-- Each student's own profile: what they fill in on the welcome guide (frontend/src/pages/Welcome.jsx)
-- and on Edit profile, and what the Profile page shows. Paste this whole file into
-- Supabase -> SQL Editor -> Run. Safe to run more than once: "if not exists" skips what's already there.
--
-- It's its own table on purpose, apart from public.profiles (profiles.sql, Anthony's: one row per
-- login, for /api/auth/me). Nothing in profiles.sql or S4 has to change for this.
-- Education, experience, and projects aren't in here: the Profile page reads them from the resume
-- (resumes.sql), so students only type them once.


-- 1. one profile per student: the answers as one JSON value
--    { name, pronouns, school, classYear, city, headline, about,
--      lookingFor: { kinds[], when, where, paidOnly }, skills[] }
-- the backend checks every box before saving (backend/src/student-profile.ts), so only that shape
-- ever gets in. The checks here are a second lock: it has to be a JSON object, and not huge.
create table if not exists public.student_profiles (
  -- whose profile it is: their id in Supabase Auth. if that login is deleted, this goes too
  student_id    uuid primary key references auth.users(id) on delete cascade,
  data          jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  -- when they finished (or skipped) the welcome guide. null = they haven't yet, so the site shows it
  onboarded_at  timestamptz,
  updated_at    timestamptz not null default now()
);


-- 2. RLS on, no policies (the same as resumes and applications): only our backend reads and
-- writes it, and only ever the logged-in student's own profile.
alter table public.student_profiles enable row level security;
