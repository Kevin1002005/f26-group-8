// Tests for the "Can I apply?" checklist (checklistFor in fit.ts): how each part of a job is
// marked against a student's profile and resume.
// run them:   cd backend  &&  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistFor, mentions, studentFrom, type CheckJob } from './fit.js';

// A job with only what the checklist reads. post is all of the job's words (title, company,
// description, requirements), for has() like jobs.ts. It's also the description, unless one is given
function job(fields: Partial<CheckJob> & { post?: string }): { job: CheckJob; has: (w: string) => boolean } {
  const post = (fields.post ?? '').toLowerCase();
  return {
    job: { title: 'Intern', type: 'internship', level: 'college', setting: null, paid: null, location: null, description: fields.post ?? null, ...fields },
    has: (w: string) => mentions(post, w),
  };
}
const college = (more: Record<string, unknown> = {}) => studentFrom({ level: 'college', ...more }, null);
const highSchool = (more: Record<string, unknown> = {}) => studentFrom({ level: 'high-school', ...more }, null);
// just the marks, as "kind:text:status", to compare whole lists at once
const marks = (items: ReturnType<typeof checklistFor>) => items.map((i) => `${i.kind}:${i.text}:${i.status}`);

test('who it\'s for: open to both, or the same as you, is "You have this"', () => {
  const both = job({ level: 'both' });
  assert.deepEqual(marks(checklistFor(both.job, highSchool(), both.has)), ['level:Open to high school and college students:have']);
  const forCollege = job({ level: 'college' });
  assert.deepEqual(marks(checklistFor(forCollege.job, college(), forCollege.has)), ['level:For college students, like you:have']);
});

test('who it\'s for: a college job is "Not yet" for a high schooler, a high school job "Not for you" for a college student', () => {
  const forCollege = job({ level: 'college' });
  const [hs] = checklistFor(forCollege.job, highSchool(), forCollege.has);
  assert.equal(hs!.status, 'missing');
  assert.match(hs!.note ?? '', /for later/);
  const forHighSchool = job({ level: 'high-school' });
  const [c] = checklistFor(forHighSchool.job, college(), forHighSchool.has);
  assert.equal(c!.status, 'no');
});

test('who it\'s for: without a pick (only a guess from the school\'s name), it says to check, and how to fix that', () => {
  const forCollege = job({ level: 'college' });
  const [item] = checklistFor(forCollege.job, studentFrom({ school: 'Boston Latin School' }, null), forCollege.has);
  assert.equal(item!.status, 'check');
  assert.match(item!.note ?? '', /My info/);
});

test('skills the post names: yours are "You have this" (listed first), the others "Not yet"', () => {
  const j = job({ ai_skills: ['SQL', 'Python', 'Tableau'], post: 'We use SQL, Python, and Tableau' });
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['python'] }), j.has)).slice(1),
    ['skill:Python:have', 'skill:SQL:missing', 'skill:Tableau:missing']);
});

test('your own skills the post mentions count too, even without AI tags, each skill once', () => {
  const j = job({ ai_skills: ['Excel'], post: 'Excel and excel and Spanish speakers welcome' });
  // Spanish isn't an AI tag, but the post says it and it's on the profile; "excel" isn't repeated
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['Spanish', 'excel'] }), j.has)).slice(1),
    ['skill:Excel:have', 'skill:Spanish:have']);
});

test('no skills on the profile or resume yet: skills say "Check yourself" (not a wrong "Not yet")', () => {
  const j = job({ ai_skills: ['Python'], requirements: ['Experience with Python'], post: 'Experience with Python' });
  const items = checklistFor(j.job, college(), j.has);
  assert.deepEqual(marks(items).slice(1), ['line:Experience with Python:check']);
  assert.match(items[1]!.note ?? '', /Add your skills on My info/);
});

test('a requirement line with skills: "You have this" if you have them all, "Not yet" with the missing ones', () => {
  const j = job({ ai_skills: ['Python', 'SQL'], requirements: ['Experience with Python and SQL', 'Comfortable with Python'], post: 'Experience with Python and SQL' });
  const items = checklistFor(j.job, college({ skills: ['Python'] }), j.has);
  assert.deepEqual(marks(items).slice(1), ['line:Experience with Python and SQL:missing', 'line:Comfortable with Python:have']);
  assert.equal(items[1]!.note, 'Not on your profile or resume yet: SQL');
});

test('a skill a line already covers isn\'t listed again under the skills', () => {
  const j = job({ ai_skills: ['Python', 'Git'], requirements: ['Knows Python'], post: 'Knows Python. We use Git' });
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['Python', 'Git'] }), j.has)).slice(1), ['line:Knows Python:have', 'skill:Git:have']);
});

test('a line about what you study counts only when it names your major', () => {
  const j = job({ requirements: ['Pursuing a degree in Computer Science or a related field', 'Pursuing a degree in Biology'] });
  const items = checklistFor(j.job, college({ major: 'Computer Science' }), j.has);
  assert.deepEqual(marks(items).slice(1), ['line:Pursuing a degree in Computer Science or a related field:have', 'line:Pursuing a degree in Biology:check']);
  assert.equal(items[1]!.note, 'Your major: Computer Science');
  // "CS" typed on the profile counts as Computer Science (MAJOR_SHORT_FORMS)
  assert.equal(checklistFor(j.job, college({ major: 'CS' }), j.has)[1]!.status, 'have');
});

test('a line that only shares a word with your major\'s field, but isn\'t about what you study, isn\'t checked against it', () => {
  // "cloud" is one of Computer Science's words, but this line is about a skill
  const j = job({ requirements: ['Experience with cloud tools'] });
  assert.equal(checklistFor(j.job, college({ major: 'Computer Science' }), j.has)[1]!.status, 'check');
});

test('lines we can\'t compare (citizenship, age, soft skills) are "Check yourself"', () => {
  const j = job({ requirements: ['U.S. citizens only', 'At least 16 years old', 'Strong communication skills'] });
  assert.deepEqual(checklistFor(j.job, college({ skills: ['Python'], major: 'Biology' }), j.has).slice(1).map((i) => i.status), ['check', 'check', 'check']);
});

test('at most 50 lines (the most a job can have) and 8 skills, and empty lines are left out', () => {
  const requirements = ['', '  ', ...Array.from({ length: 55 }, (_, n) => `Requirement number ${n}`)];
  const ai_skills = Array.from({ length: 12 }, (_, n) => `Skill${n}`);
  const items = checklistFor(job({ requirements, ai_skills }).job, college({ skills: ['Python'] }), () => false);
  assert.equal(items.filter((i) => i.kind === 'line').length, 50);
  assert.equal(items.filter((i) => i.kind === 'skill').length, 8);
  assert.equal(items.filter((i) => i.kind === 'line')[0]!.text, 'Requirement number 0');
});

// ----- from the code review (2026-11-24): marks that used to be wrong -----

test('a line that offers a choice ("one of Python, Java, or C++"): having one is "Check yourself", not "Not yet"', () => {
  const j = job({ ai_skills: ['Python', 'Java', 'C++'], requirements: ['Proficiency in one of Python, Java, or C++'] });
  const [, item] = checklistFor(j.job, college({ skills: ['Python'] }), j.has);
  assert.equal(item!.status, 'check');
  assert.equal(item!.note, 'You have Python. It may only need one of these');
  // with none of them, it's still "Not yet"
  assert.equal(checklistFor(j.job, college({ skills: ['Excel'] }), j.has)[1]!.status, 'missing');
});

test('degree lines: only real "degree in / majoring in / bachelor\'s" wording, and the major\'s own name', () => {
  const cases: [string, string][] = [
    ['Computer Science', 'Pursuing a degree in Mechanical Engineering; programming experience a plus'],
    ['Computer Science', 'Experience with major cloud platforms'],
    ['Data Science', 'A high degree of accuracy with data entry'],
    ['Education', 'Currently pursuing higher education in a STEM field'],
    ['Civil or Environmental Engineering', 'Pursuing a degree in any field and reliable transportation'],
    ['Marketing or Communications', 'Pursuing a degree in Computer Science with strong writing skills'],
  ];
  for (const [major, line] of cases) {
    const j = job({ requirements: [line] });
    assert.equal(checklistFor(j.job, college({ major }), j.has)[1]!.status, 'check', `${major}: ${line}`);
  }
  // the real thing still counts
  for (const [major, line] of [['Computer or Electrical Engineering', 'Bachelor\'s in Electrical Engineering'], ['Biology', 'Majoring in Biology or Chemistry'],
    ['Economics', 'B.S. or B.A. in Economics']] as const) {
    const j = job({ requirements: [line] });
    assert.equal(checklistFor(j.job, college({ major }), j.has)[1]!.status, 'have', `${major}: ${line}`);
  }
});

test('a line that names a skill AND a field of study: having the skill isn\'t enough if the field isn\'t your major', () => {
  const j = job({ ai_skills: ['Python'], requirements: ['Pursuing a bachelor\'s in Computer Science with Python experience'] });
  const [, bio] = checklistFor(j.job, college({ major: 'Biology', skills: ['Python'] }), j.has);
  assert.equal(bio!.status, 'check');
  assert.equal(bio!.note, 'You have Python. Check the field of study it asks for');
  const [, cs] = checklistFor(j.job, college({ major: 'Computer Science', skills: ['Python'] }), j.has);
  assert.equal(cs!.status, 'have');
  assert.equal(cs!.note, 'Your major: Computer Science');
});

test('short and everyday-word skills only count written as a name: not D.C., C++, R&D, "go above", "excel in"', () => {
  const lineStatus = (aiSkills: string[], line: string, skills: string[]) => {
    const j = job({ ai_skills: aiSkills, requirements: [line] });
    return checklistFor(j.job, college({ skills }), j.has)[1]!.status;
  };
  assert.equal(lineStatus(['C'], 'Must be able to work on-site in Washington, D.C.', ['C']), 'check');
  assert.equal(lineStatus(['R'], 'Interest in R&D', ['R']), 'check');
  assert.equal(lineStatus(['Go'], 'Willing to go above and beyond', ['Go']), 'check');
  assert.equal(lineStatus(['Excel'], 'Ability to excel in a fast-paced team', []), 'check');
  assert.equal(lineStatus(['Excel'], 'Ability to excel in a fast-paced team', ['Python']), 'check');
  // written as names, they count
  assert.equal(lineStatus(['C', 'R'], 'Experience with C or R', ['R']), 'check');   // a choice, and they have R
  assert.equal(lineStatus(['Excel'], 'Advanced Excel skills', ['Excel']), 'have');
  assert.equal(lineStatus(['Go'], 'Go or Rust experience', []), 'check');            // no skills yet
  // a student's own short skill isn't looked for unless the AI tagged it: "C" in "C++ or C#"
  const j = job({ requirements: ['Experience with C++ or C#'], post: 'Experience with C++ or C#' });
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['C'] }), j.has)).slice(1), ['line:Experience with C++ or C#:check']);
});

test('their own skills are never the ones cut off the 8 (they go first, before the cut)', () => {
  const ai = ['Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'Grafana', 'Kafka', 'Redis', 'Elastic'];
  const j = job({ ai_skills: ai, post: 'We use Python with ' + ai.join(', ') });
  const skills = checklistFor(j.job, college({ skills: ['Python'] }), j.has).filter((i) => i.kind === 'skill');
  assert.equal(skills.length, 8);
  assert.deepEqual(skills[0], { kind: 'skill', text: 'Python', status: 'have' });
});

test('"Excel" and "Microsoft Excel" are close, not a contradiction: "Check yourself", listed once', () => {
  const j = job({ ai_skills: ['Microsoft Excel'], post: 'You will use Microsoft Excel daily' });
  const items = checklistFor(j.job, college({ skills: ['Excel'] }), j.has);
  assert.deepEqual(marks(items).slice(1), ['skill:Microsoft Excel:check']);
  assert.equal(items[1]!.note, 'Close to "Excel" on your profile or resume');
  const line = job({ ai_skills: ['Microsoft Excel'], requirements: ['Proficient in Microsoft Excel'] });
  const [, l] = checklistFor(line.job, college({ skills: ['Excel'] }), line.has);
  assert.equal(l!.status, 'check');
  assert.equal(l!.note, 'Close to "Excel" on your profile or resume');
});

test('the company\'s name doesn\'t name a skill: "Swift Transportation" isn\'t the skill Swift', () => {
  const j = job({ organization: 'Swift Transportation', description: 'Help our drivers plan routes.', post: 'Swift Transportation. Help our drivers plan routes.' } as Partial<CheckJob> & { post: string });
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['Swift'] }), j.has)), ['level:For college students, like you:have']);
  // but the post naming it does
  const k = job({ description: 'Build our iPhone app in Swift.', post: 'Build our iPhone app in Swift.' });
  assert.deepEqual(marks(checklistFor(k.job, college({ skills: ['Swift'] }), k.has)).slice(1), ['skill:Swift:have']);
});

test('odd data from the database (not text, missing lists) doesn\'t break it', () => {
  const j = job({ requirements: [42 as unknown as string, 'Real line'], ai_skills: [null as unknown as string, 'Excel'] });
  assert.deepEqual(marks(checklistFor(j.job, college({ skills: ['Excel'] }), j.has)).slice(1), ['line:Real line:check', 'skill:Excel:have']);
  const bare = job({ requirements: null, ai_skills: null });
  assert.equal(checklistFor(bare.job, college(), bare.has).length, 1);
});
