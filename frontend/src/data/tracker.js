// tracker.js remembers which jobs are on the Application tracker, and in
// which column. Discovery and the Feed add jobs to it (Save, Apply), and the
// Application tracker page shows them, moves them, and keeps their notes.
//
// The list is saved with your ACCOUNT (the backend's /api/applications,
// plans.md Task F12), so it follows you to any device. This browser keeps a
// copy too (localStorage), so pages show your list right away, and so
// everything still works when the server can't be reached: each change waits
// in an "outbox" on this device, and is sent as soon as the server is back.
// A list saved in this browser before accounts kept it is sent to your
// account once, the first time a page with the tracker opens.
//
// One item in the list:
//   { id, stage, title, organization, deadline, initials, notes,
//     link, statusDetail, appliedOn, custom? }
// "stage" is the column: "saved", "preparing", or "submitted".
// link is the posting's web address, statusDetail a short line like "Interview Dec 3",
// and appliedOn the day you applied (set when the card moves to Submitted).
// "id" is one of:
//   a number   a made-up example job in opportunities.js (the Feed's posts)
//   a uuid     a real job from Opportunities (its id in the jobs table), or,
//              with custom: true, a job typed in from another site (the
//              server's id for that row)

// useEffect runs code after a page is drawn (here: syncing when it opens).
// useSyncExternalStore lets a page redraw when something outside React
// changes (here: the list, after a change or after the server answers)
import { useEffect, useSyncExternalStore } from "react";
// api() talks to the backend; canRetry says if a failed request is worth trying again
import { api, canRetry } from "../api.js";
// accountKey and readAccountItem keep each account's list apart on a shared
// computer (login-status.js). loggedInId says whose list it is right now
import { accountKey, loggedInId, readAccountItem, useLoggedInId } from "../login-status.js";
// The made-up example jobs, and the "GL" initials for a company's square logo
import { initialsOf, opportunities } from "./opportunities.js";

// The names things are saved under in the browser (plus the account's id)
const listName = "scoutsearch-applications"; // the list itself
const outboxName = "scoutsearch-applications-outbox"; // changes not sent to the account yet
const serverIdsName = "scoutsearch-applications-server-ids"; // { jobId: the server's row id }

// The three columns
const stageNames = ["saved", "preparing", "submitted"];


// ---------- This browser's storage ----------

// Every read and write is inside try/catch: storage can be turned off (some
// private windows) or full. Then things are kept here, in memory, until the
// tab closes (your account still has them)
const memory = new Map();

// Reads one saved thing (as JSON), or null if there's nothing (or it's broken).
// readAccountItem also moves an old list from before accounts (login-status.js)
function readSaved(name, account) {
  try {
    const text = readAccountItem(name, account);
    if (text !== null) return JSON.parse(text);
  } catch {
    // storage is off, or the text is broken: use memory
  }
  return memory.get(accountKey(name, account)) ?? null;
}

function writeSaved(name, account, value) {
  const key = accountKey(name, account);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

// Keeps only items that look right (an object, in one of the 3 columns, with an
// id, not in the list already). One broken item (like null) would otherwise
// crash every page that reads the tracker
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

// The outbox: this device's changes the account doesn't have yet, oldest first:
//   { key, type: "add", id, stage, details }   put a job on the tracker
//   { key, type: "move", id, stage, appliedOn? }  move it to another column
//   { key, type: "notes", id, notes }          change its notes
//   { key, type: "details", id, details }      change its link, status, or date applied
//   { key, type: "remove", id }                take it off
// "key" names that one change, so it can be crossed off after it's sent
function readOutbox(account) {
  const outbox = readSaved(outboxName, account);
  const types = ["add", "move", "notes", "details", "remove"];
  return Array.isArray(outbox) ? outbox.filter((change) => change && types.includes(change.type)) : [];
}

function readServerIds(account) {
  const ids = readSaved(serverIdsName, account);
  return ids !== null && typeof ids === "object" && !Array.isArray(ids) ? ids : {};
}

// A new random id in the shape the database uses (a "uuid", like "3f2a9c1e-...").
// crypto.getRandomValues works on any address (crypto.randomUUID needs https,
// and the site is sometimes opened from a phone by its local address)
function newUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // the "version 4" mark (a random uuid)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // the "variant" mark every uuid has
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

// Today's date on this computer, like "2026-11-16" (the "en-CA" way of writing
// dates happens to be year-month-day, the same as the database)
function today() {
  return new Date().toLocaleDateString("en-CA");
}


// ---------- The list in memory, and telling pages about changes ----------

const listeners = new Set();
function tellListeners() {
  for (const listener of listeners) listener();
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// React asks for the list on every redraw, and needs the SAME list back each
// time unless something really changed, so it's kept here
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
  if (cache.account === account) cache = { account: account, items: items };
  tellListeners();
}

// How syncing is going, for the line on the Application tracker page:
//   state    "waiting" (nothing known yet), "saved" (your account has
//            everything), or "offline" (changes are waiting on this device)
//   problem  a sentence when the server refused a change ("" if none)
const startingStatus = { account: null, state: "waiting", problem: "" };
let status = startingStatus;
function setStatus(account, changes) {
  const base = status.account === account ? status : { ...startingStatus, account: account };
  status = { ...base, ...changes };
  tellListeners();
}

// ANOTHER tab changed the list (the "storage" event only fires in the other
// tabs; event.key null means everything was cleared): read it again
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === accountKey(listName, cache.account)) {
    cache = { account: undefined, items: [] };
    tellListeners();
  }
});


// ---------- Reading and changing the list ----------
// Each change happens on this device right away (so the page never waits),
// then goes in the outbox, and the outbox is sent to the account.

// The job behind one item, with what the tracker shows (title, organization,
// deadline, initials), or null if there's none: an example job comes from
// opportunities.js, any other from the details saved with it
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

// Puts a change in the outbox, then starts sending. Only where a job ends up
// matters, so a newer "move" (or "notes", or "details") of a job replaces an older
// one, and a "remove" replaces all of them
function queueChange(account, change) {
  const replaced = (old) => old.id === change.id && old.type !== "add" && old.type !== "remove"
    && (change.type === "remove" || old.type === change.type);
  const outbox = readOutbox(account).filter((old) => !replaced(old));
  writeSaved(outboxName, account, [...outbox, { ...change, key: newUuid() }]);
  // a new change: an old "couldn't save" sentence is about something else
  setStatus(account, { problem: "" });
  syncTracker();
}

// Puts one item on the list (unless it's there already) and queues it.
// extra goes on the outbox change only (see markApplied)
function addItem(item, extra = {}) {
  const account = loggedInId();
  const list = currentItems();
  if (list.some((each) => each.id === item.id) || !stageNames.includes(item.stage)) return;
  setItems(account, [...list, item]);
  // details = everything except the id and column (title, company, notes...)
  const { id, stage, ...details } = item;
  if (account) queueChange(account, { type: "add", id: id, stage: stage, details: details, ...extra });
}

// Changes some fields of one item (like { notes }) and queues "change" for the
// account. Nothing happens if they're all the same already
function changeItem(id, fields, change) {
  const account = loggedInId();
  const list = currentItems();
  const item = list.find((each) => each.id === id);
  if (!item || Object.entries(fields).every(([key, value]) => (item[key] ?? "") === (value ?? ""))) return;
  setItems(account, list.map((each) => (each.id === id ? { ...each, ...fields } : each)));
  if (account) queueChange(account, { ...change, id: id });
}

// Save (Discovery, Feed): the job goes in "Saved". details is what the tracker
// shows for a real job: { title, organization, deadline, initials, link }
export function addToTracker(id, details = {}) {
  addItem({ ...details, id: id, stage: "saved" });
}

// "Yes, I sent it" (Discovery's pop-up asks after Apply opens the posting; opening
// it alone doesn't call this): the job goes in "Submitted", dated today, whether it
// was on the tracker already or not. "mustBe": if the account had it in another
// column (saved on another device, before that list arrived here), it's moved too
export function markApplied(id, details = {}) {
  if (currentItems().some((item) => item.id === id)) {
    moveOnTracker(id, "submitted");
  } else {
    addItem({ ...details, id: id, stage: "submitted", appliedOn: today() }, { mustBe: true });
  }
}

// A job found on another site, typed in on the tracker page. job is
// { title, organization, deadline, stage, link, statusDetail }. Its id is made
// here, so its card works before the server has answered; the server keeps the same id
export function addOtherJob(job) {
  const id = newUuid();
  addItem({
    id: id,
    stage: job.stage,
    title: job.title,
    organization: job.organization,
    deadline: job.deadline || null,
    initials: initialsOf(job.organization),
    link: job.link || null,
    statusDetail: job.statusDetail || "",
    // added straight to Submitted: that's the day you applied
    appliedOn: job.stage === "submitted" ? today() : null,
    custom: true,
  });
  return id;
}

// Undo after Remove: puts the item back exactly as it was (column, notes, details...)
export function putBackOnTracker(item) {
  addItem(item);
}

// Moves a job to another column. Moving it to Submitted also dates it today, unless
// it already has a date applied (the move carries the date, so the account gets it)
export function moveOnTracker(id, stage) {
  const item = currentItems().find((each) => each.id === id);
  if (!item || !stageNames.includes(stage)) return;
  const appliedOn = stage === "submitted" ? item.appliedOn || today() : undefined;
  changeItem(id, appliedOn ? { stage: stage, appliedOn: appliedOn } : { stage: stage }, { type: "move", stage: stage, appliedOn: appliedOn });
}

export function saveTrackerNotes(id, notes) {
  changeItem(id, { notes: notes }, { type: "notes", notes: notes });
}

// The card's details: { link, statusDetail, appliedOn } (the Details form on the
// tracker). Empty ones are saved as nothing
export function saveTrackerDetails(id, details) {
  const fields = { link: details.link || null, statusDetail: details.statusDetail || "", appliedOn: details.appliedOn || null };
  changeItem(id, fields, { type: "details", details: fields });
}

export function removeFromTracker(id) {
  const account = loggedInId();
  const list = currentItems();
  if (!list.some((item) => item.id === id)) return;
  setItems(account, list.filter((item) => item.id !== id));
  if (account) queueChange(account, { type: "remove", id: id });
}


// ---------- Sending changes to the account, and reading it back ----------

// Sends one change from the outbox. Throws if the request failed
async function sendChange(account, change) {
  const send = (path, method, body) => api(path, { method: method, body: body && JSON.stringify(body), asUser: account });

  if (change.type === "add") {
    // A real job: the backend copies its title from the jobs table itself (it
    // never takes the browser's word for it). An example or a typed-in job: its
    // words are sent (an example's from opportunities.js)
    const details = change.details ?? {};
    const words = (job) => ({ title: job.title, organization: job.organization ?? "", deadline: job.deadline ?? null });
    let body;
    if (typeof change.id === "number") {
      body = { example_id: change.id, ...words(opportunities.find((job) => job.id === change.id) ?? details) };
    } else if (details.custom) {
      body = { id: change.id, ...words(details) };
    } else {
      body = { job_id: change.id };
    }
    body.status = change.stage;
    // notes and details come along too (Undo puts them back)
    if (details.notes) body.notes = details.notes;
    if (details.link) body.link = details.link;
    if (details.statusDetail) body.status_detail = details.statusDetail;
    if (details.appliedOn) body.applied_on = details.appliedOn;
    const { application } = await send("/applications", "POST", body);
    writeSaved(serverIdsName, account, { ...readServerIds(account), [change.id]: application.id });
    // It was on the account already, in another column: usually that column
    // wins (your other device chose it), but Apply means "it's submitted"
    if (change.mustBe && application.status !== change.stage) {
      await send("/applications/" + application.id, "PATCH", { status: change.stage, applied_on: details.appliedOn ?? null });
    }
    return;
  }

  // The rest need the server's row id. None means the account never got this
  // job (adding it was refused), so there's nothing to do
  const rowId = readServerIds(account)[change.id];
  if (!rowId) return;
  // What a PATCH sends for each kind of change (the server's names for the fields)
  const patchBody = () => {
    if (change.type === "move") return change.appliedOn ? { status: change.stage, applied_on: change.appliedOn } : { status: change.stage };
    if (change.type === "notes") return { notes: change.notes };
    const d = change.details ?? {};
    return { link: d.link ?? null, status_detail: d.statusDetail ?? "", applied_on: d.appliedOn ?? null };
  };
  try {
    if (change.type === "remove") await send("/applications/" + rowId, "DELETE");
    else await send("/applications/" + rowId, "PATCH", patchBody());
  } catch (error) {
    // 404: it was taken off on another device, so there's nothing left to change
    if (error.status !== 404) throw error;
  }
  if (change.type === "remove") {
    const ids = readServerIds(account);
    delete ids[change.id];
    writeSaved(serverIdsName, account, ids);
  }
}

// Sends the outbox, oldest first, one at a time (so the server sees changes in
// the order you made them). Gives back false if the server couldn't be reached
async function sendOutbox(account) {
  for (;;) {
    // read it fresh each time: a new change may have been added meanwhile
    const change = readOutbox(account)[0];
    if (!change) return true;
    try {
      await sendChange(account, change);
    } catch (error) {
      if (canRetry(error)) return false;
      // The server said no, so that change can never go through: drop it, and say why
      setStatus(account, { problem: "One change couldn't be saved to your account: " + error.message });
    }
    writeSaved(outboxName, account, readOutbox(account).filter((each) => each.key !== change.key));
  }
}

// A row from the server -> an item. A row with neither a job_id nor an
// example_id (typed in, or its job was deleted later) uses its own id
function itemFromRow(row) {
  const item = {
    id: row.example_id ?? row.job_id ?? row.id,
    stage: row.status,
    title: row.title,
    organization: row.organization,
    deadline: row.deadline,
    initials: initialsOf(row.organization),
    notes: row.notes ?? "",
    link: row.link ?? null,
    statusDetail: row.status_detail ?? "",
    appliedOn: row.applied_on ?? null,
  };
  if (row.example_id === null && row.job_id === null) item.custom = true;
  return item;
}

// The list with the outbox's changes done on top: what this device should show
// while they're still on their way
function withOutbox(items, outbox) {
  let list = items;
  for (const change of outbox) {
    if (change.type === "add" && !list.some((item) => item.id === change.id)) {
      list = [...list, { ...change.details, id: change.id, stage: change.stage }];
    } else if (change.type === "move" || change.type === "notes" || change.type === "details") {
      const fields = change.type === "move" ? { stage: change.stage, ...(change.appliedOn ? { appliedOn: change.appliedOn } : {}) }
        : change.type === "notes" ? { notes: change.notes } : change.details;
      list = list.map((item) => (item.id === change.id ? { ...item, ...fields } : item));
    } else if (change.type === "remove") {
      list = list.filter((item) => item.id !== change.id);
    }
  }
  return list;
}

// One round of syncing. Gives back "done", "offline" (try again later), or
// "more" (changes were made meanwhile: go again right away)
async function syncOnce(account) {
  // 1. Jobs on this device the account has never heard of (a list from before
  //    accounts kept it): put each one in the outbox, once
  const serverIds = readServerIds(account);
  const outbox = readOutbox(account);
  const unsent = cleanList(readSaved(listName, account)).filter((item) => !serverIds[item.id] && trackerJob(item)
    && !outbox.some((change) => change.type === "add" && change.id === item.id));
  if (unsent.length > 0) {
    writeSaved(outboxName, account, [...outbox, ...unsent.map(({ id, stage, ...details }) => (
      { type: "add", id: id, stage: stage, details: details, key: newUuid() }))]);
  }

  // 2. Send the outbox. If the server can't be reached, stop here: this device
  //    keeps showing its own list
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
    if (canRetry(error)) {
      setStatus(account, { state: "offline" });
      return "offline";
    }
    setStatus(account, { problem: "Your account's list couldn't be loaded: " + error.message });
    return "done";
  }
  const rows = Array.isArray(answer.applications) ? answer.applications : [];
  writeSaved(serverIdsName, account, Object.fromEntries(rows.map((row) => [itemFromRow(row).id, row.id])));
  // Changes made while the list was on its way: show them on top, send them next
  const waiting = readOutbox(account);
  setItems(account, withOutbox(cleanList(rows.map(itemFromRow)), waiting));
  if (waiting.length > 0) return "more";
  setStatus(account, { state: "saved" });
  return "done";
}

// Only one sync at a time. One asked for meanwhile ("again") runs right after
let running = null;
let again = false;
let retryTimer = null;

// Sends this device's changes, then reads the account's list back
function syncTracker() {
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
        // don't send the same change at once (old browsers skip it: the backend
        // copes, since adding a job twice keeps one)
        const result = navigator.locks
          ? await navigator.locks.request("scoutsearch-tracker-sync", () => syncOnce(account))
          : await syncOnce(account);
        clearTimeout(retryTimer);
        // Couldn't reach the server: try again by itself in 15 seconds
        if (result === "offline") retryTimer = setTimeout(syncTracker, 15000);
        if (result === "more") again = true;
      } while (again);
    } catch (error) {
      // a mistake in our own code: log it, and let the next sync try again
      console.error("Syncing the tracker failed:", error);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Back online: send what's waiting right away. Coming back to this tab: read the
// account again, so changes from your other devices show up here
window.addEventListener("online", () => syncTracker());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && loggedInId()) syncTracker();
});


// ---------- Hooks for pages ----------
// A "hook" is a function a component calls at its top to get something that
// can change, and redraw when it does.

// The tracker's list (a different account logging in redraws it too)
export function useTrackerItems() {
  useLoggedInId();
  return useSyncExternalStore(subscribe, currentItems);
}

// Syncs with the account when the page opens (and when a different account
// logs in), and gives back how it's going: { state, problem }
export function useTrackerSync() {
  const account = useLoggedInId();
  useEffect(() => {
    if (account) syncTracker();
  }, [account]);
  const current = useSyncExternalStore(subscribe, () => status);
  return current.account === account ? current : startingStatus;
}
