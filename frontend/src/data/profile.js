// profile.js keeps your profile: what you fill in on the welcome guide
// (pages/Welcome.jsx) and on Edit profile, and what the Profile page shows.
// It's saved with your ACCOUNT (the backend's /api/student-profile/me), so it
// follows you to any device. This browser also keeps a copy (localStorage),
// so your profile shows up right away, even before the server answers.
//
// Your education, experience, and projects aren't in here: the Profile page
// takes them from your resume (resume-storage.js), so you only type them once.
//
// How to use it in a component:
//   const profile = useMyProfile();
//   profile.data        { name, pronouns, level, school, classYear, major, city, headline, about,
//                         lookingFor: { kinds, when, where, paidOnly }, skills }
//                       level is "high-school", "college", or "" (not picked yet)
//   profile.known       true once we know your profile (from the server, or this browser's copy)
//   profile.state       "loading", "ready" (the server answered), or "offline"
//   profile.needsGuide  true if you haven't finished or skipped the welcome guide
//   await saveProfile(data)          saves it (throws an Error with a message if it can't)
//   await saveProfile(data, true)    ...and marks the welcome guide as done

// useSyncExternalStore lets a page redraw when something outside React changes
// (here: the server's answer). useEffect asks the server after the page shows up
import { useEffect, useSyncExternalStore } from 'react';
// api() talks to our backend (api.js)
import { api } from '../api.js';
// accountKey keeps each account's copy apart on a shared computer, and
// loggedInId / useLoggedInId say whose profile it is (login-status.js)
import { accountKey, loggedInId, useLoggedInId } from '../login-status.js';

// The kinds of positions you can be looking for: the same as the job board's tabs
export const positionKinds = ['Internship', 'Co-op', 'Research', 'Program'];

// Where you are in school: the welcome guide and Edit profile ask (ProfileFields.jsx),
// and Opportunities and Best fit use it to start with what you can apply to.
// The same two words as the job board's "Who it's for" filter and the backend
// (backend/src/student-profile.ts drops anything else)
export const schoolLevels = ['high-school', 'college'];

// The most letters each box can hold. The boxes use these as maxLength, and
// the backend checks the same numbers (backend/src/student-profile.ts)
export const most = {
    name: 100, pronouns: 40, school: 150, classYear: 20, major: 100, city: 100,
    headline: 150, about: 2000, when: 100, where: 150, skill: 50, skills: 30,
};

// A profile with nothing filled in yet
export const emptyProfile = {
    name: '', pronouns: '', level: '', school: '', classYear: '', major: '', city: '',
    headline: '', about: '',
    lookingFor: { kinds: [], when: '', where: '', paidOnly: false },
    skills: [],
};

// Fills in anything missing (or the wrong type) from a saved profile, so a page
// never crashes on an old or broken copy
function fillProfile(saved) {
    const data = saved && typeof saved === 'object' ? saved : {};
    const looking = data.lookingFor && typeof data.lookingFor === 'object' ? data.lookingFor : {};
    // text, or "" if it isn't text
    const text = (value) => (typeof value === 'string' ? value : '');
    return {
        name: text(data.name), pronouns: text(data.pronouns),
        // only one of the two levels; anything else counts as "not picked yet"
        level: schoolLevels.includes(data.level) ? data.level : '',
        school: text(data.school),
        classYear: text(data.classYear), major: text(data.major), city: text(data.city),
        headline: text(data.headline), about: text(data.about),
        lookingFor: {
            kinds: Array.isArray(looking.kinds) ? looking.kinds.filter((kind) => positionKinds.includes(kind)) : [],
            when: text(looking.when),
            where: text(looking.where),
            paidOnly: looking.paidOnly === true,
        },
        skills: Array.isArray(data.skills) ? data.skills.filter((skill) => typeof skill === 'string') : [],
    };
}

// The name this browser's copy is saved under (plus the account's id)
const storageKey = 'scoutsearch-profile';

// This browser's copy for an account, or null. try/catch: storage can be turned off
function readCopy(account) {
    try {
        const row = JSON.parse(localStorage.getItem(accountKey(storageKey, account)));
        return row && typeof row === 'object' ? row : null;
    } catch {
        return null;
    }
}
function keepCopy(account, row) {
    try {
        if (row) localStorage.setItem(accountKey(storageKey, account), JSON.stringify(row));
        else localStorage.removeItem(accountKey(storageKey, account));
    } catch {
        // Storage is off: the server still has it
    }
}

// What we know right now, for the logged-in account:
//   row    what the server sent ({ data, onboarded_at, updated_at }) or this browser's copy of it, or null
//   state  "loading", "ready", or "offline"
let current = { account: null, row: null, state: 'loading' };
const listeners = new Set();
function update(next) {
    current = next;
    for (const listener of listeners) listener();
}
// The account's starting point: this browser's copy, until the server answers
function snapshotFor(account) {
    if (current.account !== account) {
        current = { account: account, row: account ? readCopy(account) : null, state: 'loading' };
    }
    return current;
}

// Accounts that pressed "Skip the guide" while the server couldn't be reached.
// They aren't sent back to the guide again during this visit
const skippedThisVisit = new Set();

// The account being asked about right now, so two pages don't ask twice at once
let asking = null;
// Asks the server for the account's profile
function askServer(account) {
    if (!account || asking === account) return;
    asking = account;
    api('/student-profile/me', { asUser: account })
        .then((answer) => {
            // Our backend always answers { profile: {...} } or { profile: null }.
            // Anything else didn't come from it, so it counts as no answer.
            // (Without this, a wrong answer would look like "no profile yet",
            // and would send everyone to the welcome guide)
            if (typeof answer?.profile !== 'object') throw new Error('Not an answer from our backend');
            keepCopy(account, answer.profile);
            if (loggedInId() === account) update({ account: account, row: answer.profile, state: 'ready' });
        })
        .catch(() => {
            // Couldn't reach it (or it said no): keep showing this browser's copy
            if (current.account === account) update({ ...current, state: 'offline' });
        })
        .finally(() => {
            asking = null;
        });
}

// Asks again (the "Try again" button, when the server couldn't be reached)
export function reloadProfile() {
    askServer(loggedInId());
}

// Your newest profile (filled in like profile.data), for code that changes just
// one part of it and saves the rest as it is (profile-resume-sync.js does, when
// you change your resume). If the server hasn't answered yet this visit, it asks
// first. Gives back null if your profile isn't known at all
export async function latestProfile() {
    const account = loggedInId();
    if (!account) return null;
    if (snapshotFor(account).state !== 'ready') {
        try {
            const answer = await api('/student-profile/me', { asUser: account });
            if (typeof answer?.profile === 'object') {
                keepCopy(account, answer.profile);
                update({ account: account, row: answer.profile, state: 'ready' });
            }
        } catch {
            // Can't reach it: use this browser's copy, if there is one
        }
    }
    const snapshot = snapshotFor(account);
    return snapshot.state === 'ready' || snapshot.row ? fillProfile(snapshot.row?.data) : null;
}

// Saves the whole profile to your account. finished: true also marks the
// welcome guide as done. Gives back the saved profile, or throws an Error
// whose message can be shown on the page
export async function saveProfile(data, finished = false) {
    const account = loggedInId();
    const answer = await api('/student-profile/me', {
        method: 'PUT',
        body: JSON.stringify({ data: data, finished: finished }),
        asUser: account,
    });
    // The same check as above: a saved profile always comes back
    if (!answer?.profile || typeof answer.profile !== 'object') {
        throw new Error("Couldn't reach the server. Try again in a minute.");
    }
    keepCopy(account, answer.profile);
    update({ account: account, row: answer.profile, state: 'ready' });
    return answer.profile;
}

// "Skip the guide" when it couldn't be saved: don't show the guide again
// until the next visit (by then the server is probably back)
export function skipGuideForNow() {
    skippedThisVisit.add(loggedInId());
    update({ ...current });
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// The React "hook" pages use (see the top of this file)
export function useMyProfile() {
    const account = useLoggedInId();
    const snapshot = useSyncExternalStore(subscribe, () => snapshotFor(account));

    // Ask the server once per visit (and again if it couldn't be reached last time)
    useEffect(() => {
        if (account && snapshotFor(account).state !== 'ready') askServer(account);
    }, [account]);

    return {
        data: fillProfile(snapshot.row?.data),
        known: snapshot.state === 'ready' || snapshot.row !== null,
        state: snapshot.state,
        // Only the server's answer can send you to the guide: if it can't be
        // reached, you use the site as normal (better than being stuck)
        needsGuide: Boolean(account) && snapshot.state === 'ready' && !snapshot.row?.onboarded_at && !skippedThisVisit.has(account),
    };
}
