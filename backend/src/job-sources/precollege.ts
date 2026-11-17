// High school summer programs from precollege-finder (https://github.com/itsmeck24/precollege-finder,
// MIT license): research programs, math camps, and summer institutes like RSI, COSMOS, and SSP.
// No key needed.
// Its website's catalog was filled in by an AI and gets about 4 in 10 facts wrong, so we DON'T
// use that. We read its hand-checked files instead: one per program, recorded by a person from
// the program's own pages, with each fact marked:
//   confirmed    stated on the page, for the 2027 programs
//   undated      stated on the page, without saying which year (like "rising juniors can apply")
//   prior_cycle  only last year's version was on the page (so not used for dates)
//   not_found    the page doesn't say
// Dates are only used when they're confirmed. A program whose site couldn't be read is still
// listed, with a note to check its site.
import { fetchJson, toDate, type ImportedJob, type SourceResult } from './shared.js';

const BASE = 'https://raw.githubusercontent.com/itsmeck24/precollege-finder/main/';

// the hand-checked files (data/truth and data/manual in the repo). There's no list of them
// to download, so they're listed here: if the project adds a program, add its file here
const PROGRAM_FILES = [
  'data/manual/mites.json',
  'data/manual/nasa-sees.json',
  'data/manual/ssp.json',
  'data/truth/bu-research-in-science-and-engineering-rise.json',
  'data/truth/canada-usa-mathcamp.json',
  'data/truth/clark-scholars-program.json',
  'data/truth/cosmos.json',
  'data/truth/garcia-summer-research-program.json',
  'data/truth/hampshire-college-summer-studies-in-mathematics.json',
  'data/truth/hutton-junior-fisheries-biology-program.json',
  'data/truth/leda-scholars.json',
  'data/truth/nyu-tandon-arise.json',
  'data/truth/princeton-summer-journalism-program.json',
  'data/truth/research-science-institute.json',
  'data/truth/rockefeller-university-summer-science-research-program.json',
  'data/truth/ross-mathematics-program.json',
  'data/truth/secondary-student-training-program.json',
  'data/truth/stanford-institutes-of-medicine-summer-research-program.json',
  'data/truth/summer-academy-for-math-and-science-sams.json',
  'data/truth/summer-ventures-in-science-and-mathematics.json',
  'data/truth/telluride-association-summer-seminar.json',
  'data/truth/texas-state-honors-summer-math-camp.json',
  'data/truth/yale-young-global-scholars.json',
];

// one program's file (only the parts we use)
type Fact = { name?: string; status?: string; value?: unknown };
type ProgramFile = {
  provider?: { name?: string; home_url?: string };
  program?: { name?: string; target_cycle?: number };
  checked_on?: string;
  fields?: Fact[];
  excluded?: string;   // set when the program's site couldn't be read (so there are no facts)
};

export async function fetchPrecollege(): Promise<SourceResult> {
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  let gone = 0;
  for (const path of PROGRAM_FILES) {
    let file: ProgramFile;
    try {
      file = (await fetchJson(BASE + path)) as ProgramFile;
    } catch (err) {
      // 404 = the project removed that program, so it's simply not listed any more
      if (err instanceof Error && err.message === 'HTTP 404') {
        console.log(`precollege: ${path} is gone`);
        gone++;
        continue;
      }
      console.error(`precollege: ${path} failed:`, err);
      allFetchesWorked = false;
      continue;
    }
    try {
      const job = toImportedJob(path, file);
      if (job) jobs.push(job);
    } catch {
      console.error(`precollege: skipped ${path}, it couldn't be read`);
    }
  }
  // if EVERY file is gone, the project probably moved or renamed its files (not that every
  // program ended): say it failed, so nothing gets closed, and check the list at the top
  if (gone === PROGRAM_FILES.length) {
    console.error('precollege failed: none of its files were found (did the project move them?)');
    allFetchesWorked = false;
  }
  return { jobs, allFetchesWorked };
}

// "[9, 10, 11]" -> "9th to 11th grade", "[11]" -> "11th grade"
function gradesInWords(grades: number[]): string {
  const nth = (g: number) => `${g}th`;
  const sorted = [...grades].sort((a, b) => a - b);
  return sorted.length === 1 ? `${nth(sorted[0]!)} grade` : `${nth(sorted[0]!)} to ${nth(sorted[sorted.length - 1]!)} grade`;
}

// "2027-06-21" -> "June 21, 2027"
function dayInWords(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const AID_WORDS: Record<string, string> = {
  need_based: 'need-based financial aid',
  meets_full_need: 'aid that meets full need',
  travel: 'travel help',
  stipend: 'a stipend',
};
const FORMAT_WORDS: Record<string, string> = { residential: 'live on campus', commuter: 'commute daily', virtual: 'online', hybrid: 'partly online' };

function toImportedJob(path: string, file: ProgramFile): ImportedJob | null {
  const name = (file.program?.name ?? file.provider?.name ?? '').trim();
  const link = (file.provider?.home_url ?? '').trim();
  if (name === '' || !/^https?:\/\//i.test(link)) return null;
  const facts = Array.isArray(file.fields) ? file.fields : [];

  // a fact's value, if the page states it. Dates have to be confirmed (for this year's program)
  const stated = (factName: string, onlyConfirmed = false): unknown => {
    const fact = facts.find((f) => f?.name === factName);
    if (!fact) return null;
    const ok = fact.status === 'confirmed' || (!onlyConfirmed && fact.status === 'undated');
    return ok ? fact.value ?? null : null;
  };
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

  if (stated('not_running', true) === true) return null;   // not running this year

  const grades = Array.isArray(stated('grade_at_application')) ? (stated('grade_at_application') as unknown[]).filter((g): g is number => typeof g === 'number') : [];
  const minAge = typeof stated('min_age') === 'number' ? (stated('min_age') as number) : null;
  const maxAge = typeof stated('max_age') === 'number' ? (stated('max_age') as number) : null;
  const citizenship = stated('citizenship');
  const cost = typeof stated('cost_usd') === 'number' ? (stated('cost_usd') as number) : null;
  const aid = list(stated('aid_type'));
  const format = list(stated('format'));
  const subjects = list(stated('subjects'));
  const deadline = typeof stated('deadline', true) === 'string' ? toDate(stated('deadline', true)) : null;
  const start = typeof stated('start_date', true) === 'string' ? toDate(stated('start_date', true)) : null;

  const requirements: string[] = [];
  if (grades.length > 0) requirements.push(`In ${gradesInWords(grades)} when you apply`);
  if (minAge !== null && maxAge !== null) requirements.push(`Ages ${minAge} to ${maxAge}`);
  else if (minAge !== null) requirements.push(`At least ${minAge} years old`);
  else if (maxAge !== null) requirements.push(`${maxAge} or younger`);
  if (citizenship === 'us_citizen') requirements.push('U.S. citizens only');
  if (citizenship === 'us_citizen_or_pr') requirements.push('U.S. citizens and permanent residents');

  // what it costs and what help there is: "Free · a stipend", "Costs $5,793 · need-based financial aid"
  const costText = cost === null ? '' : cost === 0 ? 'Free' : `Costs $${cost.toLocaleString('en-US')}`;
  // Object.hasOwn: only the names in the list (a value like "constructor" isn't one)
  const aidText = aid.map((a) => (Object.hasOwn(AID_WORDS, a) ? AID_WORDS[a] : '')).filter(Boolean).join(', ');
  const payText = [costText, aidText].filter(Boolean).join(' · ') || null;
  // "paid" means the student gets paid: a stipend. A program you pay for (or one that's free
  // with no stipend) isn't. Neither stated = we don't know
  const paid = aid.includes('stipend') ? true : cost !== null ? false : null;

  // only online -> remote; online and on campus -> partly (hybrid); only on campus -> on-site
  const online = format.includes('virtual');
  const inPerson = format.includes('residential') || format.includes('commuter');
  const setting = format.includes('hybrid') || (online && inPerson) ? 'hybrid' : online ? 'remote' : inPerson ? 'on-site' : null;

  const cycle = typeof file.program?.target_cycle === 'number' ? ` (${file.program.target_cycle})` : '';
  const description = [
    `A program for high school students${cycle}.`,
    subjects.length > 0 ? `Subjects: ${subjects.join(', ')}.` : '',
    start ? `Starts ${dayInWords(start)}.` : '',
    format.length > 0 ? `Students ${format.map((f) => (Object.hasOwn(FORMAT_WORDS, f) ? FORMAT_WORDS[f] : f)).join(' or ')}.` : '',
    file.excluded ? 'Its details couldn\'t be checked from its website, so see the website for who can apply and the dates.' : '',
    `Details checked by hand on the program's own website${file.checked_on ? ` on ${file.checked_on}` : ''}, by the precollege-finder project.`,
  ].filter(Boolean).join(' ');

  return {
    source: 'precollege',
    // the file's name is the id: "data/truth/cosmos.json" -> "cosmos"
    external_id: path.replace(/^.*\//, '').replace(/\.json$/, ''),
    title: name,
    organization: (file.provider?.name ?? name).trim(),
    // "NASA SEES High School Summer Intern Program" is an internship; "Research Science Institute" is research
    type: /\bintern/i.test(name) ? 'internship' : /\bresearch\b/i.test(name) ? 'research' : 'program',
    level: 'high-school',
    location: null,            // the files don't say
    setting,
    paid,
    pay_text: payText,
    deadline,
    description,
    requirements,
    apply_url: link,
    posted_at: null,
  };
}
