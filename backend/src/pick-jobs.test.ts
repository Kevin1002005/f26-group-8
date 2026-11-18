// Tests for pickJobs in jobs.ts: the filters on Opportunities, "within 25 miles of Worcester",
// and the "Want more?" suggestions. Made-up jobs only: no database, no internet.
// run them:   cd backend  &&  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placesIn, findPlace, statesIn } from './places.js';
import { studentFrom } from './fit.js';

// jobs.ts makes the Supabase client when it's loaded (db.ts), and that needs an address and a
// key. These fake ones are never used: pickJobs doesn't talk to the database
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY ??= 'not-a-real-key';
const { pickJobs, indexJobs } = await import('./jobs.js');
type Picks = Parameters<typeof pickJobs>[2];
type Job = ReturnType<typeof job>;
// pickJobs takes the jobs with their word index (word-index.ts), the way the route has them
const pick = (list: Job[], student: Parameters<typeof pickJobs>[1], f: Picks, useIndex = true) => pickJobs(indexJobs(list), student, f, useIndex);

// A made-up open job. tags: the majors the AI gave it (it counts as AI-read either way)
let nextId = 0;
function job(title: string, location: string | null, tags: string[] = [], extra: Record<string, unknown> = {}) {
  nextId++;
  const row = {
    id: `job-${nextId}`, title, organization: `Company ${nextId}`, type: 'internship', level: 'college',
    setting: location === null ? 'remote' : 'on-site', paid: null, location, deadline: null, posted_at: null,
    description: '', requirements: [], ai_majors: tags, ai_skills: [], ai_tagged_at: '2026-11-17T00:00:00Z', ...extra,
  };
  return { job: row, text: `${title} ${row.organization}`.toLowerCase(), places: placesIn(location), states: statesIn(location) };
}

const jobs = [
  job('Finance Intern', 'Worcester, MA'),                                       // 0 miles
  job('Accounting Intern', 'Framingham, MA'),                                   // about 20 miles
  job('Audit Intern', 'Boston, MA'),                                            // about 39 miles
  job('Finance Intern', 'Worcester, England, GB'),                              // not in the US
  job('Tax Intern', null),                                                      // remote
  job('Software Engineer Intern', 'Worcester, MA', ['Computer Science']),      // not finance
  job('Economic Research Intern', 'Worcester, MA', ['Economics']),             // a related field
  job('Treasury Analyst Intern', 'Shrewsbury, MA', ['Finance or Accounting']), // only the AI says finance
];
const finance = studentFrom({ major: 'Finance or Accounting', city: 'Worcester, MA' }, null);
const titles = (picked: ReturnType<typeof pick>) => picked.jobs.map((j) => `${j.title} @ ${j.location}`);
const picks = (more: Partial<Picks>): Picks => ({
  q: '', location: '', near: null, within: 25, hide: [], include: [], exclude: [], ...more,
});

test('within 25 miles of Worcester, for a Finance major', () => {
  const picked = pick(jobs, finance, picks({ location: 'worcester', near: findPlace('worcester', ['MA']), major: 'only' }));
  assert.deepEqual(titles(picked), [
    'Finance Intern @ Worcester, MA', 'Accounting Intern @ Framingham, MA', 'Treasury Analyst Intern @ Shrewsbury, MA',
  ]);
  // only 3, so it offers more: Boston (within 50), the remote job, and the Economics one
  assert.deepEqual(picked.suggestions, [
    { kind: 'wider', within: 50, count: 1 },
    { kind: 'remote', count: 1 },
    { kind: 'related', majors: ['Economics', 'Business', 'Mathematics or Statistics'], count: 1 },
  ]);
});

test('each suggestion, once picked, shows exactly the jobs it counted', () => {
  const near = findPlace('worcester', ['MA']);
  const at25 = pick(jobs, finance, picks({ location: 'worcester', near, major: 'only' })).total;
  const at50 = pick(jobs, finance, picks({ location: 'worcester', near, within: 50, major: 'only' }));
  assert.equal(at50.total, at25 + 1);
  assert.ok(titles(at50).includes('Audit Intern @ Boston, MA'));
  const remote = pick(jobs, finance, picks({ setting: 'remote', major: 'only' }));
  assert.deepEqual(titles(remote), ['Tax Intern @ null']);
  const related = pick(jobs, finance, picks({ location: 'worcester', near, major: 'related' }));
  assert.equal(related.total, at25 + 1);
  assert.ok(titles(related).includes('Economic Research Intern @ Worcester, MA'));
});

test('a state keeps every job in it', () => {
  const picked = pick(jobs, finance, picks({ location: 'ma', near: findPlace('ma'), major: 'only' }));
  assert.equal(picked.total, 4);   // Worcester, Framingham, Boston, Shrewsbury
  assert.ok(picked.jobs.every((j) => (j.location ?? '').endsWith('MA')));
});

test("a place that isn't on the map matches the words in the location, the old way", () => {
  const picked = pick(jobs, finance, picks({ location: 'england', near: findPlace('england') }));
  assert.deepEqual(titles(picked), ['Finance Intern @ Worcester, England, GB']);
});

test('no suggestions once 10 or more jobs match', () => {
  const many = Array.from({ length: 10 }, () => job('Finance Intern', 'Worcester, MA'));
  const picked = pick([...many, ...jobs], finance, picks({ location: 'worcester', near: findPlace('worcester'), major: 'only' }));
  assert.ok(picked.total >= 10);
  assert.deepEqual(picked.suggestions, []);
});

test('without a location or a major, every job passes and nothing is suggested', () => {
  const picked = pick(jobs, finance, picks({}));
  assert.equal(picked.total, jobs.length);
  assert.deepEqual(picked.suggestions, []);
});

test('the word index gives exactly the same answers as reading every job', () => {
  const extra = [
    job('C++ Developer Intern', 'Boston, MA', [], { description: 'Node.js, machine learning, and C# too. Excel/SQL.' }),
    job('Data Intern', 'Boston, MA', [], { description: 'maintain the pipeline' }),
  ];
  // the text pickJobs matches against includes the description
  for (const e of extra) e.text = `${e.job.title} ${e.job.organization} ${e.job.description}`.toLowerCase();
  const student = studentFrom({ major: 'Finance or Accounting', city: 'Worcester, MA', skills: ['C++', 'Node.js', 'machine learning', 'AI', 'Excel', 'SQL', 'C#'] }, null);
  for (const f of [
    picks({}),
    picks({ include: ['c++'] }), picks({ include: ['node.js', 'excel'] }), picks({ include: ['ai'] }), picks({ exclude: ['machine learning'] }),
    picks({ location: 'ma', near: findPlace('ma'), major: 'related' }),
  ]) {
    const fast = pick([...jobs, ...extra], student, f, true);
    const slow = pick([...jobs, ...extra], student, f, false);
    assert.deepEqual(fast, slow);
  }
  // and the tricky words find what they should: "ai" isn't in "maintain"
  assert.deepEqual(titles(pick(extra, student, picks({ include: ['ai'] }))), []);
  assert.deepEqual(titles(pick(extra, student, picks({ include: ['c++'] }))), ['C++ Developer Intern @ Boston, MA']);
});

test('a state search keeps jobs that only name the state, and not look-alikes', () => {
  const list = [
    job('Finance Intern', 'MA'), job('Audit Intern', 'Remote - MA'), job('Tax Intern', 'Worcester County, MA'),
    job('Treasury Intern', 'Massachusetts, US'), job('Accounting Intern', 'Washington, DC'), job('Bank Intern', 'Morgantown, West Virginia'),
  ];
  const at = (typed: string) => titles(pick(list, finance, picks({ location: typed, near: findPlace(typed) })));
  assert.deepEqual(at('ma'), ['Finance Intern @ MA', 'Audit Intern @ Remote - MA', 'Tax Intern @ Worcester County, MA', 'Treasury Intern @ Massachusetts, US']);
  // "Washington, DC" isn't in Washington state, and West Virginia isn't Virginia
  assert.deepEqual(at('wa'), []);
  assert.deepEqual(at('va'), []);
  assert.deepEqual(at('dc'), ['Accounting Intern @ Washington, DC']);   // "DC" typed alone is the city
  assert.deepEqual(titles(pick(list, finance, picks({ location: 'wv', near: findPlace('wv') }))), ['Bank Intern @ Morgantown, West Virginia']);
});

test('a city search still finds jobs listed under just that city name', () => {
  const list = [job('Finance Intern', 'Worcester'), job('Audit Intern', 'Greater Boston Area'), job('Tax Intern', 'Worcester, England')];
  const near = (typed: string) => titles(pick(list, finance, picks({ location: typed, near: findPlace(typed, ['MA']) })));
  assert.deepEqual(near('worcester'), ['Finance Intern @ Worcester']);
  assert.deepEqual(near('boston'), ['Audit Intern @ Greater Boston Area']);
});

test('"constructor" and other built-in names never crash a search', () => {
  const list = [job('Finance Intern', 'Constructor'), job('Audit Intern', 'Remote - Constructor'), job('Tax Intern', 'Worcester, MA')];
  assert.deepEqual(placesIn('Constructor'), []);
  assert.equal(findPlace('constructor'), null);
  const odd = studentFrom({ major: 'constructor', city: 'constructor' }, null);
  for (const f of [picks({}), picks({ major: 'only' }), picks({ major: 'related' }), picks({ location: 'constructor', near: findPlace('constructor') })]) {
    assert.doesNotThrow(() => pick(list, odd, f));
  }
});
