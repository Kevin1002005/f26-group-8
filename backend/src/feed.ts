// The Feed (frontend/src/pages/Feed.jsx): posts every logged-in student can see, comments,
// likes, and following. The tables are in backend/sql/feed.sql.
//   GET    /api/feed/posts?tab=all|following&before=<time>   a page of posts, newest first
//   POST   /api/feed/posts                 { text }          share a post
//   PATCH  /api/feed/posts/:id             { text }          edit YOUR post
//   DELETE /api/feed/posts/:id                               delete YOUR post
//   PUT    /api/feed/posts/:id/like                          like it      -> { likes, liked }
//   DELETE /api/feed/posts/:id/like                          unlike it    -> { likes, liked }
//   POST   /api/feed/posts/:id/comments    { text }          comment on it
//   PATCH  /api/feed/comments/:id          { text }          edit YOUR comment
//   DELETE /api/feed/comments/:id                            delete YOUR comment
//   PUT    /api/feed/follows/:userId                         follow someone
//   DELETE /api/feed/follows/:userId                         stop following them
// Every route needs you to be logged in (authenticateToken). Posts show the writer's name and
// headline from their profile (student_profiles), and nothing else about them.
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// every route in this file: log in first (401 if not)
router.use(authenticateToken);

const PAGE_SIZE = 20;
const MOST_POST_LETTERS = 2000;
const MOST_COMMENT_LETTERS = 500;
// so one account can't flood the Feed: at most this many in any 10 minutes
const MOST_POSTS_PER_10_MIN = 10;
const MOST_COMMENTS_PER_10_MIN = 30;
// what a uuid looks like: 8-4-4-4-12 hex digits
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = { id: string; name: string; headline: string };

// The text of a post or comment: trimmed, not empty, not too long.
// Gives back { text } or { problem } (a message for a 400)
function readText(value: unknown, most: number): { text: string } | { problem: string } {
  if (typeof value !== 'string' || value.trim() === '') return { problem: 'Write something first' };
  const text = value.trim();
  if (text.length > most) return { problem: `That's too long (at most ${most} letters)` };
  return { text };
}

// The name and headline of each of these students, from their profiles. Someone without a
// profile (or without a name in it) shows as "A ScoutSearch student": their email is never shown
async function peopleFor(ids: string[]): Promise<Map<string, Person> | null> {
  const people = new Map<string, Person>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return people;
  const { data, error } = await supabase.from('student_profiles').select('student_id, data').in('student_id', unique);
  if (error) {
    console.error('feed people lookup failed:', error);
    return null;
  }
  for (const id of unique) {
    const profile = data.find((row) => row.student_id === id)?.data ?? {};
    const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'A ScoutSearch student';
    const headline = typeof profile.headline === 'string' && profile.headline.trim() ? profile.headline.trim() : 'Student';
    people.set(id, { id, name, headline });
  }
  return people;
}

// True if this student already wrote "most" rows in "table" in the last 10 minutes
async function tooMany(table: string, studentId: string, most: number): Promise<boolean | null> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from(table).select('id').eq('author_id', studentId).gte('created_at', since).limit(most);
  if (error) {
    console.error(`${table} count failed:`, error);
    return null;
  }
  return data.length >= most;
}

// How many likes a post has
async function likeCount(postId: string): Promise<number | null> {
  const { data, error } = await supabase.from('post_likes').select('student_id').eq('post_id', postId);
  if (error) {
    console.error('like count failed:', error);
    return null;
  }
  return data.length;
}

type CommentRow = { id: string; post_id: string; author_id: string; text: string; created_at: string; edited_at: string | null };
// the columns of a post and of a comment (edited_at: when it was last edited, or null)
const POST_COLUMNS = 'id, author_id, text, created_at, edited_at';
const COMMENT_COLUMNS = 'id, post_id, author_id, text, created_at, edited_at';
// One comment, the way the Feed shows it
function shapeComment(row: CommentRow, me: string, people: Map<string, Person>) {
  return { id: row.id, text: row.text, created_at: row.created_at, edited_at: row.edited_at ?? null, mine: row.author_id === me, author: people.get(row.author_id) };
}


// GET /api/feed/posts: 20 posts, newest first. tab=following: only from people you follow.
// before=<a post's created_at>: the 20 older than that ("Show older posts").
// -> { posts, more (true if there are older ones), following_count }
router.get('/posts', async (req, res) => {
  const me = req.user!.id;
  const tab = req.query.tab ?? 'all';
  if (tab !== 'all' && tab !== 'following') return res.status(400).json({ error: 'tab has to be all or following' });
  const before = req.query.before;
  if (before !== undefined && (typeof before !== 'string' || Number.isNaN(Date.parse(before)))) {
    return res.status(400).json({ error: 'before has to be a time' });
  }

  // who you follow: for the Following tab, and for each post's Follow button
  const { data: follows, error: followsError } = await supabase.from('follows').select('followed_id').eq('follower_id', me);
  if (followsError) {
    console.error('follows lookup failed:', followsError);
    return res.status(500).json({ error: 'Database error' });
  }
  const followingIds = follows.map((row) => row.followed_id as string);
  if (tab === 'following' && followingIds.length === 0) {
    return res.json({ posts: [], more: false, following_count: 0 });
  }

  // one more than a page, to know if there are older ones
  let query = supabase
    .from('posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (tab === 'following') query = query.in('author_id', followingIds);
  if (typeof before === 'string') query = query.lt('created_at', new Date(before).toISOString());
  const { data: rows, error } = await query;
  if (error) {
    console.error('post list failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  const posts = rows.slice(0, PAGE_SIZE);
  const ids = posts.map((post) => post.id);

  // their likes and comments, both at once (Promise.all waits for both)
  const [likes, comments] = ids.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }]
    : await Promise.all([
      supabase.from('post_likes').select('post_id, student_id').in('post_id', ids),
      supabase.from('post_comments').select(COMMENT_COLUMNS).in('post_id', ids).order('created_at'),
    ]);
  if (likes.error || comments.error) {
    console.error('post likes or comments lookup failed:', likes.error ?? comments.error);
    return res.status(500).json({ error: 'Database error' });
  }
  const commentRows = (comments.data ?? []) as CommentRow[];
  const likeRows = (likes.data ?? []) as { post_id: string; student_id: string }[];

  const people = await peopleFor([...posts.map((post) => post.author_id), ...commentRows.map((comment) => comment.author_id)]);
  if (!people) return res.status(500).json({ error: 'Database error' });

  res.json({
    posts: posts.map((post) => ({
      id: post.id,
      text: post.text,
      created_at: post.created_at,
      edited_at: post.edited_at ?? null,
      mine: post.author_id === me,
      author: { ...people.get(post.author_id), following: followingIds.includes(post.author_id) },
      likes: likeRows.filter((like) => like.post_id === post.id).length,
      liked: likeRows.some((like) => like.post_id === post.id && like.student_id === me),
      comments: commentRows.filter((comment) => comment.post_id === post.id).map((comment) => shapeComment(comment, me, people)),
    })),
    more: rows.length > PAGE_SIZE,
    following_count: followingIds.length,
  });
});


// POST /api/feed/posts: share a post. body { text } -> 201 { post }
router.post('/posts', async (req, res) => {
  const me = req.user!.id;
  const checked = readText(req.body?.text, MOST_POST_LETTERS);
  if ('problem' in checked) return res.status(400).json({ error: checked.problem });
  const busy = await tooMany('posts', me, MOST_POSTS_PER_10_MIN);
  if (busy === null) return res.status(500).json({ error: 'Database error' });
  if (busy) return res.status(429).json({ error: "You've posted a lot just now. Wait a few minutes and try again." });

  const { data: post, error } = await supabase
    .from('posts')
    .insert({ author_id: me, text: checked.text })
    .select(POST_COLUMNS)
    .single();
  if (error) {
    console.error('post insert failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  const people = await peopleFor([me]);
  if (!people) return res.status(500).json({ error: 'Database error' });
  res.status(201).json({
    post: { id: post.id, text: post.text, created_at: post.created_at, edited_at: null, mine: true, author: { ...people.get(me), following: false }, likes: 0, liked: false, comments: [] },
  });
});


// Edits YOUR post or comment in "table": the new text, and edited_at = now. Gives back the
// changed row, or null if there's no such one of yours (someone else's answers the same: 404)
async function editOwn(table: 'posts' | 'post_comments', id: string, me: string, text: string) {
  const { data, error } = await supabase
    .from(table)
    .update({ text: text, edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', me)
    .select(table === 'posts' ? POST_COLUMNS : COMMENT_COLUMNS);
  if (error) {
    console.error(`${table} edit failed:`, error);
    return undefined;
  }
  return (data[0] as unknown as { id: string; text: string; edited_at: string } | undefined) ?? null;
}

// PATCH /api/feed/posts/:id: edit YOUR post. body { text } -> { post: { id, text, edited_at } }
router.patch('/posts/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const checked = readText(req.body?.text, MOST_POST_LETTERS);
  if ('problem' in checked) return res.status(400).json({ error: checked.problem });
  const row = await editOwn('posts', req.params.id, req.user!.id, checked.text);
  if (row === undefined) return res.status(500).json({ error: 'Database error' });
  if (row === null) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: { id: row.id, text: row.text, edited_at: row.edited_at } });
});


// DELETE /api/feed/posts/:id: delete YOUR post (and its comments and likes). 204, or 404 if
// there's no such post of yours (someone else's post answers the same, so nothing is given away)
router.delete('/posts/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', req.params.id)
    .eq('author_id', req.user!.id)
    .select('id');
  if (error) {
    console.error('post delete failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (data.length === 0) return res.status(404).json({ error: 'Post not found' });
  res.status(204).end();
});


// PUT /api/feed/posts/:id/like (like) and DELETE (unlike) -> { likes, liked }
router.put('/posts/:id/like', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  // ignoreDuplicates: liking twice is fine, it stays one like
  const { error } = await supabase
    .from('post_likes')
    .upsert({ post_id: req.params.id, student_id: req.user!.id }, { onConflict: 'post_id,student_id', ignoreDuplicates: true });
  if (error) {
    // 23503: the post doesn't exist (anymore)
    if (error.code === '23503') return res.status(404).json({ error: 'Post not found' });
    console.error('like failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  const likes = await likeCount(req.params.id);
  if (likes === null) return res.status(500).json({ error: 'Database error' });
  res.json({ likes, liked: true });
});

router.delete('/posts/:id/like', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const { error } = await supabase.from('post_likes').delete().eq('post_id', req.params.id).eq('student_id', req.user!.id);
  if (error) {
    console.error('unlike failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  const likes = await likeCount(req.params.id);
  if (likes === null) return res.status(500).json({ error: 'Database error' });
  res.json({ likes, liked: false });
});


// POST /api/feed/posts/:id/comments: comment on a post. body { text } -> 201 { comment }
router.post('/posts/:id/comments', async (req, res) => {
  const me = req.user!.id;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const checked = readText(req.body?.text, MOST_COMMENT_LETTERS);
  if ('problem' in checked) return res.status(400).json({ error: checked.problem });
  const busy = await tooMany('post_comments', me, MOST_COMMENTS_PER_10_MIN);
  if (busy === null) return res.status(500).json({ error: 'Database error' });
  if (busy) return res.status(429).json({ error: "You've commented a lot just now. Wait a few minutes and try again." });

  const { data: comment, error } = await supabase
    .from('post_comments')
    .insert({ post_id: req.params.id, author_id: me, text: checked.text })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'Post not found' });
    console.error('comment insert failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  const people = await peopleFor([me]);
  if (!people) return res.status(500).json({ error: 'Database error' });
  res.status(201).json({ comment: shapeComment(comment as CommentRow, me, people) });
});


// PATCH /api/feed/comments/:id: edit YOUR comment. body { text } -> { comment: { id, text, edited_at } }
router.patch('/comments/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Comment not found' });
  const checked = readText(req.body?.text, MOST_COMMENT_LETTERS);
  if ('problem' in checked) return res.status(400).json({ error: checked.problem });
  const row = await editOwn('post_comments', req.params.id, req.user!.id, checked.text);
  if (row === undefined) return res.status(500).json({ error: 'Database error' });
  if (row === null) return res.status(404).json({ error: 'Comment not found' });
  res.json({ comment: { id: row.id, text: row.text, edited_at: row.edited_at } });
});

// DELETE /api/feed/comments/:id: delete YOUR comment. 204, or 404 (same as for posts)
router.delete('/comments/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Comment not found' });
  const { data, error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', req.params.id)
    .eq('author_id', req.user!.id)
    .select('id');
  if (error) {
    console.error('comment delete failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (data.length === 0) return res.status(404).json({ error: 'Comment not found' });
  res.status(204).end();
});


// PUT /api/feed/follows/:userId (follow) and DELETE (stop following) -> { following }
router.put('/follows/:userId', async (req, res) => {
  const me = req.user!.id;
  if (!UUID.test(req.params.userId)) return res.status(404).json({ error: 'Student not found' });
  if (req.params.userId === me) return res.status(400).json({ error: "You can't follow yourself" });
  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: me, followed_id: req.params.userId }, { onConflict: 'follower_id,followed_id', ignoreDuplicates: true });
  if (error) {
    // 23503: there's no such account
    if (error.code === '23503') return res.status(404).json({ error: 'Student not found' });
    console.error('follow failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ following: true });
});

router.delete('/follows/:userId', async (req, res) => {
  if (!UUID.test(req.params.userId)) return res.status(404).json({ error: 'Student not found' });
  const { error } = await supabase.from('follows').delete().eq('follower_id', req.user!.id).eq('followed_id', req.params.userId);
  if (error) {
    console.error('unfollow failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ following: false });
});

export default router;
