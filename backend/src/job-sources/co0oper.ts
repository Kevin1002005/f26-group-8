// CO0Oper's Internships-jobs list (https://github.com/CO0Oper/Internships-jobs): a GitHub project
// that checks hundreds of companies' job boards (mostly Greenhouse and Ashby) for intern roles
// every day, and keeps them in one JSON file. No key needed.
// It's worldwide, so we keep only the ones in the US or remote (isInUS in shared.ts): ScoutSearch
// is for students in the US. Like SimplifyJobs, it has no descriptions or pay: just the company,
// title, location, link, and the day it was posted. It has no ids either, so the link is the id.
// It collects jobs from other sites, so it's an "aggregator" (import-runner.ts): a job we
// already have from Greenhouse, Lever, or Ashby is skipped.
import {
  fetchJson, guessSetting, guessType, isInUS, isWebLink, simplifyUrl, toDate, toTime,
  type ImportedJob, type SourceResult,
} from './shared.js';

// the list's raw file
const LIST_URL = 'https://raw.githubusercontent.com/CO0Oper/Internships-jobs/main/data/postings.json';

// one row of the list
type Co0operPosting = {
  company: string;
  title: string;
  location: string | null;
  url: string;
  posted: string | null;   // the day it was posted, like "2026-11-16"
};

export async function fetchCo0oper(): Promise<SourceResult> {
  let body: unknown;
  try {
    body = await fetchJson(LIST_URL);
  } catch (err) {
    console.error('co0oper failed:', err);
    return { jobs: [], allFetchesWorked: false };
  }
  if (!Array.isArray(body)) {
    console.error('co0oper failed: the list wasn\'t a list');
    return { jobs: [], allFetchesWorked: false };
  }

  const jobs: ImportedJob[] = [];
  let readable = 0;   // rows with the fields we need (in the US or not)
  for (const posting of body as Co0operPosting[]) {
    // one posting that can't be read is skipped on its own (see greenhouse.ts)
    try {
      if (!posting || typeof posting.company !== 'string' || typeof posting.title !== 'string' || !isWebLink(posting.url)) continue;
      readable++;
      const location = typeof posting.location === 'string' && posting.location.trim() !== '' ? posting.location.trim() : null;
      // only jobs in the US (or remote): see the note at the top
      if (!isInUS(location)) continue;
      jobs.push(toImportedJob(posting, location));
    } catch {
      console.error('co0oper: skipped one posting that couldn\'t be read');
    }
  }
  // an empty list, or one where most rows can't be read, probably means the file changed shape
  // (or a bad update), not that every internship is gone: say it failed, so nothing gets closed
  if (readable === 0 || readable < body.length / 2) {
    console.error(`co0oper failed: only ${readable} of ${body.length} rows could be read`);
    return { jobs: [], allFetchesWorked: false };
  }
  return { jobs, allFetchesWorked: true };
}

function toImportedJob(posting: Co0operPosting, location: string | null): ImportedJob {
  // "2026-11-16" -> noon that day (UTC), which is still that day in US time zones.
  // (toDate first, so a day that doesn't exist, like "2026-02-30", becomes null)
  const day = toDate(posting.posted);
  return {
    source: 'co0oper',
    // no ids in the list, so the link is the id: "job-boards.greenhouse.io/bitgo/jobs/89"
    // (simplifyUrl, so "?gh_src=..." on the end doesn't make it a different job)
    external_id: simplifyUrl(posting.url),
    title: posting.title.trim(),
    organization: posting.company.trim(),
    type: guessType(posting.title),
    level: 'college',          // the list is for college students
    location,
    setting: guessSetting(location),
    paid: null,                // the list doesn't say
    pay_text: null,
    deadline: null,
    // there's no description, so this says where it's from (the matching reads the title too)
    description: 'Listed on the CO0Oper internship list, which checks company job boards every day.',
    requirements: [],
    apply_url: posting.url,
    posted_at: day ? toTime(`${day}T12:00:00Z`) : null,
  };
}
