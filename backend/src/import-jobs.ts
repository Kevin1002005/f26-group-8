// plans.md Task JB2. Pulls internships from outside job sites into our jobs table.
//
// run it by hand:   cd backend  &&  npm run import-jobs
// it does NOT run when the server starts: "tsx watch" restarts the server every time you
// save a file, and each restart would call every job site again (and use up Adzuna's daily limit).
import { supabase } from './db.js';
import { fetchGreenhouse } from './job-sources/greenhouse.js';
import { fetchLever } from './job-sources/lever.js';
import { fetchJSearch } from './job-sources/jsearch.js';
import {
  isForOurStudents, mergeSimilarJobs, jobKey, simplifyUrl,
  type ImportedJob, type SourceResult,
} from './job-sources/shared.js';

// every source we import from. USAJOBS and Adzuna get added here once their keys are in secrets.env
//
// aggregator: true is for sites that collect jobs from OTHER sites (JSearch gets them from
// Google for Jobs). Their copy of a job is skipped if a direct source (like Greenhouse)
// already has it, because the direct one is more complete and stays up to date.
// that's also why aggregators go LAST in this list: the direct sources save first.
type Source = {
  name: ImportedJob['source'];
  fetchJobs: () => Promise<SourceResult>;
  aggregator?: boolean;
};
const SOURCES: Source[] = [
  { name: 'greenhouse', fetchJobs: fetchGreenhouse },
  { name: 'lever', fetchJobs: fetchLever },
  // skips itself (and says so) if JSEARCH_API_KEY isn't in secrets.env
  { name: 'jsearch', fetchJobs: fetchJSearch, aggregator: true },
];


// the companies+titles and links of every open job from the OTHER sources, so an aggregator
// can skip jobs we already have. returns null if the database call fails.
async function jobsFromOtherSources(name: string): Promise<Set<string> | null> {
  const taken = new Set<string>();
  // Supabase sends at most 1000 rows per call, so ask 1000 at a time until a page comes back short
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('jobs')
      .select('organization, title, apply_url')
      .neq('source', name)
      .eq('status', 'open')
      .range(from, from + 999);

    if (error) {
      console.error(`${name}: reading other sources' jobs failed`, error);
      return null;
    }
    for (const job of data) {
      taken.add(jobKey(job));
      if (job.apply_url) taken.add(simplifyUrl(job.apply_url));
    }
    if (data.length < 1000) return taken;
  }
}


// JB2b, for one source: fetch -> drop duplicate ids -> save -> close jobs the source took down.
// returns false if something went wrong, so we can report it at the end
async function importSource({ name, fetchJobs, aggregator }: Source): Promise<boolean> {
  // every row saved in this run gets this exact time as last_seen_at.
  // afterwards, an open job from this source with an OLDER last_seen_at wasn't in
  // today's list, which means the company took it down.
  const runStartedAt = new Date().toISOString();

  const { jobs: fetched, allFetchesWorked } = await fetchJobs();

  // 1. only jobs high schoolers or college undergrads can apply to (no PhD, master's,
  // MBA, or new-grad jobs). jobs.sql has a matching rule, so they can't get in another way.
  const forOurStudents = fetched.filter((job) => isForOurStudents(job.title, job.description));

  // 2. merge copies of the same job (same company + title, like one post per city) into one row
  let jobs = mergeSimilarJobs(forOurStudents);

  // 3. aggregators only: skip jobs a direct source already has (same company + title, or same link).
  // a skipped job isn't saved this run, so if an older run saved it, step 5 below closes that copy.
  if (aggregator) {
    const taken = await jobsFromOtherSources(name);
    if (!taken) return false;   // can't tell what's a duplicate, so save nothing and close nothing
    jobs = jobs.filter((job) => !taken.has(jobKey(job)) && !taken.has(simplifyUrl(job.apply_url)));
  }

  console.log(
    `${name}: fetched ${fetched.length}, ${fetched.length - forOurStudents.length} not for our students, ` +
    `${forOurStudents.length - jobs.length} merged or already listed`
  );

  // 4. drop duplicate ids (keep the last one). Postgres refuses to save a batch that
  // has the same job in it twice ("ON CONFLICT DO UPDATE command cannot affect row a second time")
  const byId = new Map<string, ImportedJob>();
  for (const job of jobs) {
    byId.set(job.external_id, job);
  }
  const rows = [...byId.values()].map((job) => ({
    ...job,
    status: 'open',               // the company still lists it, so it's open (even if we closed it before)
    last_seen_at: runStartedAt,
  }));

  if (rows.length > 0) {
    // upsert = insert new jobs, update the ones we already have.
    // "already have" means same source + external_id: the unique rule in jobs.sql.
    // id and created_at aren't in the rows, so new jobs get their defaults and old jobs keep theirs.
    const { error } = await supabase
      .from('jobs')
      .upsert(rows, { onConflict: 'source,external_id' });

    if (error) {
      console.error(`${name}: saving failed`, error);
      return false;   // stop here: closing jobs now would close the ones we just failed to save
    }
  }

  if (!allFetchesWorked) {
    console.log(`${name}: saved ${rows.length} jobs. Some companies failed, so no old jobs were closed.`);
    return false;
  }

  // 5. close this source's open jobs that weren't in today's list
  const { data: closed, error } = await supabase
    .from('jobs')
    .update({ status: 'closed' })
    .eq('source', name)
    .eq('status', 'open')
    .lt('last_seen_at', runStartedAt)
    .select('id');   // ask for the closed rows back, just so we can count them

  if (error) {
    console.error(`${name}: closing old jobs failed`, error);
    return false;
  }

  console.log(`${name}: saved ${rows.length} jobs, closed ${closed.length} that are gone`);
  return true;
}


// one source at a time, so the log stays readable and one failing source doesn't stop the rest
let everythingWorked = true;
for (const source of SOURCES) {
  const worked = await importSource(source);
  if (!worked) everythingWorked = false;
}

// a non-zero exit code tells the terminal (or a scheduler, later) that something went wrong
if (!everythingWorked) {
  process.exitCode = 1;
}
