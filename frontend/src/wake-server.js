// wake-server.js wakes our backend up the moment the site opens.
//
// Why: the backend runs on Render's free plan, which puts it to sleep when
// nobody has used it for a while (about 15 minutes). Waking it up takes up to
// a minute. Before this, the first page that needed it (Opportunities, or the
// welcome guide's Finish button) had to wait that whole minute, and a tester
// sat on "Loading opportunities..." for two.
//
// main.jsx calls wakeServer() once, as soon as any page of the site opens
// (About, Sign up, Log in, a "confirm your email" link, ...). The server then
// starts waking up while you're still reading or typing, so it's usually awake
// by the time you need it. As soon as it wakes, it also starts loading the
// job list (backend/src/app.ts, /api/health), so Opportunities is quick too.
//
// It asks for /api/health: a tiny address that answers { ok: true } right
// away, without a login (backend/src/app.ts). The answer itself isn't used.
// If it fails (no internet, or the server is down), nothing happens here: the
// pages' own requests show their own messages later.
// (It uses fetch directly, not api() in api.js, because there's no login to send)

export function wakeServer() {
    // .catch(() => {}) means "if it fails, do nothing" (so a failure doesn't
    // show up as an error in the browser's console)
    fetch('/api/health').catch(() => {});
}
