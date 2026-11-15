// tracker.js remembers which jobs are on the Application tracker, and in
// which column. Two pages use it:
//   - Discovery: pressing Save adds a job (to the "Saved" column), and
//     pressing it again takes the job off.
//   - Application tracker: shows the jobs, and saves where you drag them.
//
// The list is kept in this browser's storage (localStorage), so it's still
// there after a refresh or after going to another page. It looks like:
//   [ { id: 1, stage: "saved" }, { id: 3, stage: "submitted" } ]
// "id" matches an opportunity in opportunities.js, and "stage" is the column:
// "saved", "preparing", or "submitted".
//
// Later, this list would be saved by the backend for each account instead.
//
// Every read and write is inside try/catch: the browser's storage can be
// turned off (for example in a private window). Then the tracker just starts
// empty instead of the page breaking.

// accountKey and readAccountItem keep each account's list apart
// (login-status.js), so on a shared computer the next person to log in
// doesn't see the jobs you saved. Your list stays for when you come back.
import { accountKey, readAccountItem } from "../login-status.js";

// The name this list is saved under in the browser's storage
// (plus the account's id, added by accountKey)
const storageName = "scoutsearch-applications";

// The three columns. Anything saved with another stage is left out (see below)
const stageNames = ["saved", "preparing", "submitted"];

// Gives back the whole list (or an empty list if there's nothing saved yet)
export function loadTracker() {
  try {
    const list = JSON.parse(readAccountItem(storageName) || "[]");
    // Array.isArray checks it really is a list, in case something else got saved there
    if (!Array.isArray(list)) return [];
    // Keep only items that look right: an object, in one of the three columns,
    // for a job that isn't in the list already. One broken item (like null)
    // would otherwise crash every page that reads the tracker, and "Try again"
    // would crash again, until someone cleared the browser's storage by hand.
    // "seen" remembers the ids so far, so a job saved twice is only kept once
    const seen = new Set();
    return list.filter((item) => {
      const looksRight = item !== null && typeof item === "object" && stageNames.includes(item.stage) && !seen.has(item.id);
      if (looksRight) seen.add(item.id);
      return looksRight;
    });
  } catch {
    return [];
  }
}

// Saves the whole list
export function saveTracker(list) {
  try {
    localStorage.setItem(accountKey(storageName), JSON.stringify(list));
  } catch {
    // Storage is turned off. Nothing to do: the tracker just won't remember.
  }
}

// Runs "callback" whenever ANOTHER tab changes the tracker (for example,
// Save on Opportunities in a second tab). The browser's "storage" event only
// fires in the other tabs. Gives back a function that stops listening,
// for useEffect's clean-up
export function watchTracker(callback) {
  function handleStorage(event) {
    // event.key is the name that changed (null means everything was cleared)
    if (event.key === accountKey(storageName) || event.key === null) {
      callback();
    }
  }
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

// True if this job is on the tracker (in any column).
// .some() is true if at least one item in the list passes the test.
export function isOnTracker(id) {
  return loadTracker().some((item) => item.id === id);
}

// Adds a job to the "Saved" column (if it isn't on the tracker already)
export function addToTracker(id) {
  const list = loadTracker();
  if (!list.some((item) => item.id === id)) {
    // [...list, newItem] makes a new list: everything already there, plus the new one
    saveTracker([...list, { id: id, stage: "saved" }]);
  }
}

// Takes a job off the tracker, whichever column it's in.
// .filter() keeps every item except this job.
export function removeFromTracker(id) {
  saveTracker(loadTracker().filter((item) => item.id !== id));
}
