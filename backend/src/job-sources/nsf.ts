// NSF ETAP (https://etap.nsf.gov): the National Science Foundation's site where its student
// research programs post their openings. Most are REUs (Research Experiences for Undergraduates:
// paid summer research at a university), plus research abroad (IRES), scholarships, and a few
// programs for high schoolers. Its public search gives every opportunity that's open right now
// as JSON, 100 a page. No key needed.
// Programs only for grad students, postdocs, or teachers are left out (applicantTypes below).
import { fetchJson, htmlToText, isWebLink, toDate, toTime, type ImportedJob, type SourceResult } from './shared.js';

const searchUrl = (page: number) =>
  `https://etap.nsf.gov/api/edge/awards/public/opportunities/search?s=&page=${page}&numberPerPage=100`;
// at most this many pages (2,000 opportunities), in case the site ever says something odd
const MOST_PAGES = 20;

// only the fields we use (the real answer has many more)
type EtapAddress = { name?: string; city?: string; state?: string; country?: string };
type EtapOpportunity = {
  award?: { id?: number; institutionName?: string };
  opportunity?: {
    id?: number;
    awardId?: number;
    programType?: string;          // "REU", "IRES", "S_STEM", ...
    name?: string;
    url?: string | null;           // the program's own site
    startDate?: string;            // when the program itself starts, "05/31/2027"
    endDate?: string;
    programOverview?: string;      // HTML
    eligibility?: string;          // HTML
    researchTopics?: string;
    addresses?: EtapAddress[];
    applicantTypes?: string[];     // "UNDERGRADUATE", "HIGH_SCHOOL", "GRADUATE", "TEACHER", ...
    fieldOfStudies?: string[];     // "LIFE_SCIENCES", "ENGINEERING", ...
    eligibilityReqs?: { eligibilityText?: string }[];
  };
  applicationRequirements?: { startDate?: string; endDate?: string };   // when applications open and close
};
type EtapPage = { response?: { body?: { totalPage?: number; foundOpportunities?: EtapOpportunity[] } } };

// "11/23/2026" -> "2026-11-23" (ETAP writes month/day/year). null if it isn't a real day
function etapDay(value: unknown): string | null {
  const match = typeof value === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim()) : null;
  return match ? toDate(`${match[3]}-${match[1]}-${match[2]}`) : null;
}

// "2027-05-31" -> "May 31, 2027"
function dayInWords(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// "LOUISVILLE" -> "Louisville" (ETAP writes some cities in capitals)
function capitalized(text: string): string {
  return text === text.toUpperCase() ? text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase()) : text;
}

export async function fetchNsf(): Promise<SourceResult> {
  const found: EtapOpportunity[] = [];
  let allFetchesWorked = true;
  let pages: number | null = null;   // how many pages there are (page 1 says)
  for (let page = 1; page <= (pages ?? 1) && page <= MOST_PAGES; page++) {
    try {
      const body = (await fetchJson(searchUrl(page))) as EtapPage;
      const result = body?.response?.body;
      if (!result || !Array.isArray(result.foundOpportunities)) throw new Error('the answer didn\'t have a list');
      found.push(...result.foundOpportunities);
      if (page === 1 && typeof result.totalPage === 'number') pages = result.totalPage;
    } catch (err) {
      console.error(`nsf: page ${page} failed:`, err);
      allFetchesWorked = false;
      break;   // the later pages would be missing anyway
    }
  }
  // if we didn't get every page, some open programs are missing from the list, and the importer
  // would close them. So it only counts as working if page 1 said how many pages there are, we
  // read all of them, and there was at least one program (NSF always has some open)
  if (allFetchesWorked && (pages === null || pages > MOST_PAGES || found.length === 0)) {
    console.error(`nsf failed: couldn't read every page (it says ${pages ?? 'nothing about how many'} pages; we read at most ${MOST_PAGES})`);
    allFetchesWorked = false;
  }

  const jobs: ImportedJob[] = [];
  for (const item of found) {
    // one opportunity that can't be read is skipped on its own (see greenhouse.ts)
    try {
      const job = toImportedJob(item);
      if (job) jobs.push(job);
    } catch {
      console.error('nsf: skipped one opportunity that couldn\'t be read');
    }
  }
  return { jobs, allFetchesWorked };
}

function toImportedJob(item: EtapOpportunity): ImportedJob | null {
  const o = item.opportunity;
  if (!o || typeof o.id !== 'number' || typeof o.name !== 'string' || o.name.trim() === '') return null;

  // who can apply: we keep it only if undergrads or high schoolers can
  const who = Array.isArray(o.applicantTypes) ? o.applicantTypes : [];
  const undergrads = who.includes('UNDERGRADUATE');
  const highSchool = who.includes('HIGH_SCHOOL');
  if (!undergrads && !highSchool) return null;

  // the link: the program's own site, or else its page on ETAP (where students apply)
  const link = isWebLink(o.url) ? o.url.trim() : `https://etap.nsf.gov/award/${o.awardId ?? item.award?.id}/opportunity/${o.id}`;

  // where: up to 3 places, like "Louisville, KY · Hamburg, Germany"
  const places = (o.addresses ?? []).map((a) => {
    const city = capitalized((a.city ?? '').trim());
    const country = (a.country ?? '').trim();
    const inUs = country === '' || country === 'USA';
    const after = inUs ? (a.state ?? '').trim() : capitalized(country.replace(/_/g, ' '));
    return [city, after].filter(Boolean).join(', ');
  }).filter(Boolean);
  const uniquePlaces = [...new Set(places)];
  const location = uniquePlaces.length === 0 ? null : uniquePlaces.slice(0, 3).join(' · ') + (uniquePlaces.length > 3 ? ` +${uniquePlaces.length - 3} more` : '');

  const overview = htmlToText(o.programOverview);
  const eligibility = htmlToText(o.eligibility);
  // REUs pay their students a stipend (NSF requires it). For the others, only if the post says so
  const paid = o.programType === 'REU' || /\bstipends?\b/i.test(`${overview ?? ''} ${eligibility ?? ''}`) ? true : null;
  const programStart = etapDay(o.startDate);
  const programEnd = etapDay(o.endDate);
  // "LIFE_SCIENCES" -> "life sciences"
  const fields = (o.fieldOfStudies ?? []).filter((f) => typeof f === 'string').map((f) => f.toLowerCase().replace(/_/g, ' '));

  const description = [
    overview,
    eligibility ? `Who can apply: ${eligibility}` : '',
    o.researchTopics ? `Research topics: ${o.researchTopics.trim()}` : '',
    fields.length > 0 ? `Fields: ${fields.join(', ')}` : '',
    programStart && programEnd ? `Dates: ${dayInWords(programStart)} to ${dayInWords(programEnd)}` : '',
    'Posted on NSF ETAP, the National Science Foundation\'s site for student research programs.',
  ].filter(Boolean).join('\n\n');

  // when applications opened, at noon (UTC) that day. In the future = null (toTime)
  const opened = etapDay(item.applicationRequirements?.startDate);

  return {
    source: 'nsf',
    external_id: String(o.id),
    title: o.name.trim(),
    organization: (item.award?.institutionName ?? '').trim() || 'National Science Foundation',
    // REUs and research abroad (IRES) are research; scholarships and the rest are programs
    type: o.programType === 'REU' || o.programType === 'IRES' ? 'research' : 'program',
    level: highSchool && undergrads ? 'both' : highSchool ? 'high-school' : 'college',
    location,
    setting: null,             // ETAP doesn't say
    paid,
    pay_text: paid ? 'Stipend' : null,
    deadline: etapDay(item.applicationRequirements?.endDate),
    description,
    requirements: (o.eligibilityReqs ?? []).map((r) => htmlToText(r?.eligibilityText)).filter((r): r is string => r !== null),
    apply_url: link,
    posted_at: opened ? toTime(`${opened}T12:00:00Z`) : null,
  };
}
