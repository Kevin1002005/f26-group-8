// frontend/plans.md Task B7: each student's Application tracker list, saved with their account.
//   GET    /api/applications        your list                  -> { applications: [Application] }
//   POST   /api/applications        put a job on it (one of ours, an example, or one
//                                   from another site)         -> 201 { application } (200 if it was there already)
//   PATCH  /api/applications/:id    move it to another column  -> { application }
//   DELETE /api/applications/:id    take it off                -> 204
//
// Every route needs you to be logged in (authenticateToken), and only ever touches YOUR rows.
// That part matters: the backend uses the secret key, which skips RLS, so the
// .eq('student_id', ...) on every query below is the only thing keeping trackers apart.
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// every route in this file: log in first (401 if not)
router.use(authenticateToken);

// what's sent back for each row (the shared contract's Application)
const COLUMNS = 'id, job_id, example_id, title, organization, deadline, status, notes, created_at, updated_at';

// decision D8 (2026-11-15): the tracker's 3 columns. The same list as the check in
// backend/sql/applications.sql
const STATUSES = ['saved', 'preparing', 'submitted'];

// what a uuid looks like: 8-4-4-4-12 hex digits (the same as in jobs.ts)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// enough for anyone's real job search, and it stops one account filling the table
const MOST_PER_STUDENT = 200;


// text the client sent, with spaces trimmed off the ends. null if it isn't text at all,
// or is longer than "most" letters (the same limits as the checks in applications.sql)
function readText(value: unknown, most: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= most ? text : null;
}

// a date like "2026-12-01" that's a real day (2026-02-30 isn't: JavaScript rolls it over
// to March, so it doesn't come back as the same text). null if it isn't one
function readDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value) ? value : null;
}


// GET /api/applications: your whole list, oldest first (the order you saved them in)
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('applications')
    .select(COLUMNS)
    .eq('student_id', req.user!.id)
    .order('created_at')
    .order('id');   // same time (two saved at once): id keeps the order the same every time

  if (error) {
    console.error('application list failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ applications: data });
});


// The title, company, and deadline a student typed in (for an example job, or a job from
// another site), checked. Gives back those three, or null if one is wrong
function readTypedJob(body: Record<string, unknown>): { title: string; organization: string; deadline: string | null } | null {
  const title = readText(body.title, 300);
  const organization = readText(body.organization ?? '', 300);
  const deadline = body.deadline === undefined || body.deadline === null ? null : readDate(body.deadline);
  if (!title || organization === null || (body.deadline != null && deadline === null)) return null;
  return { title, organization, deadline };
}

// POST /api/applications: put a job on your tracker.
// body for a real job:            { job_id, status?, notes? }   (title, company, and deadline come from the jobs table)
// body for an example job:        { example_id, title, organization?, deadline?, status?, notes? }
// body for a job from another site: { title, organization?, deadline?, status?, notes?, id? }
//   id lets the browser pick the row's id (a uuid) itself, so it can show the card and
//   keep moving it before the server has answered (src/data/tracker.js)
router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const studentId = req.user!.id;

  const status = body.status ?? 'saved';
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown column' });
  }
  // notes can come along (Undo puts a job back with its notes)
  const notes = body.notes === undefined ? '' : readText(body.notes, 5000);
  if (notes === null) {
    return res.status(400).json({ error: 'Notes can be at most 5,000 letters' });
  }

  // the row to save, filled in below
  let row: Record<string, unknown>;

  if (body.job_id !== undefined && body.job_id !== null) {
    // a real job: check it's one of ours, and copy what the tracker shows FROM the jobs
    // table, never from the request (a student could otherwise put any words on a card).
    // pending jobs are still hidden from students (an admin hasn't verified the employer)
    if (typeof body.job_id !== 'string' || !UUID.test(body.job_id)) {
      return res.status(400).json({ error: 'Unknown job' });
    }
    const { data: job, error } = await supabase
      .from('jobs')
      .select('title, organization, deadline')
      .eq('id', body.job_id)
      .neq('status', 'pending')
      .maybeSingle();
    if (error) {
      console.error('application job lookup failed:', error);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    row = { student_id: studentId, job_id: body.job_id, title: job.title, organization: job.organization, deadline: job.deadline, status, notes };
  } else if (body.example_id !== undefined && body.example_id !== null) {
    // a made-up example job (opportunities.js). The server doesn't know those, so the
    // card's words come from the request, after checking them
    const exampleId = body.example_id;
    if (!Number.isInteger(exampleId) || exampleId < 1 || exampleId > 1000) {
      return res.status(400).json({ error: 'Unknown job' });
    }
    const typed = readTypedJob(body);
    if (!typed) {
      return res.status(400).json({ error: 'Check the job\'s title, company, and deadline' });
    }
    row = { student_id: studentId, example_id: exampleId, ...typed, status, notes };
  } else if (body.title !== undefined) {
    // a job the student found on another site and typed in (frontend/plans.md F4:
    // "Add an application"). It's only on their own tracker, so their words are fine
    if (body.id !== undefined && (typeof body.id !== 'string' || !UUID.test(body.id))) {
      return res.status(400).json({ error: 'Unknown job' });
    }
    const typed = readTypedJob(body);
    if (!typed) {
      return res.status(400).json({ error: 'Check the job\'s title, company, and deadline' });
    }
    row = { student_id: studentId, ...typed, status, notes };
    if (body.id !== undefined) row.id = body.id;
  } else {
    return res.status(400).json({ error: 'Say which job (job_id, example_id, or a title)' });
  }

  // at most MOST_PER_STUDENT jobs each: ask for that many ids, and see if there are that many
  const { data: existing, error: countError } = await supabase
    .from('applications')
    .select('id')
    .eq('student_id', studentId)
    .range(0, MOST_PER_STUDENT - 1);
  if (countError) {
    console.error('application count failed:', countError);
    return res.status(500).json({ error: 'Database error' });
  }
  if (existing.length >= MOST_PER_STUDENT) {
    return res.status(400).json({ error: `Your tracker is full (${MOST_PER_STUDENT} jobs). Take some off first.` });
  }

  const { data: saved, error: insertError } = await supabase
    .from('applications')
    .insert(row)
    .select(COLUMNS)
    .single();

  if (insertError) {
    // 23505 = unique violation: this job is on the tracker already (for example, Save
    // pressed on two devices, or the browser sent a job from another site twice because
    // the first answer got lost). That's fine: send back the row that's there, with 200
    if (insertError.code === '23505') {
      const match = row.job_id ? { field: 'job_id', value: row.job_id }
        : row.example_id ? { field: 'example_id', value: row.example_id }
        : { field: 'id', value: row.id };
      const { data: already, error: findError } = await supabase
        .from('applications')
        .select(COLUMNS)
        .eq('student_id', studentId)
        .eq(match.field, match.value)
        .maybeSingle();
      if (findError) {
        console.error('finding the existing application failed:', findError);
        return res.status(500).json({ error: 'Database error' });
      }
      if (already) {
        return res.json({ application: already });
      }
      // not one of YOUR rows: that id is taken by someone else's. Say no, without saying whose
      return res.status(409).json({ error: 'That id is taken. Try again.' });
    }
    console.error('application insert failed:', insertError);
    return res.status(500).json({ error: 'Database error' });
  }

  res.status(201).json({ application: saved });
});


// PATCH /api/applications/:id: move a job to another column ({ status }) and/or change
// its notes ({ notes }). Only your own: anyone else's id is "not found"
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const body = req.body ?? {};
  const changes: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return res.status(400).json({ error: 'Unknown column' });
    changes.status = body.status;
  }
  if (body.notes !== undefined) {
    const notes = readText(body.notes, 5000);
    if (notes === null) return res.status(400).json({ error: 'Notes can be at most 5,000 letters' });
    changes.notes = notes;
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'Nothing to change' });
  }
  changes.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('applications')
    .update(changes)
    .eq('id', id)
    .eq('student_id', req.user!.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('application update failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ application: data });
});


// DELETE /api/applications/:id: take a job off your tracker. Only your own
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { data, error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('student_id', req.user!.id)
    .select('id');   // ask for the deleted rows back, to know if there was one

  if (error) {
    console.error('application delete failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  if (data.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).end();
});

export default router;
