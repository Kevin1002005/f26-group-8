// things every job source file shares: the row shape, plus small helpers
// for fetching, picking out intern jobs, and cleaning up text.


// one row for the jobs table (backend/sql/jobs.sql), built from an outside site's job.
// every field is required (use null when the site doesn't say). that way each source file
// has to decide about every column, AND every row has the same keys: when many rows are
// saved at once, Supabase fills a key that's missing from one row with null.
export type ImportedJob = {
  source: 'greenhouse' | 'lever' | 'usajobs' | 'adzuna' | 'jsearch';
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
};

// what each source's fetch function hands back to import-jobs.ts.
// allFetchesWorked is false if any company's call failed. Then the importer won't close
// that source's old jobs: a job might only be missing because its company's call failed.
export type SourceResult = {
  jobs: ImportedJob[];
  allFetchesWorked: boolean;
};


// GET a URL and read the JSON. Throws if the site is down, too slow, or answers with an
// error code, so the caller's try/catch counts it as a failed fetch.
export async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  // give up after 60 seconds so one slow site can't hang the whole import.
  // (20 seconds was too short: big boards like Veeva's, with 800+ jobs, take a while to download)
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    // only the status code, not the URL: some URLs (Adzuna's) have our API key in them,
    // and this message gets printed in the terminal
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}


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
export function isWebLink(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
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

// storableText for every text field of one row
export function storableJob(job: ImportedJob): ImportedJob {
  const clean = (text: string | null) => (text === null ? null : storableText(text));
  return {
    ...job,
    external_id: storableText(job.external_id),
    title: storableText(job.title),
    organization: storableText(job.organization),
    location: clean(job.location),
    pay_text: clean(job.pay_text),
    description: clean(job.description),
    requirements: job.requirements.map(storableText),
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

// true if high schoolers or college undergrads can apply
export function isForOurStudents(title: string, description: string | null): boolean {
  if (NOT_FOR_OUR_STUDENTS.test(title)) return false;
  if (description && GRAD_ONLY_DESCRIPTION.some((rule) => rule.test(description))) return false;
  return true;
}

// 'high-school' if the post only mentions high school, 'both' if it mentions high school
// AND college, otherwise 'college' (most internships are for college students)
export function guessLevel(title: string, description: string | null): ImportedJob['level'] {
  const text = `${title} ${description ?? ''}`;
  const highSchool = /\bhigh[\s-]?school(ers?)?\b/i.test(text);
  const college = /\b(college|undergrad(uate)?s?|university|bachelor['’]?s)\b/i.test(text);
  if (highSchool && college) return 'both';
  if (highSchool) return 'high-school';
  return 'college';
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

// "https://Boards.Greenhouse.io/stripe/jobs/123?gh_src=abc" -> "boards.greenhouse.io/stripe/jobs/123"
// so the same posting reached through two sites counts as one link
export function simplifyUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).toLowerCase().replace(/\/+$/, '');
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
    };
  });
}
