// frontend/plans.md Task B8: each student's resume from the Resume builder, saved with their account.
//   GET /api/resumes/me   your resume, or null if you haven't saved one   -> { resume: Resume | null }
//   PUT /api/resumes/me   save it (replaces the whole thing)               -> { resume: Resume }
//                         (409 { error, resume } if another device saved first, see below)
// "me" because there's only ever your own: nobody can ask for someone else's.
// Every route needs you to be logged in (authenticateToken).
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// every route in this file: log in first (401 if not)
router.use(authenticateToken);

// The boxes the Resume builder has (frontend/src/resume-storage.js, "blankResume"),
// and the most letters each one can hold. Real resumes never come close: these are
// here so nobody can store a novel (or junk) in the database.
const CONTACT_BOXES: Record<string, number> = { name: 200, location: 200, email: 200, phone: 50, link: 300 };
const LIST_BOXES: Record<string, Record<string, number>> = {
  education: { school: 200, location: 200, degree: 300, dates: 100 },
  experience: { role: 200, organization: 200, location: 200, dates: 100, bullets: 4000 },
  projects: { name: 200, context: 200, dates: 100, bullets: 4000, link: 300 },
  skills: { label: 100, items: 1000 },
};
const MOST_ENTRIES = 30;   // in each section (education, experience, ...)

// true for a plain { } object (not null, and not a list)
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Copies one entry, keeping ONLY the boxes in "boxes", each as text. A number becomes
// text ("2026"); anything else (missing, null, a list...) becomes empty, the same as the
// Resume builder does. Gives back a message instead if a box is too long.
function copyBoxes(entry: Record<string, unknown>, boxes: Record<string, number>): Record<string, string> | string {
  const copy: Record<string, string> = {};
  for (const [box, most] of Object.entries(boxes)) {
    const value = entry[box];
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    if (text.length > most) return `A "${box}" box is too long (at most ${most} letters)`;
    copy[box] = text;
  }
  return copy;
}

// Checks a whole resume and builds a clean copy of it: only the known sections and boxes,
// so nothing else ever gets saved. Gives back { resume } or { problem } (a message for a 400)
function cleanResume(data: unknown): { resume: Record<string, unknown> } | { problem: string } {
  if (!isObject(data)) return { problem: 'Send the resume as { data: { contact, education, ... } }' };

  const contact = data.contact ?? {};
  if (!isObject(contact)) return { problem: 'contact has to be { name, location, ... }' };
  const cleanContact = copyBoxes(contact, CONTACT_BOXES);
  if (typeof cleanContact === 'string') return { problem: cleanContact };
  const resume: Record<string, unknown> = { contact: cleanContact };

  for (const [section, boxes] of Object.entries(LIST_BOXES)) {
    const list = data[section] ?? [];
    if (!Array.isArray(list)) return { problem: `${section} has to be a list` };
    if (list.length > MOST_ENTRIES) return { problem: `${section} can have at most ${MOST_ENTRIES} entries` };
    const cleanList = [];
    for (const [place, entry] of list.entries()) {
      if (!isObject(entry)) return { problem: `Every ${section} entry has to be { ... }` };
      const cleanEntry = copyBoxes(entry, boxes);
      if (typeof cleanEntry === 'string') return { problem: cleanEntry };
      // numbered 1, 2, 3... in order, like the Resume builder does, so no two share an id
      cleanList.push({ id: place + 1, ...cleanEntry });
    }
    resume[section] = cleanList;
  }
  return { resume };
}


// GET /api/resumes/me: your saved resume, or null if there isn't one yet
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('resumes')
    .select('student_id, data, updated_at')
    .eq('student_id', req.user!.id)
    .maybeSingle();

  if (error) {
    console.error('resume lookup failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ resume: data });
});


// PUT /api/resumes/me: save your resume.
// body { data: { contact, education, experience, projects, skills }, base_updated_at? }
//
// base_updated_at stops two devices from quietly overwriting each other. It's the
// updated_at of the copy this browser started from (what GET or the last PUT gave back):
//   a time  "only save if the saved one is still that one"
//   null    "only save if there's none yet" (this browser has never seen one)
//   left out  save no matter what
// If someone saved in between (another device), nothing is saved, and the answer is
// 409 with the copy that's there now, so the Resume builder can ask which one to keep.
// To keep yours anyway, send it again with THAT copy's updated_at.
router.put('/me', async (req, res) => {
  const studentId = req.user!.id;
  const checked = cleanResume(req.body?.data);
  if ('problem' in checked) {
    return res.status(400).json({ error: checked.problem });
  }
  const base = req.body?.base_updated_at;
  if (base !== undefined && base !== null && (typeof base !== 'string' || Number.isNaN(Date.parse(base)))) {
    return res.status(400).json({ error: 'base_updated_at has to be a time (or null)' });
  }

  const newRow = { student_id: studentId, data: checked.resume, updated_at: new Date().toISOString() };
  const columns = 'student_id, data, updated_at';

  // left out: save no matter what ("upsert": insert it, or update it if there's one already)
  if (base === undefined) {
    const { data, error } = await supabase.from('resumes').upsert(newRow, { onConflict: 'student_id' }).select(columns).single();
    if (error) {
      console.error('resume save failed:', error);
      return res.status(500).json({ error: 'Database error' });
    }
    return res.json({ resume: data });
  }

  if (typeof base === 'string') {
    // only update the row if its updated_at is still the one this browser started from.
    // It's one step in the database, so two saves at the same moment can't both win
    const { data, error } = await supabase
      .from('resumes')
      .update({ data: newRow.data, updated_at: newRow.updated_at })
      .eq('student_id', studentId)
      .eq('updated_at', base)
      .select(columns)
      .maybeSingle();
    if (error) {
      console.error('resume save failed:', error);
      return res.status(500).json({ error: 'Database error' });
    }
    if (data) return res.json({ resume: data });
    // nothing matched: someone saved in between, or there's no row anymore (see below)
  }

  // base null (or the row it was based on is gone): only add one if there's none
  const { data: added, error: insertError } = await supabase.from('resumes').insert(newRow).select(columns).single();
  if (!insertError) return res.json({ resume: added });
  if (insertError.code !== '23505') {
    console.error('resume save failed:', insertError);
    return res.status(500).json({ error: 'Database error' });
  }

  // 23505: there IS one already, and it isn't the one this browser started from.
  // Send it back (409 = "conflict"), so the student can choose
  const { data: current, error: findError } = await supabase
    .from('resumes')
    .select(columns)
    .eq('student_id', studentId)
    .maybeSingle();
  if (findError || !current) {
    console.error('resume lookup after a clash failed:', findError);
    return res.status(500).json({ error: 'Database error' });
  }
  res.status(409).json({ error: 'Your resume was changed on another device.', resume: current });
});

export default router;
