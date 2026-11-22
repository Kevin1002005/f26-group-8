// use-current-user.js tells a component who is logged in: their name, their
// initials (for the circle in the top bar), and their email.
//
// Before this, every page showed the same made-up person ("Roemer Mallari",
// "RMV"), so a real person who logged in with Google saw someone else's name
// as their own.
//
// The name comes from your profile (what you typed in the welcome guide or on
// My info, data/profile.js), so changing it there changes it everywhere, like
// in the top bar's dropdown. Until your profile has a name, it's
// the one on your login: Google gives Supabase your name and email when you log
// in with it, and Sign up saves the name you typed.
// LATER (task F8 in frontend/plans.md): ask the backend instead, with
// api('/auth/me'), which will also say your role (student, employer, ...).
// Pages that use this hook won't need to change when that happens.
//
// How to use it in a component:
//   const me = useCurrentUser();
//   me.name       'Kevin Liu' (or '' if we don't know it)
//   me.initials   'KL' (or '' if we don't know the name)
//   me.email      'kevin@example.com' (or '')

// useState remembers the user; useEffect starts listening to Supabase
// after the component shows up on the screen
import { useEffect, useState } from 'react';
// supabase is our one shared connection (supabase.js). It's null when
// .env.local is missing
import { supabase } from './supabase.js';
// Your profile, for the name you gave it (data/profile.js)
import { useMyProfile } from './data/profile.js';

// Turns a name into 1 or 2 capital letters for the circle:
//   'Kevin Liu' -> 'KL', 'Maya' -> 'M', 'kevin@example.com' -> 'K', '' -> ''
// split(/\s+/) cuts the name at the spaces; filter(Boolean) drops empty pieces
export function initialsFor(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = words[0][0];
    // Only add a second letter if there's more than one word
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase();
}

export function useCurrentUser() {
    // The Supabase user, or null while we don't know (or nobody is logged in)
    const [user, setUser] = useState(null);
    // Your profile (its name wins over the login's, see the top of this file)
    const profile = useMyProfile();

    useEffect(() => {
        // No Supabase set up (no .env.local): nothing to read
        if (!supabase) return;

        // onAuthStateChange calls us back right away with the current login
        // (Supabase calls this "INITIAL_SESSION"), and again whenever someone
        // logs in or out, even in another tab. So the name stays up to date
        // without reloading the page. "?." gives undefined instead of
        // crashing when there's no session
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
        });

        // "Clean up" when the component goes away: stop listening
        return () => data.subscription.unsubscribe();
    }, []);

    // Your profile's name first. Then the login's: Google puts the name in
    // user_metadata as full_name (or sometimes name). If there's no name at
    // all, pages show the email instead.
    // "||" means "use the first one that isn't empty"
    const metadata = user?.user_metadata ?? {};
    const email = user?.email ?? '';
    const name = profile.data.name.trim() || metadata.full_name || metadata.name || '';

    return {
        name: name,
        initials: initialsFor(name || email),
        email: email,
    };
}
