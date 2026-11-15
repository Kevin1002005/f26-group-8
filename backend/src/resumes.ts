// frontend/plans.md Task B8: each student's resume from the Resume builder, saved with their account.
//   GET /api/resumes/me   your resume, or null if you haven't saved one   -> { resume: Resume | null }
//   PUT /api/resumes/me   save it (replaces the whole thing)               -> { resume: Resume }
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


// PUT /api/resumes/me: save your resume, body { data: { contact, education, experience, projects, skills } }.
// It replaces what was saved before ("upsert": insert it, or update it if there's one already)
router.put('/me', async (req, res) => {
  const checked = cleanResume(req.body?.data);
  if ('problem' in checked) {
    return res.status(400).json({ error: checked.problem });
  }

  const { data, error } = await supabase
    .from('resumes')
    .upsert({ student_id: req.user!.id, data: checked.resume, updated_at: new Date().toISOString() }, { onConflict: 'student_id' })
    .select('student_id, data, updated_at')
    .single();

  if (error) {
    console.error('resume save failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ resume: data });
});

export default router;
