// vanshb03's Summer2027-Internships (https://github.com/vanshb03/Summer2027-Internships): a community
// list of internships on GitHub, like SimplifyJobs' (MIT license). It keeps its list as one JSON
// file in the same shape as Simplify's. No key needed.
//
// Its links are short links (like https://go.vansh.nyc/1Ap) that send you on to the company's
// posting. We follow each one ONCE to get the real link and save that, so:
//   - students go straight to the company's site, and
//   - a job we already have from another source is recognized by its link.
// Links we already followed are read back from our jobs table, so a run only follows the new
// ones, and at most MOST_NEW_LINKS of them (the rest keep the short link, which still works,
// until a later run follows them).
// The following happens in followVanshLinks, which the importer runs AFTER it has taken out the
// jobs other sources already have (import-runner.ts). Those are never saved, so if we followed
// their links first, every run would follow them again and use up MOST_NEW_LINKS on them.
// It collects jobs from other sites, so it's an "aggregator" (import-runner.ts).
import { supabase } from '../db.js';
import { fetchJson, guessSetting, guessType, isWebLink, toTime, type ImportedJob, type SourceResult } from './shared.js';

// the list's raw file. "dev" is the repo's main branch
const LIST_URL = 'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json';

// the most short links one run follows, and how many at a time (so we're gentle with their site)
const MOST_NEW_LINKS = 300;
const AT_A_TIME = 8;

// only the fields we use (the real file has more)
type VanshListing = {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations: string[] | null;
  season: string | null;        // "Summer", "Fall", ...
  sponsorship: string | null;   // "Offers Sponsorship", "U.S. Citizenship is Required", ...
  date_posted: number | null;   // seconds since 1970
  active: boolean;
  is_visible: boolean | null;
};

// true for the list's short links
function isShortLink(url: string): boolean {
  return /^https?:\/\/go\.vansh\.nyc\//i.test(url);
}

// Follows one short link and gives back where it goes, or null if it doesn't say.
// redirect: 'manual' means fetch doesn't go there itself: we only want the address
// (the "location" header), not the company's whole page. HEAD asks for headers only
async function followShortLink(link: string): Promise<string | null> {
  try {
    const res = await fetch(link, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const to = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !to) return null;
    const real = new URL(to, link).href;   // new URL(..., link) also handles "/jobs/1" (no site name)
    return isWebLink(real) && !isShortLink(real) ? real : null;
  } catch {
    return null;   // the link is kept as it is, and a later run tries again
  }
}

// The real links we saved on earlier runs, by the list's id. If the database can't be
// reached, the run just follows the links again (up to MOST_NEW_LINKS)
async function linksWeAlreadyFollowed(): Promise<Map<string, string>> {
  const known = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('jobs')
      .select('external_id, apply_url')
      .eq('source', 'vanshb03')
      .order('external_id')
      .range(from, from + 999);
    if (error) {
      console.error('vanshb03: reading the links we already followed failed', error);
      return known;
    }
    for (const row of data) {
      if (row.external_id && row.apply_url && !isShortLink(row.apply_url)) known.set(row.external_id, row.apply_url);
    }
    if (data.length < 1000) return known;
  }
}

export async function fetchVansh(): Promise<SourceResult> {
  let body: unknown;
  try {
    body = await fetchJson(LIST_URL);
  } catch (err) {
    console.error('vanshb03 failed:', err);
    return { jobs: [], allFetchesWorked: false };
  }
  if (!Array.isArray(body)) {
    console.error('vanshb03 failed: the list wasn\'t a list');
    return { jobs: [], allFetchesWorked: false };
  }

  const jobs: ImportedJob[] = [];
  let readable = 0;   // listings with the fields we need (open or not)
  for (const listing of body as VanshListing[]) {
    // one listing that can't be read is skipped on its own (see greenhouse.ts)
    try {
      if (!listing || typeof listing.id !== 'string' || typeof listing.title !== 'string' || typeof listing.company_name !== 'string') continue;
      readable++;
      if (listing.active !== true || listing.is_visible === false || !isWebLink(listing.url)) continue;
      jobs.push(toImportedJob(listing));
    } catch {
      console.error('vanshb03: skipped one listing that couldn\'t be read');
    }
  }
  // an empty list, or one where most rows can't be read, probably means the file changed shape
  // (or a bad update), not that every internship is gone: say it failed, so nothing gets closed
  if (readable === 0 || readable < body.length / 2) {
    console.error(`vanshb03 failed: only ${readable} of ${body.length} listings could be read`);
    return { jobs: [], allFetchesWorked: false };
  }
  return { jobs, allFetchesWorked: true };
}

// Swaps the short links for the real ones (the importer runs this after taking out duplicates).
// Gives back the same jobs, with real links where it could get them
export async function followVanshLinks(jobs: ImportedJob[]): Promise<ImportedJob[]> {
  // first the ones we already know...
  const known = await linksWeAlreadyFollowed();
  const toFollow: ImportedJob[] = [];
  for (const job of jobs) {
    if (!isShortLink(job.apply_url)) continue;
    const saved = known.get(job.external_id);
    if (saved) job.apply_url = saved;
    else toFollow.push(job);
  }
  // ...then follow up to MOST_NEW_LINKS new ones, AT_A_TIME at once
  const now = toFollow.slice(0, MOST_NEW_LINKS);
  let followed = 0;
  for (let from = 0; from < now.length; from += AT_A_TIME) {
    const group = now.slice(from, from + AT_A_TIME);
    const real = await Promise.all(group.map((job) => followShortLink(job.apply_url)));
    group.forEach((job, i) => {
      const link = real[i];
      if (link) {
        job.apply_url = link;
        followed++;
      }
    });
  }
  console.log(`vanshb03: followed ${followed} new short links (${toFollow.length - followed} left for a later run)`);
  return jobs;
}

function toImportedJob(listing: VanshListing): ImportedJob {
  const places = (listing.locations ?? []).filter((l) => typeof l === 'string' && l.trim() !== '').map((l) => l.trim());
  // at most 3 places, then "+5 more", like mergeSimilarJobs does (shared.ts)
  const location = places.length === 0 ? null : places.slice(0, 3).join(' · ') + (places.length > 3 ? ` +${places.length - 3} more` : '');
  const season = typeof listing.season === 'string' ? listing.season : '';
  const sponsorship = typeof listing.sponsorship === 'string' && listing.sponsorship !== 'Other' ? listing.sponsorship : '';
  // there's no description, so this says what the list knows (and the matching uses it)
  const about = [
    'Listed on the vanshb03 internship list.',
    season ? `Season: ${season}.` : '',
    sponsorship ? `Visa sponsorship: ${sponsorship}.` : '',
    places.length > 3 ? `Locations: ${places.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return {
    source: 'vanshb03',
    external_id: listing.id,
    title: listing.title.trim(),
    organization: listing.company_name.trim(),
    type: guessType(listing.title),
    level: 'college',          // the list is for college students
    location,
    setting: guessSetting(places.join(' ')),
    paid: null,                // the list doesn't say
    pay_text: null,
    deadline: null,
    description: about,
    requirements: sponsorship === 'U.S. Citizenship is Required' ? ['U.S. citizenship is required'] : [],
    apply_url: listing.url,    // swapped for the real link in followVanshLinks above
    posted_at: typeof listing.date_posted === 'number' ? toTime(listing.date_posted * 1000) : null,
  };
}
