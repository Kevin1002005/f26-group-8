// things every job source file shares: the row shape, plus small helpers
// for fetching, picking out intern jobs, and cleaning up text.


// one row for the jobs table (backend/sql/jobs.sql), built from an outside site's job.
// every field is required (use null when the site doesn't say). that way each source file
// has to decide about every column, AND every row has the same keys: when many rows are
// saved at once, Supabase fills a key that's missing from one row with null.
export type ImportedJob = {
  source: 'greenhouse' | 'lever' | 'usajobs' | 'adzuna' | 'jsearch' | 'simplify' | 'ashby' | 'smartrecruiters' | 'workable'
    | 'co0oper' | 'vanshb03' | 'speedyapply' | 'nsf' | 'precollege' | 'web';
  external_id: string;          // the job's id on the outside site
  title: string;
  organization: string;
  type: 'internship' | 'co-op' | 'research' | 'program';
  level: 'high-school' | 'college' | 'both';
  location: string | null;
  setting: 'remote' | 'hybrid' | 'on-site' | null;
  paid: boolean | null;         // null = the site didn't say (not the same as unpaid)
  pay_text: string | null;
  deadline: string | null;      // YYYY-MM-DD
  description: string | null;   // plain text, never HTML
  requirements: string[];
  apply_url: string;            // the original posting, so students apply on the real site
  posted_at: string | null;     // when the company posted it (an ISO time, from toTime), or null
};

// what each source's fetch function hands back to import-jobs.ts.
// allFetchesWorked is false if any company's call failed. Then the importer won't close
// that source's old jobs: a job might only be missing because its company's call failed.
// keepOpen is for a source that reads many company boards: it says if one of our saved jobs comes
// from a board whose call failed this time. Those jobs stay open (they might only be missing
// because of that call), and the importer still closes the source's other old jobs as usual
export type SourceResult = {
  jobs: ImportedJob[];
  allFetchesWorked: boolean;
  keepOpen?: (job: { external_id: string; apply_url: string | null }) => boolean;
};

// What a source that reads many company boards hands back (greenhouse.ts, lever.ts, ...).
// failed: the boards whose call failed or was only partly read, and boardOf: which board one of
// our saved jobs came from. With hundreds of boards, a failure or two is normal, so only those
// boards' old jobs stay open. If more than half failed, the site itself is probably down: then the
// whole source counts as failed, and nothing gets closed
export function boardsResult(
  source: string, jobs: ImportedJob[], boardCount: number, failed: Set<string>,
  boardOf: (job: { external_id: string; apply_url: string | null }) => string,
): SourceResult {
  if (failed.size > 0) console.log(`${source}: ${failed.size} of ${boardCount} boards failed, so their old jobs stay open`);
  const failedNames = new Set([...failed].map((board) => board.toLowerCase()));
  return {
    jobs,
    allFetchesWorked: failed.size <= boardCount / 2,
    keepOpen: failed.size > 0 ? (job) => failedNames.has(boardOf(job).toLowerCase()) : undefined,
  };
}
// the board at the start of an external_id ("stripe:123" -> "stripe"): Greenhouse, Ashby,
// SmartRecruiters, and Workable all write their ids that way
export const boardInId = (job: { external_id: string }) => job.external_id.slice(0, job.external_id.indexOf(':'));


// The biggest answer we read from a job site: 40 MB. The importer runs inside the same server
// as the website (Refresh), so one giant file from a list could otherwise use up all its memory
// and crash it for everyone. (SimplifyJobs' list, the biggest, is about 13 MB today)
const MOST_BYTES = 40 * 1024 * 1024;

// Reads an answer's body as text, but stops (and throws) once it passes most bytes
// (MOST_BYTES unless the caller wants less: web-search.ts reads Gemini's answer with a 5 MB limit)
export async function readCapped(res: Response, most = MOST_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > most) throw new Error('the answer is too big');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > most) {
      await reader.cancel();
      throw new Error('the answer is too big');
    }
    parts.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}

// GET a URL and read the JSON. Throws if the site is down, too slow, answers with an
// error code, or sends more than MOST_BYTES, so the caller's try/catch counts it as a failed fetch.
// waitMs: how long to wait before giving up (web search waits less, so a student isn't left waiting)
export async function fetchJson(url: string, headers: Record<string, string> = {}, waitMs = 60_000): Promise<unknown> {
  // give up after 60 seconds so one slow site can't hang the whole import.
  // (20 seconds was too short: big boards like Veeva's, with 800+ jobs, take a while to download)
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(waitMs) });
  if (!res.ok) {
    // only the status code, not the URL: some URLs (Adzuna's) have our API key in them,
    // and this message gets printed in the terminal
    throw new Error(`HTTP ${res.status}`);
  }
  return JSON.parse(await readCapped(res));
}

// the same as fetchJson, for a page that isn't JSON (speedyapply's README)
export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCapped(res);
}

// true when fetchJson failed because the page isn't there any more: 404 (Not Found) or 410 (Gone).
// For a company board, that means the company closed it or moved to another hiring site. That's
// different from the site being down: the company really has no jobs there now, so the importer
// can close its old ones, instead of counting a failed fetch (which closes nothing for the whole source)
export function isGone(err: unknown): boolean {
  return err instanceof Error && /^HTTP (404|410)$/.test(err.message);
}

// Runs work(item) for every item, with at most `limit` running at the same time, like a few
// checkout lines instead of one. Hundreds of company boards one at a time took many minutes; all
// at once would flood the sites. work() must catch its own errors (each source's loop already does)
export async function atMostAtOnce<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  // each "line" takes the next item until none are left
  const line = async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, line));
}

// How many company boards each hiring site's source reads at the same time
export const BOARDS_AT_ONCE = 4;


// matches "intern", "interns", "internship(s)", "co-op(s)", "coop(s)".
// \b means "edge of a word", so "internal" and "international" don't count.
const INTERN_WORDS = /\b(intern|interns|internships?|co-?ops?)\b/i;
const CO_OP_WORDS = /\bco-?ops?\b/i;

// plans.md JB2a: keep only intern/co-op titles
export function isInternTitle(title: string): boolean {
  return INTERN_WORDS.test(title);
}

// "Software Engineer Co-op" -> 'co-op', everything else we keep -> 'internship'
export function guessType(title: string): 'internship' | 'co-op' {
  return CO_OP_WORDS.test(title) ? 'co-op' : 'internship';
}

// some sites put "Remote" or "Hybrid" inside the location name instead of a separate field.
// if it says neither, we leave it null: not saying isn't the same as on-site.
export function guessSetting(location: string | null): ImportedJob['setting'] {
  if (!location) return null;
  if (/\bremote\b/i.test(location)) return 'remote';
  if (/\bhybrid\b/i.test(location)) return 'hybrid';
  return null;
}

// "2026-12-01T23:59:59Z" -> "2026-12-01". Anything that doesn't start with a real date -> null.
// the shape alone isn't enough: "2026-02-30" looks like a date but Postgres refuses it,
// and one refused row makes the whole source's save fail. JavaScript rolls a day that
// doesn't exist over into the next month (2026-02-30 -> March 2), so a real day is one
// that comes back as the same text. (Postgres has no year 0, so that's out too.)
export function toDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match || match[0].startsWith('0000')) return null;
  const day = new Date(`${match[0]}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(match[0]) ? match[0] : null;
}

// when the company posted a job, as an ISO time like "2026-09-09T14:50:29.000Z", or null.
// Greenhouse and JSearch send text ("2026-09-09T10:50:29-04:00"); Lever sends a number
// (milliseconds since 1970). Anything that isn't a real time, or is far off (before 2000, or
// more than a day from now), becomes null, so one odd value can't stop the save or make
// the Opportunities page say "Posted in 2099"
export function toTime(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const time = new Date(value);
  const ms = time.getTime();
  if (Number.isNaN(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.now() + 24 * 60 * 60 * 1000) return null;
  return time.toISOString();
}


// &amp; -> &, &lt; -> <, &#39; -> ' and so on.
// a name that isn't in this list stays as raw text (students would see "&mdash;"),
// so it has the ones job posts actually use, like the dash in "$50&mdash;$60".
// (no toLowerCase when looking these up: &Eacute; and &eacute; are different letters)
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™', eacute: 'é', rarr: '→',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const n = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // leave it as-is unless it's a real character the database can store.
      // 0 is not allowed in Postgres text, 0xD800-0xDFFF is half of an emoji's two-part code,
      // and past 0x10FFFF isn't a character at all (fromCodePoint would crash).
      // one bad character would make the whole source's save fail, so this matters.
      const isRealCharacter = n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff);
      return isRealCharacter ? String.fromCodePoint(n) : whole;
    }
    // Object.hasOwn: only names written in the list above. A plain NAMED_ENTITIES[code] also
    // finds what every JavaScript object has built in, so "&constructor;" would turn into
    // the text "function Object() { [native code] }"
    return Object.hasOwn(NAMED_ENTITIES, code) ? NAMED_ENTITIES[code] : whole;
  });
}

// turns a job description's HTML into plain text.
// the text can still CONTAIN things that look like tags: a posting that writes
// "&lt;img ...&gt;" decodes to the words "<img ...>". that's harmless only because the
// frontend shows descriptions as text ({job.description} in React), never as HTML.
// so never put a description through dangerouslySetInnerHTML
// (plans.md: "never render description as HTML").
//
// escaped: true is for Greenhouse, which sends "&lt;p&gt;" instead of "<p>", so we decode
// once first to get real tags back. Lever sends real tags, and decoding first there would
// turn a real "&lt;" in the text (like "GPA &lt; 3.0") into "<", which the tag remover
// below would then delete, along with everything up to the next ">".
export function htmlToText(html: string | null | undefined, { escaped = false } = {}): string | null {
  if (!html) return null;

  const tagged = escaped ? decodeEntities(html) : html;

  // [^<>]* (not [^>]*) means "a tag can't contain another <". with [^>]*, every "<" that
  // never gets its ">" makes the search read all the way to the end of the text, so a
  // posting with thousands of stray "<" took seconds to minutes. now each "<" stops at the next one
  const text = decodeEntities(
    tagged
      // start a new line wherever a paragraph, line, list item or heading ends
      .replace(/<(br|\/p|li|\/li|\/h[1-6]|\/div)\b[^<>]*>/gi, '\n')
      // then drop every tag that's left
      .replace(/<[^<>]*>/g, '')
  )
    .replace(/[ \t]+/g, ' ')     // squash runs of spaces
    .replace(/ *\n */g, '\n')    // no spaces at the start or end of lines
    .replace(/\n{3,}/g, '\n\n')  // at most one empty line in a row
    .trim();

  return text || null;
}

// true only for a normal web link. jobs.sql only allows http:// and https:// in apply_url,
// so a job without one is skipped instead of making the whole save fail.
// At most 500 letters too: a student's tracker keeps a job's link, and the tracker only takes
// links up to 500 (applications.sql), so a longer one would make "Save" fail for that job.
// (A real job link is far shorter; one that long is almost always tracking junk, or a broken list)
export const MOST_LINK_LETTERS = 500;
export function isWebLink(url: unknown): url is string {
  return typeof url === 'string' && url.length <= MOST_LINK_LETTERS && /^https?:\/\//i.test(url);
}

// "<ul><li>Python</li><li>SQL</li></ul>" -> ["Python", "SQL"]
export function listItems(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .split(/<\/li>/i)
    .map((part) => htmlToText(part))
    .filter((item): item is string => item !== null);
}

// Postgres refuses two kinds of characters in text: NUL (\u0000), and half of an emoji's
// two-part code (a "lone surrogate", left behind when a site cuts text in the middle of
// an emoji). ONE of them anywhere makes the whole save fail, so every job from every
// company of that source would go missing, not just the odd one.
// this removes NUL and turns a lone half into "�". (decodeEntities above already refuses
// to make them out of &#0; and &#xD800;, but a site can also send them as raw characters.)
export function storableText(text: string): string {
  return text.replace(/\u0000/g, '').toWellFormed();
}

// The longest each field can be (letters). A site's text past these is cut off, so one odd
// listing can't make every Opportunities load (and every AI request) huge.
// (external_id isn't cut: two long ids that start the same would become one job. The importer
// skips a job whose id is too long instead, see import-runner.ts)
const MOST_LETTERS = { title: 300, organization: 200, location: 400, pay_text: 200, description: 30000, requirement: 1000 };
const MOST_REQUIREMENTS = 50;
const cut = (text: string, most: number) => (text.length > most ? text.slice(0, most).toWellFormed() : text);

// storableText for every text field of one row, plus the length limits above
export function storableJob(job: ImportedJob): ImportedJob {
  const clean = (text: string | null, most: number) => (text === null ? null : cut(storableText(text), most));
  return {
    ...job,
    external_id: storableText(job.external_id),
    title: cut(storableText(job.title), MOST_LETTERS.title),
    organization: cut(storableText(job.organization), MOST_LETTERS.organization),
    location: clean(job.location, MOST_LETTERS.location),
    pay_text: clean(job.pay_text, MOST_LETTERS.pay_text),
    description: clean(job.description, MOST_LETTERS.description),
    requirements: job.requirements.slice(0, MOST_REQUIREMENTS).map((r) => cut(storableText(r), MOST_LETTERS.requirement)),
    apply_url: storableText(job.apply_url),
  };
}

// ---------- who the job is for (only high schoolers and college undergrads) ----------

// titles that mean the job is for grad students, PhDs, or people who already graduated.
// \b is "edge of a word", so "undergraduate" does NOT match "graduate"
// (there's no word edge between the r and the g).
// "master's" needs the s, so "Scrum Master Intern" still counts.
// jobs.sql step 5 has the SAME list as a database rule. If you change one, change both:
// if the database rule catches a job this one missed, the whole batch fails to save.
export const NOT_FOR_OUR_STUDENTS = /\b(ph\.?\s?d|doctoral|postdoctoral|post-?docs?|master['’]?s|mba|graduate|grad)\b/i;

// descriptions that only accept grad students, like "currently pursuing a PhD" or
// "Master's students only". A description that says "Bachelor's, Master's, or PhD"
// still passes, because undergrads can apply to that one.
const GRAD_ONLY_DESCRIPTION = [
  /\b(currently|actively)\s+(enrolled|pursuing|working towards?)\s+(in\s+)?(an?\s+)?(ph\.?\s?d|doctoral|master['’]?s|mba|graduate)\b/i,
  /\b(ph\.?\s?d|doctoral|master['’]?s|mba|graduate)\s+students\s+only\b/i,
];

// titles for law, pharmacy, or nursing-graduate students: an undergrad or a high schooler can't
// get these. "Legal Intern" is a law-school internship (the ACLU's and companies' alike: checked
// 2026-11-17, all 28 open ones), "Law Clerk (J.D. Students)" and "(LL.M. Students)" too, and a
// "Pharmacy Intern" is a licensed role for pharmacy-school students. Business jobs that only
// mention pharmacy ("Pharmacy Aggregation Intern") still pass.
// (This one is only checked by the importer, not by a database rule like the list above)
// (LL.M. needs its dots: plain "LLM" is a large language model, as in "LLM Research Intern")
export const PROFESSIONAL_SCHOOL_TITLE = /\b(legal intern(ship)?s?|law clerks?|j\.?d\.? students?|ll\.m\b\.?|pharmacy intern(ship)?s?|pharm\.?\s?d|nurse practitioner)\b/i;

// true if high schoolers or college undergrads can apply
export function isForOurStudents(title: string, description: string | null): boolean {
  if (NOT_FOR_OUR_STUDENTS.test(title)) return false;
  if (PROFESSIONAL_SCHOOL_TITLE.test(title)) return false;
  if (description && GRAD_ONLY_DESCRIPTION.some((rule) => rule.test(description))) return false;
  return true;
}

// 'high-school' if the post only mentions high school, 'both' if it mentions high school
// AND college, otherwise 'college' (most internships are for college students)
// Some posts say "high school" without being for high schoolers: "2 years of post-high school
// study" (that's college), or "a high school diploma or GED" (they have to have FINISHED high
// school). Those are taken out first, so they don't make a college job look open to high schoolers
// (2026-11-17: 15 of the 71 jobs marked for high schoolers were like this)
const NOT_FOR_HIGH_SCHOOLERS = /\bpost[\s-]?high[\s-]?school\b|\bhigh[\s-]?school (diploma|graduates?|education|equivalen\w*|degree)\b|\b(ged|hiset)\b/gi;

export function guessLevel(title: string, description: string | null): ImportedJob['level'] {
  const text = `${title} ${description ?? ''}`.replace(NOT_FOR_HIGH_SCHOOLERS, ' ');
  const highSchool = /\bhigh[\s-]?school(ers?)?\b/i.test(text);
  const college = /\b(college|undergrad(uate)?s?|university|bachelor['’]?s)\b/i.test(text);
  if (highSchool && college) return 'both';
  if (highSchool) return 'high-school';
  return 'college';
}


// ---------- is it in the US? ----------
// for worldwide lists (CO0Oper's): ScoutSearch is for students in the US, so we keep jobs in
// the US or remote. "New York, NY", "Austin, Texas", "Remote (USA)", "US Remote", and just
// "Remote" count. "Remote - Australia", "London, UK", "Berlin, DE", and "Bengaluru" don't.
// A place we can't tell is left out.

// a US state, a big US city, or the country by name. (?<![a-z]) and (?![a-z]) mean "not inside a
// longer word", so "us" counts in "Remote (US)" but not in "Campus"
const US_PLACES = new RegExp('(?<![a-z])(' + [
  'united states', 'usa', 'u\\.s\\.?a?\\.?', 'us', 'd\\.c\\.',
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'hawaii',
  'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts',
  'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming',
  'san francisco', 'bay area', 'silicon valley', 'seattle', 'boston', 'chicago', 'austin', 'los angeles', 'nyc',
  'atlanta', 'denver', 'pittsburgh', 'philadelphia', 'miami', 'dallas', 'houston', 'san diego', 'san jose',
  'palo alto', 'mountain view', 'menlo park', 'sunnyvale',
].join('|') + ')(?![a-z])', 'i');

// other countries and their big cities, so "Berlin, DE" (Germany) isn't read as Delaware
const OTHER_PLACES = new RegExp('(?<![a-z])(' + [
  'canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'waterloo', 'mexico', 'brazil', 'colombia', 'bogota', 'bogotá',
  'argentina', 'chile', 'united kingdom', 'uk', 'england', 'scotland', 'london', 'ireland', 'dublin', 'germany', 'berlin',
  'munich', 'france', 'paris', 'spain', 'madrid', 'barcelona', 'portugal', 'lisbon', 'italy', 'milan', 'rome',
  'netherlands', 'amsterdam', 'belgium', 'switzerland', 'zurich', 'austria', 'vienna', 'sweden', 'stockholm', 'norway',
  'denmark', 'finland', 'poland', 'warsaw', 'czech', 'prague', 'romania', 'greece', 'turkey', 'istanbul', 'israel',
  'tel aviv', 'uae', 'dubai', 'saudi', 'egypt', 'kenya', 'nigeria', 'south africa', 'india', 'bengaluru', 'bangalore',
  'hyderabad', 'pune', 'chennai', 'mumbai', 'delhi', 'gurgaon', 'gurugram', 'noida', 'singapore', 'malaysia',
  'kuala lumpur', 'indonesia', 'jakarta', 'philippines', 'manila', 'thailand', 'bangkok', 'vietnam', 'china',
  'shanghai', 'beijing', 'shenzhen', 'hong kong', 'taiwan', 'taipei', 'japan', 'tokyo', 'korea', 'seoul',
  'australia', 'sydney', 'melbourne', 'new zealand', 'europe', 'emea', 'apac', 'latam',
  // more cities that come with a two-letter code that's also a US state's ("Haifa, IL", "Hamburg, DE")
  'mississauga', 'quebec', 'calgary', 'edmonton', 'winnipeg', 'halifax', 'ontario', 'british columbia', 'alberta',
  'hamburg', 'frankfurt', 'cologne', 'stuttgart', 'dusseldorf', 'haifa', 'jerusalem', 'kolkata', 'ahmedabad', 'kochi',
  'medellin', 'casablanca', 'morocco', 'lima', 'peru', 'monterrey', 'guadalajara', 'krakow', 'budapest', 'hungary',
  'kyiv', 'ukraine', 'bucharest', 'sofia', 'bulgaria', 'belgrade', 'serbia', 'zagreb', 'croatia', 'estonia', 'latvia',
  'lithuania', 'edinburgh', 'manchester', 'glasgow', 'belfast', 'cork', 'lyon', 'toulouse', 'valencia', 'porto',
  'brussels', 'copenhagen', 'oslo', 'helsinki', 'athens', 'cape town', 'johannesburg', 'accra', 'ghana',
  // added 2026-11-17, from the company boards (find-boards.ts). Not names that are also US towns
  // (Lebanon, Cairo, Panama City, Georgia...)
  'united arab emirates', 'abu dhabi', 'qatar', 'doha', 'riyadh', 'pakistan', 'karachi', 'lahore', 'bangladesh',
  'dhaka', 'sri lanka', 'nepal', 'cyprus', 'luxembourg', 'slovakia', 'slovenia', 'iceland', 'nairobi', 'lagos',
  'uganda', 'rwanda', 'ethiopia', 'hanoi', 'ho chi minh', 'osaka', 'kyoto', 'auckland', 'brisbane', 'buenos aires',
  'sao paulo', 'são paulo', 'rio de janeiro', 'montevideo', 'uruguay', 'costa rica', 'guatemala',
].join('|') + ')(?![a-z])', 'i');

// Canada's provinces, written the same way ("Mississauga, ON"): none of them is a US state
const CANADA_CODES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

// a two-letter US state after a comma or space, in capitals: "Boston, MA", "Kansas City, MO (HQ)"
const US_STATE_CODES = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
  'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR']);
function hasCode(location: string, codes: Set<string>): boolean {
  return [...location.matchAll(/[,\s]\s*([A-Z]{2})(?![A-Za-z])/g)].some((match) => codes.has(match[1]!));
}

export function isInUS(location: string | null): boolean {
  if (!location) return false;
  // "Montréal" -> "Montreal", so the accent doesn't hide a city from the lists above.
  // Runs of spaces become one space, and very long text is cut: hasCode's pattern got slow
  // (each space tried again from every earlier one) on a location with thousands of spaces
  const place = location.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').slice(0, 400);
  // "Mississauga, ON, CA" or "Austin, TX, US": two codes at the end, and the last is the country
  const country = /,\s*[A-Z]{2}\s*,\s*([A-Z]{2})\s*$/.exec(place)?.[1];
  if (country) return country === 'US';
  if (US_PLACES.test(place)) return true;   // a US place by name (even if another country is listed too)
  if (OTHER_PLACES.test(place) || hasCode(place, CANADA_CODES)) return false;
  if (hasCode(place, US_STATE_CODES)) return true;
  // just "Remote" (or "Anywhere"), with no country
  const words = location.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return ['remote', 'anywhere', 'remote anywhere', 'fully remote'].includes(words);
}

// The other way around, for company boards: true only when the location is clearly NOT in the US
// ("London, UK", "Toronto, ON", "Hong Kong, Hong Kong", "Remote - Canada"). Unlike !isInUS, a
// place we can't tell ("Multiple Locations", "Hybrid", a small US town) or no location counts as
// maybe in the US, and is kept: a company board's jobs are real, we only drop the foreign ones.
// A location naming the US AND another country ("London; New York, NY") is kept too
export function isOutsideUS(location: string | null): boolean {
  if (!location) return false;
  const place = location.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').slice(0, 400);
  const country = /,\s*[A-Z]{2}\s*,\s*([A-Z]{2})\s*$/.exec(place)?.[1];
  if (country) return country !== 'US';
  if (US_PLACES.test(place)) return false;
  return OTHER_PLACES.test(place) || hasCode(place, CANADA_CODES);
}


// ---------- merging similar jobs ----------

// "Software Engineer Intern - Summer 2027" and "Software Engineer Intern (Summer 2027)"
// both become "software engineer intern": lowercase, no years, no seasons, no punctuation
function simplifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')                              // "master's" -> "masters"
    .replace(/\b20\d\d\b/g, ' ')                        // years
    .replace(/\b(summer|fall|autumn|spring|winter)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')                        // punctuation -> spaces
    .trim();
}

// "Stripe, Inc." and "stripe" are the same company
function simplifyOrganization(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// two jobs are "the same job" if they're at the same company with the same simplified title.
// location is left out on purpose: companies often post one internship once per city.
export function jobKey(job: { organization: string; title: string }): string {
  return `${simplifyOrganization(job.organization)}|${simplifyTitle(job.title)}`;
}

// the bits on the end of a link that only say where you came from, not which job it is
const TRACKING_PARAMS = /^(utm_.*|gh_src|source|ref|referrer|lever-source.*|lever-origin|trk)$/i;

// "https://Boards.Greenhouse.io/stripe/jobs/123?gh_src=abc" -> "boards.greenhouse.io/stripe/jobs/123"
// so the same posting reached through two sites counts as one link.
// The rest of the ?... part is kept (in a set order): some sites put the job's id there, like
// "...recruitment.html?cid=5&jobId=111", and without it every job on that site would look like one
export function simplifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const kept = [...u.searchParams].filter(([name]) => !TRACKING_PARAMS.test(name)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = kept.length > 0 ? '?' + new URLSearchParams(kept).toString() : '';
    // the slashes on the end are taken off one by one (a pattern like /\/+$/ gets very slow on a
    // link with thousands of slashes in a row, and this runs for every saved link on every import)
    let path = u.host + u.pathname;
    let end = path.length;
    while (end > 0 && path[end - 1] === '/') end--;
    path = path.slice(0, end);
    return (path + query).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// turns many "same job" rows into one row each.
// the kept row is the one with the smallest external_id, so the SAME row wins every run.
// (if it changed, the importer would close the old row and add a new one with a new id,
// and links to the old job would break.)
// its location becomes every city in the group, like "Boston, MA · New York, NY +2 more".
export function mergeSimilarJobs(jobs: ImportedJob[]): ImportedJob[] {
  const groups = new Map<string, ImportedJob[]>();
  for (const job of jobs) {
    const key = jobKey(job);
    const group = groups.get(key);
    if (group) group.push(job);
    else groups.set(key, [job]);
  }

  return [...groups.values()].map((group) => {
    group.sort((a, b) => (a.external_id < b.external_id ? -1 : 1));
    const kept = group[0]!;   // "!" because every group has at least one job
    if (group.length === 1) return kept;

    const locations = [...new Set(group.map((job) => job.location).filter((l): l is string => !!l))];
    const shown = locations.slice(0, 3).join(' · ');
    const settings = new Set(group.map((job) => job.setting));

    return {
      ...kept,
      location: locations.length > 3 ? `${shown} +${locations.length - 3} more` : shown || null,
      // only keep remote/hybrid/on-site if every copy agrees
      setting: settings.size === 1 ? kept.setting : null,
      // fill in anything the kept copy is missing from the other copies
      paid: group.some((job) => job.paid) ? true : kept.paid,
      pay_text: group.find((job) => job.pay_text)?.pay_text ?? null,
      deadline: group.find((job) => job.deadline)?.deadline ?? null,
      description: group.find((job) => job.description)?.description ?? null,
      // the earliest copy is when the job was first posted. ISO times in the same
      // format sort by text, so .sort() puts the earliest first
      posted_at: group.map((job) => job.posted_at).filter((t): t is string => !!t).sort()[0] ?? null,
    };
  });
}
