// resume-storage.js keeps the Resume builder's information (pages/ResumeBuilder.jsx).
// It's saved in this browser's storage (localStorage), so it's still there
// after a refresh. LATER (plans.md, F15): the backend saves it with your
// account instead, so it follows you to other devices.
//
// The shape is the "Resume" one in frontend/plans.md's shared contract:
//   { contact, education[], experience[], projects[], skills[] }
// Bullet points are kept as one piece of text with one bullet per line,
// because that's how you type them in the form.
//
// Every read and write is inside try/catch: the browser's storage can be
// turned off (some private windows). Then the builder still works, it just
// won't remember anything after a refresh.

// The name it's saved under in localStorage
const storageKey = 'scoutsearch-resume';

// A made-up example, so a new visitor sees how a finished resume looks.
// Everything in it is invented on purpose (the team's rule: examples are
// clearly fake, never a real person's details).
export const exampleResume = {
    contact: {
        name: 'Jamie Rivera',
        location: 'Boston, MA',
        email: 'jamie.rivera@example.com',
        phone: '',
        link: 'linkedin.com/in/jamie-rivera-example',
    },
    education: [
        {
            id: 1,
            school: 'Northeastern University',
            location: 'Boston, MA',
            degree: 'Bachelor of Science in Computer Science',
            dates: 'Sep 2026 – Present',
        },
    ],
    projects: [
        {
            id: 1,
            name: 'Study Buddy',
            context: 'Campus Hackathon',
            dates: 'Nov 2026',
            bullets: 'Co-built a web app that matches students into study groups by class and schedule.\nBuilt the sign-up flow and the group chat page in React.\nDeployed the app and wrote the setup guide for the team.',
            link: 'github.com/example/study-buddy',
        },
        {
            id: 2,
            name: 'Budget Tracker',
            context: 'Personal project',
            dates: 'Aug 2026',
            bullets: 'Made a budgeting site that sorts spending into categories and shows a monthly chart.\nUsed JavaScript, HTML, and CSS, and made every page work with a keyboard.',
            link: '',
        },
    ],
    experience: [
        {
            id: 1,
            role: 'Library Assistant',
            organization: 'Westbrook Public Library',
            location: 'Boston, MA',
            dates: 'Jun 2025 – Present',
            bullets: 'Helped visitors find books and use the computers, about 40 people a shift.\nRan a weekly coding club for middle schoolers.',
        },
        {
            id: 2,
            role: 'Cashier',
            organization: 'Harbor Street Bakery',
            location: 'Quincy, MA',
            dates: 'Jun 2024 – May 2025',
            bullets: 'Handled orders and payments during busy weekend mornings.\nTrained two new team members on the register.',
        },
    ],
    skills: [
        { id: 1, label: 'Languages', items: 'Python, JavaScript, HTML, CSS' },
        { id: 2, label: 'Tools', items: 'Git, GitHub, VS Code, Figma' },
        { id: 3, label: 'Concepts', items: 'Front-End Development, Accessibility (WCAG), Responsive Design' },
    ],
};

// An empty resume, for "Start from scratch". One empty entry in each
// section, so the form shows the boxes to fill in
export const blankResume = {
    contact: { name: '', location: '', email: '', phone: '', link: '' },
    education: [{ id: 1, school: '', location: '', degree: '', dates: '' }],
    projects: [{ id: 1, name: '', context: '', dates: '', bullets: '', link: '' }],
    experience: [{ id: 1, role: '', organization: '', location: '', dates: '', bullets: '' }],
    skills: [{ id: 1, label: 'Languages', items: '' }],
};

// Copies one entry, keeping only the boxes "blank" has, each one as text.
// A missing box becomes empty, and something that isn't text (a number,
// null) is turned into text, so the page's .trim() and form boxes always work
function fillBoxes(blank, entry) {
    const filled = {};
    for (const key of Object.keys(blank)) {
        filled[key] = entry[key] === undefined || entry[key] === null ? '' : String(entry[key]);
    }
    return filled;
}

// Fills in anything missing from a saved resume (an older version, or one
// saved halfway). Without this, one missing box crashes the whole page.
// The ids are numbered again (1, 2, 3...) so no two entries share one
function fillGaps(saved) {
    // One list, like "projects": only real entries, each with every box
    function fillList(key) {
        const list = Array.isArray(saved[key]) ? saved[key] : [];
        return list
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry, place) => ({ ...fillBoxes(blankResume[key][0], entry), id: place + 1 }));
    }
    return {
        contact: fillBoxes(blankResume.contact, saved.contact),
        education: fillList('education'),
        projects: fillList('projects'),
        experience: fillList('experience'),
        skills: fillList('skills'),
    };
}

// Gives back the saved resume, or null if nothing is saved yet (or the
// saved text is broken)
export function loadResume() {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        // A quick check that it really is a resume, in case something else got saved there
        return saved && typeof saved.contact === 'object' && saved.contact !== null ? fillGaps(saved) : null;
    } catch {
        return null;
    }
}

// Saves the whole resume
export function saveResume(resume) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(resume));
    } catch {
        // Storage is turned off. Nothing to do: it just won't be remembered.
    }
}
