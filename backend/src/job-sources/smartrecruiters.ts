// SmartRecruiters: a hiring site many big employers use, including lots outside tech (media,
// retail, food service, manufacturing). Each company's postings are public (no key).
// docs: https://developers.smartrecruiters.com/docs/posting-api
// The list doesn't include descriptions (that would be one more call per job), so best fit
// uses the title, company, and location.
import {
  fetchJson, isInternTitle, guessType, isWebLink, toTime,
  type ImportedJob, type SourceResult,
} from './shared.js';

// company ids (the part after jobs.smartrecruiters.com/), checked 2026-11-16.
// to add one, add its id here (a wrong id just finds no jobs)
const COMPANIES = ['BoschGroup', 'NBCUniversal3', 'Equinox', 'Experian', 'Sodexo', 'WesternDigital', 'Ubisoft2'];
// at most 5 pages of 100 per company, so one huge company can't slow the import down
const MOST_PAGES = 5;

// only the fields we use (the real response has more)
type SmartPosting = {
  id: string;
  name: string;
  releasedDate: string | null;
  company?: { name?: string } | null;
  location?: { city?: string; region?: string; country?: string; remote?: boolean } | null;
  experienceLevel?: { id?: string } | null;       // 'internship' for intern roles
};

export async function fetchSmartRecruiters(): Promise<SourceResult> {
  const jobs: ImportedJob[] = [];
  let allFetchesWorked = true;
  for (const company of COMPANIES) {
    try {
      for (let page = 0; page < MOST_PAGES; page++) {
        const body = (await fetchJson(`https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100&offset=${page * 100}`)) as { content: SmartPosting[] };
        const list = body.content ?? [];
        for (const posting of list) {
          try {
            if (typeof posting.id !== 'string' || typeof posting.name !== 'string') continue;
            if (posting.experienceLevel?.id === 'internship' || isInternTitle(posting.name)) jobs.push(toImportedJob(posting, company));
          } catch {
            console.error(`smartrecruiters ${company}: skipped one job that couldn't be read`);
          }
        }
        if (list.length < 100) break;
      }
    } catch (err) {
      console.error(`smartrecruiters ${company} failed:`, err);
      allFetchesWorked = false;
    }
  }
  return { jobs, allFetchesWorked };
}

function toImportedJob(posting: SmartPosting, company: string): ImportedJob {
  const where = posting.location ?? {};
  const location = [where.city, where.region, where.country?.toUpperCase()].filter((p) => typeof p === 'string' && p.trim() !== '').join(', ') || null;
  const url = `https://jobs.smartrecruiters.com/${company}/${posting.id}`;
  return {
    source: 'smartrecruiters',
    external_id: `${company}:${posting.id}`,
    title: posting.name.trim(),
    organization: posting.company?.name?.trim() || company,
    type: guessType(posting.name),
    level: 'college',
    location,
    setting: where.remote ? 'remote' : null,
    paid: null,
    pay_text: null,
    deadline: null,
    description: null,
    requirements: [],
    apply_url: isWebLink(url) ? url : `https://jobs.smartrecruiters.com/${company}`,
    posted_at: toTime(posting.releasedDate),
  };
}
