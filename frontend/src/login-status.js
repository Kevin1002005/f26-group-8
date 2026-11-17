// login-status.js remembers WHO is logged in on this browser, so pages can
// show different things to logged-in people (for example, the About page's
// top bar shows "Home" and your circle instead of "Log in" and "Sign up"),
// and so the Resume builder and the Application tracker can keep each
// person's things apart (see accountKey below).
//
// When Supabase logs you in, the page that did it (Log in, Sign up, Reset
// password) calls markLoggedIn with your account's id: the long code Supabase
// gives every account, like "1b2c3d4e-...". It's saved in the browser's
// localStorage (a small storage space each website gets) and removed on Log out.
//
// It also listens to Supabase itself, so the site notices when a login ends
// some other way: Log out in another tab, or a login that ran out.

// useSyncExternalStore lets a component redraw when something outside React
// changes (here: who's logged in). See useLoggedInId at the bottom
import { useSyncExternalStore } from 'react';
// supabase is our shared connection (supabase.js). Logging in makes a real
// Supabase login, so Log out has to end that too (see markLoggedOut)
import { supabase } from './supabase.js';

// The name it's saved under in localStorage
const storageKey = 'scoutsearch-logged-in';

// The same id, also kept in memory. Some browsers block localStorage (a
// setting like "Don't allow sites to save data"). Then saving the id fails
// without a sound, but Supabase still logs you in (it keeps its login in
// memory instead). Without this copy, the login guard (RequireLogin) would
// think nobody is logged in and send you to Log in, which would see Supabase's
// login and send you back, over and over, forever. In memory, the copy lasts
// until the tab is reloaded or closed, like Supabase's own.
let idInMemory = null;

// The components that want to hear when the login changes (useLoggedInId)
const listeners = new Set();
function tellListeners() {
    for (const listener of listeners) listener();
}

// The id of the account logged in on this browser, or null if nobody is.
// "try/catch": if the browser blocks localStorage, reading throws
export function loggedInId() {
    if (idInMemory) return idInMemory;
    try {
        const saved = localStorage.getItem(storageKey);
        // Before ids were saved, this was just "yes". That counts as logged out,
        // so the login guard sends you to Log in, which sees your Supabase login
        // and saves your id in a split second (no password needed)
        return saved && saved !== 'yes' ? saved : null;
    } catch {
        return null;
    }
}

// True if someone is logged in
export function isLoggedIn() {
    return loggedInId() !== null;
}

// The name a page saves someone's things under: the page's own name plus the
// account id, like "scoutsearch-resume:1b2c3d4e-...". On a shared computer
// (a school library), the next person to log in gets their OWN resume and
// tracker, not yours. Logging out deletes yours from this browser (see
// forgetAccountCopies below): your account keeps them, and they come back
// when you log in again. (Only changes that haven't reached your account yet
// stay, so they can be sent the next time you log in here.)
// id is whose: leave it out for whoever is logged in now. (tracker.js and
// resume-storage.js pass it, to finish saving for the account that made a
// change even if someone else has logged in since)
export function accountKey(name, id = loggedInId()) {
    // Only pages behind the login guard save things, so there's always an id.
    // "guest" is just a safe fallback
    return name + ':' + (id ?? 'guest');
}

// Reads someone's saved things, by the page's name ("scoutsearch-resume").
// Before each account had its own, everyone's were saved under the plain name.
// The first account to open the page on this browser after that change takes
// the old copy over, once, so nobody loses a resume they had already made.
// It can throw if the browser blocks localStorage: the pages that call this
// already catch that. id is whose, like in accountKey
export function readAccountItem(name, id = loggedInId()) {
    const key = accountKey(name, id);
    const mine = localStorage.getItem(key);
    if (mine !== null || id === null) return mine;
    const old = localStorage.getItem(name);
    if (old !== null) {
        localStorage.setItem(key, old);
        localStorage.removeItem(name);
    }
    return old;
}

// Remembers who just logged in. Log in, Sign up, and Reset password run this
// with the id Supabase gives back (session.user.id)
export function markLoggedIn(userId) {
    idInMemory = userId;
    try {
        localStorage.setItem(storageKey, userId);
    } catch {
        // Saving is blocked: the copy in memory still works until a reload
    }
    tellListeners();
}

// Forgets the login in this browser (without asking Supabase)
function forgetLogin() {
    idInMemory = null;
    try {
        localStorage.removeItem(storageKey);
    } catch {
        // Nothing to forget
    }
    tellListeners();
}

// Deletes this browser's copies of one account's things (every saved item whose
// name ends in ":<id>": profile, resume, tracker, hidden companies). The account
// itself keeps them. Log out and Delete my account both run this, so on a shared
// computer the next person can't read yours, even in the browser's developer tools.
// keepUnsent (Log out): changes made offline that haven't reached the account yet
// stay, so they're sent the next time you log in here instead of being lost
// (the resume, if it has an unsent edit; the tracker, if its outbox isn't empty)
export function forgetAccountCopies(id, { keepUnsent = false } = {}) {
    if (!id) return;
    try {
        const keep = new Set();
        if (keepUnsent) {
            if (localStorage.getItem('scoutsearch-resume-unsent:' + id) === 'yes') {
                for (const name of ['scoutsearch-resume', 'scoutsearch-resume-unsent', 'scoutsearch-resume-base']) keep.add(name + ':' + id);
            }
            const outbox = JSON.parse(localStorage.getItem('scoutsearch-applications-outbox:' + id) ?? '[]');
            if (Array.isArray(outbox) && outbox.length > 0) {
                for (const name of ['scoutsearch-applications', 'scoutsearch-applications-outbox', 'scoutsearch-applications-server-ids']) keep.add(name + ':' + id);
            }
        }
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('scoutsearch-') && key.endsWith(':' + id) && !keep.has(key)) localStorage.removeItem(key);
        }
    } catch {
        // storage is off (or a saved item is broken): there's nothing more to remove
    }
}

// Forgets the login (the dropdown's "Log out" runs this).
// "async" + "await": it waits for Supabase to finish logging out, so whoever
// runs this can wait too ("await markLoggedOut()") before opening the Log in page
export async function markLoggedOut() {
    // End the real Supabase login too. Without this, the Log in page would
    // still find the old login and send you right back to Opportunities.
    // scope: 'local' logs out only this browser, not your other devices.
    // "await" matters: Supabase only forgets the login AFTER its server answers
    // (about a third of a second). Without waiting, the Log in page could still
    // find it in that time. (If the internet is down, Supabase still forgets it
    // in this browser and hands back an error, so nothing else is needed here)
    // supabase is null when .env.local is missing, so "if" skips it then
    // whose copies to delete: read it before forgetting the login
    const id = loggedInId();
    if (supabase) {
        await supabase.auth.signOut({ scope: 'local' });
    }
    forgetAccountCopies(id, { keepUnsent: true });
    forgetLogin();
}

// Supabase tells us when its login ends without our Log out button:
// - SIGNED_OUT: you logged out in another tab (Supabase tells every open tab),
//   or the login ran out and couldn't be renewed
// - INITIAL_SESSION with no session: the site just opened, we thought you were
//   logged in, but Supabase has no login for you anymore
// Either way, forget it, so the login guard sends you to Log in instead of
// showing pages that can't load your things.
if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
        const loginEnded = event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session);
        if (loginEnded && isLoggedIn()) {
            forgetLogin();
        }
    });
}

// When ANOTHER tab logs in or out, it changes localStorage, and the browser
// tells this tab with a "storage" event (event.key null = everything was cleared)
window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
        // The other tab's answer wins over this tab's copy in memory
        idInMemory = event.newValue && event.newValue !== 'yes' ? event.newValue : null;
        tellListeners();
    }
});

// A React "hook": gives a component the logged-in id (or null), and redraws
// that component whenever it changes. RequireLogin uses it, so logging out in
// another tab sends this tab to Log in too.
// subscribe adds a listener and gives back a way to remove it
function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function useLoggedInId() {
    return useSyncExternalStore(subscribe, loggedInId);
}
