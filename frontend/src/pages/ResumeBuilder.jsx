// ResumeBuilder.jsx is the Resume builder (yoursite.com/resume).
// Type your details in the form on the left, and the resume on the right
// updates as you type. "Download PDF" saves it to your computer.
//   - It opens with a made-up example (clearly labeled), so you can see how
//     a finished resume looks. "Start from scratch" empties it.
//   - Everything saves in this browser as you type (resume-storage.js).
//   - "Download PDF" opens the browser's print window, where you pick
//     "Save as PDF". index.css (under "Printing and Save as PDF") makes the
//     printed page only the resume, on a letter-size page.
// The layout follows Jake's Resume, a free template (MIT License) that many
// students use. We wrote our own code for it; the template's license notices
// are kept in frontend/public/resume-template-license.txt, and the note under
// the preview links to it. The styles are in index.css, under "Resume builder page".

// useState lets the page remember a value and redraw itself when it changes.
// useRef remembers a value WITHOUT redrawing (here: where the focus goes next).
// useEffect runs a bit of code right after the page has been redrawn.
import { useEffect, useRef, useState } from 'react';
// NavBar is the bar across the top of the page (components/NavBar.jsx).
import NavBar from '../components/NavBar.jsx';
// The saved resume, the example, and the empty one (resume-storage.js)
// (and watchOtherTabs, which keeps two open tabs showing the same resume)
import { blankResume, exampleResume, loadResume, saveResume, watchOtherTabs } from '../resume-storage.js';

// ---------- The repeating sections ----------
// Education, Projects, and Experience all work the same way: a list of
// entries, each with a few boxes. This says which boxes each one has, so one
// piece of code (EntryEditor below) can draw all three.
//   singular   what one entry is called ("Job 2")
//   nameKey    the box whose words name the entry ("Remove Library Assistant")
//   fields     the boxes: key (where it's saved), label, and wide (whole row)
//              or bullets (a bigger box, one bullet point per line)
const sections = [
    {
        key: 'education',
        title: 'Education',
        singular: 'School',
        nameKey: 'school',
        fields: [
            { key: 'school', label: 'School' },
            { key: 'location', label: 'City, state' },
            { key: 'degree', label: 'Degree or program', wide: true },
            { key: 'dates', label: 'Dates', placeholder: 'Sep 2026 – Present' },
        ],
    },
    {
        key: 'projects',
        title: 'Projects',
        singular: 'Project',
        nameKey: 'name',
        fields: [
            { key: 'name', label: 'Project name' },
            { key: 'context', label: 'Where (class, club, hackathon)' },
            { key: 'dates', label: 'Dates', placeholder: 'Nov 2026' },
            { key: 'link', label: 'Link (optional)', placeholder: 'github.com/you/project' },
            { key: 'bullets', label: 'What you did', bullets: true },
        ],
    },
    {
        key: 'experience',
        title: 'Experience',
        singular: 'Job',
        nameKey: 'role',
        fields: [
            { key: 'role', label: 'Job title' },
            { key: 'organization', label: 'Where you worked' },
            { key: 'location', label: 'City, state' },
            { key: 'dates', label: 'Dates', placeholder: 'Jun 2025 – Present' },
            { key: 'bullets', label: 'What you did', bullets: true },
        ],
    },
];

// The contact boxes at the top of the form
const contactFields = [
    { key: 'name', label: 'Full name', autoComplete: 'name' },
    { key: 'location', label: 'City, state', autoComplete: 'address-level2' },
    { key: 'email', label: 'Email', autoComplete: 'email', type: 'email' },
    { key: 'phone', label: 'Phone (optional)', autoComplete: 'tel', type: 'tel' },
    { key: 'link', label: 'LinkedIn or website (optional)', autoComplete: 'url', wide: true },
];

// ---------- Small helpers ----------

// The next free id in a list: one more than the biggest id so far.
// (Each entry needs its own id, for React's "key" and for the boxes' ids)
function nextId(list) {
    return list.reduce((biggest, item) => Math.max(biggest, item.id), 0) + 1;
}

// Turns the bullet box's text into a list: one bullet per line, skipping
// empty lines. .split('\n') cuts the text at each new line
function toBullets(text) {
    return text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

// True if every box in an entry is still empty (empty entries aren't printed)
function isEmpty(entry) {
    return Object.entries(entry).every(([key, value]) => key === 'id' || String(value).trim() === '');
}

// ---------- Icons ----------
// Small drawings for the square buttons. aria-hidden: the button's
// aria-label already says what it does (WCAG)
function ArrowUpIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
    );
}

function ArrowDownIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
    );
}

// ---------- Pieces of the page ----------

// One box you type in, with its label above it.
// props.id connects the label to the box (WCAG). props.bullets makes it a
// bigger box for bullet points, with a hint under it
function Field(props) {
    const className = props.wide || props.bullets ? 'resume-field resume-field-wide' : 'resume-field';
    return (
        <div className={className}>
            <label htmlFor={props.id} className="resume-label">{props.label}</label>
            {props.bullets ? (
                <>
                    {/* aria-describedby makes screen readers read the hint with the box (WCAG) */}
                    <textarea
                        id={props.id}
                        className="resume-input resume-textarea"
                        value={props.value}
                        onChange={(event) => props.onChange(event.target.value)}
                        aria-describedby={props.id + '-hint'}
                    />
                    <p id={props.id + '-hint'} className="resume-hint">One bullet point per line.</p>
                </>
            ) : (
                <input
                    id={props.id}
                    className="resume-input"
                    type={props.type || 'text'}
                    autoComplete={props.autoComplete || 'off'}
                    placeholder={props.placeholder}
                    value={props.value}
                    onChange={(event) => props.onChange(event.target.value)}
                />
            )}
        </div>
    );
}

// One entry (one school, project, or job), with Move up, Move down, Remove.
// props.section is one of the "sections" above; props.entry is the entry
function EntryEditor(props) {
    const section = props.section;
    const entry = props.entry;
    // What to call this entry in button labels: its name, or "Job 2" if it has none yet
    const number = section.singular + ' ' + (props.index + 1);
    const name = entry[section.nameKey].trim() || number;
    // The start of every id in this entry, like "experience-2". The boxes add
    // their key ("experience-2-role") and the buttons add up/down/remove, so the
    // page can find them again to put the keyboard focus back (see ResumeBuilder)
    const idStart = section.key + '-' + entry.id;

    return (
        <div className="resume-entry">
            <div className="resume-entry-head">
                <h3 className="resume-entry-title">
                    {number}{entry[section.nameKey].trim() ? ': ' + entry[section.nameKey] : ''}
                </h3>
                {/* Each button says which entry it's for, because every entry
                    has the same three buttons (WCAG). disabled: the first one
                    can't move up, the last one can't move down */}
                <div className="resume-entry-tools">
                    <button type="button" id={idStart + '-up'} className="resume-icon-button" aria-label={'Move ' + name + ' up'} disabled={props.index === 0} onClick={() => props.onMove(-1)}>
                        <ArrowUpIcon />
                    </button>
                    <button type="button" id={idStart + '-down'} className="resume-icon-button" aria-label={'Move ' + name + ' down'} disabled={props.index === props.count - 1} onClick={() => props.onMove(1)}>
                        <ArrowDownIcon />
                    </button>
                    <button type="button" id={idStart + '-remove'} className="resume-icon-button" aria-label={'Remove ' + name} onClick={props.onRemove}>
                        <TrashIcon />
                    </button>
                </div>
            </div>

            <div className="resume-fields">
                {section.fields.map((field) => (
                    <Field
                        key={field.key}
                        // A unique id, like "experience-2-role", so each label finds its own box
                        id={idStart + '-' + field.key}
                        label={field.label}
                        placeholder={field.placeholder}
                        wide={field.wide}
                        bullets={field.bullets}
                        value={entry[field.key]}
                        onChange={(value) => props.onChange(field.key, value)}
                    />
                ))}
            </div>
        </div>
    );
}

// The resume itself, drawn like the printed page. Only filled-in parts show,
// so an empty section doesn't leave a heading with nothing under it.
// props.resume is the whole resume
function ResumePaper(props) {
    const resume = props.resume;
    const contact = resume.contact;
    // The contact line: the filled-in pieces joined with " | "
    const contactLine = [contact.location, contact.email, contact.phone, contact.link]
        .map((item) => item.trim())
        .filter((item) => item !== '')
        .join(' | ');
    const education = resume.education.filter((entry) => !isEmpty(entry));
    const projects = resume.projects.filter((entry) => !isEmpty(entry));
    const experience = resume.experience.filter((entry) => !isEmpty(entry));
    const skills = resume.skills.filter((row) => row.items.trim() !== '');
    const nothingYet = !contact.name.trim() && !contactLine && !education.length && !projects.length && !experience.length && !skills.length;

    return (
        // <article>: one piece that makes sense on its own. The label tells
        // screen readers this is the preview (WCAG)
        <article className="resume-paper" aria-label="Resume preview">
            {nothingYet && <p className="resume-paper-empty">Your resume shows up here as you type.</p>}

            {contact.name.trim() && <h2 className="resume-paper-name">{contact.name}</h2>}
            {contactLine && <p className="resume-paper-contact">{contactLine}</p>}

            {education.length > 0 && (
                <section className="resume-paper-section">
                    <h3 className="resume-paper-heading">Education</h3>
                    {education.map((entry) => (
                        <div key={entry.id} className="resume-paper-entry">
                            <div className="resume-paper-row">
                                <span className="resume-paper-strong">{entry.school}</span>
                                <span className="resume-paper-right">{entry.location}</span>
                            </div>
                            <div className="resume-paper-row resume-paper-italic">
                                <span>{entry.degree}</span>
                                <span className="resume-paper-right">{entry.dates}</span>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {projects.length > 0 && (
                <section className="resume-paper-section">
                    <h3 className="resume-paper-heading">Projects</h3>
                    {projects.map((entry) => (
                        <div key={entry.id} className="resume-paper-entry">
                            <div className="resume-paper-row">
                                {/* "Name | Where", like the template */}
                                <span className="resume-paper-strong">
                                    {entry.name}{entry.context.trim() ? ' | ' + entry.context : ''}
                                </span>
                                <span className="resume-paper-right">{entry.dates}</span>
                            </div>
                            {toBullets(entry.bullets).length > 0 && (
                                <ul className="resume-paper-bullets">
                                    {/* The line's place is its key: the lines are just text */}
                                    {toBullets(entry.bullets).map((line, place) => <li key={place}>{line}</li>)}
                                </ul>
                            )}
                            {entry.link.trim() && <p className="resume-paper-link">{entry.link}</p>}
                        </div>
                    ))}
                </section>
            )}

            {experience.length > 0 && (
                <section className="resume-paper-section">
                    <h3 className="resume-paper-heading">Experience</h3>
                    {experience.map((entry) => (
                        <div key={entry.id} className="resume-paper-entry">
                            <div className="resume-paper-row">
                                <span className="resume-paper-strong">{entry.role}</span>
                                <span className="resume-paper-right">{entry.dates}</span>
                            </div>
                            <div className="resume-paper-row resume-paper-italic">
                                <span>{entry.organization}</span>
                                <span className="resume-paper-right">{entry.location}</span>
                            </div>
                            {toBullets(entry.bullets).length > 0 && (
                                <ul className="resume-paper-bullets">
                                    {toBullets(entry.bullets).map((line, place) => <li key={place}>{line}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {skills.length > 0 && (
                <section className="resume-paper-section">
                    <h3 className="resume-paper-heading">Skills</h3>
                    {skills.map((row) => (
                        <p key={row.id} className="resume-paper-skill">
                            <span className="resume-paper-strong">{row.label.trim() || 'Skills'}</span>: {row.items}
                        </p>
                    ))}
                </section>
            )}
        </article>
    );
}

// ResumeBuilder is the whole page. It puts the pieces above together and
// keeps the resume, so the form and the preview always match.
function ResumeBuilder() {
    // The resume: what's saved in this browser, or the example the first time
    const [resume, setResume] = useState(() => loadResume() || exampleResume);
    // true while the made-up example is showing (it gets the "Example" tag)
    const [showingExample, setShowingExample] = useState(() => loadResume() === null);
    // Phones: which side is showing, "edit" or "preview"
    const [view, setView] = useState('edit');
    // The short message next to the buttons ("Removed Cashier.", ...)
    const [message, setMessage] = useState('');
    // true when the last save didn't work (the browser's storage is full or
    // turned off), so the page can warn you before you lose your changes
    const [saveFailed, setSaveFailed] = useState(false);

    // If this resume is open in another tab and you type there, show those
    // changes here too, so neither tab overwrites the other. (Runs once; the
    // "return" stops listening when you leave the page.) If the other tab
    // cleared everything, this one goes back to the example, like a first visit
    useEffect(() => {
        const stopWatching = watchOtherTabs((saved) => {
            setResume(saved || exampleResume);
            setShowingExample(saved === null);
        });
        return stopWatching;
    }, []);

    // Keyboard users: after Move, Remove, or Add, the button they pressed can
    // move or disappear, and the focus would jump back to the top of the page.
    // focusNext holds the id of where the focus should go instead, and the
    // useEffect below moves it there right after the page redraws (WCAG).
    // (No list at the end of useEffect means it runs after every redraw)
    const focusNext = useRef('');
    useEffect(() => {
        if (focusNext.current) {
            // "?." skips it if that id isn't on the page
            document.getElementById(focusNext.current)?.focus();
            focusNext.current = '';
        }
    });

    // Every change goes through here: it redraws the page and saves.
    // (The example isn't saved until you change something, so it stays an example)
    function update(newResume) {
        setResume(newResume);
        // saveResume gives back false if it couldn't save ("!" flips it to true)
        setSaveFailed(!saveResume(newResume));
        setShowingExample(false);
    }

    // Changes one contact box. { ...a, [key]: value } copies "a" with one piece changed
    function changeContact(key, value) {
        update({ ...resume, contact: { ...resume.contact, [key]: value } });
    }

    // Changes one box in one entry (section is "education", "projects", or "experience")
    function changeEntry(section, id, key, value) {
        update({
            ...resume,
            [section]: resume[section].map((entry) => (entry.id === id ? { ...entry, [key]: value } : entry)),
        });
    }

    // Adds an empty entry at the end of a section (sectionInfo is one of "sections")
    function addEntry(sectionInfo) {
        const list = resume[sectionInfo.key];
        // A copy of the blank entry (blankResume, resume-storage.js) with a new id
        const empty = { ...blankResume[sectionInfo.key][0], id: nextId(list) };
        update({ ...resume, [sectionInfo.key]: [...list, empty] });
        setMessage('Added one at the bottom.');
        // The focus goes into the new entry's first box, ready to type
        focusNext.current = sectionInfo.key + '-' + empty.id + '-' + sectionInfo.fields[0].key;
    }

    // Removes an entry. The message says what was removed, for screen readers too
    function removeEntry(sectionInfo, entry) {
        const name = entry[sectionInfo.nameKey].trim() || sectionInfo.singular.toLowerCase();
        update({ ...resume, [sectionInfo.key]: resume[sectionInfo.key].filter((item) => item.id !== entry.id) });
        setMessage('Removed ' + name + '.');
        // Its Remove button is gone, so the focus goes to the section's "+ Add" button
        focusNext.current = 'resume-' + sectionInfo.key + '-add';
    }

    // Moves an entry up (-1) or down (+1) by swapping it with its neighbor
    function moveEntry(section, index, direction) {
        const list = [...resume[section]];
        const other = index + direction;
        [list[index], list[other]] = [list[other], list[index]];
        update({ ...resume, [section]: list });
        // The focus follows the entry to its new place, on the same arrow. If it
        // reached the top (or bottom), that arrow turns off, so use the other one
        let arrow = direction === -1 ? 'up' : 'down';
        if (direction === -1 && other === 0) arrow = 'down';
        if (direction === 1 && other === list.length - 1) arrow = 'up';
        focusNext.current = section + '-' + list[other].id + '-' + arrow;
    }

    // The Skills lines (each has a label like "Languages" and a list of skills)
    function changeSkill(id, key, value) {
        update({ ...resume, skills: resume.skills.map((row) => (row.id === id ? { ...row, [key]: value } : row)) });
    }

    function addSkill() {
        const newId = nextId(resume.skills);
        update({ ...resume, skills: [...resume.skills, { id: newId, label: '', items: '' }] });
        // The focus goes into the new line's first box, like addEntry
        focusNext.current = 'skill-' + newId + '-label';
    }

    function removeSkill(row) {
        update({ ...resume, skills: resume.skills.filter((item) => item.id !== row.id) });
        setMessage('Removed ' + (row.label.trim() || 'a skills line') + '.');
        // Like removeEntry: the focus goes to "+ Add skills line"
        focusNext.current = 'resume-skills-add';
    }

    // "Start from scratch": an empty resume (after checking, since it can't be undone)
    function startOver() {
        if (!window.confirm('Clear everything and start from scratch?')) return;
        update(blankResume);
        setMessage('Cleared. Start typing on the left.');
    }

    // "Download PDF": the browser's print window, where you pick "Save as PDF".
    // The page's name becomes the file's name ("Jamie Rivera - Resume.pdf"),
    // then goes back to normal after the window closes.
    // "afterprint" is the browser saying the print window closed. On computers,
    // window.print() waits for that anyway, but on phones it comes back right
    // away, before the PDF is made, so putting the name back on the next line
    // would name the file "Resume builder | ScoutSearch". { once: true } stops
    // listening after the first time
    function download() {
        const oldTitle = document.title;
        document.title = (resume.contact.name.trim() || 'My') + ' - Resume';
        window.addEventListener('afterprint', () => { document.title = oldTitle; }, { once: true });
        window.print();
    }

    return (
        <>
            {/* <title> is the name shown on the browser tab (WCAG) */}
            <title>Resume builder | ScoutSearch</title>
            <NavBar />

            <main className="resume-page">
                <header className="resume-head">
                    <div>
                        {/* The page's one <h1> (WCAG) */}
                        <h1 className="resume-head-title">
                            Resume builder
                            {showingExample && <span className="resume-example-tag">Example</span>}
                        </h1>
                        <p className="resume-head-text">
                            Fill in the form and your resume updates as you type. It saves in this browser.
                            When it's ready, download it as a PDF.
                        </p>
                        {/* Only has words when saving failed (see "saveFailed" above).
                            role="alert" makes screen readers read it right away, since
                            your changes would be lost on refresh (WCAG) */}
                        <p className="resume-save-warning" role="alert">
                            {saveFailed
                                ? "This browser isn't saving your resume (its storage is full or turned off). Download a PDF before you leave, so you don't lose your changes."
                                : ''}
                        </p>
                    </div>
                    <div className="resume-head-actions">
                        {/* role="status" makes screen readers read the message when it changes (WCAG) */}
                        <p className="resume-status" role="status">{message}</p>
                        <button type="button" className="resume-button" onClick={startOver}>
                            Start from scratch
                        </button>
                        <button type="button" className="resume-button resume-button-main" onClick={download}>
                            Download PDF
                        </button>
                    </div>
                </header>

                {/* Phones only: switch between the form and the preview.
                    aria-pressed says which one is showing (WCAG) */}
                <div className="resume-switch" role="group" aria-label="Show">
                    <button type="button" className="resume-switch-button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>
                        Edit
                    </button>
                    <button type="button" className="resume-switch-button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
                        Preview
                    </button>
                </div>

                {/* data-view tells index.css which side to show on phones */}
                <div className="resume-layout" data-view={view}>
                    {/* The form. Pressing Enter in a box shouldn't do anything, so
                        it's not a <form> that would try to send itself */}
                    <div className="resume-form">
                        <section className="resume-section" aria-labelledby="resume-contact-title">
                            <h2 id="resume-contact-title" className="resume-section-title">Contact</h2>
                            <div className="resume-fields resume-entry">
                                {contactFields.map((field) => (
                                    <Field
                                        key={field.key}
                                        id={'contact-' + field.key}
                                        label={field.label}
                                        type={field.type}
                                        autoComplete={field.autoComplete}
                                        wide={field.wide}
                                        value={resume.contact[field.key]}
                                        onChange={(value) => changeContact(field.key, value)}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* Education, Projects, Experience: the same piece for each */}
                        {sections.map((section) => (
                            <section key={section.key} className="resume-section" aria-labelledby={'resume-' + section.key + '-title'}>
                                <h2 id={'resume-' + section.key + '-title'} className="resume-section-title">{section.title}</h2>
                                {resume[section.key].map((entry, index) => (
                                    <EntryEditor
                                        key={entry.id}
                                        section={section}
                                        entry={entry}
                                        index={index}
                                        count={resume[section.key].length}
                                        onChange={(key, value) => changeEntry(section.key, entry.id, key, value)}
                                        onMove={(direction) => moveEntry(section.key, index, direction)}
                                        onRemove={() => removeEntry(section, entry)}
                                    />
                                ))}
                                <button type="button" id={'resume-' + section.key + '-add'} className="resume-add-button" onClick={() => addEntry(section)}>
                                    + Add {section.singular.toLowerCase()}
                                </button>
                            </section>
                        ))}

                        <section className="resume-section" aria-labelledby="resume-skills-title">
                            <h2 id="resume-skills-title" className="resume-section-title">Skills</h2>
                            {resume.skills.map((row, index) => (
                                <div key={row.id} className="resume-entry">
                                    <div className="resume-entry-head">
                                        <h3 className="resume-entry-title">Skills line {index + 1}</h3>
                                        <button type="button" className="resume-icon-button" aria-label={'Remove ' + (row.label.trim() || 'skills line ' + (index + 1))} onClick={() => removeSkill(row)}>
                                            <TrashIcon />
                                        </button>
                                    </div>
                                    <div className="resume-fields">
                                        <Field id={'skill-' + row.id + '-label'} label="Kind (like Languages)" value={row.label} onChange={(value) => changeSkill(row.id, 'label', value)} />
                                        <Field id={'skill-' + row.id + '-items'} label="Skills, with commas" value={row.items} onChange={(value) => changeSkill(row.id, 'items', value)} />
                                    </div>
                                </div>
                            ))}
                            <button type="button" id="resume-skills-add" className="resume-add-button" onClick={addSkill}>
                                + Add skills line
                            </button>
                        </section>
                    </div>

                    {/* The preview, and the note about the template under it.
                        The note is on the website only: printing shows nothing
                        but the paper, so it never appears on the resume */}
                    <div className="resume-preview-column">
                        <ResumePaper resume={resume} />
                        {/* Plain <a> links, not <Link>: <Link> is only for pages of
                            our app. One goes to another website (Jake's GitHub), and
                            the other is a text file in frontend/public.
                            {' '} keeps the space before a link (JSX drops it at a line break) */}
                        <p className="resume-credit">
                            ScoutSearch's resume layout is based on{' '}
                            <a href="https://github.com/jakegut/resume">Jake's Resume</a> by Jake Gutierrez,
                            a free template shared under the{' '}
                            <a href="/resume-template-license.txt">MIT License</a>.
                        </p>
                    </div>
                </div>
            </main>
        </>
    );
}

// Lets App.jsx import this page.
export default ResumeBuilder;
