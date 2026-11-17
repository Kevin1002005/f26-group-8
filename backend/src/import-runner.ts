// The importer's steps (plans.md Task JB2): pulls internships from outside job sites into our jobs
// table. Two things run it:
//   npm run import-jobs          (import-jobs.ts) every source, by hand
//   Refresh on Opportunities     (POST /api/jobs/refresh in jobs.ts) the sources in refreshSources()
// After the sources, a free AI model tags the new jobs with the majors and skills they fit
// (ai-tags.ts), if AI_API_KEY is set.
import { supabase } from './db.js';
import { fetchGreenhouse } from './job-sources/greenhouse.js';
import { fetchLever } from './job-sources/lever.js';
import { fetchJSearch } from './job-sources/jsearch.js';
import { fetchAshby } from './job-sources/ashby.js';
import { fetchSmartRecruiters } from './job-sources/smartrecruiters.js';
import { fetchWorkable } from './job-sources/workable.js';
import { fetchUsaJobs } from './job-sources/usajobs.js';
import { fetchSimplify } from './job-sources/simplify.js';
import { fetchAdzuna } from './job-sources/adzuna.js';
import { fetchNsf } from './job-sources/nsf.js';
import { fetchPrecollege } from './job-sources/precollege.js';
import { fetchCo0oper } from './job-sources/co0oper.js';
import { fetchVansh, followVanshLinks } from './job-sources/vanshb03.js';
import { fetchSpeedyApply } from './job-sources/speedyapply.js';
import { tagNewJobs } from './ai-tags.js';
import {
  isForOurStudents, mergeSimilarJobs, jobKey, simplifyUrl, storableJob,
  type ImportedJob, type SourceResult,
} from './job-sources/shared.js';

// every source we import from, in this order.
//
// aggregator: true is for sites that collect jobs from OTHER sites (JSearch gets them from
// Google for Jobs). Their copy of a job is skipped if a direct source (like Greenhouse)
// already has it, because the direct one is more complete and stays up to date.
// that's also why aggregators go LAST in this list: the direct sources save first.
// finishJobs is for a source that needs one more step once the duplicates are gone
// (vanshb03 follows its short links then, so it never follows the links of jobs we won't save)
type Source = {
  name: ImportedJob['source'];
  fetchJobs: () => Promise<SourceResult>;
  aggregator?: boolean;
  finishJobs?: (jobs: ImportedJob[]) => Promise<ImportedJob[]>;
};
export const SOURCES: Source[] = [
  // company job boards (no key)
  { name: 'greenhouse', fetchJobs: fetchGreenhouse },
  { name: 'lever', fetchJobs: fetchLever },
  { name: 'ashby', fetchJobs: fetchAshby },
  { name: 'smartrecruiters', fetchJobs: fetchSmartRecruiters },
  { name: 'workable', fetchJobs: fetchWorkable },
  // government internships: skips itself (and says so) without USAJOBS_API_KEY and USAJOBS_EMAIL
  { name: 'usajobs', fetchJobs: fetchUsaJobs },
  // research programs for undergrads (and a few for high schoolers), from the National Science Foundation
  { name: 'nsf', fetchJobs: fetchNsf },
  // hand-checked high school summer programs (precollege-finder)
  { name: 'precollege', fetchJobs: fetchPrecollege },
  // lists that collect jobs from other sites, last. GitHub lists first (no limits), then the
  // search services. The lists overlap, so each one only adds the jobs the ones before it don't have
  { name: 'simplify', fetchJobs: fetchSimplify, aggregator: true },
  { name: 'vanshb03', fetchJobs: fetchVansh, aggregator: true, finishJobs: followVanshLinks },
  { name: 'co0oper', fetchJobs: fetchCo0oper, aggregator: true },
  { name: 'speedyapply', fetchJobs: fetchSpeedyApply, aggregator: true },
  // skips itself (and says so) if JSEARCH_API_KEY isn't in secrets.env
  { name: 'jsearch', fetchJobs: fetchJSearch, aggregator: true },
  // skips itself (and says so) without ADZUNA_APP_ID and ADZUNA_APP_KEY
  { name: 'adzuna', fetchJobs: fetchAdzuna, aggregator: true },
];

// the ones Refresh on Opportunities runs (POST /api/jobs/refresh): everything without a daily
// limit. JSearch (about 200 requests a month) and Adzuna (a daily limit) only run from the
// importer, so a busy demo can't use them up. USAJOBS only if its key is set (without it, it
// would skip itself, and the check would look like it failed)
export function refreshSources(): ImportedJob['source'][] {
  const names: ImportedJob['source'][] = [
    'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'nsf', 'precollege',
    'simplify', 'vanshb03', 'co0oper', 'speedyapply',
  ];
  if (process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL) names.push('usajobs');
  return names;
}


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
      .order('id')   // a set order, so no job is missed or read twice between pages
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
async function importSource({ name, fetchJobs, aggregator, finishJobs }: Source): Promise<boolean> {
  // every row saved in this run gets this exact time as last_seen_at.
  // afterwards, an open job from this source with an OLDER last_seen_at wasn't in
  // today's list, which means the company took it down.
  const runStartedAt = new Date().toISOString();

  const result = await fetchJobs();
  const allFetchesWorked = result.allFetchesWorked;
  // storableJob (shared.ts) removes the characters Postgres can't store. It runs FIRST, so the
  // checks below see the same title the database will: "Ph\u0000D Intern" would pass them as it
  // is, then turn into "PhD Intern", which the database refuses (and the whole save fails)
  const fetched = result.jobs.map(storableJob);

  // 1. only jobs high schoolers or college undergrads can apply to (no PhD, master's,
  // MBA, or new-grad jobs). jobs.sql has a matching rule, so they can't get in another way.
  const forOurStudents = fetched.filter((job) => isForOurStudents(job.title, job.description));

  // 2. merge copies of the same job (same company + title, like one post per city) into one row
  let jobs = mergeSimilarJobs(forOurStudents);

  // 3. aggregators only: skip jobs a direct source already has (same company + title, or same link).
  // a skipped job isn't saved this run, so if an older run saved it, step 5 below closes that copy.
  let taken: Set<string> | null = null;
  if (aggregator) {
    taken = await jobsFromOtherSources(name);
    if (!taken) return false;   // can't tell what's a duplicate, so save nothing and close nothing
    jobs = jobs.filter((job) => !taken!.has(jobKey(job)) && !taken!.has(simplifyUrl(job.apply_url)));
  }
  // the source's last step, if it has one. Its new links can show more duplicates, so check again
  if (finishJobs) {
    jobs = await finishJobs(jobs);
    if (taken) jobs = jobs.filter((job) => !taken!.has(simplifyUrl(job.apply_url)));
  }

  console.log(
    `${name}: fetched ${fetched.length}, ${fetched.length - forOurStudents.length} not for our students, ` +
    `${forOurStudents.length - jobs.length} merged or already listed`
  );

  // lists that collect jobs from other sites sometimes list one posting twice (two titles, or
  // two seasons, with the same link): keep one per link. Sorted by id first, so the SAME copy
  // is kept every run (otherwise the other one would be closed and reopened each time)
  if (aggregator) {
    const links = new Set<string>();
    jobs = [...jobs].sort((a, b) => (a.external_id < b.external_id ? -1 : 1)).filter((job) => {
      const link = simplifyUrl(job.apply_url);
      if (links.has(link)) return false;
      links.add(link);
      return true;
    });
  }

  // an id longer than 1000 bytes is skipped: the database can't index one past about 2700 bytes,
  // and ONE such row would make the whole batch, and every batch after it, fail to save
  const tooLong = jobs.filter((job) => Buffer.byteLength(job.external_id) > 1000).length;
  if (tooLong > 0) {
    console.error(`${name}: skipped ${tooLong} job(s) with an id too long to save`);
    jobs = jobs.filter((job) => Buffer.byteLength(job.external_id) <= 1000);
  }

  // 4. drop duplicate ids (keep the last one). Postgres refuses to save a batch that
  // has the same job in it twice ("ON CONFLICT DO UPDATE command cannot affect row a second time")
  const byId = new Map<string, ImportedJob>();
  for (const job of jobs) {
    // (storableJob already ran at the top, so two ids that only differed by a character
    // Postgres can't store count as one job here)
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
    // 500 at a time: one huge batch (SimplifyJobs has thousands) could be too big for one request
    for (let from = 0; from < rows.length; from += 500) {
      const { error } = await supabase
        .from('jobs')
        .upsert(rows.slice(from, from + 500), { onConflict: 'source,external_id' });

      if (error) {
        console.error(`${name}: saving failed`, error);
        return false;   // stop here: closing jobs now would close the ones we just failed to save
      }
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


// Runs the sources (all of them, or only the ones named), one at a time, so the log stays
// readable and one failing source doesn't stop the rest. Then the AI tags the new jobs
// (ai-tags.ts; that part never fails the run: tags are extra). Gives back true if every source worked
export async function runImport(names?: ImportedJob['source'][]): Promise<boolean> {
  let everythingWorked = true;
  for (const source of SOURCES) {
    if (names && !names.includes(source.name)) continue;
    const worked = await importSource(source);
    if (!worked) everythingWorked = false;
  }
  await tagNewJobs();
  return everythingWorked;
}
