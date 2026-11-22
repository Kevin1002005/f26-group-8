// Login.jsx is the Log in page (yoursite.com/login).
// There are two ways to log in, and both are real (Supabase checks them):
//   - Email and password, for accounts made on the Sign up page
//   - Google, which makes the account the first time you use it
// Supabase keeps the accounts (in its "auth.users" table), so our own
// backend doesn't have to store any passwords.
// It looks just like the Sign up page (same background, top bar, box, and
// animations), because it uses the same classes from index.css.
// The styles for this page are in index.css, under "Sign up page" and
// "Log in page: Forgot your password?".
//
// The same page also has the "Forgot your password?" screens. When the
// address ends in #forgot-password (yoursite.com/login#forgot-password),
// the box shows a reset form instead of the Log in form. Because the
// address changes, the browser's Back button brings you back to Log in.

// useState lets the page remember a value and redraw itself when it changes.
// useEffect runs a bit of code after the page has been drawn.
// useRef keeps a reference to something on the screen (here: the box's
// heading), so the code can move the keyboard focus to it.
// Fragment groups a few things together without adding a box around them.
import { Fragment, useEffect, useRef, useState } from 'react';
// Link makes a clickable link to another page (or another part) of our site.
// useLocation tells the page what's in the address bar, including the # part.
// useNavigate lets the page send the user to another page of our site.
import { Link, useLocation, useNavigate } from 'react-router';
// SmoothLink is a Link that fades smoothly to the next page (components/SmoothLink.jsx).
import SmoothLink from '../components/SmoothLink.jsx';
// ServiceLogo draws the Google logo (components/ServiceLogo.jsx).
import ServiceLogo from '../components/ServiceLogo.jsx';
// SiteLogo is our own logo: the binoculars picture and the name (components/SiteLogo.jsx).
import SiteLogo from '../components/SiteLogo.jsx';
// ThemeToggle is the sun/moon button that switches Light / Dark / System
// (components/ThemeToggle.jsx).
import ThemeToggle from '../components/ThemeToggle.jsx';
// TextType: a line that types itself out, one word after another
import TextType from '../components/reactbits/TextType.jsx';
// markLoggedIn remembers that you're logged in (login-status.js)
import { markLoggedIn } from '../login-status.js';
// supabase is our one shared connection to Supabase (supabase.js).
// The Log in form, the reset form, and the Google button all use it
import { supabase } from '../supabase.js';

// The words typed after "Log in to find" at the top of the page. It types
// through them once and stops on the last one. (This list lives outside
// Login, so it stays the same list on every redraw and the typing isn't restarted)
const bannerWords = ['internships', 'co-ops', 'research positions', 'your next opportunity'];

// Works out the red message for one box, using the checks the browser
// already does because of "required" and type="email".
// "input" is the box, and "emptyMessage" is what to say if it's empty.
// It gives back '' (nothing) when the box is fine
function findProblem(input, emptyMessage) {
    // validity.valueMissing is true when a "required" box is empty
    if (input.validity.valueMissing) return emptyMessage;
    // validity.typeMismatch is true when a type="email" box doesn't look like an email
    if (input.validity.typeMismatch) return 'Enter an email address like name@example.com.';
    return '';
}

// Links in our emails (confirm your email, reset your password) come back to
// this page. If the link was too old or already used, Supabase adds
// "error_description" to the address (after ? or #). This gives back a
// message for that, or '' if the address has no problem in it
function linkProblem() {
    const address = window.location.search + window.location.hash;
    if (!address.includes('error_description')) return '';
    return "That link didn't work. It may be too old or already used. Log in below, or use Forgot your password to get a new one.";
}

// True when Supabase says this is the account's very first login: it logged in
// within a minute of being made (signing up with Google), or of confirming its
// email (the "confirm your email" link). user is the account Supabase sends
// back, and those times come from Supabase's own clock, so a wrong clock on
// this computer can't change the answer. If a time is missing, it's false.
// fromSavedLogin: true when user comes from a login this browser already had
// (getSession below), not one that just happened. That copy keeps the login
// time it had when it was saved, so a student who finished the guide and then
// opens Log in again in that same login would still look brand new. So then it
// also has to have happened in the last 2 minutes, by this computer's clock
// (if that clock is wrong, it just goes to Opportunities, and RequireLogin
// still sends a brand-new account to the guide once the server answers)
function isFirstLogin(user, fromSavedLogin) {
    // Date.parse turns a time like "2026-11-22T15:04:05Z" into milliseconds
    // (NaN if it isn't a time). "??" uses the right side when the left is missing
    const start = Date.parse(user?.email_confirmed_at ?? user?.created_at ?? '');
    const login = Date.parse(user?.last_sign_in_at ?? '');
    if (Number.isNaN(start) || Number.isNaN(login)) return false;
    // 120,000 milliseconds = 2 minutes
    if (fromSavedLogin && Math.abs(Date.now() - login) > 120000) return false;
    // Math.abs: how far apart they are, either way. 60,000 milliseconds = 1 minute
    return Math.abs(login - start) < 60000;
}

// Where to go after logging in: a brand-new account goes straight to the
// welcome guide (pages/Welcome.jsx), to fill in its profile before anything
// else, and everyone else goes to Opportunities, the home page.
// It's brand new when:
// - the address ends in ?next=welcome: the "confirm your email" link from Sign
//   up does (Signup.jsx). That one counts even after the link itself didn't work,
//   like when it's opened on a phone and you log in there with your password.
//   Only the word "welcome" is used, so nobody can make a link that sends
//   people somewhere else
// - or it's the account's first login (isFirstLogin above), which covers
//   signing up with Google: it has no confirm email
// (Before, new accounts landed on Opportunities and only got sent to the guide
// once our server answered, which can take a minute when it's waking up.
// RequireLogin.jsx still does that for anyone these two miss. And if someone
// who already did the guide gets sent there, the guide sends them on to
// Opportunities once the server answers, see Welcome.jsx)
// fromSavedLogin: see isFirstLogin above
function pageAfterLogin(user, fromSavedLogin) {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next === 'welcome' || isFirstLogin(user, fromSavedLogin)) return '/welcome';
    return '/discovery';
}

function Login() {
    // "message" is the text shown above the Log in button. It starts empty (''),
    // unless the address says an email link didn't work (see linkProblem above).
    // Calling setMessage('...') changes it, and React updates the page.
    const [message, setMessage] = useState(linkProblem);

    // true while Supabase is checking the email and password, so the button
    // says "Logging in..." and a second click is ignored
    const [loggingIn, setLoggingIn] = useState(false);

    // The red messages under the boxes. It's an object with one message per
    // box: errors.email is the Email box's, errors.password the Password box's.
    // It starts as {} (nothing wrong yet). An empty message '' means that box is fine
    const [errors, setErrors] = useState({});

    // navigate('/discovery') // Sends the user to Opportunities (the home page) after logging in
    const navigate = useNavigate();

    // What's typed in the Email box. The Log in form and the reset form share
    // it, so if you typed your email and then clicked "Forgot your password?",
    // it's already filled in for you
    const [email, setEmail] = useState('');

    // The email the reset link was sent to. It starts empty (''). Once it
    // has an address in it, the box shows "Check your email"
    const [sentTo, setSentTo] = useState('');

    // true while the reset email is being sent, so the button says
    // "Sending link..." (see handleReset)
    const [sending, setSending] = useState(false);

    // The big heading in the box ("Log in", "Reset your password", or
    // "Check your email"), so the code can move the keyboard focus onto it
    const headingRef = useRef(null);

    // Which screen the box shows:
    // - 'login': the normal Log in form
    // - 'forgot': the reset form (the address ends in #forgot-password)
    // - 'sent': "Check your email" (after the reset form is sent)
    // location.hash is the # part of the address, like '#forgot-password'
    const location = useLocation();
    let view = 'login';
    if (location.hash === '#forgot-password') {
        view = sentTo ? 'sent' : 'forgot';
    }

    // Which screen was showing last time, so the code below can tell when it changed
    const shownView = useRef(view);

    // Runs after the page is redrawn because the screen changed. It moves the
    // keyboard focus to the new heading, so screen readers read out the new
    // screen's title, and Tab continues from there (WCAG). Without this,
    // keyboard users would be dropped back at the top of the page.
    // (It skips the first time the page opens, because nothing changed yet)
    useEffect(() => {
        if (shownView.current === view) return;
        shownView.current = view;
        headingRef.current.focus();
    }, [view]);

    // After you pick your account on Google's site, Google sends you back to
    // THIS page with a one-time code in the address bar (?code=...).
    // The "confirm your email" link from Sign up lands here the same way.
    // Importing supabase.js above is enough for Supabase to see that code and
    // swap it for a real login. getSession() waits for that swap to finish,
    // then tells us if someone is logged in. If they are, go to the welcome
    // guide (a brand-new account) or Opportunities (see pageAfterLogin above).
    // (This also sends people who are already logged in straight there.)
    useEffect(() => {
        // supabase is null when .env.local is missing (see supabase.js), so skip this
        if (!supabase) return;
        // "active" turns false if you leave this page before Supabase answers
        // (finishing a Google login can take a moment). Without it, a slow
        // answer could still pull you to Opportunities from wherever you went
        let active = true;
        supabase.auth.getSession().then(({ data }) => {
            if (active && data.session) {
                // The id says WHO is logged in (login-status.js uses it to keep
                // each person's resume and tracker apart)
                markLoggedIn(data.session.user.id);
                // replace: swaps Log in out of the browser's history. Otherwise
                // Back from Opportunities would open Log in, which would see the
                // login and push you forward again, so Back could never get past it
                // (true: this login may be one the browser already had, see isFirstLogin)
                navigate(pageAfterLogin(data.session.user, true), { replace: true });
            }
        });
        // The clean-up: runs when you leave the page
        return () => {
            active = false;
        };
    }, [navigate]);

    // Runs when the Google button is clicked.
    // "async" lets us "await": wait for Supabase to answer before going on
    async function handleGoogle() {
        // supabase is null when .env.local is missing (see supabase.js)
        if (!supabase) {
            console.error('Google log in: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            setMessage("Couldn't start Google log in. Please try again.");
            return;
        }
        // This leaves our site and goes to Google's sign-in page.
        // redirectTo is where Google sends you back afterward: this Log in
        // page, so the useEffect above can finish logging you in.
        // window.location.origin is the start of our address (http://localhost:5173)
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/login' },
        });
        // An error here means Supabase isn't set up right (for example, the
        // keys in .env.local are missing). The real reason goes to the console (F12)
        if (error) {
            console.error('Google log in failed:', error);
            setMessage("Couldn't start Google log in. Please try again.");
        }
    }

    // Runs when the form is submitted (the Log in button is clicked,
    // or Enter is pressed).
    // "async" lets us "await": wait for Supabase to check the password
    async function handleSubmit(event) {
        // Normally submitting a form reloads the whole page. This stops that.
        event.preventDefault();
        // If it's already checking, ignore a second click or Enter
        if (loggingIn) return;
        // event.target is the form. form.email is the input with name="email"
        const form = event.target;

        // Check each box and show the red messages (or clear old ones)
        const newErrors = {
            email: findProblem(form.email, 'Enter your email.'),
            password: findProblem(form.password, 'Enter your password.'),
        };
        setErrors(newErrors);
        // If a box has a problem, stop here and put the cursor in the first
        // box that needs fixing, so screen readers read its red message (WCAG)
        if (newErrors.email) {
            form.email.focus();
            return;
        }
        if (newErrors.password) {
            form.password.focus();
            return;
        }

        // supabase is null when .env.local is missing (see supabase.js)
        if (!supabase) {
            console.error('Log in: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            setMessage("Couldn't log you in. Please try again later.");
            return;
        }

        // Changes the button's words to "Logging in..." and clears an old message
        setLoggingIn(true);
        setMessage('');

        // Supabase checks the email and password. It never sends the
        // password back, only a login (a "session") if they match.
        // .value is what the user typed in each box
        let data, error;
        try {
            ({ data, error } = await supabase.auth.signInWithPassword({
                email: form.email.value,
                password: form.password.value,
            }));
        } catch (thrown) {
            // supabase-js hands back { error } for its own problems, but a few rare
            // ones (like the browser refusing to save the login) are thrown instead.
            // Treat them like any other error, so the button can't stay stuck on
            // "Logging in..." with no message
            error = thrown;
        }
        setLoggingIn(false);

        if (error) {
            // error.code says what went wrong. The messages never say whether
            // an email has an account, so nobody can use this page to find
            // out who's signed up
            if (error.code === 'email_not_confirmed') {
                setMessage('Please confirm your email first. The link is in the email we sent when you signed up.');
            } else if (error.code === 'invalid_credentials') {
                setMessage("That email and password don't match. Check them and try again.");
            } else {
                // Anything else (no internet, Supabase is down, ...). The real
                // reason goes to the console (F12), not on the page
                console.error('Log in failed:', error);
                setMessage("Couldn't log you in right now. Please try again.");
            }
            return;
        }

        // It worked. Remember who's logged in, so the About page shows your
        // circle and a Home button instead of "Log in" and "Sign up"
        markLoggedIn(data.user.id);
        // Go to the welcome guide (a brand-new account) or Opportunities, the
        // home page (see pageAfterLogin above).
        // replace: same reason as in the useEffect above (Back isn't trapped)
        // (false: this login just happened, so its times are fresh from Supabase)
        navigate(pageAfterLogin(data.user, false), { replace: true });
    }

    // Runs when the reset form is submitted (the "Send reset link" button is
    // clicked, or Enter is pressed). The browser has already checked that
    // the Email box looks like an email address, because it's type="email"
    async function handleReset(event) {
        // Normally submitting a form reloads the whole page. This stops that.
        event.preventDefault();
        // If it's already working on it, ignore a second click or Enter
        if (sending) return;

        // Check the Email box, the same way handleSubmit does
        const form = event.target;
        const emailProblem = findProblem(form.email, 'Enter your email.');
        setErrors({ email: emailProblem });
        if (emailProblem) {
            form.email.focus();
            return;
        }

        if (!supabase) {
            console.error('Reset password: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            setMessage("Couldn't send the link. Please try again later.");
            return;
        }

        // Changes the button's words to "Sending link..."
        setSending(true);
        setMessage('');

        // Supabase emails a link to make a new password. redirectTo is the page
        // the link opens: our Reset password page (ResetPassword.jsx).
        // window.location.origin is the start of our address (http://localhost:5173)
        let error;
        try {
            ({ error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password',
            }));
        } catch (thrown) {
            // Same as handleSubmit: a rare thrown error mustn't leave the button
            // stuck on "Sending link..."
            error = thrown;
        }
        setSending(false);

        // Supabase gives no error for an email with no account (so nobody can
        // find out who's signed up). An error means the email couldn't be sent
        if (error) {
            if (error.code === 'over_email_send_rate_limit') {
                setMessage('Too many emails were sent just now. Please wait a few minutes and try again.');
            } else {
                console.error('Reset password failed:', error);
                setMessage("Couldn't send the link right now. Please try again.");
            }
            return;
        }

        // It worked: show "Check your email"
        setSentTo(email);
    }

    return (
        // "about-site" gives the page the About page's light blue background, fonts,
        // and keyboard outlines. "signup-site" adds the Sign up page's background
        // (a faint grid and a soft glow, in index.css)
        <div className="about-site signup-site">
            {/* <title> is the name shown on the browser tab (WCAG).
                It changes with the screen, so the tab says what you're doing */}
            <title>{view === 'login' ? 'Log in | ScoutSearch' : 'Reset your password | ScoutSearch'}</title>

            {/* The bar at the top, the same one the Sign up page has. It has the
                logo and the section tabs. The logo goes back to the About page */}
            <header className="about-bar">
                <div className="about-inner about-bar-row">
                    <SmoothLink className="about-logo" to="/about">
                        <SiteLogo />
                    </SmoothLink>

                    {/* The same section tabs as the About page's top bar.
                        aria-label="Sections" is the name screen readers say for this nav.
                        These are plain <a href> links, not <Link>, on purpose: they
                        jump to a spot on ANOTHER page, and <Link> wouldn't scroll
                        down to it. (The site reloads, which is fine here) */}
                    <nav className="about-bar-nav" aria-label="Sections">
                        <ul className="about-bar-links">
                            <li><a href="/about#who-its-for">Who it's for</a></li>
                            <li><a href="/about#why-use-our-platform">Why use our platform?</a></li>
                            <li><a href="/about#who-we-are">Who we are</a></li>
                            <li><a href="/about#questions">Questions</a></li>
                        </ul>
                    </nav>

                    {/* The sun/moon button, at the right end of the bar, where Log
                        in is on the About page. "about-bar-actions" keeps it in the
                        first row on small screens, so it's never hidden */}
                    <div className="about-bar-actions">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            {/* <main> tells screen readers where the main content starts */}
            <main className="signup-main">
                {/* "Log in to find ..." typed out above the box. It's a <p>, not a
                    heading: the page's one <h1> is "Log in" inside the box */}
                <TextType
                    as="p"
                    className="signup-banner"
                    prefix="Log in to find"
                    words={bannerWords}
                />

                {/* "signup-box" is the pale blue box around the form */}
                <div className="signup-box">
                    {/* The box shows one of three screens (see "view" above).
                        Each screen is wrapped in a Fragment with its own "key".
                        When the key changes, React builds that screen fresh
                        instead of reusing the old one, so its pieces ease in
                        one after another (the motion in index.css) and you can
                        see what changed */}

                    {/* Screen 1: the normal Log in form */}
                    {view === 'login' && (
                        <Fragment key="login">
                            {/* <h1> is the main heading. Each page should have only one.
                                tabIndex={-1} lets the code focus it (see the useEffect above)
                                without adding it to the Tab order */}
                            <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Log in</h1>
                            <p className="signup-intro">Welcome back to ScoutSearch.</p>

                            {/* onSubmit={handleSubmit} runs the function above when the form is sent.
                                noValidate turns off the browser's own "Please fill out this
                                field" bubbles, so our red messages under the boxes show instead */}
                            <form onSubmit={handleSubmit} noValidate>
                                {/* htmlFor="email" connects this label to the input with id="email".
                                    Clicking the label focuses the input, and screen readers read
                                    the label out loud (WCAG) */}
                                <label htmlFor="email" className="signup-label">Email</label>
                                {/* type="email" checks it looks like an email address.
                                    autoComplete="email" lets the browser fill it in for you.
                                    required means it can't be empty (findProblem checks this).
                                    value and onChange keep what's typed in "email" (above).
                                    Typing also clears the red message ("...errors" copies the
                                    other boxes' messages, and email: '' empties this one).
                                    aria-invalid gives the box its red outline (index.css) and tells
                                    screen readers it has a problem. aria-describedby points at
                                    the red message below, so screen readers read it with the box */}
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="signup-input"
                                    value={email}
                                    onChange={(event) => {
                                        setEmail(event.target.value);
                                        setErrors({ ...errors, email: '' });
                                    }}
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby="email-error"
                                />
                                {/* The red reason under the box. It's empty when the box is fine */}
                                <p id="email-error" className="signup-field-error">{errors.email}</p>

                                <label htmlFor="password" className="signup-label">Password</label>
                                {/* type="password" hides what you type as dots.
                                    "current-password" lets password managers fill in a saved password.
                                    The rest works like the Email box above */}
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="signup-input"
                                    onChange={() => setErrors({ ...errors, password: '' })}
                                    aria-invalid={Boolean(errors.password)}
                                    aria-describedby="password-error"
                                />
                                <p id="password-error" className="signup-field-error">{errors.password}</p>

                                {/* "Forgot your password?" right under the password box.
                                    to="#forgot-password" adds #forgot-password to the
                                    address, which swaps the box to the reset form. Since the
                                    address changes, Back brings you here again.
                                    onClick clears any old "Check your email" and red
                                    messages, so the reset form always opens fresh */}
                                <p className="signup-forgot">
                                    <Link
                                        to="#forgot-password"
                                        className="signup-forgot-link"
                                        onClick={() => {
                                            setSentTo('');
                                            setErrors({});
                                            setMessage('');
                                        }}
                                    >
                                        Forgot your password?
                                    </Link>
                                </p>

                                {/* Shows the message. role="status" makes screen readers read the
                                    message out loud when it appears (WCAG) */}
                                <p role="status" className="signup-message">{message}</p>

                                {/* type="submit" means clicking this button sends the form.
                                    "about-button" is the sky-blue button from the About page.
                                    aria-disabled (not "disabled") keeps the button reachable
                                    with Tab while Supabase checks, and handleSubmit ignores
                                    clicks while it's on */}
                                <button type="submit" className="about-button signup-submit" aria-disabled={loggingIn}>
                                    {loggingIn ? 'Logging in...' : 'Log in'}
                                </button>
                            </form>

                            {/* The "or" line between the form and the buttons. It's only
                                decoration, so screen readers skip it (WCAG) */}
                            <p className="signup-divider" aria-hidden="true">or continue with</p>

                            {/* The "Continue with Google" button.
                                type="button" means it doesn't send the form.
                                It logs you in with Google (handleGoogle above) */}
                            <div className="signup-social-list">
                                {/* aria-label gives screen readers (and voice control) the
                                    full words, since the button only shows the name (WCAG) */}
                                <button type="button" className="signup-social-button" aria-label="Continue with Google" onClick={handleGoogle}>
                                    <ServiceLogo name="google" />
                                    Google
                                </button>
                            </div>
                        </Fragment>
                    )}

                    {/* Screen 2: the reset form (the address ends in #forgot-password) */}
                    {view === 'forgot' && (
                        <Fragment key="forgot">
                            <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Reset your password</h1>
                            <p className="signup-intro">
                                Type the email you log in with, and we'll send you a link to make a new password.
                            </p>

                            {/* onSubmit={handleReset} runs the function above when the form is sent.
                                noValidate: our red message shows instead of the browser's bubble */}
                            <form onSubmit={handleReset} noValidate>
                                {/* id="reset-email" is different from the Log in form's
                                    id="email", because two things on a page can't share an id.
                                    The red message works like the Log in form's Email box */}
                                <label htmlFor="reset-email" className="signup-label">Email</label>
                                <input
                                    id="reset-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="signup-input"
                                    value={email}
                                    onChange={(event) => {
                                        setEmail(event.target.value);
                                        setErrors({ ...errors, email: '' });
                                    }}
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby="reset-email-error"
                                />
                                <p id="reset-email-error" className="signup-field-error">{errors.email}</p>

                                {/* Says if the email couldn't be sent. role="status" makes
                                    screen readers read it out when it appears (WCAG) */}
                                <p role="status" className="signup-message">{message}</p>

                                {/* aria-disabled (not "disabled") keeps the button reachable
                                    with Tab while it's working, and the words say what's
                                    happening. handleReset ignores clicks while it's on */}
                                <button type="submit" className="about-button signup-submit" aria-disabled={sending}>
                                    {sending ? 'Sending link...' : 'Send reset link'}
                                </button>
                            </form>
                        </Fragment>
                    )}

                    {/* Screen 3: "Check your email" (after the reset form is sent) */}
                    {view === 'sent' && (
                        <Fragment key="sent">
                            <h1 className="signup-title" ref={headingRef} tabIndex={-1}>Check your email</h1>
                            {/* It says "If there's an account" on purpose. Saying
                                "we found your account" would let anyone type in emails
                                to find out who has an account here. The email is in bold
                                so a typo is easy to spot */}
                            <p className="signup-intro">
                                If there's a ScoutSearch account for <span className="signup-sent-email">{sentTo}</span>, a link to make a new password is on its way.
                            </p>
                            <p className="signup-note">It can take a few minutes. If you don't see it, check your spam folder.</p>

                            {/* Goes back to the normal Log in form (yoursite.com/login,
                                without the # part). It's the main next step, so it gets
                                the sky-blue button look */}
                            <Link to="/login" className="about-button signup-submit signup-submit-link">Back to Log in</Link>

                            {/* Shows the reset form again, with the email still filled
                                in so it's easy to fix a typo */}
                            <button type="button" className="signup-secondary-button" onClick={() => { setSentTo(''); setMessage(''); }}>
                                Use a different email
                            </button>
                        </Fragment>
                    )}
                </div>

                {/* The line under the box. It changes with the screen.
                    Each version has its own key, so it's built fresh and eases
                    in too. "Check your email" has no line here, because its
                    "Back to Log in" button is already in the box */}
                {view === 'login' && (
                    // For people who don't have an account yet. It fades
                    // smoothly to the Sign up page
                    <p className="signup-switch" key="login">
                        New to ScoutSearch? <SmoothLink to="/signup">Sign up</SmoothLink>
                    </p>
                )}
                {view === 'forgot' && (
                    // For people who remembered their password after all
                    <p className="signup-switch" key="forgot">
                        Remembered it? <Link to="/login">Back to Log in</Link>
                    </p>
                )}
            </main>
        </div>
    )
}

// Lets App.jsx import this page.
export default Login
