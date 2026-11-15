// supabase.js makes ONE connection to our supabase database and 
// every page imports it from here. If each page made its own connection,
// the browser would end up with several copies that don't share the
// login state. This is a common pattern in React apps.
import { createClient } from '@supabase/supabase-js'

// Vite reads these from the .env.local. Only names that start with VITE_
// are exposed to the browser. This is a security feature of Vite.
// Names with VITE_ get passed to the browser code
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Make the connection once and share it with "export" with the rest of the site
// flowType: 'pkce' is the safer way to handle logins that send you to
// another site and back (like "Log in with Google"). It's more secure than
// the old way (called the "implicit flow").
// If .env.local is missing, createClient crashes, and since App.jsx loads the
// Log in and Sign up pages right away, the whole site would go blank. So with
// no keys we export null instead, and the pages check for that before using it.
// A key that's there but written wrong (like a URL without "https://", from a
// typo in Vercel's settings) crashes it the same way, so connect() catches that
// too: the real reason goes to the console (F12), and the site still opens.
function connect() {
    if (!supabaseUrl || !supabaseKey) return null;
    try {
        return createClient(supabaseUrl, supabaseKey, {
            auth: {
                flowType: 'pkce', // Use PKCE flow for authentication
            },
        });
    } catch (error) {
        console.error('Supabase: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY looks wrong:', error);
        return null;
    }
}
export const supabase = connect();

// Remembers if this visit came from a "reset your password" email link.
// Supabase says so with a PASSWORD_RECOVERY event as the site opens, which
// can happen before the Reset password page (ResetPassword.jsx) has even
// loaded. So the listening starts here, right after the connection is made.
// The Reset password page checks it, so its form only shows for the account
// in the link, never for someone who was already logged in on this computer
// (a link that didn't work leaves their login in place)
let cameFromResetLink = false
if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') cameFromResetLink = true
        // Logging out forgets it, so the next person to log in can't use it
        if (event === 'SIGNED_OUT') cameFromResetLink = false
    })
}

// true if a reset link logged you in during this visit (see above)
export function openedFromResetLink() {
    return cameFromResetLink
}