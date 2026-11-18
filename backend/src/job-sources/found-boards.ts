// The company job boards that find-boards.ts found in the GitHub lists we import, saved in
// found-boards.json. Each hiring-site source (greenhouse.ts, lever.ts, ashby.ts, smartrecruiters.ts,
// workable.ts) reads these companies' boards too, not just the few hand-picked ones written in it.
//
// Why: the GitHub lists (Simplify and the others) link to hundreds of companies' boards, but
// they only list the tech internships, and with no description. Reading a company's board
// ourselves finds ALL its internships (marketing, finance, operations, design...), with the
// full description, so Best fit and the AI tags have more to go on.
//
// To update the list: cd backend && npm run find-boards, then commit found-boards.json.
import { readFileSync } from 'node:fs';

// id: the company's name in the board's address (boards.greenhouse.io/<id>), name: the
// company's name to show, for the sites whose jobs don't say it (Lever, Ashby)
export type Board = { id: string; name: string };
export type BoardSite = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workable';

// the most boards read per site: Refresh reads them all, and has to finish in a few minutes
export const MOST_BOARDS = 1000;

// a board id goes into a web address, so only letters, digits, and . _ - and spaces
// (a few Ashby boards have spaces, like "Lambda Labs"; the sources put it through encodeURIComponent)
const BOARD_ID = /^[A-Za-z0-9._ -]{1,100}$/;
export function isBoardId(id: string): boolean {
  return BOARD_ID.test(id);
}

function readFound(): Partial<Record<BoardSite, unknown>> {
  // FOUND_BOARDS_FILE: read another file instead (the tests use a small one).
  // A missing or broken file just means no found boards: the hand-picked ones still run
  const file = process.env.FOUND_BOARDS_FILE || new URL('./found-boards.json', import.meta.url);
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('found-boards.json could not be read, so only the hand-picked boards are used:', (err as Error).message);
    return {};
  }
}

// The boards to read on one hiring site: the hand-picked ones first, then the found ones that
// aren't among them. Ids are compared ignoring upper/lower case ("Stripe" and "stripe" are one
// board), so no company is read twice
export function boardsFor(site: BoardSite, picked: Board[]): Board[] {
  const found = readFound()[site];
  const boards = [...picked];
  const seen = new Set(picked.map((board) => board.id.toLowerCase()));
  for (const board of Array.isArray(found) ? found : []) {
    if (boards.length >= MOST_BOARDS) break;
    // the file is ours, but check each entry anyway: one bad line shouldn't stop the import
    if (typeof board?.id !== 'string' || typeof board?.name !== 'string' || !BOARD_ID.test(board.id)) continue;
    const key = board.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push({ id: board.id, name: board.name.trim().slice(0, 200) || board.id });
  }
  return boards;
}
