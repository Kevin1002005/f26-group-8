// A word index for the open jobs, like the index at the back of a book: for every word, which
// jobs use it. GET /api/jobs/for-me (jobs.ts) builds it once each time it loads the jobs, then
// "which jobs mention Excel?" is one lookup instead of reading all ~6,700 job posts again.
//
// Why: Best fit checks every skill, major word, and resume word (up to ~130 words) against every
// job. Reading every post for every word took ~160 ms per student, so 200 students at once
// waited over a minute (the 2026-11-17 stress test). With the index it's a few ms.
//
// It gives EXACTLY the same answers as mentions() in fit.ts (a whole word, any case):
//  - a word of only letters and digits ("excel", "python3") is looked up directly: a job's
//    words here are its runs of letters and digits, which is just what mentions() counts as one word
//  - anything else ("C++", "Node.js", "machine learning") first narrows down to the jobs that have
//    its letter parts (one lookup), then checks those few jobs with mentions() itself
import { mentions } from './fit.js';

// word -> the positions (in the jobs list) of every job that uses it, smallest first
export type WordIndex = Map<string, number[]>;

// a run of letters (\p{L}) and digits (\p{N}): the same idea of "a word" as mentions()
const BETWEEN_WORDS = /[^\p{L}\p{N}]+/u;
const ONE_WORD = /^[\p{L}\p{N}]+$/u;

// Builds the index from each job's text (already in lower case, like OpenJob.text in jobs.ts)
export function buildIndex(texts: string[]): WordIndex {
  const index: WordIndex = new Map();
  texts.forEach((text, i) => {
    for (const word of text.split(BETWEEN_WORDS)) {
      if (word === '') continue;
      const jobs = index.get(word);
      if (!jobs) index.set(word, [i]);
      // the jobs go in order, so a word used twice in one job only needs checking against the last one
      else if (jobs[jobs.length - 1] !== i) jobs.push(i);
    }
  });
  return index;
}

// Which jobs mention a word: a list with a 1 for each job that does (marks[i] is job i).
// texts are the same texts the index was built from
export function jobsMentioning(index: WordIndex, texts: string[], word: string): Uint8Array {
  const marks = new Uint8Array(texts.length);
  const w = word.toLowerCase();
  if (w === '') return marks;
  if (ONE_WORD.test(w)) {
    for (const i of index.get(w) ?? []) marks[i] = 1;
    return marks;
  }
  // "c++" -> ["c"], "machine learning" -> ["machine", "learning"]: a job has to use every part,
  // so start from the part the fewest jobs use, and check just those jobs the slow, exact way
  const parts = w.split(BETWEEN_WORDS).filter((part) => part !== '');
  let fewest: number[] | null = null;
  for (const part of parts) {
    const jobs = index.get(part) ?? [];
    if (!fewest || jobs.length < fewest.length) fewest = jobs;
  }
  // no letters or digits at all (like "++"): check every job
  const candidates = fewest ?? texts.map((_, i) => i);
  for (const i of candidates) if (mentions(texts[i]!, w)) marks[i] = 1;
  return marks;
}
