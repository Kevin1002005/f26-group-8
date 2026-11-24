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
  levelPicked: boolean;    // true if they picked high school or college themselves (false: level is
                           // only a guess from their school's name, see studentFrom)
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
    levelPicked: profile.level === 'high-school' || profile.level === 'college',
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

// ---------- "Can I apply?" ----------
// The checklist in a job's pop-up on Opportunities (plan item #21): each thing the job asks for
// that we can compare with the student's profile and resume, marked one of four ways:
//   have     "You have this"
//   missing  "Not yet": a skill the post names that isn't on their profile or resume yet, or a
//            college job for a high schooler (one they can get later)
//   no       "Not for you": a high school job, for a college student
//   check    "Check yourself": something we can't honestly compare ("U.S. citizens only", "Strong
//            communication skills"), or a skill when the student hasn't listed any skills yet
// kind says which part of the list it goes in:
//   level    who the job is for (high school or college students). Always there
//   line     one line from "What they're looking for" (the job's requirements), when the post has
//            them. Most of our job sites don't send these (only Lever, JSearch, NSF, USAJOBS, and
//            the pre-college programs do), which is why the skills below matter
//   skill    a skill the post names: its AI tags (ai-tags.ts, which only keeps skills the post
//            really names), plus the student's own skills that the post mentions. A skill a line
//            already covers isn't repeated
// It never says "you can't apply": the page reminds students it only knows their profile and
// resume, and a stretch is still worth applying to.
export type CheckStatus = 'have' | 'missing' | 'no' | 'check';
export type CheckItem = { kind: 'level' | 'line' | 'skill'; text: string; status: CheckStatus; note?: string };
// the parts of a job the checklist reads: fitFor's, plus the lines under "What they're looking for"
// and the description (as the post wrote them, upper/lower case and all)
export type CheckJob = FitJob & { requirements?: string[] | null; description?: string | null };
// at most this many lines: the most a job can have (MOST_REQUIREMENTS in job-sources/shared.ts),
// so no line of the post goes missing from the pop-up. And at most 8 skills (the AI gives up to 8),
// so the list stays readable
const MOST_CHECK_LINES = 50;
const MOST_CHECK_SKILLS = 8;
// A line about what you study: "a degree in ...", "majoring in ...", "major in ...", a bachelor's, a
// B.S. or B.A., or "pursuing a degree". Only these are checked against the major. The same words
// in their everyday meaning don't count: "major cloud platforms", "a high degree of accuracy",
// "pursuing higher education"
const DEGREE_LINE = /\b(degrees?|majors?|majoring|concentration)\s+in\b|\bbachelor'?s?\b|\bb\.\s?[sa]\.|\bbs\/ba\b|\bpursuing\s+(a\s+|an\s+)?(degree|major|bachelor)/i;
// The names each major goes by on a degree line. Only these count, NOT MAJOR_WORDS above: those are
// words a job TITLE uses ("programming", "data", "cloud"), and on a degree line they made "Pursuing
// a degree in Mechanical Engineering; programming experience a plus" count for Computer Science.
// A major that isn't here (one typed after "Other") uses its own name
const DEGREE_NAMES: Record<string, string[]> = {
  'Computer Science': ['computer science'],
  'Data Science': ['data science'],
  'Computer or Electrical Engineering': ['computer engineering', 'electrical engineering', 'electrical and computer engineering'],
  'Mechanical Engineering': ['mechanical engineering'],
  'Civil or Environmental Engineering': ['civil engineering', 'environmental engineering'],
  'Biology': ['biology', 'biological sciences', 'life sciences'],
  'Chemistry': ['chemistry'],
  'Health Sciences or Nursing': ['health science', 'health sciences', 'nursing', 'public health'],
  'Psychology': ['psychology'],
  'Business': ['business', 'business administration'],
  'Finance or Accounting': ['finance', 'accounting'],
  'Economics': ['economics'],
  'Marketing or Communications': ['marketing', 'communications'],
  'Design': ['design', 'graphic design', 'industrial design'],
  'Mathematics or Statistics': ['mathematics', 'math', 'statistics'],
  'Political Science or Public Policy': ['political science', 'public policy'],
  'Environmental Science': ['environmental science', 'environmental studies'],
  'Education': ['education'],
};
// Words that make a line a choice ("one of Python, Java, or C++", "a language such as Python or R"):
// then having one of its skills may be all it asks for
const CHOICE_WORDS = /\b(or|one of|any of|either|such as|e\.g\.|for example)\b/i;
// Skills that are also everyday words. In a post they only count written as a name, with a capital
// letter: "Excel" is the program, "excel in a fast-paced team" isn't; "Go" is the language, "go
// above and beyond" isn't (see namesSkill)
const EVERYDAY_WORD_SKILLS = new Set([
  'excel', 'word', 'access', 'office', 'teams', 'go', 'swift', 'rust', 'ruby', 'spark', 'chef', 'puppet', 'express',
  'flask', 'react', 'unity', 'dart', 'julia', 'elm', 'crystal', 'notion', 'slack', 'sketch', 'maya', 'shell',
]);
const LEVEL_WORDS: Record<string, string> = { 'high-school': 'high school students', college: 'college students' };

// Does this text name a skill? Stricter than mentions() above, because a skill is a NAME:
//  - not as part of something else: "C" isn't in "C++", "C#", or "Washington, D.C.", and "R" isn't in
//    "R&D" (mentions() splits words at + # & and dots, so it would find them)
//  - a short skill (1 or 2 letters, like "C", "R", "AI") or one that's also an everyday word
//    (EVERYDAY_WORD_SKILLS) has to start with a capital letter, like a name
// The other letters can be either case ("PYTHON" and "Javascript" count). text is as the post wrote
// it (not in lower case). The regular expressions are kept, like mentions()'s
const skillPatterns = new Map<string, RegExp>();
export function namesSkill(text: string, skill: string): boolean {
  const s = skill.trim();
  if (s === '') return false;
  const key = s.toLowerCase();
  let pattern = skillPatterns.get(key);
  if (!pattern) {
    if (skillPatterns.size >= MOST_PATTERNS) skillPatterns.clear();
    // escapes the characters regular expressions treat specially (like the + in "C++")
    const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const capitalFirst = Array.from(key).length <= 2 || EVERYDAY_WORD_SKILLS.has(key);
    // each letter in either case ("[pP]"), except a first letter that has to be a capital
    const body = Array.from(key).map((c, i) => {
      const upper = c.toUpperCase();
      if (upper === c) return escape(c);                         // not a letter: a digit, +, #, or .
      if (i === 0 && capitalFirst) return escape(upper);
      return upper.length === 1 ? `[${escape(upper)}${escape(c)}]` : `(?:${escape(upper)}|${escape(c)})`;
    }).join('');
    // (?<!...) = not right after a letter, digit, dot, dash, slash, + or #;
    // (?!...) = not right before a letter, digit, + # &, or a dot and more letters (".js", ".C.")
    pattern = new RegExp(`(?<![\\p{L}\\p{N}.\\-/+#])${body}(?![\\p{L}\\p{N}+#&]|\\.[\\p{L}\\p{N}])`, 'u');
    skillPatterns.set(key, pattern);
  }
  return pattern.test(text);
}

// has(word) says if the job's post mentions a word, like fitFor's (it's used as a quick first check)
export function checklistFor(job: CheckJob, student: Student, has: (w: string) => boolean): CheckItem[] {
  const items: CheckItem[] = [];

  // 1. who it's for
  const forWhom = LEVEL_WORDS[job.level] ?? 'students';
  if (job.level === 'both') {
    items.push({ kind: 'level', text: 'Open to high school and college students', status: 'have' });
  } else if (!student.levelPicked) {
    items.push({ kind: 'level', text: `For ${forWhom}`, status: 'check', note: 'Pick high school or college on My info, and this gets checked for you' });
  } else if (job.level === student.level) {
    items.push({ kind: 'level', text: `For ${forWhom}, like you`, status: 'have' });
  } else if (job.level === 'college') {
    items.push({ kind: 'level', text: 'For college students', status: 'missing', note: "You're in high school now, so this one is for later" });
  } else {
    items.push({ kind: 'level', text: 'For high school students', status: 'no', note: "You're in college" });
  }

  // ----- the skills -----
  const noSkillsYet = student.skills.length === 0;
  const mine = new Set(student.skills.map((s) => s.toLowerCase()));
  // How a skill the post names compares with the student's:
  //   'have'  the same skill (whatever its upper/lower case)
  //   'near'  one of theirs is a word inside it, or it's a word inside one of theirs: "Excel" and
  //           "Microsoft Excel". Probably the same, but not for sure, so the student checks it
  //   'lack'  not on their profile or resume
  // (near needs 3 letters or more, so "C" isn't near "Objective C")
  const nearTo = (skill: string) => student.skills.find((m) => m.length >= 3 && skill.length >= 3
    && (mentions(skill.toLowerCase(), m.toLowerCase()) || mentions(m.toLowerCase(), skill.toLowerCase())));
  const compare = (skill: string): 'have' | 'near' | 'lack' => mine.has(skill.toLowerCase()) ? 'have' : nearTo(skill) ? 'near' : 'lack';

  // The skills the post names: its AI tags first (the AI only keeps skills the post really names),
  // then the student's own skills the post names (namesSkill), each once whatever its case.
  // For theirs, only the title, description, and requirements count, not the company's name:
  // "Swift Transportation" doesn't name the skill Swift. A short one (1 or 2 letters, like "C" or
  // "R") only counts when the AI tagged it too: alone, it's too easy to find by accident. And one
  // that's a word inside a tagged skill ("Excel" in "Microsoft Excel") isn't listed again
  const postSkills: string[] = [];
  const seenSkills = new Set<string>();
  const addPostSkill = (skill: unknown) => {
    if (typeof skill !== 'string') return;
    const s = skill.trim();
    if (s === '' || seenSkills.has(s.toLowerCase())) return;
    seenSkills.add(s.toLowerCase());
    postSkills.push(s);
  };
  for (const s of job.ai_skills ?? []) addPostSkill(s);
  const postText = [job.title, job.description ?? '', ...(job.requirements ?? []).filter((r) => typeof r === 'string')].join('\n');
  for (const s of student.skills) {
    if (Array.from(s.trim()).length <= 2) continue;
    if (postSkills.some((p) => mentions(p.toLowerCase(), s.toLowerCase()))) continue;
    // has() first: a quick check with the word index, so the slower namesSkill only runs for the
    // few skills the post might name
    if (has(s) && namesSkill(postText, s)) addPostSkill(s);
  }

  // what you study: the names the student's major goes by on a degree line (DEGREE_NAMES)
  const degreeNames = student.major === '' ? []
    : Object.hasOwn(DEGREE_NAMES, student.major) ? DEGREE_NAMES[student.major]!
    : student.major.length >= 3 ? [student.major.toLowerCase()] : [];

  // 2. each line of "What they're looking for"
  const covered = new Set<string>();   // skills a line named (lower case), so they aren't listed twice
  const lines = (job.requirements ?? []).filter((l): l is string => typeof l === 'string' && l.trim() !== '').slice(0, MOST_CHECK_LINES);
  for (const line of lines) {
    const lower = line.toLowerCase();
    // a line about what you study, and whether it names the student's major
    const degreeLine = DEGREE_LINE.test(line);
    const yourMajor = degreeLine && degreeNames.some((name) => mentions(lower, name));
    // the skills this line names
    const named = postSkills.filter((s) => namesSkill(line, s));
    for (const s of named) covered.add(s.toLowerCase());

    if (named.length > 0) {
      if (noSkillsYet) {
        items.push({ kind: 'line', text: line, status: 'check', note: 'Add your skills on My info, and this gets checked for you' });
        continue;
      }
      const lacking = named.filter((s) => compare(s) === 'lack');
      const had = named.filter((s) => compare(s) === 'have');
      const near = named.filter((s) => compare(s) === 'near');
      if (lacking.length === 0 && near.length === 0) {
        // every skill it names is theirs. But a line that also asks for a field of study they
        // aren't in ("a bachelor's in Computer Science with Python experience", for a Biology major)
        // can't be "You have this"
        items.push(degreeLine && !yourMajor
          ? { kind: 'line', text: line, status: 'check', note: `You have ${had.join(', ')}. Check the field of study it asks for` }
          : { kind: 'line', text: line, status: 'have', ...(yourMajor ? { note: `Your major: ${student.major}` } : {}) });
      } else if (lacking.length === 0) {
        // only "near" ones left: probably theirs, written another way
        items.push({ kind: 'line', text: line, status: 'check', note: `Close to ${near.map((s) => `"${nearTo(s)}"`).join(', ')} on your profile or resume` });
      } else if ((had.length > 0 || near.length > 0) && CHOICE_WORDS.test(line)) {
        // a choice ("one of Python, Java, or C++"), and they have one of them: it may be enough
        items.push({ kind: 'line', text: line, status: 'check', note: `You have ${[...had, ...near.map((s) => nearTo(s)!)].join(', ')}. It may only need one of these` });
      } else {
        items.push({ kind: 'line', text: line, status: 'missing', note: `Not on your profile or resume yet: ${lacking.join(', ')}` });
      }
      continue;
    }
    // a line about what you study that names the student's major ("Pursuing a degree in Computer Science")
    if (yourMajor) {
      items.push({ kind: 'line', text: line, status: 'have', note: `Your major: ${student.major}` });
      continue;
    }
    // anything else (citizenship, age, grades, "strong communication skills", another major):
    // we can't compare it honestly, so the student checks it
    items.push({ kind: 'line', text: line, status: 'check' });
  }

  // 3. the skills the post names that no line covered. The ones they have go first, BEFORE the
  // list is cut to 8, so their own skills are never the ones left out
  const order = { have: 0, near: 1, lack: 2 };
  const skillItems: CheckItem[] = postSkills
    .filter((s) => !covered.has(s.toLowerCase()))
    // .sort keeps the post's order among the ones that compare the same
    .sort((a, b) => order[compare(a)] - order[compare(b)])
    .slice(0, MOST_CHECK_SKILLS)
    .map((s): CheckItem => {
      if (noSkillsYet) return { kind: 'skill', text: s, status: 'check' };
      const how = compare(s);
      if (how === 'have') return { kind: 'skill', text: s, status: 'have' };
      if (how === 'near') return { kind: 'skill', text: s, status: 'check', note: `Close to "${nearTo(s)}" on your profile or resume` };
      return { kind: 'skill', text: s, status: 'missing' };
    });
  items.push(...skillItems);
  return items;
}
