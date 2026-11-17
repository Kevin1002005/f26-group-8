// USAJOBS: the U.S. government's jobs site. Its "Students" hiring path lists federal internships
// (the Pathways program) in policy, science, health, business, and more, and many of them take
// high school students too. They're paid.
// docs: https://developer.usajobs.gov/api-reference/get-api-search
//
// needs USAJOBS_API_KEY and USAJOBS_EMAIL in secrets.env (a free key from developer.usajobs.gov;
// USAJOBS_EMAIL must be the email you signed up with, they check it). Without them, it skips itself.
import { fetchJson, guessLevel, htmlToText, isWebLink, toDate, toTime, type ImportedJob, type SourceResult } from './shared.js';

// only the fields we use (the real response has many more)
type UsaJob = {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    OrganizationName?: string;
    DepartmentName?: string;
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    PublicationStartDate?: string;
    ApplicationCloseDate?: string;
    QualificationSummary?: string;
    UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] } };
  };
};

// "PH" = per hour, "PA" = per year (the rest are rare)
const PER: Record<string, string> = { PH: 'per hour', PA: 'per year', PD: 'per day', PW: 'per week', BW: 'every two weeks', PM: 'per month' };

export async function fetchUsaJobs(): Promise<SourceResult> {
  const key = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_EMAIL;
  if (!key || !email) {
    console.log('usajobs: skipped, USAJOBS_API_KEY and USAJOBS_EMAIL are not in secrets.env');
    return { jobs: [], allFetchesWorked: false };
  }
  let body: { SearchResult?: { SearchResultItems?: UsaJob[] } };
  try {
    // HiringPath=student: jobs for current students. 500 is the most one page can hold
    body = (await fetchJson('https://data.usajobs.gov/api/search?HiringPath=student&ResultsPerPage=500', {
      Host: 'data.usajobs.gov',
      'User-Agent': email,
      'Authorization-Key': key,
    })) as typeof body;
  } catch (err) {
    console.error('usajobs failed:', err);
    return { jobs: [], allFetchesWorked: false };
  }
  const items = body?.SearchResult?.SearchResultItems;
  // no list at all means the answer changed shape, not "no jobs"; a full page (500) means there
  // were more than one page holds. Either way the list isn't complete, so nothing gets closed
  if (!Array.isArray(items)) {
    console.error('usajobs failed: the answer had no job list');
    return { jobs: [], allFetchesWorked: false };
  }
  const complete = items.length < 500;
  if (!complete) console.error('usajobs: 500 or more jobs, only the first 500 read, so no old jobs are closed');
  const jobs: ImportedJob[] = [];
  for (const item of items) {
    try {
      const d = item.MatchedObjectDescriptor;
      if (!d || typeof d.PositionTitle !== 'string' || !isWebLink(d.PositionURI)) continue;
      jobs.push(toImportedJob(item));
    } catch {
      console.error('usajobs: skipped one job that couldn\'t be read');
    }
  }
  return { jobs, allFetchesWorked: true };
}

function toImportedJob(item: UsaJob): ImportedJob {
  const d = item.MatchedObjectDescriptor;
  const pay = d.PositionRemuneration?.[0];
  const low = Number(pay?.MinimumRange);
  const high = Number(pay?.MaximumRange);
  const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const payText = Number.isFinite(low) && low > 0
    ? `${money(low)}${Number.isFinite(high) && high > low ? '–' + money(high) : ''} ${PER[pay?.RateIntervalCode ?? ''] ?? ''}`.trim()
    : null;
  const details = d.UserArea?.Details;
  const description = [htmlToText(details?.JobSummary), ...(details?.MajorDuties ?? []).map((m) => htmlToText(m))]
    .filter((t): t is string => !!t).join('\n\n') || null;
  const apply = d.ApplyURI?.find((u) => isWebLink(u)) ?? d.PositionURI;
  // who can apply is often only in the qualifications ("enrolled in high school or college")
  const qualifications = htmlToText(d.QualificationSummary);
  return {
    source: 'usajobs',
    external_id: String(item.MatchedObjectId),
    title: d.PositionTitle.trim(),
    organization: (d.OrganizationName || d.DepartmentName || 'U.S. government').trim(),
    // "Student Trainee (Biology)" is a federal internship
    type: /\bresearch\b/i.test(d.PositionTitle) ? 'research' : 'internship',
    level: guessLevel(d.PositionTitle, [description, qualifications].filter(Boolean).join('\n')),
    location: d.PositionLocationDisplay?.trim() || null,
    setting: /\bremote\b/i.test(d.PositionLocationDisplay ?? '') ? 'remote' : null,
    paid: payText ? true : null,
    pay_text: payText,
    deadline: toDate(d.ApplicationCloseDate),
    description,
    requirements: qualifications ? [qualifications] : [],
    apply_url: apply,
    posted_at: toTime(d.PublicationStartDate),
  };
}
