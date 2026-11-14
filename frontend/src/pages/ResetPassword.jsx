// ResetPassword.jsx is the "Make a new password" page (yoursite.com/reset-password).
// You get here from the link in the "reset your password" email, which the
// Log in page's "Forgot your password?" screen asks Supabase to send.
//
// How it works:
//   1. The link opens this page with a one-time code in the address (?code=...).
//      Importing supabase.js is enough for Supabase to swap that code for a
//      short login, just for changing the password.
//   2. You type a new password twice, and supabase.auth.updateUser saves it.
//   3. You're logged in, and a button takes you to Opportunities.
// If the link is too old or was already used, the page says so and offers a new one.
//
// It looks just like the Log in page, because it uses the same classes from
// index.css ("Sign up page"), so it has no styles of its own.
// It's open to everyone (it's NOT inside RequireLogin in App.jsx), because
// people who forgot their password aren't logged in yet.

// useState lets the page remember a value and redraw itself when it changes.
// useEffect runs a bit of code after the page has been drawn.
// useRef keeps a reference to something on the screen (here: the heading).
import { useEffect, useRef, useState } from 'react';
// Link makes a clickable link to another page of our site.
import { Link } from 'react-router';
// SmoothLink is a Link that fades smoothly to the next page (components/SmoothLink.jsx).
import SmoothLink from '../components/SmoothLink.jsx';
// SiteLogo is our own logo: the binoculars picture and the name (components/SiteLogo.jsx).
import SiteLogo from '../components/SiteLogo.jsx';
// ThemeToggle is the sun/moon button that switches Light / Dark / System
import ThemeToggle from '../components/ThemeToggle.jsx';
// markLoggedIn remembers that you're logged in (login-status.js)
import { markLoggedIn } from '../login-status.js';
// supabase is our one shared connection to Supabase (supabase.js)
import { supabase } from '../supabase.js';

// The shortest password we accept (the same as the Sign up page)
const shortestPassword = 8;

// Which screen to show when the page first opens:
//   'checking'  waiting for Supabase to read the link
//   'invalid'   the link is too old, already used, or missing
// (The other two screens come later: 'ready' shows the form, 'done' says it worked.)
// Supabase adds "error_description" to the address when a link didn't work
function firstScreen() {
    if (!supabase) return 'invalid';
    const address = window.location.search + window.location.hash;
    if (address.includes('error_description')) return 'invalid';
    return 'checking';
}

function ResetPassword() {
    // Which screen is showing (see firstScreen above)
    const [screen, setScreen] = useState(firstScreen);

    // The red messages under the two boxes ({} means nothing is wrong yet)
    const [errors, setErrors] = useState({});

    // The message above the Save button, for problems that aren't about one box
    const [message, setMessage] = useState('');

    // true while Supabase saves the new password, so the button says "Saving..."
    const [saving, setSaving] = useState(false);

    // The heading, so the code can move the keyboard focus to it when the
    // screen changes, and screen readers read the new title (WCAG)
    const headingRef = useRef(null);
    const shownScreen = useRef(screen);

    useEffect(() => {
        if (shownScreen.current === screen) return;
        shownScreen.current = screen;
        headingRef.current.focus();
    }, [screen]);

    // Waits for Supabase to read the link. onAuthStateChange calls us back
    // once it knows: with a "session" (a login) if the link worked, or
    // without one if it didn't
    useEffect(() => {
        if (!supabase) return;
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                // The link worked: show the form. (Unless the password was
                // already saved: Supabase calls back again after saving, and
                // we want to stay on "done")
                setScreen((current) => (current === 'done' ? current : 'ready'));
            } else if (event === 'INITIAL_SESSION') {
                // Supabase finished reading the address and found no login
                setScreen('invalid');
            }
        });
        // "Clean up" when the page closes: stop listening
        return () => data.subscription.unsubscribe();
    }, []);

    // Runs when the form is sent (Save is clicked, or Enter is pressed)
    async function handleSubmit(event) {
        event.preventDefault();
        if (saving) return;
        const form = event.target;

        // The same checks as the Sign up page's password step
        const password = form.password.value;
        const newErrors = { password: '', confirmPassword: '' };
        if (password === '') newErrors.password = 'Type a new password.';
        else if (password.length < shortestPassword) newErrors.password = `Use at least ${shortestPassword} characters.`;
        if (form.confirmPassword.value === '') newErrors.confirmPassword = 'Retype your new password.';
        else if (!newErrors.password && password !== form.confirmPassword.value) {
            newErrors.confirmPassword = "The passwords don't match. Please retype them.";
        }
        setErrors(newErrors);
        if (newErrors.password) {
            form.password.focus();
            return;
        }
        if (newErrors.confirmPassword) {
            form.confirmPassword.focus();
            return;
        }

        setSaving(true);
        setMessage('');
        // Saves the new password on your account
        const { error } = await supabase.auth.updateUser({ password: password });
        setSaving(false);

        if (error) {
            if (error.code === 'weak_password') {
                setErrors({ ...newErrors, password: error.message });
                form.password.focus();
            } else if (error.code === 'same_password') {
                setErrors({ ...newErrors, password: "That's the password you already have. Choose a new one." });
                form.password.focus();
            } else if (error.name === 'AuthSessionMissingError') {
                // The short login from the link ran out
                setScreen('invalid');
            } else {
                console.error('Saving the new password failed:', error);
                setMessage("Couldn't save your new password right now. Please try again.");
            }
            return;
        }

        // It worked, and you're logged in now
        markLoggedIn();
        setScreen('done');
    }

    return (
        // The same page background as Log in and Sign up
        <div className="about-site signup-site">
            {/* <title> is the name shown on the browser tab (WCAG) */}
            <title>Make a new password | ScoutSearch</title>

            {/* The same top bar as the Log in page: the logo (back to About) and
                the sun/moon button */}
            <header className="about-bar">
                <div className="about-inner about-bar-row">
                    <SmoothLink className="about-logo" to="/about">
                        <SiteLogo />
                    </SmoothLink>
                    <div className="about-bar-actions">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="signup-main">
                <div className="signup-box">
                    {/* key={screen}: each screen is built fresh, so it eases in like
                        the Log in page's screens do */}
                    <div key={screen}>
                        {/* Waiting for Supabase to read the link (usually a split second).
                            role="status" lets screen readers hear it (WCAG) */}
                        {screen === 'checking' && (
                            <>
                                <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Make a new password</h1>
                                <p className="signup-intro" role="status">Checking your link...</p>
                            </>
                        )}

                        {/* The link worked: the form */}
                        {screen === 'ready' && (
                            <>
                                <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Make a new password</h1>
                                <p className="signup-intro">Type your new password twice.</p>

                                {/* noValidate: our red messages show instead of the browser's bubbles */}
                                <form onSubmit={handleSubmit} noValidate>
                                    <label htmlFor="password" className="signup-label">
                                        New password (at least {shortestPassword} characters)
                                    </label>
                                    {/* "new-password" tells password managers to suggest a strong one */}
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        className="signup-input"
                                        onChange={() => setErrors({ ...errors, password: '' })}
                                        aria-invalid={Boolean(errors.password)}
                                        aria-describedby="password-error"
                                    />
                                    <p id="password-error" className="signup-field-error">{errors.password}</p>

                                    <label htmlFor="confirmPassword" className="signup-label">Confirm new password</label>
                                    <input
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        className="signup-input"
                                        onChange={() => setErrors({ ...errors, confirmPassword: '' })}
                                        aria-invalid={Boolean(errors.confirmPassword)}
                                        aria-describedby="confirmPassword-error"
                                    />
                                    <p id="confirmPassword-error" className="signup-field-error">{errors.confirmPassword}</p>

                                    {/* role="status" reads the message out when it appears (WCAG) */}
                                    <p role="status" className="signup-message">{message}</p>

                                    {/* aria-disabled keeps the button reachable with Tab while saving */}
                                    <button type="submit" className="about-button signup-submit" aria-disabled={saving}>
                                        {saving ? 'Saving...' : 'Save new password'}
                                    </button>
                                </form>
                            </>
                        )}

                        {/* The link didn't work */}
                        {screen === 'invalid' && (
                            <>
                                <h1 className="signup-title" ref={headingRef} tabIndex={-1}>This link didn't work</h1>
                                <p className="signup-intro">
                                    Reset links only work once, for a short time, and in the browser where you asked for them.
                                </p>
                                {/* Opens the Log in page's "Forgot your password?" screen */}
                                <Link to="/login#forgot-password" className="about-button signup-submit signup-submit-link">
                                    Get a new link
                                </Link>
                            </>
                        )}

                        {/* Saved */}
                        {screen === 'done' && (
                            <>
                                <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Your password is changed</h1>
                                <p className="signup-intro">You're logged in. Next time, log in with your new password.</p>
                                <Link to="/discovery" className="about-button signup-submit signup-submit-link">
                                    Go to Opportunities
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                {/* A way out on every screen except "done" (which has its own button) */}
                {screen !== 'done' && (
                    <p className="signup-switch">
                        Remembered it? <Link to="/login">Back to Log in</Link>
                    </p>
                )}
            </main>
        </div>
    );
}

// Lets App.jsx import this page.
export default ResetPassword;
