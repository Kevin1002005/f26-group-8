// Settings.jsx is the Settings page (yoursite.com/settings).
// You get here from the dropdown under your circle in the top bar.
// It has a column of tabs on the left. Clicking one shows its box on the right:
//   Account          a link to Edit profile, and Change password
//                    (logged-out people use "Forgot your password?" on Log in instead)
// (There used to be a "Preferences" tab too. It only said "Coming soon", and
// the Profile page's "What I'm looking for" card already does that job.)
//   Appearance       light or dark, the site's colors, and heading style
//   Privacy & data   who can see your profile and what's on it, and "Your data":
//                    Download my data, Delete my account (backend/src/account.ts)
//   Accessibility    font, text size, contrast, spacing, motion, ...
// Appearance and Accessibility work right away, on every page. The choices
// are saved in this browser (see settings.js). Privacy is saved too, but it
// won't change what others see until the site is connected to the backend.
// The styles for this page are in index.css, under "Settings page".

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen (here: the tabs),
// so the code can move the keyboard focus to them.
import { useRef, useState } from 'react';
// useLocation tells the page what the web address is, including the "#..." at the end.
// useNavigate lets the page change the web address.
// Link makes a clickable link to another page of our site (the Account tab's "Edit profile").
import { Link, useLocation, useNavigate } from 'react-router';
// NavBar is the bar across the top of the page (components/NavBar.jsx).
import NavBar from '../components/NavBar.jsx';
// The code that saves the choices and puts them into effect (settings.js)
import { applySettings, defaultSettings, loadSettings, saveSettings } from '../settings.js';
// useTheme reads and changes Light / Dark / System (theme.js). It's the same
// choice as the sun/moon button in the top bar, so both always agree
import { useTheme } from '../theme.js';
// supabase is our one shared connection to Supabase (supabase.js).
// The Account tab's "Change password" form uses it to save the new password
import { supabase } from '../supabase.js';
// api() talks to our backend (api.js). The "Your data" buttons use it
import { api } from '../api.js';
// Whose account this is, and how to log out after deleting it (login-status.js)
import { loggedInId, markLoggedOut } from '../login-status.js';

// The shortest password we accept (the same as the Sign up page)
const shortestPassword = 8;

// ---------- The tabs ----------
// The "id" is also the end of the web address: yoursite.com/settings#privacy
// opens the Privacy & data tab, so a link or bookmark can open a tab directly.
const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'privacy', label: 'Privacy & data' },
    { id: 'accessibility', label: 'Accessibility' },
];

// Which settings each tab's "Reset" button puts back to normal
const appearanceSettings = ['palette', 'headings'];
const privacySettings = ['profileVisibility', 'shareEmail', 'shareSchool', 'shareConnections', 'shareProfileViews', 'shareResume', 'allowMessages'];
const accessibilitySettings = ['font', 'textSize', 'highContrast', 'textSpacing', 'underlineLinks', 'reduceMotion', 'strongFocus'];

// ---------- Pieces of the page ----------

// A group of choices where you pick ONE (radio buttons), like "Color theme".
// props.options is the list of choices, props.value is the one that's picked,
// and props.onChange runs with the new value when another one is picked.
// <fieldset> and <legend> group them under one title, which screen readers
// read along with each choice (WCAG)
function ChoiceGroup(props) {
    return (
        <fieldset className="settings-group">
            <legend className="settings-legend">{props.legend}</legend>
            {props.hint && <p className="settings-hint">{props.hint}</p>}
            <div className="settings-choices">
                {props.options.map((option) => (
                    // The whole box is the label, so clicking anywhere on it picks it
                    <label key={option.value} className="settings-choice">
                        {/* Radio buttons with the same "name" are one group:
                            picking one un-picks the others */}
                        <input
                            type="radio"
                            name={props.name}
                            value={option.value}
                            checked={props.value === option.value}
                            onChange={() => props.onChange(option.value)}
                        />
                        {/* The two-color circle, only on the Color theme choices.
                            It's decoration, since the name says the same thing */}
                        {option.swatch && (
                            <span className={'settings-swatch settings-swatch-' + option.value} aria-hidden="true"></span>
                        )}
                        <span className="settings-choice-text">
                            <span className="settings-choice-label">{option.label}</span>
                            {option.description && (
                                <span className="settings-choice-description">{option.description}</span>
                            )}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

// One on/off choice (a checkbox), like "High contrast".
// props.checked is true when it's on. props.onChange runs with true or false
function Toggle(props) {
    return (
        <label className="settings-choice">
            <input
                type="checkbox"
                checked={props.checked}
                onChange={(event) => props.onChange(event.target.checked)}
            />
            <span className="settings-choice-text">
                <span className="settings-choice-label">{props.label}</span>
                <span className="settings-choice-description">{props.description}</span>
            </span>
        </label>
    );
}

// The "Change password" form on the Account tab, for people who are logged in.
// (Logged-out people who forgot their password use "Forgot your password?"
// on the Log in page, which emails a link to the account's address.)
// You're already logged in, so Supabase knows whose password to change and
// doesn't ask for the old one. People who log in with Google can use this
// too: it gives them a password, so they can also log in with their email.
function ChangePassword() {
    // The red messages under the two boxes ({} means nothing is wrong yet)
    const [errors, setErrors] = useState({});
    // The message next to the Save button ("Your password is changed.", ...)
    const [message, setMessage] = useState('');
    // true while Supabase saves it, so the button says "Saving..."
    const [saving, setSaving] = useState(false);

    // Runs when the form is sent (Save is clicked, or Enter is pressed)
    // "async" lets us "await": wait for Supabase to save it
    async function handleSubmit(event) {
        // Normally sending a form reloads the whole page. This stops that.
        event.preventDefault();
        // If it's already saving, ignore a second click or Enter
        if (saving) return;
        // event.target is the form. form.newPassword is the box with name="newPassword"
        const form = event.target;
        const password = form.newPassword.value;

        // The same checks as the Sign up page
        const newErrors = { newPassword: '', confirmNewPassword: '' };
        if (password === '') newErrors.newPassword = 'Type a new password.';
        else if (password.length < shortestPassword) newErrors.newPassword = `Use at least ${shortestPassword} characters.`;
        if (form.confirmNewPassword.value === '') newErrors.confirmNewPassword = 'Retype your new password.';
        else if (!newErrors.newPassword && password !== form.confirmNewPassword.value) {
            newErrors.confirmNewPassword = "The passwords don't match. Please retype them.";
        }
        setErrors(newErrors);
        setMessage('');
        // If a box has a problem, put the cursor in it, so screen readers
        // read its red message (WCAG)
        if (newErrors.newPassword) {
            form.newPassword.focus();
            return;
        }
        if (newErrors.confirmNewPassword) {
            form.confirmNewPassword.focus();
            return;
        }

        // supabase is null when .env.local is missing (see supabase.js)
        if (!supabase) {
            console.error('Change password: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing from .env.local');
            setMessage("Couldn't change your password. Please try again later.");
            return;
        }

        setSaving(true);
        // Saves the new password on your account
        const { error } = await supabase.auth.updateUser({ password: password });
        setSaving(false);

        if (error) {
            if (error.code === 'weak_password') {
                // Supabase's message says what the password needs
                setErrors({ ...newErrors, newPassword: error.message });
                form.newPassword.focus();
            } else if (error.code === 'same_password') {
                setErrors({ ...newErrors, newPassword: "That's the password you already have. Choose a new one." });
                form.newPassword.focus();
            } else if (error.code === 'reauthentication_needed' || error.name === 'AuthSessionMissingError') {
                // Supabase wants a fresh login before changing a password
                // (its "Secure password change" setting), or the login ran out
                setMessage('For your safety, please log out, log back in, and try again.');
            } else {
                // Anything else. The real reason goes to the console (F12)
                console.error('Change password failed:', error);
                setMessage("Couldn't change your password right now. Please try again.");
            }
            return;
        }

        // It worked. form.reset() empties both boxes
        form.reset();
        setMessage('Your password is changed. Use it the next time you log in.');
    }

    return (
        // noValidate: our red messages show instead of the browser's bubbles
        <form className="settings-password-form" onSubmit={handleSubmit} noValidate>
            {/* htmlFor connects each label to its box, so clicking the label
                focuses the box and screen readers read it (WCAG). The rule is
                in the label, so everyone knows it before typing */}
            <label htmlFor="settings-new-password" className="settings-field-label">
                New password (at least {shortestPassword} characters)
            </label>
            {/* "new-password" tells password managers to suggest a strong one.
                aria-invalid gives the box its red line when there's a problem,
                and aria-describedby makes screen readers read the red message */}
            <input
                id="settings-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                className="settings-input"
                onChange={() => setErrors({ ...errors, newPassword: '' })}
                aria-invalid={Boolean(errors.newPassword)}
                aria-describedby="settings-new-password-error"
            />
            <p id="settings-new-password-error" className="settings-field-error">{errors.newPassword}</p>

            <label htmlFor="settings-confirm-password" className="settings-field-label">
                Confirm new password
            </label>
            <input
                id="settings-confirm-password"
                name="confirmNewPassword"
                type="password"
                autoComplete="new-password"
                required
                className="settings-input"
                onChange={() => setErrors({ ...errors, confirmNewPassword: '' })}
                aria-invalid={Boolean(errors.confirmNewPassword)}
                aria-describedby="settings-confirm-password-error"
            />
            <p id="settings-confirm-password-error" className="settings-field-error">{errors.confirmNewPassword}</p>

            <div className="settings-password-actions">
                {/* aria-disabled (not "disabled") keeps the button reachable with
                    Tab while it saves, and handleSubmit ignores clicks meanwhile */}
                <button type="submit" className="settings-button" aria-disabled={saving}>
                    {saving ? 'Saving...' : 'Change password'}
                </button>
                {/* role="status" makes screen readers read the message out (WCAG) */}
                <p className="settings-message" role="status">{message}</p>
            </div>
        </form>
    );
}

// Settings is the whole page. It puts the pieces above together.
function Settings() {
    // All the choices, read from the browser when the page opens.
    // (Passing loadSettings without () means "only read them the first time")
    const [settings, setSettings] = useState(loadSettings);

    // The message next to a Reset button, or after "Download my data"
    const [message, setMessage] = useState('');

    // Light / Dark / System (see theme.js)
    const { theme, setTheme } = useTheme();

    // The tab buttons, so the arrow keys can move the keyboard focus between them
    const tabRefs = useRef([]);

    // true while the text size slider is being dragged with a mouse or finger
    // (see the slider below). A ref, because changing it shouldn't redraw the page
    const draggingSlider = useRef(false);

    const location = useLocation();
    const navigate = useNavigate();

    // Which tab is open comes from the end of the web address.
    // "#privacy".slice(1) is "privacy". If it isn't one of the tabs (or there's
    // nothing there), the Account tab is open
    const hashId = location.hash.slice(1);
    const activeTab = tabs.some((tab) => tab.id === hashId) ? hashId : 'account';

    // Opens a tab by changing the end of the web address.
    // "replace" means switching tabs doesn't fill up the Back button's history
    function openTab(id) {
        setMessage('');
        navigate({ hash: '#' + id }, { replace: true });
    }

    // The arrow keys move between tabs, like they do in tabs on a computer.
    // Home and End jump to the first and last tab (WCAG)
    function handleTabKeyDown(event, index) {
        let next = null;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        // Any other key: do nothing special
        if (next === null) return;

        // Stops the arrow keys from also scrolling the page
        event.preventDefault();
        openTab(tabs[next].id);
        tabRefs.current[next].focus();
    }

    // Changes one choice, then saves all of them and puts them into effect.
    // [name]: value means "the setting called whatever is in name", so
    // changeSetting('palette', 'mint') sets settings.palette to 'mint'.
    // It starts from loadSettings() (what's saved right now), not from this
    // page's copy: if you changed something in another tab, this page's copy
    // is old, and saving it would quietly undo that change
    function changeSetting(name, value) {
        const newSettings = { ...loadSettings(), [name]: value };
        setSettings(newSettings);
        saveSettings(newSettings);
        applySettings(newSettings);
        setMessage('');
    }

    // "Download my data": everything your account has saved (backend/src/account.ts),
    // plus this browser's settings, as one file. A Blob is a file made in the browser,
    // and a link with "download" saves it instead of opening it
    async function downloadData() {
        setMessage('Getting your data...');
        try {
            const data = await api('/account/export');
            const file = new Blob([JSON.stringify({ ...data, settings_in_this_browser: loadSettings() }, null, 2)], { type: 'application/json' });
            const name = 'scoutsearch-data-' + new Date().toISOString().slice(0, 10) + '.json';
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.download = name;
            link.click();
            URL.revokeObjectURL(link.href);
            setMessage('Downloaded ' + name + '.');
        } catch (error) {
            setMessage("Couldn't get your data: " + error.message);
        }
    }

    // "Delete my account": after checking (it can't be undone), deletes the account and
    // everything saved with it, removes this browser's copies too, then logs out
    async function deleteAccount() {
        if (!window.confirm('Delete your account and everything saved with it (your profile, tracker, resume, and Feed posts)? This can\'t be undone.')) return;
        const id = loggedInId();
        setMessage('Deleting your account...');
        try {
            await api('/account', { method: 'DELETE' });
        } catch (error) {
            setMessage("Couldn't delete your account: " + error.message);
            return;
        }
        // this browser's copies of your things are saved under your account id ("...:<id>")
        try {
            for (const key of Object.keys(localStorage)) {
                if (id && key.endsWith(':' + id)) localStorage.removeItem(key);
            }
        } catch {
            // storage is off: there's nothing saved to remove
        }
        await markLoggedOut();
        navigate('/about', { replace: true });
    }

    // Puts the listed settings back to how they started
    // (starting from what's saved right now, for the same reason as changeSetting)
    function resetSettings(names) {
        const newSettings = { ...loadSettings() };
        names.forEach((name) => {
            newSettings[name] = defaultSettings[name];
        });
        setSettings(newSettings);
        saveSettings(newSettings);
        applySettings(newSettings);
        setMessage('Back to the defaults.');
    }

    return (
        <>
            {/* <title> is the name shown on the browser tab (WCAG) */}
            <title>Settings | ScoutSearch</title>
            <NavBar />

            <main className="settings-page">
                <h1 className="settings-title">Settings</h1>

                <div className="settings-layout">
                    {/* The column of tabs. role="tablist" and role="tab" tell screen
                        readers these are tabs, so they say "tab, 3 of 4" (WCAG).
                        Only the open tab is a Tab-key stop (tabIndex 0); the arrow
                        keys move between the others (tabIndex -1) */}
                    <div className="settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
                        {tabs.map((tab, index) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                id={'settings-tab-' + tab.id}
                                aria-selected={activeTab === tab.id}
                                aria-controls={'settings-panel-' + tab.id}
                                tabIndex={activeTab === tab.id ? 0 : -1}
                                className="settings-tab"
                                // Saves this button in the list, so handleTabKeyDown can focus it
                                ref={(element) => { tabRefs.current[index] = element; }}
                                onClick={() => openTab(tab.id)}
                                onKeyDown={(event) => handleTabKeyDown(event, index)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* The boxes, one per tab. Every box is always on the page, but
                        "hidden" hides all but the open one. role="tabpanel" and
                        aria-labelledby connect each box to its tab (WCAG) */}
                    <div>
                        {/* ----- Account ----- */}
                        <section
                            id="settings-panel-account"
                            role="tabpanel"
                            aria-labelledby="settings-tab-account"
                            hidden={activeTab !== 'account'}
                            className="settings-panel"
                        >
                            <h2 className="settings-panel-title">Account</h2>
                            {/* This tab used to only say "Coming soon", so the dropdown's
                                link here was a dead end. Now it sends you to the page
                                where you really can change those things */}
                            <p className="settings-text">Your name, school, bio, and resume are part of your profile.</p>
                            {/* A Link, not a button, because it goes to another page.
                                It borrows the pill look of the Reset buttons */}
                            <Link to="/editprofile" className="settings-button settings-edit-profile-link">
                                Edit profile
                            </Link>

                            <div className="settings-group">
                                <h3 className="settings-legend">Change password</h3>
                                <p className="settings-text">
                                    If you log in with Google, this adds a password, so you can also log in with your email.
                                </p>
                                {/* The form itself is the ChangePassword piece above */}
                                <ChangePassword />
                            </div>

                            <div className="settings-group">
                                <h3 className="settings-legend">Email</h3>
                                {/* Says plainly what isn't ready, the same way the
                                    Privacy tab's buttons do */}
                                <p className="settings-text">Changing your email isn't ready yet.</p>
                            </div>
                        </section>

                        {/* ----- Appearance ----- */}
                        <section
                            id="settings-panel-appearance"
                            role="tabpanel"
                            aria-labelledby="settings-tab-appearance"
                            hidden={activeTab !== 'appearance'}
                            className="settings-panel"
                        >
                            <h2 className="settings-panel-title">Appearance</h2>
                            <p className="settings-text">Change how ScoutSearch looks. Changes show up right away, on every page.</p>

                            {/* The same choice as the sun/moon button in the top bar */}
                            <ChoiceGroup
                                legend="Light or dark"
                                name="theme"
                                value={theme}
                                onChange={(value) => {
                                    setTheme(value);
                                    setMessage('');
                                }}
                                options={[
                                    { value: 'light', label: 'Light', description: 'Always light' },
                                    { value: 'dark', label: 'Dark', description: 'Always dark' },
                                    { value: 'system', label: 'System', description: 'Match your device' },
                                ]}
                            />

                            <ChoiceGroup
                                legend="Colors"
                                name="palette"
                                value={settings.palette}
                                onChange={(value) => changeSetting('palette', value)}
                                options={[
                                    { value: 'blue', label: 'Blue', description: 'The normal look', swatch: true },
                                    { value: 'mint', label: 'Mint', description: 'Soft green-blue', swatch: true },
                                    { value: 'lavender', label: 'Lavender', description: 'Soft purple-blue', swatch: true },
                                ]}
                            />

                            <ChoiceGroup
                                legend="Heading style"
                                hint="The font used for the big titles on each page."
                                name="headings"
                                value={settings.headings}
                                onChange={(value) => changeSetting('headings', value)}
                                options={[
                                    { value: 'classic', label: 'Classic', description: 'The same font as the text' },
                                    { value: 'sign', label: 'Road sign', description: 'Bold, like highway signs' },
                                ]}
                            />

                            <div className="settings-footer">
                                {/* Puts the colors and headings back, and Light or dark back to System */}
                                <button
                                    type="button"
                                    className="settings-button"
                                    onClick={() => {
                                        setTheme('system');
                                        resetSettings(appearanceSettings);
                                    }}
                                >
                                    Reset appearance
                                </button>
                                {/* role="status" makes screen readers read the message out loud (WCAG) */}
                                <p role="status" className="settings-message">{activeTab === 'appearance' ? message : ''}</p>
                            </div>
                        </section>

                        {/* ----- Privacy & data ----- */}
                        <section
                            id="settings-panel-privacy"
                            role="tabpanel"
                            aria-labelledby="settings-tab-privacy"
                            hidden={activeTab !== 'privacy'}
                            className="settings-panel"
                        >
                            <h2 className="settings-panel-title">Privacy &amp; data</h2>
                            <p className="settings-text">
                                Choose who can see your profile and what's on it. These are saved in
                                this browser for now, and will take effect once the site is connected
                                to the backend.
                            </p>

                            <ChoiceGroup
                                legend="Who can see your profile"
                                name="profileVisibility"
                                value={settings.profileVisibility}
                                onChange={(value) => changeSetting('profileVisibility', value)}
                                options={[
                                    { value: 'everyone', label: 'Everyone', description: 'Anyone on ScoutSearch, including job listers' },
                                    { value: 'members', label: 'Students only', description: 'Other students, but not job listers' },
                                    { value: 'connections', label: 'Only connections', description: 'People you have connected with' },
                                ]}
                            />

                            {/* A group of on/off choices. It's a <fieldset> too, so screen
                                readers read "What to share on your profile" with each one */}
                            <fieldset className="settings-group">
                                <legend className="settings-legend">What to share on your profile</legend>
                                <div className="settings-choices">
                                    <Toggle label="School" description="Where you go to school" checked={settings.shareSchool} onChange={(value) => changeSetting('shareSchool', value)} />
                                    <Toggle label="Email" description="Your email address" checked={settings.shareEmail} onChange={(value) => changeSetting('shareEmail', value)} />
                                    <Toggle label="Connections" description="How many connections you have" checked={settings.shareConnections} onChange={(value) => changeSetting('shareConnections', value)} />
                                    <Toggle label="Profile views" description="How many people viewed your profile" checked={settings.shareProfileViews} onChange={(value) => changeSetting('shareProfileViews', value)} />
                                    <Toggle label="Resume" description="Job listers can open your resume" checked={settings.shareResume} onChange={(value) => changeSetting('shareResume', value)} />
                                </div>
                            </fieldset>

                            <fieldset className="settings-group">
                                <legend className="settings-legend">Messages</legend>
                                <div className="settings-choices">
                                    <Toggle label="Messages from job listers" description="Companies can message you about jobs" checked={settings.allowMessages} onChange={(value) => changeSetting('allowMessages', value)} />
                                </div>
                            </fieldset>

                            {/* Your data: a copy of everything saved with your account, or
                                delete it all (the Privacy Policy's "Your rights" points here) */}
                            <div className="settings-group">
                                <h3 className="settings-legend">Your data</h3>
                                <p className="settings-hint">
                                    Get a copy of everything ScoutSearch has saved about you, or delete your account and
                                    everything saved with it. See the <Link to="/privacy-policy">Privacy Policy</Link>.
                                </p>
                                <div className="settings-footer">
                                    <button type="button" className="settings-button" onClick={downloadData}>
                                        Download my data
                                    </button>
                                    <button type="button" className="settings-button settings-button-danger" onClick={deleteAccount}>
                                        Delete my account
                                    </button>
                                </div>
                            </div>

                            <div className="settings-footer">
                                <button type="button" className="settings-button" onClick={() => resetSettings(privacySettings)}>
                                    Reset privacy
                                </button>
                                <p role="status" className="settings-message">{activeTab === 'privacy' ? message : ''}</p>
                            </div>
                        </section>

                        {/* ----- Accessibility ----- */}
                        <section
                            id="settings-panel-accessibility"
                            role="tabpanel"
                            aria-labelledby="settings-tab-accessibility"
                            hidden={activeTab !== 'accessibility'}
                            className="settings-panel"
                        >
                            <h2 className="settings-panel-title">Accessibility</h2>
                            <p className="settings-text">Make ScoutSearch easier to see, read, and use. Changes show up right away, on every page.</p>

                            <ChoiceGroup
                                legend="Font"
                                name="font"
                                value={settings.font}
                                onChange={(value) => changeSetting('font', value)}
                                options={[
                                    { value: 'default', label: 'Default', description: "The site's normal fonts" },
                                    { value: 'readable', label: 'Easy to read', description: 'Atkinson Hyperlegible, made for low vision' },
                                    { value: 'wide', label: 'Wide letters', description: 'Verdana, with roomy letters' },
                                ]}
                            />

                            {/* Text size: a slider you drag left (smaller) or right (bigger).
                                The <label> is its title, and htmlFor ties it to the slider,
                                so screen readers say "Text size" when they reach it (WCAG) */}
                            <div className="settings-group">
                                <label htmlFor="settings-text-size" className="settings-legend">Text size</label>
                                <p id="settings-text-size-hint" className="settings-hint">
                                    Drag the slider, or use the arrow keys, to make the text and everything around it bigger.
                                </p>
                                <div className="settings-slider-row">
                                    {/* A small "A" and a big "A" at each end, showing which way is bigger.
                                        They're decoration, so screen readers skip them (WCAG) */}
                                    <span className="settings-slider-small-a" aria-hidden="true">A</span>
                                    {/* type="range" is the browser's own slider, so it already works
                                        with the mouse, a finger, and the arrow keys.
                                        min/max/step: from 100% to 150%, 1% at a time, so you can pick any size in between.
                                        aria-valuetext makes screen readers say "125%", not just "125" (WCAG) */}
                                    <input
                                        type="range"
                                        id="settings-text-size"
                                        className="settings-slider"
                                        min="100"
                                        max="150"
                                        step="1"
                                        value={settings.textSize}
                                        aria-describedby="settings-text-size-hint"
                                        aria-valuetext={settings.textSize + '%'}
                                        // How far along the knob is: 0 at 100%, 1 at 150%.
                                        // index.css uses it to color the track blue up to the knob.
                                        // (This is the only style set in JSX, because it changes
                                        // as you drag. The look itself stays in index.css)
                                        style={{ '--slider-fill': (settings.textSize - 100) / 50 }}
                                        // While you drag with a mouse or finger, only the number next to
                                        // the slider changes. (The slider grows with the page, so changing
                                        // the size mid-drag would make it jump around under the mouse.)
                                        // Anything else (arrow keys, or a screen reader's swipe up or down,
                                        // which sends no mouse or key events at all) puts the new size into
                                        // effect right away. Number() turns the slider's text "125" into 125
                                        onPointerDown={() => { draggingSlider.current = true; }}
                                        onChange={(event) => {
                                            if (draggingSlider.current) {
                                                setSettings({ ...settings, textSize: Number(event.target.value) });
                                            } else {
                                                changeSetting('textSize', Number(event.target.value));
                                            }
                                        }}
                                        // When you let go, the new size is saved and put into effect.
                                        // onBlur (leaving the slider) is a backup, in case the mouse was let go somewhere else
                                        onPointerUp={(event) => { draggingSlider.current = false; changeSetting('textSize', Number(event.target.value)); }}
                                        onPointerCancel={() => { draggingSlider.current = false; }}
                                        onBlur={(event) => { draggingSlider.current = false; changeSetting('textSize', Number(event.target.value)); }}
                                    />
                                    <span className="settings-slider-big-a" aria-hidden="true">A</span>
                                    {/* The size it's on now, like "125%" */}
                                    <span className="settings-slider-value">{settings.textSize}%</span>
                                </div>
                            </div>

                            <fieldset className="settings-group">
                                <legend className="settings-legend">Reading and seeing</legend>
                                <div className="settings-choices">
                                    <Toggle label="High contrast" description="Darker text and lines that stand out more" checked={settings.highContrast} onChange={(value) => changeSetting('highContrast', value)} />
                                    <Toggle label="More text spacing" description="More room between lines, letters, and words" checked={settings.textSpacing} onChange={(value) => changeSetting('textSpacing', value)} />
                                    <Toggle label="Underline links" description="So links don't rely on color alone" checked={settings.underlineLinks} onChange={(value) => changeSetting('underlineLinks', value)} />
                                </div>
                            </fieldset>

                            <fieldset className="settings-group">
                                <legend className="settings-legend">Motion and keyboard</legend>
                                <div className="settings-choices">
                                    <Toggle label="Reduce motion" description="Turn off animations and fades" checked={settings.reduceMotion} onChange={(value) => changeSetting('reduceMotion', value)} />
                                    <Toggle label="Stronger keyboard outline" description="A thicker outline around what the Tab key reached" checked={settings.strongFocus} onChange={(value) => changeSetting('strongFocus', value)} />
                                </div>
                            </fieldset>

                            <div className="settings-footer">
                                <button type="button" className="settings-button" onClick={() => resetSettings(accessibilitySettings)}>
                                    Reset accessibility
                                </button>
                                <p role="status" className="settings-message">{activeTab === 'accessibility' ? message : ''}</p>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </>
    )
}

// Lets App.jsx import this page.
export default Settings
