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

// The words a job TITLE uses when it's in each field. The names are the same as the site's list
// (frontend/src/data/majors.js): if you add a major there, add it here too.
// A major that isn't here ("Other") uses the words the student typed.
// Each word should point to one field: words that show up in other fields' titles were left out
// or made longer (checked against the 5,669 job titles of 2026-11-17). For example: "analyst" was
// in "Data Analyst", "Summer Analyst" (banking) and "Security Operations Center Analyst", so it
// counted for Business, Data Science, and Economics at once; "infrastructure" was mostly cloud
// infrastructure, not civil; "lab" was "robotics lab" and "AI lab"; "school" was "High School
// Internship, Software Engineering". A title with none of these words uses the AI's reading
// instead (see fitsMajor below)
export const MAJOR_WORDS: Record<string, string[]> = {
  'Computer Science': ['software', 'developer', 'programming', 'computer science', 'web development', 'frontend', 'front end', 'backend',
    'back end', 'full stack', 'mobile', 'cloud', 'devops', 'cybersecurity', 'machine learning', 'artificial intelligence', 'ai', 'swe', 'coding'],
  'Data Science': ['data', 'analytics', 'machine learning', 'statistics', 'statistical', 'data science', 'sql', 'visualization'],
  'Computer or Electrical Engineering': ['hardware', 'electrical', 'embedded', 'firmware', 'circuit', 'fpga', 'asic', 'robotics', 'electronics',
    'semiconductor', 'signal processing', 'controls engineer', 'controls engineering', 'control systems', 'chip', 'wireless',
    'analog', 'mixed signal', 'verification', 'rtl', 'vlsi', 'cpu', 'gpu', 'silicon'],
  'Mechanical Engineering': ['mechanical', 'manufacturing', 'cad', 'solidworks', 'robotics', 'aerospace', 'automotive', 'thermal', 'design engineer'],
  'Civil or Environmental Engineering': ['civil', 'structural', 'construction', 'transportation', 'environmental engineering', 'water',
    'geotechnical', 'surveying', 'stormwater', 'land development'],
  'Biology': ['biology', 'biological', 'biotech', 'biotechnology', 'life sciences', 'genetics', 'molecular', 'ecology', 'clinical research',
    'wet lab', 'microbiology', 'biochemistry', 'neuroscience', 'lab technician', 'laboratory technician'],
  'Chemistry': ['chemistry', 'chemical', 'pharmaceutical', 'analytical chemistry', 'synthesis', 'materials science', 'polymer', 'biochemistry',
    'wet lab', 'lab technician', 'laboratory technician'],
  'Health Sciences or Nursing': ['health', 'healthcare', 'clinical', 'patient', 'nursing', 'hospital', 'medical', 'public health'],
  'Psychology': ['psychology', 'behavioral', 'mental health', 'counseling', 'human factors', 'user research', 'social science'],
  'Business': ['business', 'operations', 'strategy', 'consulting', 'management', 'sales', 'entrepreneurship', 'supply chain'],
  'Finance or Accounting': ['finance', 'financial', 'accounting', 'accountant', 'investment', 'investments', 'banking', 'bank', 'audit', 'tax',
    'treasury', 'quantitative', 'quant', 'trading', 'equities', 'equity research', 'private equity', 'public equity', 'wealth',
    'asset management', 'bookkeeping', 'capital markets'],
  'Economics': ['economics', 'economic', 'economist', 'econometrics'],
  'Marketing or Communications': ['marketing', 'communications', 'social media', 'content', 'brand', 'public relations', 'journalism', 'writing', 'media'],
  'Design': ['design', 'designer', 'ux', 'ui', 'user experience', 'product design', 'graphic', 'visual', 'figma', 'creative'],
  'Mathematics or Statistics': ['math', 'mathematics', 'statistics', 'statistical', 'quantitative', 'quant', 'actuarial', 'modeling'],
  'Political Science or Public Policy': ['policy', 'government', 'public policy', 'public affairs', 'political', 'legislative', 'law',
    'advocacy', 'civic', 'nonprofit'],
  'Environmental Science': ['environmental', 'sustainability', 'climate', 'conservation', 'ecology', 'renewable', 'clean energy', 'solar'],
  'Education': ['education', 'teaching', 'tutor', 'tutoring', 'teacher', 'curriculum', 'classroom'],
};

// The majors that engineering jobs belong to. A title that says engineer, developer, or software,
// or names chip-design work ("Design Verification Engineer", "FPGA Design Verification Intern",
// "Software Engineer Intern, Trading Systems", "Communications Engineering Intern") is an
// engineering job, so it never counts for the OTHER majors, even when it also has one of their
// words ("design", "trading", "communications") or the AI tagged it
const ENGINEERING_MAJORS = new Set([
  'Computer Science', 'Data Science', 'Computer or Electrical Engineering', 'Mechanical Engineering',
  'Civil or Environmental Engineering', 'Chemistry',
]);
const ENGINEERING_TITLE = /\b(engineer|engineers|engineering|developer|developers|software|swe|devops|firmware|fpga|asic|rtl|vlsi|verification|analog|silicon|cpu|gpu)\b/i;

// A title with its "non-" words taken out: "Summer Intern (Non-Tax)" says it is NOT a tax job
const withoutNonWords = (title: string) => title.toLowerCase().replace(/\bnon-?\s?\p{L}+/gu, ' ');
// "Undecided / exploring": no major, so every field shows
export const UNDECIDED = 'Undecided / exploring';

// Short forms students often type after picking "Other" ("CS", "Econ"), and the major on the
// list each one means. Without these, "CS" had no words to look for (wordsOf below skips words
// under 3 letters), so "For your major" couldn't work for it. The keys are lower case without
// dots, because studentFrom looks them up that way ("C.S." and "cs" both find "cs").
// CE is read as Computer Engineering: a Civil Engineering student can pick "Civil or
// Environmental Engineering" from the list instead
export const MAJOR_SHORT_FORMS: Record<string, string> = {
  cs: 'Computer Science',
  ce: 'Computer or Electrical Engineering',
  ece: 'Computer or Electrical Engineering',
  ee: 'Computer or Electrical Engineering',
  me: 'Mechanical Engineering',
  ai: 'Computer Science',
  ml: 'Data Science',
  ux: 'Design',
  it: 'Computer Science',        // information technology
  is: 'Computer Science',        // information systems
  econ: 'Economics',
  bio: 'Biology',
  chem: 'Chemistry',
  math: 'Mathematics or Statistics',
  stats: 'Mathematics or Statistics',
};

// The fields next to each major, for "Add jobs from related fields" on Opportunities when only
// a few jobs fit your major (jobs.ts, &major=related). A Finance student is often a good fit for
// an Economics or Business internship too. The names are MAJOR_WORDS' names
export const RELATED_MAJORS: Record<string, string[]> = {
  'Computer Science': ['Data Science', 'Computer or Electrical Engineering', 'Mathematics or Statistics'],
  'Data Science': ['Computer Science', 'Mathematics or Statistics', 'Economics'],
  'Computer or Electrical Engineering': ['Computer Science', 'Mechanical Engineering'],
  'Mechanical Engineering': ['Computer or Electrical Engineering', 'Civil or Environmental Engineering'],
  'Civil or Environmental Engineering': ['Environmental Science', 'Mechanical Engineering'],
  'Biology': ['Chemistry', 'Health Sciences or Nursing', 'Environmental Science'],
  'Chemistry': ['Biology', 'Environmental Science'],
  'Health Sciences or Nursing': ['Biology', 'Psychology'],
  'Psychology': ['Health Sciences or Nursing', 'Education'],
  'Business': ['Economics', 'Finance or Accounting', 'Marketing or Communications'],
  'Finance or Accounting': ['Economics', 'Business', 'Mathematics or Statistics'],
  'Economics': ['Finance or Accounting', 'Business', 'Political Science or Public Policy'],
  'Marketing or Communications': ['Business', 'Design'],
  'Design': ['Marketing or Communications', 'Computer Science'],
  'Mathematics or Statistics': ['Data Science', 'Finance or Accounting', 'Economics'],
  'Political Science or Public Policy': ['Economics', 'Environmental Science'],
  'Environmental Science': ['Civil or Environmental Engineering', 'Biology', 'Political Science or Public Policy'],
  'Education': ['Psychology'],
};

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
  home: string;            // their city as they wrote it ("Worcester, MA"), so a city typed without
                           // a state on Opportunities picks the one near them (places.ts)
};

// Builds a Student from their profile's data and their resume's data (either can be missing)
export function studentFrom(profileData: unknown, resumeData: unknown): Student {
  const profile = isObject(profileData) ? profileData : {};
  const resume = isObject(resumeData) ? resumeData : {};
  const lookingFor = isObject(profile.lookingFor) ? profile.lookingFor : {};

  // a short form ("CS", "Econ") counts as the major on the list it stands for (MAJOR_SHORT_FORMS)
  const typed = text(profile.major);
  const shortForm = typed.toLowerCase().replace(/\./g, '');
  const listed = Object.hasOwn(MAJOR_SHORT_FORMS, shortForm) ? MAJOR_SHORT_FORMS[shortForm]! : typed;
  const major = listed === UNDECIDED ? '' : listed;
  // Object.hasOwn: a typed-in major like "constructor" must not pick up a built-in function
  const majorWords = major === '' ? [] : Object.hasOwn(MAJOR_WORDS, major) ? MAJOR_WORDS[major]! : wordsOf(major, 3);

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

  // High school or college: what the student picked (the welcome guide and My info ask,
  // and student-profile.ts only keeps these two). Someone who hasn't picked yet gets the old
  // guess from their school's name, which can be wrong ("Boston Latin School" counts as college)
  const school = text(profile.school).toLowerCase();
  const level = profile.level === 'high-school' || profile.level === 'college'
    ? profile.level
    : /high school|\bhs\b/.test(school) ? 'high-school' : 'college';

  const experience: string[] = [];
  if (Array.isArray(resume.experience)) {
    for (const job of resume.experience) if (isObject(job)) experience.push(...wordsOf(text(job.role), 4));
  }

  return {
    major, majorWords, skills, kinds, level, places, wantsRemote, paidOnly: lookingFor.paidOnly === true,
    experience: [...new Set(experience)].slice(0, MOST_EXPERIENCE_WORDS),
    home: text(profile.city).slice(0, 100),
  };
}

// The parts of a job fitFor looks at. text is the job's title, company, description, and
// requirements together, in lower case
// ai_majors and ai_skills are the job's AI tags (empty, or missing, until it's been tagged),
// and ai_tagged_at is when the AI read it (null until then)
export type FitJob = {
  title: string; type: string; level: string; setting: string | null; paid: boolean | null; location: string | null;
  ai_majors?: string[] | null; ai_skills?: string[] | null; ai_tagged_at?: string | null;
};
export type Fit = { score: number | null; reasons: string[]; majorMatch: boolean };

// The majors a job title names (MAJOR_WORDS), for fitsMajor. An engineering title only names
// engineering majors (ENGINEERING_TITLE above). Kept per title, since every request asks about
// every job (emptied if it ever gets big, like the patterns above)
const titleMajors = new Map<string, string[]>();
export function majorsInTitle(jobTitle: string): string[] {
  const kept = titleMajors.get(jobTitle);
  if (kept) return kept;
  if (titleMajors.size >= 20000) titleMajors.clear();
  const title = withoutNonWords(jobTitle);
  const engineering = ENGINEERING_TITLE.test(title);
  const named = Object.entries(MAJOR_WORDS)
    .filter(([major, words]) => !(engineering && !ENGINEERING_MAJORS.has(major)) && words.some((w) => mentions(title, w)))
    .map(([major]) => major);
  titleMajors.set(jobTitle, named);
  return named;
}

// Does a job fit a major? "For your major" shows only these, so it's strict: an accounting
// student shouldn't see software jobs, and a CS student shouldn't see audit jobs.
//  1. The TITLE decides. Not the description or the company name: "a wealth of experience" in a
//     description made a Sonos software job count for Finance, and every job at Citizens
//     *Financial* Group (software included) counted for Finance.
//  2. A title that names no field at all ("Summer Analyst", "Summer Intern") uses the AI's reading
//     of the post (ai-tags.ts), except an engineering title for a non-engineering major.
//  3. The AI never overrides a title that names a field: "Software Engineer Intern" at a trading
//     firm is a CS job, even if the AI also tagged it Finance.
// word is the title's word for the major (for "Why it fits"), or null if the AI decided.
// A major that isn't in MAJOR_WORDS ("Other") matches its own words (words) in the title.
export function fitsMajor(job: FitJob, major: string, words?: string[]): { fits: boolean; word: string | null } {
  const title = withoutNonWords(job.title);
  if (!Object.hasOwn(MAJOR_WORDS, major)) {
    const word = (words ?? []).find((w) => mentions(title, w)) ?? null;
    return { fits: word !== null, word };
  }
  const named = majorsInTitle(job.title);
  if (named.includes(major)) return { fits: true, word: MAJOR_WORDS[major]!.find((w) => mentions(title, w)) ?? null };
  const engineeringOnly = ENGINEERING_TITLE.test(title) && !ENGINEERING_MAJORS.has(major);
  const aiSays = named.length === 0 && !engineeringOnly && (job.ai_majors ?? []).includes(major);
  return { fits: aiSays, word: null };
}

const TYPE_WORDS: Record<string, string> = { internship: 'An internship', 'co-op': 'A co-op', research: 'A research position', program: 'A program' };

// has(word) says if the job's text mentions a word (by default by reading jobText; jobs.ts passes
// one that uses the word index in word-index.ts, which gives the same answers much faster)
export function fitFor(job: FitJob, jobText: string, student: Student, has = (w: string) => mentions(jobText, w)): Fit {
  let earned = 0;
  let possible = 0;
  // [points, reason]: the reasons are sorted by points at the end
  const reasons: [number, string][] = [];

  // major (30): the title names it, or the AI read the post as it (fitsMajor)
  let majorMatch = false;
  if (student.majorWords.length > 0) {
    possible += 30;
    const { fits, word } = fitsMajor(job, student.major, student.majorWords);
    if (fits) {
      earned += 30;
      majorMatch = true;
      reasons.push([30, word ? `Fits your major (${student.major}): the title says "${word}"` : `Fits your major (${student.major}), from an AI reading of the post`]);
    }
  }

  // skills (25): 10 for one, 20 for two, 25 for three or more
  if (student.skills.length > 0) {
    possible += 25;
    // a skill the post mentions, or one the AI found in it (written a bit differently, like "JS")
    const aiSkills = new Set((job.ai_skills ?? []).map((s) => s.toLowerCase()));
    const found = student.skills.filter((s) => has(s) || aiSkills.has(s.toLowerCase()));
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
    const word = student.experience.find(has);
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
