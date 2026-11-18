// speedyapply's 2027-SWE-College-Jobs (https://github.com/speedyapply/2027-SWE-College-Jobs): a list
// of software engineering internships in the US, updated every day. No key needed.
// It's only kept as tables in its README (there's no JSON file), so we read the README and
// pull each row out of its tables. A row looks like this (only the FAANG+ and Quant tables
// have the Salary column):
//   | <a href="https://about.meta.com"><strong>Meta</strong></a> | Research Intern | Burlingame, CA | $50/hr | <a href="https://www.metacareers.com/jobs/1"><img src="..." alt="Apply"/></a> | 6d |
// It has no ids, so the link is the id. "6d" (its Age column) means it was posted 6 days ago.
// (Its internship README is US-only. Its other pages, for new grads and other countries, aren't read.)
// Its 2027-AI-College-Jobs list (AI, machine learning, and data science) has the same tables, so
// both READMEs are read (added 2026-11-17)
// It collects jobs from other sites, so it's an "aggregator" (import-runner.ts).
import {
  fetchText, guessSetting, guessType, htmlToText, isWebLink, simplifyUrl, toTime,
  type ImportedJob, type SourceResult,
} from './shared.js';

// each README, and what its list is about (for the job's description)
const READMES = [
  { url: 'https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/README.md', about: 'software engineering' },
  { url: 'https://raw.githubusercontent.com/speedyapply/2027-AI-College-Jobs/main/README.md', about: 'AI, machine learning, and data science' },
];

// Every table in a README: its column names (lower case), and each row as
// { column name: what's in that cell }.
// A table is lines that start with "|": the first one is the column names, the second is
// the "|---|---|" line under them, and the rest are rows
type Table = { columns: string[]; rows: Record<string, string>[] };
export function tablesIn(markdown: string): Table[] {
  const tables: Table[] = [];
  let table: Table | null = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    // any other line ends the table
    if (!line.startsWith('|')) {
      table = null;
      continue;
    }
    // "| a | b |" -> ["a", "b"] (without the | at each end). A "\|" inside a cell is a | that's
    // part of the text, like "SWE Intern \| Summer", so it doesn't split the cell
    const cells = line.replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
    if (!table) {
      table = { columns: cells.map((cell) => cell.toLowerCase()), rows: [] };
      tables.push(table);
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;   // the "|---|---|" line
    const row: Record<string, string> = {};
    table.columns.forEach((name, i) => (row[name] = cells[i] ?? ''));
    table.rows.push(row);
  }
  return tables;
}

export async function fetchSpeedyApply(): Promise<SourceResult> {
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  // each README on its own: one failing still keeps the other's jobs, but nothing gets closed
  for (const { url, about } of READMES) {
    const result = await readReadme(url, about);
    jobs.push(...result.jobs);
    if (!result.allFetchesWorked) allFetchesWorked = false;
  }
  return { jobs, allFetchesWorked };
}

// the jobs in one of speedyapply's READMEs
async function readReadme(url: string, about: string): Promise<SourceResult> {
  // which list it is, for the log ("2027-AI-College-Jobs")
  const list = url.split('/')[4];
  let readme: string;
  try {
    readme = await fetchText(url);
  } catch (err) {
    console.error(`speedyapply ${list} failed:`, err);
    return { jobs: [], allFetchesWorked: false };
  }

  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  for (const table of tablesIn(readme)) {
    // only the job tables (they have a Company column; the README could have other tables)
    if (!table.columns.includes('company')) continue;
    // a job table without the columns we need: they renamed one. Its jobs can't be read, so
    // say it failed (otherwise every job in that table would be closed)
    if (!table.columns.includes('position') || !table.columns.includes('posting')) {
      console.error(`speedyapply ${list}: a table has columns we don't know (${table.columns.join(', ')})`);
      allFetchesWorked = false;
      continue;
    }
    for (const row of table.rows) {
      // one row that can't be read is skipped on its own (see greenhouse.ts)
      try {
        const job = toImportedJob(row, about);
        if (job) jobs.push(job);
      } catch {
        console.error(`speedyapply ${list}: skipped one row that couldn't be read`);
      }
    }
  }
  if (jobs.length === 0) {
    // a README with no rows at all probably means they changed how it looks, not that every
    // internship is gone: say it failed, so the importer doesn't close all of them
    console.error(`speedyapply ${list} failed: no job rows found in its README`);
    return { jobs: [], allFetchesWorked: false };
  }
  return { jobs, allFetchesWorked };
}

function toImportedJob(row: Record<string, string>, about: string): ImportedJob | null {
  const organization = htmlToText(row.company);
  const title = htmlToText(row.position);
  // the link is in the Apply button: <a href="https://..."><img ...></a>.
  // htmlToText on just the link turns "&amp;" back into "&"
  const href = /href="([^"]+)"/i.exec(row.posting ?? '')?.[1];
  const link = href ? htmlToText(href) : null;
  if (!organization || !title || !isWebLink(link)) return null;

  // "<br>" between places becomes a line break in htmlToText: shown as " · " instead
  const location = htmlToText(row.location)?.split('\n').map((p) => p.trim()).filter(Boolean).join(' · ') || null;
  const salary = htmlToText(row.salary);   // "$50/hr", or null in the Other table
  // "6d" -> posted 6 days ago (at noon UTC, so it's that day in US time zones)
  const days = /^(\d{1,3})d$/.exec((row.age ?? '').trim())?.[1];
  let postedAt: string | null = null;
  if (days) {
    const today = new Date();
    postedAt = toTime(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - Number(days), 12));
  }

  return {
    source: 'speedyapply',
    external_id: simplifyUrl(link),   // no ids in the list, so the link is the id
    title,
    organization,
    type: guessType(title),
    level: 'college',          // the list is for college students
    location,
    setting: guessSetting(location),
    paid: salary && /\$\s?\d/.test(salary) ? true : null,   // a $ amount means it's paid
    pay_text: salary && /\$\s?\d/.test(salary) ? salary : null,
    deadline: null,
    description: `Listed on the SpeedyApply ${about} internship list.`,
    requirements: [],
    apply_url: link,
    posted_at: postedAt,
  };
}
