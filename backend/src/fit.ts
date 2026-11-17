// How well a job fits a student: the "Best fit" score and its "Why it fits" reasons on
// Opportunities (GET /api/jobs/for-me in jobs.ts).
//
// It compares the job's title, company, description, and requirements with what the student
// told us: their major, skills, and what they're looking for (their profile, student_profiles)
// and their resume (skills, experience). Each part is worth some points. Only the parts the
// student filled in count, so someone who only gave a major isn't marked down for the rest:
//   major 30, skills 25, kind of position 15, high school or college 10, experience 10,
//   where 10, pay 10 (only if they asked for paid positions only)
// The score is the points earned out of the points possible, from 0 to 100.
// A job's AI tags (ai-tags.ts: the majors it fits and the skills it names, read by an AI from
// the public job post) count too, besides the words in the post. Nothing about the student is
// sent anywhere: this file runs on our server.

// The words job posts in each field tend to use. The names are the same as the site's list
// (frontend/src/data/majors.js): if you add a major there, add it here too.
// A major that isn't here ("Other") uses the words the student typed.
export const MAJOR_WORDS: Record<string, string[]> = {
  'Computer Science': ['software', 'developer', 'programming', 'computer science', 'web', 'frontend', 'front end', 'backend', 'back end',
    'full stack', 'mobile', 'cloud', 'devops', 'cybersecurity', 'machine learning', 'artificial intelligence', 'ai', 'swe', 'coding'],
  'Data Science': ['data', 'analytics', 'analyst', 'machine learning', 'statistics', 'statistical', 'data science', 'sql', 'visualization', 'ai'],
  'Computer or Electrical Engineering': ['hardware', 'electrical', 'embedded', 'firmware', 'circuit', 'fpga', 'asic', 'robotics', 'electronics',
    'semiconductor', 'signal processing', 'controls', 'chip'],
  'Mechanical Engineering': ['mechanical', 'manufacturing', 'cad', 'solidworks', 'robotics', 'aerospace', 'automotive', 'thermal', 'design engineer'],
  'Civil or Environmental Engineering': ['civil', 'structural', 'construction', 'transportation', 'infrastructure', 'environmental engineering',
    'water', 'geotechnical'],
  'Biology': ['biology', 'biological', 'lab', 'laboratory', 'biotech', 'life sciences', 'genetics', 'molecular', 'ecology', 'clinical research', 'wet lab'],
  'Chemistry': ['chemistry', 'chemical', 'lab', 'laboratory', 'materials', 'pharmaceutical', 'analytical', 'synthesis'],
  'Health Sciences or Nursing': ['health', 'healthcare', 'clinical', 'patient', 'nursing', 'hospital', 'medical', 'public health'],
  'Psychology': ['psychology', 'behavioral', 'mental health', 'counseling', 'human factors', 'user research', 'social science'],
  'Business': ['business', 'operations', 'strategy', 'consulting', 'management', 'sales', 'analyst', 'entrepreneurship', 'supply chain'],
  'Finance or Accounting': ['finance', 'financial', 'accounting', 'investment', 'banking', 'audit', 'tax', 'quantitative', 'trading', 'equity', 'wealth'],
  'Economics': ['economics', 'economic', 'economist', 'policy', 'quantitative', 'finance', 'analyst'],
  'Marketing or Communications': ['marketing', 'communications', 'social media', 'content', 'brand', 'public relations', 'journalism', 'writing', 'media'],
  'Design': ['design', 'designer', 'ux', 'ui', 'user experience', 'product design', 'graphic', 'visual', 'figma', 'creative'],
  'Mathematics or Statistics': ['math', 'mathematics', 'statistics', 'statistical', 'quantitative', 'quant', 'actuarial', 'modeling'],
  'Political Science or Public Policy': ['policy', 'government', 'public', 'political', 'legislative', 'law', 'advocacy', 'civic', 'nonprofit'],
  'Environmental Science': ['environmental', 'sustainability', 'climate', 'energy', 'conservation', 'ecology', 'renewable'],
  'Education': ['education', 'teaching', 'tutor', 'tutoring', 'teacher', 'school', 'curriculum', 'classroom'],
};
// "Undecided / exploring": no major, so every field shows
export const UNDECIDED = 'Undecided / exploring';

// The most skills and resume job-title words a student's Best fit looks at (see studentFrom)
const MOST_SKILLS = 60;
const MOST_EXPERIENCE_WORDS = 60;

// Words too common to mean anything on their own (for a typed-in major, or a job title on a resume)
const COMMON_WORDS = new Set([
  'and', 'the', 'for', 'with', 'of', 'in', 'or', 'a', 'an', 'to', 'at', 'on', 'major', 'studies', 'study', 'science', 'sciences',
  'intern', 'internship', 'assistant', 'associate', 'student', 'part', 'time', 'summer', 'member', 'volunteer', 'worker', 'staff',
  'team', 'lead', 'junior', 'senior', 'other', 'general',
]);

// A word or phrase in the text, as a whole word: "ai" is in "AI tools", not in "maintain".
// text must already be lower case. The regular expressions are kept, since the same words are
// checked against hundreds of jobs
// (The kept list is emptied when it reaches MOST_PATTERNS: the words come from students'
// filters and resumes, so without a limit it would grow for as long as the server runs)
const patterns = new Map<string, RegExp>();
const MOST_PATTERNS = 5000;
export function mentions(text: string, word: string): boolean {
  const w = word.toLowerCase();
  if (w === '' || !text.includes(w)) return false;   // the quick check first
  let pattern = patterns.get(w);
  if (!pattern) {
    if (patterns.size >= MOST_PATTERNS) patterns.clear();
    // escape the characters regular expressions treat specially (like the + in "C++")
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \p{L} = any letter, \p{N} = any digit: the word can't be part of a longer word
    pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u');
    patterns.set(w, pattern);
  }
  return pattern.test(text);
}

// The words of some text, without common ones, at least `shortest` letters long
function wordsOf(text: string, shortest: number): string[] {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((w) => w.length >= shortest && !COMMON_WORDS.has(w)))];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// What we know about a student, for fitFor
export type Student = {
  major: string;           // their major's name ('' if none, or undecided)
  majorWords: string[];    // the words that mean a job is in that field
  skills: string[];        // from the profile and the resume, each once
  kinds: string[];         // the kinds of positions they want: 'internship', 'co-op', 'research', 'program'
  level: 'high-school' | 'college';
  places: string[];        // where they want to be (their city, and "Where" on their profile)
  wantsRemote: boolean;
  paidOnly: boolean;
  experience: string[];    // words from the job titles on their resume
};

// Builds a Student from their profile's data and their resume's data (either can be missing)
export function studentFrom(profileData: unknown, resumeData: unknown): Student {
  const profile = isObject(profileData) ? profileData : {};
  const resume = isObject(resumeData) ? resumeData : {};
  const lookingFor = isObject(profile.lookingFor) ? profile.lookingFor : {};

  const major = text(profile.major) === UNDECIDED ? '' : text(profile.major);
  const majorWords = major === '' ? [] : MAJOR_WORDS[major] ?? wordsOf(major, 3);

  // skills: the profile's list, then each item of the resume's Skills lines ("Python, SQL"),
  // at most MOST_SKILLS in all. (A resume's Skills boxes can hold thousands of tiny items, and
  // every skill is checked against every job, so without a limit one resume could slow
  // Opportunities down for everyone.) seen holds each one in lower case, to skip repeats quickly
  const skills: string[] = [];
  const seen = new Set<string>();
  const addSkill = (skill: string) => {
    const s = skill.trim();
    if (skills.length >= MOST_SKILLS || s.length < 1 || s.length > 40 || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    skills.push(s);
  };
  if (Array.isArray(profile.skills)) for (const s of profile.skills) if (typeof s === 'string') addSkill(s);
  if (Array.isArray(resume.skills)) {
    for (const line of resume.skills) if (isObject(line)) for (const s of text(line.items).split(',')) addSkill(s);
  }

  const kindNames: Record<string, string> = { Internship: 'internship', 'Co-op': 'co-op', Research: 'research', Program: 'program' };
  const kinds = Array.isArray(lookingFor.kinds) ? lookingFor.kinds.map((k) => kindNames[k as string]).filter(Boolean) : [];

  // "Boston, MA or remote" -> boston, ma (and wantsRemote). Their city counts too
  const where = text(lookingFor.where).toLowerCase();
  const wantsRemote = /\bremote\b/.test(where);
  const places = [...new Set([...where.split(/,|\/|\bor\b|\band\b/), ...text(profile.city).toLowerCase().split(',')]
    .map((p) => p.replace(/\bremote\b/g, '').trim()).filter((p) => p.length >= 2))];

  const school = text(profile.school).toLowerCase();
  const level = /high school|\bhs\b/.test(school) ? 'high-school' : 'college';

  const experience: string[] = [];
  if (Array.isArray(resume.experience)) {
    for (const job of resume.experience) if (isObject(job)) experience.push(...wordsOf(text(job.role), 4));
  }

  return {
    major, majorWords, skills, kinds, level, places, wantsRemote, paidOnly: lookingFor.paidOnly === true,
    experience: [...new Set(experience)].slice(0, MOST_EXPERIENCE_WORDS),
  };
}

// The parts of a job fitFor looks at. text is the job's title, company, description, and
// requirements together, in lower case
// ai_majors and ai_skills are the job's AI tags (empty, or missing, until it's been tagged)
export type FitJob = {
  title: string; type: string; level: string; setting: string | null; paid: boolean | null; location: string | null;
  ai_majors?: string[] | null; ai_skills?: string[] | null;
};
export type Fit = { score: number | null; reasons: string[]; majorMatch: boolean };

const TYPE_WORDS: Record<string, string> = { internship: 'An internship', 'co-op': 'A co-op', research: 'A research position', program: 'A program' };

export function fitFor(job: FitJob, jobText: string, student: Student): Fit {
  let earned = 0;
  let possible = 0;
  // [points, reason]: the reasons are sorted by points at the end
  const reasons: [number, string][] = [];

  // major (30): the post mentions a word from the major, or the AI tagged the post with it
  let majorMatch = false;
  if (student.majorWords.length > 0) {
    possible += 30;
    const word = student.majorWords.find((w) => mentions(jobText, w));
    const aiSaysSo = (job.ai_majors ?? []).includes(student.major);
    if (word || aiSaysSo) {
      earned += 30;
      majorMatch = true;
      reasons.push([30, word ? `Fits your major (${student.major}): it mentions "${word}"` : `Fits your major (${student.major}), from an AI reading of the post`]);
    }
  }

  // skills (25): 10 for one, 20 for two, 25 for three or more
  if (student.skills.length > 0) {
    possible += 25;
    // a skill the post mentions, or one the AI found in it (written a bit differently, like "JS")
    const aiSkills = new Set((job.ai_skills ?? []).map((s) => s.toLowerCase()));
    const found = student.skills.filter((s) => mentions(jobText, s) || aiSkills.has(s.toLowerCase()));
    if (found.length > 0) {
      const points = Math.min(25, found.length * 10);
      earned += points;
      const shown = found.slice(0, 3).join(', ') + (found.length > 3 ? `, and ${found.length - 3} more` : '');
      reasons.push([points, `Mentions ${shown} from your skills`]);
    }
  }

  // kind of position (15)
  if (student.kinds.length > 0) {
    possible += 15;
    if (student.kinds.includes(job.type)) {
      earned += 15;
      reasons.push([15, `${TYPE_WORDS[job.type] ?? 'A position'}, which you're looking for`]);
    }
  }

  // high school or college (10): a job for "both" fits everyone
  possible += 10;
  if (job.level === 'both' || job.level === student.level) {
    earned += 10;
    reasons.push([5, `Open to ${student.level === 'high-school' ? 'high school' : 'college'} students`]);
  }

  // experience (10): a word from a job title on their resume
  if (student.experience.length > 0) {
    possible += 10;
    const word = student.experience.find((w) => mentions(jobText, w));
    if (word) {
      earned += 10;
      reasons.push([10, `Related to your experience ("${word}")`]);
    }
  }

  // where (10)
  if (student.places.length > 0 || student.wantsRemote) {
    possible += 10;
    const location = (job.location ?? '').toLowerCase();
    if (student.wantsRemote && job.setting === 'remote') {
      earned += 10;
      reasons.push([10, 'Remote, like you wanted']);
    } else {
      const place = student.places.find((p) => mentions(location, p));
      if (place) {
        earned += 10;
        reasons.push([10, `In ${job.location}, where you want to be`]);
      }
    }
  }

  // pay (10): only if they asked for paid positions only. Not saying counts as half
  if (student.paidOnly) {
    possible += 10;
    if (job.paid === true) {
      earned += 10;
      reasons.push([10, 'Paid']);
    } else if (job.paid === null) {
      earned += 5;
    }
  }

  // with only "high school or college" known, a score wouldn't mean anything
  if (possible <= 10) return { score: null, reasons: [], majorMatch };
  reasons.sort((a, b) => b[0] - a[0]);
  return { score: Math.round((earned / possible) * 100), reasons: reasons.slice(0, 4).map(([, reason]) => reason), majorMatch };
}
