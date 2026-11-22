// Each student's own profile: what the welcome guide (frontend/src/pages/Welcome.jsx) and
// My info (frontend/src/pages/EditProfile.jsx) save. Only that student ever sees it.
//   GET /api/student-profile/me   your profile, or null if you haven't saved one  -> { profile: Profile | null }
//   PUT /api/student-profile/me   save it (replaces the whole thing)               -> { profile: Profile }
//                                 body { data: { name, level, school, ... }, finished?: true }
//                                 (level: "high-school" or "college", see LEVELS below)
// Profile = { data, onboarded_at, updated_at }. onboarded_at is when you finished (or skipped) the
// welcome guide, or null if you haven't yet (then the site shows you the guide).
// "me" because there's only ever your own: nobody can ask for someone else's.
// It uses its own table (backend/sql/student_profiles.sql), not Anthony's profiles table.
import express from 'express';
import { supabase } from './db.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// every route in this file: log in first (401 if not)
router.use(authenticateToken);

// The boxes, and the most letters each one can hold. They match the maxLength on the
// site's boxes (frontend/src/components/ProfileFields.jsx), so only a hand-made request hits them
// (2026-11-22) pronouns, headline, and about were taken out: nothing shows or uses them now, so they
// aren't kept. An old copy of the site that still sends them just has them left out, not refused
const TEXT_BOXES: Record<string, number> = { name: 100, school: 150, classYear: 20, major: 100, city: 100 };
const LOOKING_FOR_BOXES: Record<string, number> = { when: 100, where: 150 };
// The kinds of positions, the same as the job board's tabs (Discovery)
const KINDS = ['Internship', 'Co-op', 'Research', 'Program'];
const MOST_SKILLS = 30;
const SKILL_LETTERS = 50;
const COLUMNS = 'data, onboarded_at, updated_at';
// Where the student is in school (the welcome guide's first question). The same two words as
// the jobs' level and Opportunities' "Who it's for" filter, so Best fit (fit.ts) can use it as is
const LEVELS = ['high-school', 'college'];

// true for a plain { } object (not null, and not a list)
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Copies the text boxes from "from" into "into", trimmed. Missing or null becomes "".
// Gives back a message if one isn't text or is too long, or null if they're all fine
function copyText(from: Record<string, unknown>, boxes: Record<string, number>, into: Record<string, unknown>): string | null {
  for (const [box, most] of Object.entries(boxes)) {
    const value = from[box] ?? '';
    if (typeof value !== 'string') return `${box} has to be text`;
    if (value.trim().length > most) return `${box} can be at most ${most} letters`;
    into[box] = value.trim();
  }
  return null;
}

// Checks a whole profile and builds a clean copy of it: only the known boxes, so nothing
// else ever gets saved. Gives back { profile } or { problem } (a message for a 400)
function cleanProfile(data: unknown): { profile: Record<string, unknown> } | { problem: string } {
  if (!isObject(data)) return { problem: 'Send the profile as { data: { name, school, ... } }' };
  const profile: Record<string, unknown> = {};
  const textProblem = copyText(data, TEXT_BOXES, profile);
  if (textProblem) return { problem: textProblem };

  // High school or college: only one of LEVELS is kept. Anything else (or nothing, for
  // someone who hasn't picked yet) is left out instead of refused, so saving the rest of a
  // profile never fails over it
  if (typeof data.level === 'string' && LEVELS.includes(data.level)) profile.level = data.level;

  // What I'm looking for
  const lookingFor = data.lookingFor ?? {};
  if (!isObject(lookingFor)) return { problem: 'lookingFor has to be { kinds, when, where, paidOnly }' };
  const cleanLooking: Record<string, unknown> = {};
  const lookingProblem = copyText(lookingFor, LOOKING_FOR_BOXES, cleanLooking);
  if (lookingProblem) return { problem: lookingProblem };
  const kinds: unknown = lookingFor.kinds ?? [];
  if (!Array.isArray(kinds) || !kinds.every((kind) => typeof kind === 'string' && KINDS.includes(kind))) {
    return { problem: `kinds has to be a list of: ${KINDS.join(', ')}` };
  }
  // each kind once, in the job board's order
  cleanLooking.kinds = KINDS.filter((kind) => kinds.includes(kind));
  const paidOnly = lookingFor.paidOnly ?? false;
  if (typeof paidOnly !== 'boolean') return { problem: 'paidOnly has to be true or false' };
  cleanLooking.paidOnly = paidOnly;
  profile.lookingFor = cleanLooking;

  // Skills: trimmed, no blanks, and no repeats ("react" next to "React")
  const skills: unknown = data.skills ?? [];
  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill === 'string')) {
    return { problem: 'skills has to be a list of text' };
  }
  // (a list far longer than anyone types is refused right away, and repeats are found with a
  // Set: checking each skill against every kept one took seconds for a list of thousands)
  if (skills.length > MOST_SKILLS * 4) return { problem: `You can list at most ${MOST_SKILLS} skills` };
  const cleanSkills: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills as string[]) {
    const text = skill.trim();
    if (text.length > SKILL_LETTERS) return { problem: `A skill can be at most ${SKILL_LETTERS} letters` };
    if (text === '' || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    cleanSkills.push(text);
    if (cleanSkills.length > MOST_SKILLS) return { problem: `You can list at most ${MOST_SKILLS} skills` };
  }
  profile.skills = cleanSkills;
  return { profile };
}


// GET /api/student-profile/me: your profile, or null if there isn't one yet
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('student_profiles')
    .select(COLUMNS)
    .eq('student_id', req.user!.id)
    .maybeSingle();

  if (error) {
    console.error('profile lookup failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ profile: data });
});


// PUT /api/student-profile/me: save your profile. finished: true means you just finished (or
// skipped) the welcome guide, so it isn't shown again
router.put('/me', async (req, res) => {
  const checked = cleanProfile(req.body?.data);
  if ('problem' in checked) {
    return res.status(400).json({ error: checked.problem });
  }
  const finished = req.body?.finished ?? false;
  if (typeof finished !== 'boolean') {
    return res.status(400).json({ error: 'finished has to be true or false' });
  }

  const now = new Date().toISOString();
  const row: Record<string, unknown> = { student_id: req.user!.id, data: checked.profile, updated_at: now };
  // only when finishing the guide. Left out otherwise, so a save from My info keeps the
  // date that's there (an upsert only changes the columns it's given)
  if (finished) row.onboarded_at = now;

  // "upsert": insert it, or update it if there's one already
  const { data, error } = await supabase
    .from('student_profiles')
    .upsert(row, { onConflict: 'student_id' })
    .select(COLUMNS)
    .single();
  if (error) {
    console.error('profile save failed:', error);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json({ profile: data });
});

export default router;
