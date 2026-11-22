// opportunities.js holds small helpers for job deadlines and logos that
// Discovery (Opportunities) and the Application tracker share.
//
// It used to hold made-up example jobs too, for the Feed's example listing
// posts. The Feed was taken out in 2026-11, so they're gone. A student who
// saved one of them still sees it on the tracker: the account keeps each saved
// job's title, company, and deadline (src/data/tracker.js).
//
// "export" lets other files bring the helpers in, like:
//   import { isPastDeadline } from "../data/opportunities.js";

// True once a deadline ("2026-11-20") has gone by. A job stays open for all
// of its last day and closes at 11:59 pm, on this computer's clock (the same
// time Discovery's "Due soon" tag goes away, so one tag hands over to the other).
// Discovery and the Application tracker use it, so a closed job
// says "Closed" everywhere instead of still asking you to apply.
// Many real jobs don't list a deadline (null): those never close this way
export function isPastDeadline(deadline) {
  if (!deadline) return false;
  return new Date(deadline + "T23:59") < new Date();
}

// True if a deadline is within the next "days" days (and not already past).
// Used for the "Due soon" tags (7 days) and the boxes of what's due (14 days).
// A job with no deadline (null) is never "due".
// 1000 * 60 * 60 * 24 is the number of milliseconds in one day.
export function isDueWithin(deadline, days) {
  if (!deadline) return false;
  const msLeft = new Date(deadline + "T23:59") - new Date();
  return msLeft >= 0 && msLeft <= days * 1000 * 60 * 60 * 24;
}

// "Greenline Labs" -> "GL", for the square logos
export function initialsOf(organization) {
  return (organization || "")
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
