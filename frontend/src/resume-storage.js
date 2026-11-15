// resume-storage.js keeps the Resume builder's information (pages/ResumeBuilder.jsx).
// It's saved with your ACCOUNT (the backend's /api/resumes/me, plans.md Task
// F15), so it follows you to any device. It's also kept in this browser's
// storage (localStorage), so:
//   - the builder opens with your resume right away, and
//   - if the server can't be reached, your typing is still kept here, and is
//     sent to your account as soon as the server is back.
// A resume saved in this browser before accounts kept it is sent to your
// account the first time you open the builder (once).
//
// The shape is the "Resume" one in frontend/plans.md's shared contract:
//   { contact, education[], experience[], projects[], skills[] }
// Bullet points are kept as one piece of text with one bullet per line,
// because that's how you type them in the form.
//
// Every read and write is inside try/catch: the browser's storage can be
// turned off (some private windows). Then the builder still works, and your
// account still keeps it; this browser just won't have its own copy.

// useSyncExternalStore lets the page redraw when something outside React
// changes (here: "Saved to your account" and the like). See useResumeSync
import { useSyncExternalStore } from 'react';
// api() is how we talk to the backend (api.js)
import { api } from './api.js';
// accountKey and readAccountItem keep each account's resume apart
// (login-status.js): on a shared computer, the next person to log in gets
// their own resume, not yours. Yours stays for when you log back in.
// loggedInId says whose resume it is right now
import { accountKey, loggedInId, readAccountItem, useLoggedInId } from './login-status.js';

// The name it's saved under in localStorage (plus the account's id, added by accountKey)
const storageKey = 'scoutsearch-resume';
// Saved as "yes" while this browser has changes your account doesn't have yet
// (you typed while the server couldn't be reached, or closed the tab right
// after typing). Then this browser's copy is the newest, and gets sent first
const unsentKey = 'scoutsearch-resume-unsent';

// A made-up example, so a new visitor sees how a finished resume looks.
// Everything in it is invented on purpose (the team's rule: examples are
// clearly fake, never a real person's details).
export const exampleResume = {
    contact: {
        name: 'Jamie Rivera',
        location: 'Boston, MA',
        email: 'jamie.rivera@example.com',
        phone: '',
        link: 'linkedin.com/in/jamie-rivera-example',
    },
    education: [
        {
            id: 1,
            school: 'Northeastern University',
            location: 'Boston, MA',
            degree: 'Bachelor of Science in Computer Science',
            dates: 'Sep 2026 – Present',
        },
    ],
    projects: [
        {
            id: 1,
            name: 'Study Buddy',
            context: 'Campus Hackathon',
            dates: 'Nov 2026',
            bullets: 'Co-built a web app that matches students into study groups by class and schedule.\nBuilt the sign-up flow and the group chat page in React.\nDeployed the app and wrote the setup guide for the team.',
            link: 'github.com/example/study-buddy',
        },
        {
            id: 2,
            name: 'Budget Tracker',
            context: 'Personal project',
            dates: 'Aug 2026',
            bullets: 'Made a budgeting site that sorts spending into categories and shows a monthly chart.\nUsed JavaScript, HTML, and CSS, and made every page work with a keyboard.',
            link: '',
        },
    ],
    experience: [
        {
            id: 1,
            role: 'Library Assistant',
            organization: 'Westbrook Public Library',
            location: 'Boston, MA',
            dates: 'Jun 2025 – Present',
            bullets: 'Helped visitors find books and use the computers, about 40 people a shift.\nRan a weekly coding club for middle schoolers.',
        },
        {
            id: 2,
            role: 'Cashier',
            organization: 'Harbor Street Bakery',
            location: 'Quincy, MA',
            dates: 'Jun 2024 – May 2025',
            bullets: 'Handled orders and payments during busy weekend mornings.\nTrained two new team members on the register.',
        },
    ],
    skills: [
        { id: 1, label: 'Languages', items: 'Python, JavaScript, HTML, CSS' },
        { id: 2, label: 'Tools', items: 'Git, GitHub, VS Code, Figma' },
        { id: 3, label: 'Concepts', items: 'Front-End Development, Accessibility (WCAG), Responsive Design' },
    ],
};

// An empty resume, for "Start from scratch". One empty entry in each
// section, so the form shows the boxes to fill in
export const blankResume = {
    contact: { name: '', location: '', email: '', phone: '', link: '' },
    education: [{ id: 1, school: '', location: '', degree: '', dates: '' }],
    projects: [{ id: 1, name: '', context: '', dates: '', bullets: '', link: '' }],
    experience: [{ id: 1, role: '', organization: '', location: '', dates: '', bullets: '' }],
    skills: [{ id: 1, label: 'Languages', items: '' }],
};

// Copies one entry, keeping only the boxes "blank" has, each one as text.
// Text stays, and a number is turned into text ("2026"). Anything else (a
// missing box, null, a list, an object) becomes empty, so the page's .trim()
// and form boxes always work and the resume never says "[object Object]"
function fillBoxes(blank, entry) {
    const filled = {};
    for (const key of Object.keys(blank)) {
        const value = entry[key];
        filled[key] = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    }
    return filled;
}

// Fills in anything missing from a saved resume (an older version, or one
// saved halfway). Without this, one missing box crashes the whole page.
// The ids are numbered again (1, 2, 3...) so no two entries share one
function fillGaps(saved) {
    // One list, like "projects": only real entries, each with every box
    function fillList(key) {
        const list = Array.isArray(saved[key]) ? saved[key] : [];
        return list
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry, place) => ({ ...fillBoxes(blankResume[key][0], entry), id: place + 1 }));
    }
    return {
        contact: fillBoxes(blankResume.contact, saved.contact),
        education: fillList('education'),
        projects: fillList('projects'),
        experience: fillList('experience'),
        skills: fillList('skills'),
    };
}

// A quick check that something really is a resume, in case something else
// got saved there. Gives back a full resume (fillGaps), or null
function asResume(saved) {
    return saved && typeof saved === 'object' && typeof saved.contact === 'object' && saved.contact !== null
        ? fillGaps(saved)
        : null;
}

// Gives back the saved resume, or null if nothing is saved yet (or the
// saved text is broken). account is whose (leave it out for whoever is logged in)
export function loadResume(account = loggedInId()) {
    try {
        return asResume(JSON.parse(readAccountItem(storageKey, account)));
    } catch {
        return null;
    }
}

// Saves the whole resume: in this browser now, and to your account a moment
// after you stop typing (see sendSoon). Gives back true if this browser saved
// it, or false if its storage is full or turned off, so the page can warn you
export function saveResume(resume) {
    const account = loggedInId();
    let savedHere = true;
    try {
        localStorage.setItem(accountKey(storageKey, account), JSON.stringify(resume));
        // until it reaches your account, this browser's copy is the newest
        localStorage.setItem(accountKey(unsentKey, account), 'yes');
    } catch {
        savedHere = false;
    }
    if (account) {
        sendSoon(account, resume);
    }
    return savedHere;
}


// ---------- Saving to your account ----------

// How saving to your account is going, for the line on the Resume builder:
//   state    "waiting" (nothing known yet), "saved" (your account has the
//            newest), "offline" (the server can't be reached: it's kept in this
//            browser for now), or "problem" (the server said no, see message)
//   message  the server's reason, for "problem"
const startingStatus = { account: null, state: 'waiting', message: '' };
let status = startingStatus;
const listeners = new Set();
function setStatus(account, state, message = '') {
    status = { account: account, state: state, message: message };
    for (const listener of listeners) listener();
}

// The newest change that hasn't been sent yet ({ account, resume }), or null
let waiting = null;
// The timer for "send it a moment after you stop typing"
let typingTimer = null;
// Sending goes one at a time, in order: each send waits for the one before
let sendLine = Promise.resolve();
// The timer for "try again later" (when the server couldn't be reached)
let retryTimer = null;

// Does the browser have changes your account doesn't have yet?
function isUnsent(account) {
    try {
        return localStorage.getItem(accountKey(unsentKey, account)) === 'yes';
    } catch {
        // Storage is off: only what's waiting in memory counts
        return waiting !== null && waiting.account === account;
    }
}
function markSent(account) {
    try {
        localStorage.removeItem(accountKey(unsentKey, account));
    } catch {
        // Nothing to remove
    }
}

// Sends the resume 1.5 seconds after the last change, so typing a sentence
// is one save, not one per letter
function sendSoon(account, resume) {
    waiting = { account: account, resume: resume };
    clearTimeout(typingTimer);
    typingTimer = setTimeout(sendNow, 1500);
}

// True when a failed save is worth trying again later (no answer, the login
// is being renewed, or the server broke). The same rule as tracker.js
function worthRetrying(error) {
    const code = error?.status;
    return typeof code !== 'number' || code === 0 || code === 401 || code === 408 || code === 429 || code >= 500;
}

// Sends what's waiting, right now. keepalive: true lets the browser finish
// sending even if the tab is closing (see "visibilitychange" below).
// Gives back a promise that's done when it's sent (or failed)
function sendNow(options = {}) {
    clearTimeout(typingTimer);
    sendLine = sendLine.then(async () => {
        const job = waiting;
        if (!job) return;
        // Someone else is logged in now: leave it. It's still saved in this
        // browser, marked unsent, so it's sent when that account opens the builder again
        if (loggedInId() !== job.account) {
            waiting = null;
            return;
        }
        waiting = null;
        try {
            await api('/resumes/me', {
                method: 'PUT',
                body: JSON.stringify({ data: job.resume }),
                keepalive: options.keepalive === true,
                asUser: job.account,
            });
            clearTimeout(retryTimer);
            // Only "sent" if nothing newer came in while this was on its way
            if (waiting === null) {
                markSent(job.account);
                setStatus(job.account, 'saved');
            }
        } catch (error) {
            if (worthRetrying(error)) {
                // Put it back (unless something newer is waiting), and try again in 30 seconds
                if (waiting === null) waiting = job;
                setStatus(job.account, 'offline');
                clearTimeout(retryTimer);
                retryTimer = setTimeout(sendNow, 30000);
            } else {
                // The server looked at it and said no (a box is too long, or the
                // whole resume is). It stays in this browser, and the next change is
                // sent again. 413 means "too big": express.json's own answer
                const message = error.status === 413
                    ? 'Your resume is too long to save to your account. Try shortening it.'
                    : error.message;
                setStatus(job.account, 'problem', message);
            }
        }
    });
    return sendLine;
}

// Gets the builder in step with your account. The Resume builder runs this
// when it opens, and whenever you come back to its tab. Gives back a promise
// of the account's resume when it's different from this browser's (the page
// should show it), or null when there's nothing to change
export async function syncResume() {
    const account = loggedInId();
    if (!account) return null;

    // 1. This browser has changes your account doesn't have: send them. They
    //    win, because they're the newest you typed
    if (isUnsent(account)) {
        const local = loadResume(account);
        if (local && waiting === null) waiting = { account: account, resume: local };
        await sendNow();
        return null;
    }

    // 2. Ask your account for its resume
    let answer;
    try {
        answer = await api('/resumes/me', { asUser: account });
    } catch (error) {
        setStatus(account, worthRetrying(error) ? 'offline' : 'problem', error.message);
        return null;
    }
    // You typed while the answer was on its way, or logged out: your typing
    // wins (it's sent in a moment), so leave everything as it is
    if (isUnsent(account) || waiting !== null || loggedInId() !== account) return null;

    const fromAccount = asResume(answer.resume?.data);
    const local = loadResume(account);
    if (fromAccount) {
        // Your account has one: that's the newest (maybe from another device).
        // Keep a copy here too
        setStatus(account, 'saved');
        if (JSON.stringify(fromAccount) === JSON.stringify(local)) return null;
        try {
            localStorage.setItem(accountKey(storageKey, account), JSON.stringify(fromAccount));
        } catch {
            // Storage is off: the page still shows it
        }
        return fromAccount;
    }
    if (local) {
        // Your account has none yet, but this browser does (made before accounts
        // kept resumes): send it to your account, once
        waiting = { account: account, resume: local };
        await sendNow();
        return null;
    }
    // Nothing anywhere yet: the builder shows the example, and nothing is saved
    // until you change something
    setStatus(account, 'waiting');
    return null;
}

// Runs syncResume when the Resume builder opens and whenever you come back to
// its tab (to pick up changes from your other devices), and hands the
// account's resume to "callback" when the page should show it.
// Gives back a function that stops, for useEffect's clean-up
export function watchAccountResume(callback) {
    let stopped = false;
    function check() {
        syncResume().then((fromAccount) => {
            if (!stopped && fromAccount) callback(fromAccount);
        });
    }
    function handleVisible() {
        if (document.visibilityState === 'visible') check();
    }
    check();
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', handleVisible);
    };
}

// Leaving the tab (switching tabs, closing it, or a phone going to the home
// screen): send what's waiting right away instead of in 1.5 seconds, so it
// isn't lost if the tab is closed. keepalive lets it finish after the tab is gone.
// (A resume over 64 KB can't use keepalive; it's still kept in this browser,
// marked unsent, and sent the next time you open the builder)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && waiting !== null) sendNow({ keepalive: true });
});
// Back online: send what's waiting right away
window.addEventListener('online', () => {
    if (waiting !== null) sendNow();
});

// A React "hook" for the Resume builder: how saving to your account is going
// ({ state, message }, see "status" above). The page redraws when it changes
function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function useResumeSync() {
    const account = useLoggedInId();
    const current = useSyncExternalStore(subscribe, () => status);
    return current.account === account ? current : startingStatus;
}

// Keeps two open tabs in step: runs "callback" with the newest resume
// whenever ANOTHER tab saves one. (The browser's "storage" event only fires
// in the other tabs, never in the tab that saved.) Without this, the tab you
// typed in last would quietly overwrite the other tab's changes.
// Gives back a function that stops listening, for useEffect's clean-up
export function watchOtherTabs(callback) {
    function handleStorage(event) {
        // event.key is the name that changed (null means everything was cleared)
        if (event.key === accountKey(storageKey) || event.key === null) {
            callback(loadResume());
        }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
}
