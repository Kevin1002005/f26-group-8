// SimplifyJobs: a big community list of internships on GitHub, updated every hour
// (https://github.com/SimplifyJobs/Summer2027-Internships). Simplify and the community add
// roles from company career pages. Besides the table in its README, it keeps the same list
// as one JSON file, which is what we read. No key needed.
// It's mostly tech (software, AI and data, hardware, quant, product), and it has no
// descriptions: just the company, title, locations, terms ("Summer 2027"), and the link.
// It collects jobs from other sites, so it's an "aggregator" (import-runner.ts): a job we
// already have from Greenhouse, Lever, or Ashby is skipped.
// Every job keeps a link to the company's own posting, and says it came "via SimplifyJobs".
import { guessType, guessSetting, isWebLink, toTime, type ImportedJob, type SourceResult, fetchJson } from './shared.js';

// the list's raw file. "dev" is the repo's main branch
const LIST_URL = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json';

// only the fields we use (the real file has more)
type SimplifyListing = {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations: string[] | null;
  terms: string[] | null;
  category: string | null;
  date_posted: number | null;   // seconds since 1970
  active: boolean;
  is_visible: boolean | null;
  degrees: string[] | null;     // like ["Bachelor's"] or ["PhD"]; often empty
};

// listings only for grad students: their degrees list has no bachelor's (and isn't empty)
function onlyForGradStudents(degrees: string[] | null): boolean {
  if (!Array.isArray(degrees) || degrees.length === 0) return false;
  return !degrees.some((d) => typeof d === 'string' && /bachelor|undergrad|high school/i.test(d));
}

export async function fetchSimplify(): Promise<SourceResult> {
  let body: unknown;
  try {
    body = await fetchJson(LIST_URL);
  } catch (err) {
    console.error('simplify failed:', err);
    return { jobs: [], allFetchesWorked: false };
  }
  if (!Array.isArray(body)) {
    console.error('simplify failed: the list wasn\'t a list');
    return { jobs: [], allFetchesWorked: false };
  }

  const jobs: ImportedJob[] = [];
  let readable = 0;   // listings with the fields we need (open or not)
  for (const listing of body as SimplifyListing[]) {
    // one listing that can't be read is skipped on its own (see greenhouse.ts)
    try {
      if (!listing || typeof listing.id !== 'string' || typeof listing.title !== 'string' || typeof listing.company_name !== 'string') continue;
      readable++;
      // closed or hidden listings, and anything missing what our table needs
      if (listing.active !== true || listing.is_visible === false || !isWebLink(listing.url)) continue;
      if (onlyForGradStudents(listing.degrees)) continue;
      jobs.push(toImportedJob(listing));
    } catch {
      console.error('simplify: skipped one listing that couldn\'t be read');
    }
  }
  // an empty list, or one where most rows can't be read, probably means the file changed shape
  // (or a bad update), not that every internship is gone: say it failed, so nothing gets closed
  if (readable === 0 || readable < body.length / 2) {
    console.error(`simplify failed: only ${readable} of ${body.length} listings could be read`);
    return { jobs: [], allFetchesWorked: false };
  }
  return { jobs, allFetchesWorked: true };
}

function toImportedJob(listing: SimplifyListing): ImportedJob {
  const places = (listing.locations ?? []).filter((l) => typeof l === 'string' && l.trim() !== '').map((l) => l.trim());
  // at most 3 places, then "+5 more", like mergeSimilarJobs does (shared.ts)
  const location = places.length === 0 ? null : places.slice(0, 3).join(' · ') + (places.length > 3 ? ` +${places.length - 3} more` : '');
  const terms = (listing.terms ?? []).filter((t) => typeof t === 'string' && t !== 'N/A');
  // there's no description, so this says what the list knows (and the matching uses it)
  const about = [
    listing.category ? `Listed under ${listing.category} on the SimplifyJobs internship list.` : 'Listed on the SimplifyJobs internship list.',
    terms.length > 0 ? `Term: ${terms.join(', ')}.` : '',
    places.length > 3 ? `Locations: ${places.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  return {
    source: 'simplify',
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
    requirements: [],
    apply_url: listing.url,
    posted_at: typeof listing.date_posted === 'number' ? toTime(listing.date_posted * 1000) : null,
  };
}
