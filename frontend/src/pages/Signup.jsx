// Signup.jsx is the Sign up page (yoursite.com/signup).
// Signing up takes 2 steps, both shown in the same box on this page:
//   Step 1: Name and Email (or Google), then "Continue".
//   Step 2: Password and "Confirm password" (typed twice, so a typo is caught).
// Then a third screen says "Check your email".
// Step 2 makes a real account in Supabase (supabase.auth.signUp). Supabase
// emails a link to confirm the address, and clicking it logs you in.
// (If the team turns off "Confirm email" in Supabase, you're logged in
// right away instead, and the third screen is skipped.)
// It looks like the About page (same background, top bar, fonts, and button).
// The styles for this page are in index.css, under "Sign up page".

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen (here: the page's heading),
// so the code can move the keyboard focus to it.
// useEffect runs a bit of code after the page has been redrawn.
import { useEffect, useRef, useState } from 'react';
// Link makes a clickable link to another page of our site.
// useNavigate lets the page send the user to another page of our site.
import { Link, useNavigate } from 'react-router';
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
// Step 2 and the Google button use it to make your account
import { supabase } from '../supabase.js';

// The shortest password we accept. Supabase's own minimum is 6; 8 is a
// little safer and is what most sites ask for
const shortestPassword = 8;

// The words typed after "Join now to find" at the top of the page. It types
// through them once and stops on the last one. (This list lives outside
// Signup, so it stays the same list on every redraw and the typing isn't restarted)
const bannerWords = ['internships', 'co-ops', 'research positions', 'your first opportunity'];

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

function Signup() {
    // "step" is which part of signing up is showing: 1 (name and email),
    // 2 (password), or 3 ("Check your email"). It starts at 1.
    // Calling setStep(2) shows step 2.
    const [step, setStep] = useState(1);

    // What was typed on step 1. They're kept here so they aren't lost when the
    // page swaps to step 2 (and so they're still there if someone goes Back)
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    // "message" is the text shown above the Sign up button on step 2. It
    // starts empty (''). Calling setMessage('...') changes it, and React
    // updates the page.
    const [message, setMessage] = useState('');

    // true while Supabase is making the account, so the Sign up button says
    // "Creating your account..." and a second click is ignored (see handleSubmit)
    const [signingUp, setSigningUp] = useState(false);

    // The red messages under the boxes. It's an object with one message per
    // box: errors.name is the Name box's, errors.email the Email box's, and so on.
    // It starts as {} (nothing wrong yet). An empty message '' means that box is fine
    const [errors, setErrors] = useState({});

    // The big heading ("Sign up" / "Create a password"), so the code can
    // move the keyboard focus onto it when the step changes
    const headingRef = useRef(null);

    // true when the next redraw is because the step changed (and not
    // because the page just opened)
    const stepJustChanged = useRef(false);

    // navigate('/discovery') // Sends the user to Opportunities (the home page) after signing up
    const navigate = useNavigate();

    // Runs after the page is redrawn because "step" changed. Without this,
    // clicking Continue removes the button that had the keyboard focus, and
    // keyboard and screen reader users would be dropped back at the top of
    // the page. Focusing the heading makes screen readers read out the new
    // step's title, and Tab then continues from there (WCAG)
    useEffect(() => {
        if (stepJustChanged.current) {
            stepJustChanged.current = false;
            headingRef.current.focus();
        }
    }, [step]);

    // Runs when the Google button is clicked.
    // With Google there's no separate "sign up": the first time someone logs
    // in with Google, Supabase makes their account. So this is the same as
    // the Log in page's Google button.
    // "async" lets us "await": wait for Supabase to answer before going on
    async function handleGoogle() {
        // supabase is null when .env.local is missing (see supabase.js)
        if (!supabase) {
            console.error('Google sign up: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            return;
        }
        // This leaves our site and goes to Google's sign-in page.
        // redirectTo is where Google sends you back afterward. It's the Log in
        // page on purpose: that page finishes logging you in and then goes
        // to Opportunities, the home page (see the useEffect in Login.jsx).
        // window.location.origin is the start of our address (http://localhost:5173)
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/login' },
        });
        // An error here means Supabase isn't set up right (for example, the
        // keys in .env.local are missing). Step 1 has no message box to show
        // it in, so the reason goes to the console (F12)
        if (error) {
            console.error('Google sign up failed:', error);
        }
    }

    // Runs when step 1 is submitted (the Continue button is clicked, or Enter
    // is pressed).
    function handleContinue(event) {
        // Normally submitting a form reloads the whole page. This stops that.
        event.preventDefault();

        // event.target is the form. form.name is the input with name="name"
        const form = event.target;

        // Check each box and show the red messages (or clear old ones)
        const newErrors = {
            name: findProblem(form.name, 'Enter your name.'),
            email: findProblem(form.email, 'Enter your email.'),
        };
        setErrors(newErrors);
        // If a box has a problem, stop here and put the cursor in the first
        // box that needs fixing, so screen readers read its red message (WCAG)
        if (newErrors.name) {
            form.name.focus();
            return;
        }
        if (newErrors.email) {
            form.email.focus();
            return;
        }

        // Both boxes are fine: show the password step. (There used to be a
        // short pretend "Signing you up..." wait here. Nothing is sent until
        // step 2, so now it goes straight there)
        stepJustChanged.current = true;
        setStep(2);
    }

    // Runs when the Back button on step 2 is clicked
    function handleBack() {
        stepJustChanged.current = true;
        // Clears the old message, so it isn't there when they come back
        setMessage('');
        setErrors({});
        setStep(1);
    }

    // Runs when step 2 is submitted (the Sign up button is clicked,
    // or Enter is pressed).
    // "async" lets us "await": wait for Supabase to make the account
    async function handleSubmit(event) {
        event.preventDefault();
        // If it's already making the account, ignore a second click or Enter
        if (signingUp) return;
        // event.target is the form. form.password and form.confirmPassword are
        // the inputs with those names, and .value is what the user typed in them.
        const form = event.target;

        // Check each box. If both are filled in but different, the
        // "Confirm password" box gets the "don't match" message instead
        const newErrors = {
            password: findProblem(form.password, 'Create a password.'),
            confirmPassword: findProblem(form.confirmPassword, 'Retype your password.'),
        };
        if (!newErrors.password && form.password.value.length < shortestPassword) {
            newErrors.password = `Use at least ${shortestPassword} characters.`;
        }
        if (!newErrors.confirmPassword && form.password.value !== form.confirmPassword.value) {
            newErrors.confirmPassword = "The passwords don't match. Please retype them.";
        }
        setErrors(newErrors);

        // If a box has a problem, stop here. The page stays on step 2, and
        // the keyboard focus goes to the first box that needs fixing
        if (newErrors.password) {
            form.password.focus();
            return;
        }
        if (newErrors.confirmPassword) {
            form.confirmPassword.focus();
            return;
        }

        // supabase is null when .env.local is missing (see supabase.js)
        if (!supabase) {
            console.error('Sign up: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            setMessage("Couldn't create your account. Please try again later.");
            return;
        }

        // Changes the button's words to "Creating your account..."
        setSigningUp(true);
        setMessage('');

        // Supabase makes the account and keeps the password safely (hashed),
        // so our own database never sees it.
        // - options.data is saved with the account. full_name is the same
        //   name Google uses, so the top bar shows your name either way
        //   (see use-current-user.js)
        // - emailRedirectTo is where the "confirm your email" link sends you:
        //   the Log in page, which finishes logging you in
        let data, error;
        try {
            ({ data, error } = await supabase.auth.signUp({
                email: email,
                password: form.password.value,
                options: {
                    data: { full_name: name.trim() },
                    emailRedirectTo: window.location.origin + '/login',
                },
            }));
        } catch (thrown) {
            // supabase-js hands back { error } for its own problems, but a few rare
            // ones (like the browser refusing to save the login) are thrown instead.
            // Treat them like any other error, so the button can't stay stuck
            error = thrown;
        }
        setSigningUp(false);

        if (error) {
            if (error.code === 'weak_password') {
                // Supabase's message says what the password needs, like
                // "Password should contain at least one number"
                setErrors({ ...newErrors, password: error.message });
                form.password.focus();
            } else if (error.code === 'over_email_send_rate_limit') {
                setMessage('Too many sign-ups just now. Please wait a few minutes and try again.');
            } else {
                // Anything else. It doesn't say whether the email already has
                // an account, so nobody can use this page to find out who's
                // signed up. The real reason goes to the console (F12)
                console.error('Sign up failed:', error);
                setMessage("Couldn't create your account. If you already have one, log in instead.");
            }
            return;
        }

        // If Supabase's "Confirm email" setting is off, you're logged in right
        // away (data.session is your login)
        if (data.session) {
            // Remember who's logged in, so the About page shows your circle and
            // a Home button instead of "Log in" and "Sign up" (and your resume
            // and tracker are kept under your own account, see login-status.js)
            markLoggedIn(data.session.user.id);
            // Go to the welcome guide, to set up your profile (pages/Welcome.jsx).
            // replace: Back from the guide skips the finished Sign up form
            navigate('/welcome', { replace: true });
            return;
        }

        // Otherwise, show "Check your email" (step 3)
        stepJustChanged.current = true;
        setStep(3);
    }

    return (
        // "about-site" gives the page the About page's light blue background, fonts,
        // and keyboard outlines. "signup-site" adds this page's own background
        // (a faint grid and a soft glow, in index.css)
        <div className="about-site signup-site">
            {/* <title> is the name shown on the browser tab (WCAG) */}
            <title>Sign up | ScoutSearch</title>

            {/* The bar at the top, like the About page's but without the
                Sign up button (you're already on that page) or a Log in link
                (that's under the box instead). It has the logo and the section
                tabs. The logo goes back to the About page */}
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
                {/* "Join now to find ..." typed out above the box. "signup-banner" is its
                    size and font in index.css. It's a <p>, not a heading: the page's one
                    <h1> is "Sign up" inside the box */}
                <TextType
                    as="p"
                    className="signup-banner"
                    prefix="Join now to find"
                    words={bannerWords}
                />

                {/* "signup-box" is the pale blue box around the form */}
                <div className="signup-box">
                    {/* key={step} tells React "this is a different piece of the page when
                        the step changes", so everything inside is built fresh and plays
                        its fade-up animation again, just like when the page first opens */}
                    <div key={step}>
                        {/* "Step 1 of 2" or "Step 2 of 2". It's part of the heading's
                            neighbor, so screen readers read it right before the title.
                            "Check your email" (step 3) isn't a step you fill in, so it
                            doesn't get one */}
                        {step < 3 && <p className="signup-step">Step {step} of 2</p>}

                        {/* <h1> is the main heading. Each page should have only one.
                            tabIndex={-1} lets the code focus it (see the useEffect above)
                            without making it a stop when pressing Tab */}
                        <h1 className="signup-title" ref={headingRef} tabIndex={-1}>
                            {step === 1 && 'Sign up'}
                            {step === 2 && 'Create a password'}
                            {step === 3 && 'Check your email'}
                        </h1>

                        {/* "step === 1 && (...)" means "only draw this on step 1" */}
                        {step === 1 && (
                            <>
                                <p className="signup-intro">Create your free ScoutSearch account.</p>

                                {/* onSubmit={handleContinue} runs the function above when the form is sent.
                                    noValidate turns off the browser's own "Please fill out this
                                    field" bubbles, so our red messages under the boxes show instead */}
                                <form onSubmit={handleContinue} noValidate>
                                    {/* htmlFor="name" connects this label to the input with id="name".
                                        Clicking the label focuses the input, and screen readers read
                                        the label out loud (WCAG) */}
                                    <label htmlFor="name" className="signup-label">Name</label>
                                    {/* autoComplete="name" lets the browser fill in your name.
                                        required means it can't be empty (findProblem checks this).
                                        value and onChange keep what's typed in the "name" box above,
                                        so it isn't lost when step 2 shows.
                                        Typing also clears the red message ("...errors" copies the
                                        other boxes' messages, and name: '' empties this one).
                                        aria-invalid gives the box its red outline (index.css) and tells
                                        screen readers it has a problem. aria-describedby points at
                                        the red message below, so screen readers read it with the box */}
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        className="signup-input"
                                        value={name}
                                        onChange={(event) => {
                                            setName(event.target.value);
                                            setErrors({ ...errors, name: '' });
                                        }}
                                        aria-invalid={Boolean(errors.name)}
                                        aria-describedby="name-error"
                                    />
                                    {/* The red reason under the box. It's empty when the box is fine */}
                                    <p id="name-error" className="signup-field-error">{errors.name}</p>

                                    <label htmlFor="email" className="signup-label">Email</label>
                                    {/* type="email" checks it looks like an email address.
                                        The rest works like the Name box above */}
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
                                    <p id="email-error" className="signup-field-error">{errors.email}</p>

                                    {/* type="submit" means clicking this button sends the form.
                                        "about-button" is the sky-blue button from the About page */}
                                    <button type="submit" className="about-button signup-submit">
                                        Continue
                                    </button>
                                </form>

                                {/* The "or" line between the form and the buttons. It's only
                                    decoration, so screen readers skip it (WCAG) */}
                                <p className="signup-divider" aria-hidden="true">or continue with</p>

                                {/* The "Continue with Google" button.
                                    type="button" means it doesn't send the form.
                                    It signs you up with Google (handleGoogle above) */}
                                <div className="signup-social-list">
                                    {/* The "or continue with" line above already says
                                        "continue with", so the button only needs the name.
                                        aria-label gives screen readers (and voice control) the
                                        full words (WCAG) */}
                                    <button type="button" className="signup-social-button" aria-label="Continue with Google" onClick={handleGoogle}>
                                        <ServiceLogo name="google" />
                                        Google
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Step 2: the password. Only drawn after Continue was clicked */}
                        {step === 2 && (
                            <>
                                <p className="signup-intro">Choose a password for {email}.</p>

                                {/* noValidate: our red messages show instead of the browser's bubbles */}
                                <form onSubmit={handleSubmit} noValidate>
                                    {/* The rule is in the label, so everyone knows it before
                                        typing, and screen readers read it with the box (WCAG) */}
                                    <label htmlFor="password" className="signup-label">
                                        Password (at least {shortestPassword} characters)
                                    </label>
                                    {/* type="password" hides what you type as dots.
                                        "new-password" tells password managers to suggest a strong new password.
                                        No autoFocus here: when step 2 shows, the useEffect near the top moves
                                        the focus to the step's heading (so screen readers read it out), and
                                        autoFocus would make the focus jump twice. Tab goes from the heading to here.
                                        The red message works like the Name box on step 1 */}
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

                                    {/* The same password typed again, so a typo is caught before the
                                        account is made. If the two don't match, the red message
                                        shows under this box */}
                                    <label htmlFor="confirmPassword" className="signup-label">Confirm password</label>
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

                                    {/* Shows the message. role="status" makes screen readers read the
                                        message out loud when it appears (WCAG) */}
                                    <p role="status" className="signup-message">{message}</p>

                                    {/* While Supabase makes the account, the words change to
                                        "Creating your account...". aria-disabled (not "disabled")
                                        keeps the keyboard focus on the button, and handleSubmit
                                        ignores clicks while it's on */}
                                    <button type="submit" className="about-button signup-submit" aria-disabled={signingUp}>
                                        {signingUp ? 'Creating your account...' : 'Sign up'}
                                    </button>

                                    {/* Hidden on screen. Screen readers read it out when it fills in,
                                        because a button changing its own words isn't always
                                        announced (WCAG). "sr-only" is the hiding class */}
                                    <p role="status" className="sr-only">{signingUp ? 'Creating your account' : ''}</p>

                                    {/* type="button" so it goes back without sending the form */}
                                    <button type="button" className="signup-secondary-button" onClick={handleBack}>
                                        Back
                                    </button>
                                </form>
                            </>
                        )}

                        {/* Step 3: "Check your email". Only drawn after the account is made */}
                        {step === 3 && (
                            <>
                                {/* The email is in bold, so a typo is easy to spot */}
                                <p className="signup-intro">
                                    We sent a link to <span className="signup-sent-email">{email}</span>. Click it to confirm your email, and you'll be logged in.
                                </p>
                                {/* The last sentence is there on purpose: if the email already
                                    had an account, Supabase doesn't say so (so nobody can find
                                    out who's signed up), and this screen shows the same way */}
                                <p className="signup-note">
                                    It can take a few minutes. If you don't see it, check your spam folder. Already have an account with this email? Just log in.
                                </p>

                                {/* The main next step, so it gets the sky-blue button look */}
                                <Link to="/login" className="about-button signup-submit signup-submit-link">Go to Log in</Link>

                                {/* Back to step 1, with the name and email still filled in,
                                    so it's easy to fix a typo */}
                                <button type="button" className="signup-secondary-button" onClick={handleBack}>
                                    Use a different email
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* What signing up means, before anyone does it: the rules, the youngest
                    age allowed (COPPA: no accounts for children under 13), and how we
                    handle their information. Under the box, so it shows on both steps */}
                <p className="signup-legal">
                    By signing up, you agree to the <Link to="/terms-of-service">Terms of Service</Link> and
                    confirm you're 13 or older. See how we handle your information in the{' '}
                    <Link to="/privacy-policy">Privacy Policy</Link>.
                </p>

                {/* For people who already have an account. It's under the box, so it
                    shows on both steps. It fades smoothly to the Login page */}
                <p className="signup-switch">
                    Already have an account? <SmoothLink to="/login">Log in</SmoothLink>
                </p>
            </main>
        </div>
    )
}

// Lets App.jsx import this page.
export default Signup
