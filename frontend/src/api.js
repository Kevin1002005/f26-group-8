// api.js is how every page talks to our backend (the Express server in backend/).
// Every request goes to /api/..., and the Vite proxy (vite.config.js) passes
// it on to the backend on port 3000.
// It also sends your login token, so the backend knows who is asking.

// supabase is our one shared connection (supabase.js). It knows who's logged in
import { supabase } from './supabase.js';

// An Error with a number on it, so code that calls api() can tell kinds of
// failure apart (src/data/tracker.js and src/resume-storage.js use it to decide
// whether to try again later):
//   0         no answer from our backend (no internet, server down, not set up)
//   400-499   the backend said no (401 = not logged in, 404 = not found, ...)
//   500-599   the backend broke
// body is the backend's whole answer, when there is one: some refusals carry more
// than a message (a 409 from /resumes/me has the copy another device saved)
function failed(message, status, body = {}) {
    const error = new Error(message);
    error.status = status;
    error.body = body;
    return error;
}

// path is the part after /api, like '/posts' or '/messages'.
// options is the same as fetch's, like { method: 'POST', body: ... }.
// Leave options out to just read something (a GET).
// One extra option: asUser. Give it an account id, and the request is only
// sent if that account is the one logged in right now. Saving something for
// one account must never land in another's, even if someone logs out and a
// different person logs in while it's waiting to be sent.
// "export" lets pages import it: import { api } from '../api.js';
export async function api(path, options = {}) {
    // supabase is null when .env.local is missing (see supabase.js)
    if (!supabase) {
        throw failed('Supabase is not set up (.env.local is missing)', 0);
    }

    // Take asUser out, so the rest (method, body, ...) can go to fetch as is
    const { asUser, ...fetchOptions } = options;

    // Ask Supabase for the current login. access_token is the long code
    // that proves who you are. "?." gives undefined instead of crashing
    // when nobody is logged in
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    // Somebody else is logged in now (or nobody): don't send it.
    // 401 is the backend's "not logged in" number, so callers treat it the same
    if (asUser !== undefined && data.session?.user?.id !== asUser) {
        throw failed('You are not logged in to that account anymore.', 401);
    }

    // fetch only throws when no answer came back at all (no internet, or the
    // server is down). Its own message for that is "Failed to fetch", which
    // means nothing to most people, so pages get a clear sentence instead
    let response;
    try {
        response = await fetch('/api' + path, {
            ...fetchOptions, // copies method and body from options
            headers: {
                // tells the backend that what we send is JSON
                'Content-Type': 'application/json',
                // only add the token if there is one. The backend's
                // authenticateToken reads it from here
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
            },
        });
    } catch {
        throw failed("Couldn't reach the server. Check your internet and try again.", 0);
    }

    // 204 "No Content": it worked, and there's nothing to read (the backend
    // answers this way after deleting something)
    if (response.status === 204) {
        return {};
    }

    // Our backend always answers in JSON. If the answer is something else
    // (a web page), the backend isn't what answered: it isn't running, or
    // the live site has no backend at /api yet. (vercel.json sends every
    // other address to our index.html page, but leaves /api out on purpose)
    // That counts as "no answer from our backend" (0), even if the web page
    // says it worked (the page would get {} instead of the list it expects),
    // so tracker.js and resume-storage.js keep the change and try again later
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
        throw failed(
            response.ok ? "Couldn't reach the server. Try again in a minute." : 'Something went wrong. Try again.',
            0,
        );
    }

    // Read the answer as JSON. If it's broken anyway, .catch gives an empty
    // object instead of crashing
    const body = await response.json().catch(() => ({}));

    // response.ok is true when it worked (status 200-299). Otherwise our
    // backend always sends { error: '...' }, so pass that message along
    if (!response.ok) {
        throw failed(body.error || 'Something went wrong. Try again.', response.status, body);
    }
    return body;
}
