// tracker.js remembers which jobs are on the Application tracker, and in
// which column. Three pages use it:
//   - Discovery: pressing Save adds a job (to the "Saved" column), and
//     pressing it again takes the job off.
//   - Feed: the same Save on listing posts, and the "Due soon" box.
//   - Application tracker: shows the jobs, and moves them between columns.
//
// The list is saved with your ACCOUNT (the backend's /api/applications,
// plans.md Task F12), so it follows you to any device. It's also kept in this
// browser (localStorage), which does two jobs:
//   1. Pages show your list right away, instead of waiting for the server.
//   2. If the server can't be reached (no internet, or the backend is down),
//      everything still works: each change waits in an "outbox" on this
//      device, and is sent as soon as the server is back.
// A list saved in this browser before accounts kept it is sent to your
// account the first time you open a page with the tracker (once).
//
// The list looks like:
//   [ { id: 1, stage: "saved" },
//     { id: "3f2a...", stage: "submitted", title: "...", organization: "...", deadline: "...", initials: "..." } ]
// "stage" is the column: "saved", "preparing", or "submitted".
// "id" is either a made-up example in opportunities.js (a number, used by the
// Feed), or a real job from Opportunities (a long code, a uuid). Its title,
// company, deadline, and initials are kept with it (see trackerJob below).
//
// Every read and write of the browser's storage is inside try/catch: storage
// can be turned off (for example in a private window). Then this device just
// keeps the list in memory until the tab closes (your account still has it).

// useEffect runs code after a page is drawn (here: syncing when it opens).
// useSyncExternalStore lets a page redraw when something outside React
// changes (here: the list, after a change or after the server answers)
import { useEffect, useSyncExternalStore } from "react";
// api() is how we talk to the backend (src/api.js)
import { api } from "../api.js";
// accountKey and readAccountItem keep each account's list apart on a shared
// computer (login-status.js). loggedInId says whose list it is right now
import { accountKey, loggedInId, readAccountItem, useLoggedInId } from "../login-status.js";
// The made-up example jobs (the Feed's listing posts use them)
import { opportunities } from "./opportunities.js";

// The names things are saved under in the browser's storage
// (plus the account's id, added by accountKey)
const listName = "scoutsearch-applications"; // the list itself
const outboxName = "scoutsearch-applications-outbox"; // changes not sent to the account yet
const serverIdsName = "scoutsearch-applications-server-ids"; // each job's row number on the server

// The three columns. Anything saved with another stage is left out (see below)
const stageNames = ["saved", "preparing", "submitted"];


// ---------- This browser's storage ----------

// Where things go when the browser won't save them (storage turned off or
// full), so this tab still works until it closes
const memory = new Map();

// Reads one saved thing (as JSON), or null if there's nothing (or it's broken)
function readSaved(name, account) {
  try {
    // readAccountItem also moves an old list from before accounts (see login-status.js)
    const text = readAccountItem(name, account);
    if (text !== null) return JSON.parse(text);
  } catch {
    // storage is off, or the text is broken: fall through to memory
  }
  return memory.get(accountKey(name, account)) ?? null;
}

// Saves one thing (as JSON)
function writeSaved(name, account, value) {
  const key = accountKey(name, account);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

// The list, keeping only items that look right: an object, in one of the
// three columns, for a job that isn't in the list already. One broken item
// (like null) would otherwise crash every page that reads the tracker.
// "seen" remembers the ids so far, so a job saved twice is only kept once
function cleanList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((item) => {
    const looksRight = item !== null && typeof item === "object" && stageNames.includes(item.stage)
      && (typeof item.id === "number" || typeof item.id === "string") && !seen.has(item.id);
    if (looksRight) seen.add(item.id);
    return looksRight;
  });
}

// The outbox: the changes this device made that the account doesn't have yet,
// oldest first. Each one is { key, type, id, ... }:
//   { type: "add", id, stage, details }   put a job on the tracker
//   { type: "move", id, stage }           move it to another column
//   { type: "remove", id }                take it off
// "key" is a made-up name for that one change, so it can be crossed off
// after it's sent (even if another tab changed the outbox in between)
function readOutbox(account) {
  const outbox = readSaved(outboxName, account);
  if (!Array.isArray(outbox)) return [];
  return outbox.filter((change) => change !== null && typeof change === "object" && ["add", "move", "remove"].includes(change.type));
}

// { jobId: rowId } for every job the account has: the server's own number
// for that row, needed to move it or take it off later
function readServerIds(account) {
  const ids = readSaved(serverIdsName, account);
  return ids !== null && typeof ids === "object" && !Array.isArray(ids) ? ids : {};
}

// A new key for a change. (Not crypto.randomUUID: that only works on https
// and localhost, and the site is sometimes opened from a phone by its address)
function newKey() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}


// ---------- Telling pages about changes ----------
// Pages redraw when the list or the sync status changes (the hooks at the bottom)

const listeners = new Set();
function tellListeners() {
  for (const listener of listeners) listener();
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The list, kept in memory too. React asks for it on every redraw, and needs
// the SAME list back each time unless something really changed
let cache = { account: undefined, items: [] };

// The logged-in account's list
function currentItems() {
  const account = loggedInId();
  if (cache.account !== account) {
    cache = { account: account, items: cleanList(readSaved(listName, account)) };
  }
  return cache.items;
}

// Saves an account's list, and redraws the pages
function setItems(account, items) {
  writeSaved(listName, account, items);
  if (cache.account === account) {
    cache = { account: account, items: items };
  }
  tellListeners();
}

// How syncing is going, for the line on the Application tracker page:
//   state    "waiting" (nothing known yet), "saved" (your account has
//            everything), or "offline" (changes are waiting on this device)
//   problem  a sentence when the server refused a change ("" if none)
const startingStatus = { account: null, state: "waiting", problem: "" };
let status = startingStatus;
function setStatus(account, changes) {
  // a different account starts fresh
  const base = status.account === account ? status : { ...startingStatus, account: account };
  status = { ...base, ...changes };
  tellListeners();
}

// When ANOTHER tab changes the list (Save on Opportunities in a second tab),
// read it again. The browser's "storage" event only fires in the other tabs.
// (event.key null means everything was cleared)
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === accountKey(listName, cache.account)) {
    cache = { account: undefined, items: [] };
    tellListeners();
  }
});


// ---------- Reading the list ----------

// Gives back the whole list (or an empty list if there's nothing saved yet).
// Don't change the list it gives back: make a new one (the functions below do)
export function loadTracker() {
  return currentItems();
}

// True if this job is on the tracker (in any column).
// .some() is true if at least one item in the list passes the test.
export function isOnTracker(id) {
  return currentItems().some((item) => item.id === id);
}

// The job behind one item on the tracker, with what the tracker shows
// (title, organization, deadline, initials), or null if there's none:
//   - an example job: from opportunities.js
//   - a real job: from the details saved with it when Save was pressed
export function trackerJob(item) {
  const example = opportunities.find((job) => job.id === item.id);
  if (example) return example;
  if (typeof item.title !== "string") return null;
  return {
    id: item.id,
    title: item.title,
    organization: typeof item.organization === "string" ? item.organization : "",
    deadline: typeof item.deadline === "string" ? item.deadline : null,
    initials: typeof item.initials === "string" ? item.initials : "",
  };
}

// "Greenline Labs" -> "GL", for the square logo (the same as Discovery's).
// The server doesn't keep initials, so they're made again from the company name
function initialsOf(organization) {
  return (organization || "")
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


// ---------- Changing the list ----------
// Each change happens on this device right away (so the page never waits),
// goes in the outbox, and then the outbox is sent to the account.

// Puts one change in the outbox, then starts sending.
// A newer "move" or "remove" makes older "move"s of that job pointless (only
// where it ends up matters), so those are crossed off first
function queueChange(account, change) {
  const outbox = readOutbox(account).filter(
    (old) => !(old.type === "move" && old.id === change.id && change.type !== "add"),
  );
  writeSaved(outboxName, account, [...outbox, { ...change, key: newKey() }]);
  // a new change: any old "couldn't save" sentence is about something else
  setStatus(account, { problem: "" });
  syncTracker();
}

// Adds a job to the "Saved" column (if it isn't on the tracker already).
// details is what the tracker needs to show a real job:
// { title, organization, deadline, initials } (leave it out for an example job)
export function addToTracker(id, details = {}) {
  const account = loggedInId();
  const list = currentItems();
  if (list.some((item) => item.id === id)) return;
  // [...list, newItem] makes a new list: everything already there, plus the new one
  setItems(account, [...list, { ...details, id: id, stage: "saved" }]);
  // Only logged-in accounts have a tracker on the server
  if (account) queueChange(account, { type: "add", id: id, stage: "saved", details: details });
}

// Moves a job to another column ("saved", "preparing", or "submitted")
export function moveOnTracker(id, stage) {
  const account = loggedInId();
  const list = currentItems();
  const item = list.find((each) => each.id === id);
  if (!item || item.stage === stage || !stageNames.includes(stage)) return;
  // A new list where only that job's column is different
  setItems(account, list.map((each) => (each.id === id ? { ...each, stage: stage } : each)));
  if (account) queueChange(account, { type: "move", id: id, stage: stage });
}

// Takes a job off the tracker, whichever column it's in.
// .filter() keeps every item except this job.
export function removeFromTracker(id) {
  const account = loggedInId();
  const list = currentItems();
  if (!list.some((item) => item.id === id)) return;
  setItems(account, list.filter((item) => item.id !== id));
  if (account) queueChange(account, { type: "remove", id: id });
}


// ---------- Sending changes to the account, and reading it back ----------

// True when a failed request is worth trying again later: no answer at all (0),
// "not logged in" (401: the login is being renewed, or will be after you log
// in again), "too many requests" (429), or the server broke (500 and up).
// Anything else (400, 404...) means the server looked at it and said no, so
// sending the same thing again would only get the same no
function worthRetrying(error) {
  const code = error?.status;
  return typeof code !== "number" || code === 0 || code === 401 || code === 408 || code === 429 || code >= 500;
}

// Sends one change from the outbox. Throws if the request failed
async function sendChange(account, change) {
  const serverIds = readServerIds(account);
  const rowId = serverIds[change.id];

  if (change.type === "add") {
    // The backend looks a real job up itself (it never takes the browser's word
    // for its title). An example job isn't in the backend's jobs table, so its
    // words come from opportunities.js
    let body;
    if (typeof change.id === "number") {
      const example = opportunities.find((job) => job.id === change.id);
      const details = example ?? change.details ?? {};
      body = { example_id: change.id, title: details.title, organization: details.organization ?? "", deadline: details.deadline ?? null };
    } else {
      body = { job_id: change.id };
    }
    body.status = change.stage;
    const answer = await api("/applications", { method: "POST", body: JSON.stringify(body), asUser: account });
    // Remember the row's number (read the ids again: another change may have
    // been saved while this one was on its way)
    writeSaved(serverIdsName, account, { ...readServerIds(account), [change.id]: answer.application.id });
    return;
  }

  // "move" and "remove" need the row's number. No number means the account
  // never got this job (adding it was refused), so there's nothing to do
  if (!rowId) return;
  try {
    if (change.type === "move") {
      await api("/applications/" + rowId, { method: "PATCH", body: JSON.stringify({ status: change.stage }), asUser: account });
    } else {
      await api("/applications/" + rowId, { method: "DELETE", asUser: account });
    }
  } catch (error) {
    // 404: the job isn't on the account anymore (taken off on another device).
    // For a "remove" that's what we wanted, and a "move" has nothing left to move
    if (error.status !== 404) throw error;
  }
  // Once it's off the account, forget its number
  if (change.type === "remove") {
    const ids = readServerIds(account);
    delete ids[change.id];
    writeSaved(serverIdsName, account, ids);
  }
}

// Crosses one change off the outbox, by its key
function crossOff(account, key) {
  writeSaved(outboxName, account, readOutbox(account).filter((change) => change.key !== key));
}

// Sends the outbox, oldest change first, one at a time (so the server sees
// them in the order you made them). Gives back true once it's empty, or false
// if the server couldn't be reached (the rest wait for next time)
async function sendOutbox(account) {
  for (;;) {
    // Read it fresh each time: a new change may have been added meanwhile
    const change = readOutbox(account)[0];
    if (!change) return true;
    try {
      await sendChange(account, change);
    } catch (error) {
      if (worthRetrying(error)) return false;
      // The server said no. That change can never go through, so drop it and
      // say why (reading the account back below shows what it really has)
      setStatus(account, { problem: "One change couldn't be saved to your account: " + error.message });
    }
    crossOff(account, change.key);
  }
}

// A row from the server -> an item in the list.
// The row's own id stands in for a real job that was deleted from the jobs
// table later (its job_id is gone, but the row keeps the title)
function itemFromRow(row) {
  return {
    id: row.example_id ?? row.job_id ?? row.id,
    stage: row.status,
    title: row.title,
    organization: row.organization,
    deadline: row.deadline,
    initials: initialsOf(row.organization),
  };
}

// The list with the outbox's changes done on top: what this device should
// show while those changes are still on their way
function withOutbox(items, outbox) {
  let list = items;
  for (const change of outbox) {
    if (change.type === "add" && !list.some((item) => item.id === change.id)) {
      list = [...list, { ...change.details, id: change.id, stage: change.stage }];
    } else if (change.type === "move") {
      list = list.map((item) => (item.id === change.id ? { ...item, stage: change.stage } : item));
    } else if (change.type === "remove") {
      list = list.filter((item) => item.id !== change.id);
    }
  }
  return list;
}

// One round of syncing for one account. Gives back how it went:
//   "done"     the account and this device match
//   "offline"  the server couldn't be reached (try again later)
//   "more"     new changes were made meanwhile (go again right away)
async function syncOnce(account) {
  // 1. Jobs on this device that the account has never heard of: a list
  //    from before accounts kept it. Put each one in the outbox, once.
  //    (Only ones with a job behind them: the tracker can't show the others anyway)
  const serverIds = readServerIds(account);
  const outbox = readOutbox(account);
  const unsent = cleanList(readSaved(listName, account)).filter(
    (item) => !serverIds[item.id] && trackerJob(item) !== null
      && !outbox.some((change) => change.type === "add" && change.id === item.id),
  );
  if (unsent.length > 0) {
    writeSaved(outboxName, account, [
      ...outbox,
      ...unsent.map((item) => {
        // the item minus its id and column = its details (title, company, ...)
        const { id, stage, ...details } = item;
        return { type: "add", id: id, stage: stage, details: details, key: newKey() };
      }),
    ]);
  }

  // 2. Send the outbox. If the server can't be reached, stop here: this
  //    device keeps showing its own list, and it's tried again later
  if (!(await sendOutbox(account))) {
    setStatus(account, { state: "offline" });
    return "offline";
  }

  // 3. Read the account's list back. It's the truth: it has what your other
  //    devices saved, and leaves out what they took off
  let answer;
  try {
    answer = await api("/applications", { asUser: account });
  } catch (error) {
    if (worthRetrying(error)) {
      setStatus(account, { state: "offline" });
      return "offline";
    }
    setStatus(account, { problem: "Your account's list couldn't be loaded: " + error.message });
    return "done";
  }
  const rows = Array.isArray(answer.applications) ? answer.applications : [];
  const ids = {};
  for (const row of rows) {
    ids[itemFromRow(row).id] = row.id;
  }
  writeSaved(serverIdsName, account, ids);
  // Changes made while the list was on its way are still in the outbox:
  // show them on top, and send them next round
  const waiting = readOutbox(account);
  setItems(account, withOutbox(cleanList(rows.map(itemFromRow)), waiting));
  if (waiting.length > 0) return "more";
  setStatus(account, { state: "saved" });
  return "done";
}

// Only one sync at a time. A sync asked for while one is running ("again")
// runs right after it, so a change made meanwhile is sent too
let running = null;
let again = false;
// The wait before trying again after the server couldn't be reached. It
// doubles each time (5 seconds, 10, 20...) up to a minute, so a server that's
// down isn't asked over and over
let retryWait = 5000;
let retryTimer = null;

// Sends this device's changes to the account, then reads the account's list
// back. Pages run it when they open (see useTrackerSync); changes run it too.
// Gives back a promise that's done when the sync is
export function syncTracker() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const account = loggedInId();
        if (!account) break;
        // navigator.locks makes the browser's tabs take turns, so two open tabs
        // don't send the same change at once. (Old browsers don't have it; then
        // the backend copes anyway: adding a job twice keeps one)
        const result = navigator.locks
          ? await navigator.locks.request("scoutsearch-tracker-sync", () => syncOnce(account))
          : await syncOnce(account);
        clearTimeout(retryTimer);
        if (result === "offline") {
          // Try again later, by itself
          retryTimer = setTimeout(syncTracker, retryWait);
          retryWait = Math.min(retryWait * 2, 60000);
        } else {
          retryWait = 5000;
          if (result === "more") again = true;
        }
      } while (again);
    } catch (error) {
      // A mistake in our own code: log it, and let the next sync try again
      console.error("Syncing the tracker failed:", error);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Back online: send what's waiting right away, instead of waiting for the timer
window.addEventListener("online", () => syncTracker());
// Coming back to this tab: read the account again, so changes made on your
// other devices meanwhile show up here
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && loggedInId()) syncTracker();
});


// ---------- Hooks for pages ----------
// A "hook" is a function a component calls at its top to get something that
// can change, and redraw when it does.

// The tracker's list. The page redraws when it changes: a Save, a move, a
// change in another tab, or the account's list arriving
export function useTrackerItems() {
  // A different account logging in redraws the page too, with their list
  useLoggedInId();
  return useSyncExternalStore(subscribe, currentItems);
}

// Syncs with the account when the page opens (and when a different account
// logs in), and gives back how it's going: { state, problem } (see "status")
export function useTrackerSync() {
  const account = useLoggedInId();
  useEffect(() => {
    if (account) syncTracker();
  }, [account]);
  const current = useSyncExternalStore(subscribe, () => status);
  return current.account === account ? current : startingStatus;
}
