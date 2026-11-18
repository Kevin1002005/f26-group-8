// SmartRecruiters: a hiring site many big employers use, including lots outside tech (media,
// retail, food service, manufacturing). Each company's postings are public (no key).
// docs: https://developers.smartrecruiters.com/docs/posting-api
// The list doesn't include descriptions (that would be one more call per job), so best fit
// uses the title, company, and location.
import {
  fetchJson, isInternTitle, guessType, isWebLink, toTime,
  isGone, atMostAtOnce, boardsResult, boardInId, BOARDS_AT_ONCE,
  type ImportedJob, type SourceResult,
} from './shared.js';
import { boardsFor } from './found-boards.js';

// company ids (the part after jobs.smartrecruiters.com/), checked 2026-11-16.
// to add one, add its id here (a wrong id just finds no jobs).
// More are read from found-boards.json (found-boards.ts), which npm run find-boards fills
const COMPANIES = ['BoschGroup', 'NBCUniversal3', 'Equinox', 'Experian', 'Sodexo', 'WesternDigital', 'Ubisoft2'];
// at most 10 pages of 100 per company, so one huge company can't slow the import down.
// (Only its US postings are asked for, country=us, so this is plenty for nearly every company)
const MOST_PAGES = 10;

// only the fields we use (the real response has more)
export type SmartPosting = {
  id: string;
  name: string;
  releasedDate: string | null;
  company?: { name?: string } | null;
  location?: { city?: string; region?: string; country?: string; remote?: boolean } | null;
  experienceLevel?: { id?: string } | null;       // 'internship' for intern roles
};

export async function fetchSmartRecruiters(): Promise<SourceResult> {
  // the hand-picked companies, then the found ones (see greenhouse.ts: same order every run)
  const companies = boardsFor('smartrecruiters', COMPANIES.map((id) => ({ id, name: id }))).map((board) => board.id);
  const jobsByCompany: ImportedJob[][] = companies.map(() => []);
  // the companies whose calls failed, or whose list was cut off (their old jobs stay open)
  const failed = new Set<string>();
  await atMostAtOnce(companies, BOARDS_AT_ONCE, async (company, index) => {
    const jobs = jobsByCompany[index]!;
    try {
      for (let page = 0; page < MOST_PAGES; page++) {
        // country=us: only its postings in the US (ScoutSearch is for students in the US)
        const body = (await fetchJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?country=us&limit=100&offset=${page * 100}`)) as { content: SmartPosting[] };
        // no list at all means the answer changed shape, not "no jobs": count it as failed
        if (!Array.isArray(body?.content)) throw new Error('the answer had no job list');
        const list = body.content;
        for (const posting of list) {
          try {
            if (typeof posting.id !== 'string' || typeof posting.name !== 'string') continue;
            // a job in another country is skipped. SmartRecruiters says the country ("us", "hu", ...)
            const country = posting.location?.country;
            if (typeof country === 'string' && country.trim() !== '' && country.trim().toLowerCase() !== 'us') continue;
            if (posting.experienceLevel?.id === 'internship' || isInternTitle(posting.name)) jobs.push(toImportedJob(posting, company));
          } catch {
            console.error(`smartrecruiters ${company}: skipped one job that couldn't be read`);
          }
        }
        if (list.length < 100) break;
        // still full pages after MOST_PAGES: we didn't get the whole list, so closing this
        // company's jobs that weren't in it would close real ones
        if (page === MOST_PAGES - 1) {
          console.error(`smartrecruiters ${company}: more than ${MOST_PAGES * 100} postings, only the first ${MOST_PAGES * 100} read`);
          failed.add(company);
        }
      }
    } catch (err) {
      // the company left SmartRecruiters: no jobs here now, not a failure (see greenhouse.ts)
      if (isGone(err)) {
        console.log(`smartrecruiters ${company}: no board there any more (npm run find-boards takes it off the list)`);
        return;
      }
      console.error(`smartrecruiters ${company} failed:`, err);
      failed.add(company);
    }
  });
  return boardsResult('smartrecruiters', jobsByCompany.flat(), companies.length, failed, boardInId);
}

export function toImportedJob(posting: SmartPosting, company: string): ImportedJob {
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
