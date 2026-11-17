-- The Feed: posts, comments on them, likes, and who follows whom (frontend/src/pages/Feed.jsx,
-- backend/src/feed.ts). Paste this whole file into Supabase -> SQL Editor -> Run.
-- Safe to run more than once: "if not exists" skips what's already there.
--
-- Every logged-in student sees every post and comment (with the writer's name and headline from
-- student_profiles). Only the writer can delete theirs. Likes are counted, but nobody is shown
-- who liked what. Follows are private: only you see who you follow.
-- Everything here goes when the writer's login is deleted ("on delete cascade"), and a post's
-- comments and likes go with the post.


-- 1. posts: what you share in the post box
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  -- the backend trims it and checks the length too (backend/src/feed.ts). This is a second lock
  text        text not null check (char_length(text) between 1 and 2000),
  created_at  timestamptz not null default now()
);
-- the Feed shows the newest first, and the Following tab picks some writers' posts
create index if not exists posts_newest on public.posts (created_at desc, id desc);
create index if not exists posts_by_author on public.posts (author_id, created_at desc);


-- 2. comments on a post
create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_by_post on public.post_comments (post_id, created_at);
create index if not exists post_comments_by_author on public.post_comments (author_id, created_at desc);


-- 3. likes: one per student per post (the primary key makes a second one impossible)
create table if not exists public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  student_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, student_id)
);


-- 4. follows: follower_id follows followed_id (you can't follow yourself)
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  followed_id  uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);


-- 5. RLS on, no policies (the same as the other tables): only our backend reads and writes these,
-- and it decides what each student may see and change.
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.follows enable row level security;


-- 6. Added 2026-11-17: editing your own posts and comments. edited_at is when it was last changed
-- (null = never), so the Feed can say "Edited". "add column if not exists" makes this safe to run again.
alter table public.posts add column if not exists edited_at timestamptz;
alter table public.post_comments add column if not exists edited_at timestamptz;
