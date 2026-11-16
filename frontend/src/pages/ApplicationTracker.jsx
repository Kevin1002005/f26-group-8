// ApplicationTracker.jsx is the Application tracker page (yoursite.com/applications).
// It's a Trello-style board with 3 columns: Saved, Preparing, and Submitted.
// Drag a card from one column to another to move it along. Every card also
// has a small "Move to" menu, which does the same thing for people using a
// keyboard or a phone (dragging only works with a mouse).
//
// The board starts empty. A job shows up in "Saved" when you press Save on
// it on the Discovery page. Which jobs are on the board, and in which column,
// is saved with your account by src/data/tracker.js, so it's the same on any
// device. (It's kept in this browser too, so the board still works, and
// remembers your moves, when the server can't be reached.)
// The styles for this page are in index.css, under "Application tracker page".
//
// How the page is put together, top to bottom:
//   1. TrackerHeader    Back link, title, sentence, and the "active" box
//   2. AddJob           "Add a job from another site" and its small form
//   3. The Undo bar     after Remove (only then)
//   4. Three columns    one StageColumn per stage, each holding TrackerCards
//                       (each card has a Notes box and a Remove button)

// useState lets the page remember a value and redraw itself when it changes.
// useEffect runs code after the page is drawn (here: putting the focus back).
// useRef remembers something without redrawing (here: which menu to focus).
import { useEffect, useRef, useState } from "react";
// Link goes to another page of the site without reloading everything.
import { Link } from "react-router";
// NavBar is the bar across the top of the page (components/NavBar.jsx).
import NavBar from "../components/NavBar.jsx";
// isPastDeadline says if a job's deadline has gone by
import { isDueWithin, isPastDeadline } from "../data/opportunities.js";
// The board's list (shared with Discovery's Save button), from tracker.js:
//   useTrackerItems   the list, redrawing the page whenever it changes
//                     (a move here, a Save in another tab, your account's list arriving)
//   useTrackerSync    syncs with your account when the page opens, and says how it's going
//   moveOnTracker     moves a job to another column (and saves that to your account)
//   saveTrackerNotes / saveTrackerDetails   save a card's notes, or its link, status, and date applied
//   removeFromTracker / putBackOnTracker   Remove, and its Undo
//   addOtherJob       adds a job typed in from another site
//   trackerJob        finds the job behind each saved item (a real job or an example)
import {
  addOtherJob,
  moveOnTracker,
  putBackOnTracker,
  removeFromTracker,
  saveTrackerDetails,
  saveTrackerNotes,
  trackerJob,
  useTrackerItems,
  useTrackerSync,
} from "../data/tracker.js";

// ---------- Icons ----------
// Small drawings made with SVG. aria-hidden="true" hides them from screen
// readers, because the words next to them already say the same thing (WCAG).

// The arrow pointing left, in "Back to opportunities"
function BackArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

// A bookmark (Saved column)
function BookmarkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

// A briefcase (Preparing column)
function BriefcaseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </svg>
  );
}

// A paper plane (Submitted column)
function SendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
    </svg>
  );
}

// Six dots, the little "you can drag this" handle on each card
function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

// The 3 columns, in order. Each one has:
//   id     the name used in each application's "stage"
//   name   the title on screen
//   hint   the small line under the title
//   empty  what the column says when it has no cards
//   Icon   the drawing in the empty column. (A component can be stored in a
//          list like any other value, then drawn with <stage.Icon />.)
const stages = [
  { id: "saved", name: "Saved", hint: "Interesting roles to revisit", empty: "No saved roles yet. Press Save on a job in Opportunities to add it here.", Icon: BookmarkIcon },
  {
    id: "preparing",
    name: "Preparing",
    hint: "Applications you're working on",
    empty: "Roles you're applying to will appear here",
    Icon: BriefcaseIcon,
  },
  {
    id: "submitted",
    name: "Submitted",
    hint: "Applications sent out",
    empty: "Submitted applications will appear here",
    Icon: SendIcon,
  },
];

// ---------- Helpers ----------

// Turns "2026-11-20" into "Nov 20".
// The "T00:00" means midnight, so the date doesn't slip back a day in some time zones.
function formatDate(date) {
  return new Date(date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Builds the board from the tracker's list. trackerJob (tracker.js) finds each
// item's job: a real job's title, company, and deadline were saved with it,
// and an example job is looked up in the opportunities list.
function toApplications(items) {
  return (
    items
      // For each saved item, find its job and add the column, notes, and details to it.
      // { ...job, stage: item.stage } copies the job and adds its column.
      .map((item) => {
        const job = trackerJob(item);
        if (!job) return null;
        return {
          ...job,
          stage: item.stage,
          notes: item.notes ?? "",
          link: item.link ?? null,
          statusDetail: item.statusDetail ?? "",
          appliedOn: item.appliedOn ?? null,
        };
      })
      // Drop any saved id that no longer matches a job (null from above)
      .filter((app) => app !== null)
  );
}

// ---------- Pieces of the page ----------

// The top of the page: Back link, title, sentence, and the "active" box.
// props.total is how many applications are on the board.
// props.submitted is how many are in the Submitted column.
// props.syncMessage says whether the board is saved to your account.
function TrackerHeader(props) {
  return (
    <header className="tracker-header">
      {/* Back to the Discovery page */}
      <Link to="/discovery" className="tracker-back-link">
        <BackArrowIcon />
        Back to opportunities
      </Link>

      <div className="tracker-heading">
        <h1 className="tracker-title">Application tracker</h1>
        <p className="tracker-subtitle">Keep the opportunities you care about moving forward.</p>
        {/* Whether your board is saved to your account (see syncMessage below).
            role="status" makes screen readers read it when it changes (WCAG).
            It only changes when that really changes, not on every move, so it
            doesn't talk over the "Moved ... to ..." announcement */}
        <p className="tracker-sync" role="status">
          {props.syncMessage}
        </p>
      </div>

      {/* The "active" box on the right */}
      <section className="tracker-progress" aria-label="Your progress">
        <p className="tracker-progress-count">
          <span className="tracker-progress-number">{props.total}</span> active
        </p>
        {/* <progress> is the browser's own progress bar. It fills up as more
            applications are submitted. aria-label says what it measures (WCAG). */}
        <progress
          className="tracker-progress-bar"
          value={props.submitted}
          max={props.total || 1}
          aria-label="Applications submitted"
        />
        <p className="tracker-progress-text">
          {props.total === 0
            ? "Add an opportunity to get started"
            : props.submitted + " of " + props.total + " submitted"}
        </p>
      </section>
    </header>
  );
}

// Saves a card's notes that are still waiting for their "in a moment" timer,
// right now. box is { timer, text } (text is null when nothing is waiting).
// saveTrackerNotes puts the change in this device's outbox at once (tracker.js),
// so even if the tab closes a moment later, it's sent the next time you open the site
function saveWaitingNotes(id, box) {
  clearTimeout(box.timer);
  if (box.text !== null) {
    saveTrackerNotes(id, box.text);
    box.text = null;
  }
}

// The fold-open Notes part of a card. A <details> is the browser's own
// open/close box: pressing its <summary> line opens it, and screen readers hear
// whether it's open (WCAG), with no code of ours.
// props.app            the application (its notes are in app.notes)
// props.onTypingChange tells the card when typing starts and stops (see TrackerCard)
function TrackerNotes(props) {
  const app = props.app;
  const boxId = "tracker-notes-" + app.id;
  // What's in the box while you're typing in it ("typing" is true). Otherwise
  // the box shows the saved notes, so notes added on another device show up
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  // The notes waiting to be saved, and their "save it in a moment" timer
  // (useRef: changing them doesn't redraw the page)
  const waiting = useRef({ timer: null, text: null });

  // Leaving the page while notes are still waiting (closing the tab, switching
  // apps on a phone, or going to another page of the site): save them right
  // away, so the last few words typed aren't lost.
  //   "visibilitychange" fires when the tab is hidden (or closing)
  //   "pagehide" fires when the page is being left
  //   the "return" runs when this card leaves the screen (another page of the site)
  // [app.id] at the end: set this up again only if it's a different card
  useEffect(() => {
    const box = waiting.current;
    const id = app.id;
    function handleHide() {
      if (document.visibilityState === "hidden") saveWaitingNotes(id, box);
    }
    function handlePageHide() {
      saveWaitingNotes(id, box);
    }
    document.addEventListener("visibilitychange", handleHide);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleHide);
      window.removeEventListener("pagehide", handlePageHide);
      saveWaitingNotes(id, box);
    };
  }, [app.id]);

  // Notes are sent 1 second after you stop typing, not after every letter
  function handleChange(event) {
    const text = event.target.value;
    setDraft(text);
    const box = waiting.current;
    box.text = text;
    clearTimeout(box.timer);
    box.timer = setTimeout(() => saveWaitingNotes(app.id, box), 1000);
  }
  // Clicking or tabbing into the box: start from the saved notes
  function handleFocus() {
    setDraft(app.notes);
    setTyping(true);
    props.onTypingChange(true);
  }
  // Leaving the box: save right away
  function handleBlur() {
    saveWaitingNotes(app.id, waiting.current);
    setTyping(false);
    props.onTypingChange(false);
  }

  return (
    <details className="tracker-notes">
      {/* The line you press. It says "Notes" when there are some */}
      <summary className="tracker-notes-summary">{app.notes ? "Notes" : "Add notes"}</summary>
      {/* The label is for screen readers (the summary already shows "Notes"),
          and says which card's notes these are (WCAG) */}
      <label htmlFor={boxId} className="sr-only">
        {"Notes for " + app.title}
      </label>
      <textarea
        id={boxId}
        className="tracker-notes-box"
        // the most the account keeps (backend/sql/applications.sql)
        maxLength={5000}
        value={typing ? draft : app.notes}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </details>
  );
}

// True for a web address that starts with http:// or https:// (the same rule as the
// backend's), so only real web links become clickable
function isWebLink(text) {
  return /^https?:\/\/\S+$/i.test(text ?? "");
}

// The fold-open Details part of a card: the posting's link, a short status
// ("Interview Dec 3"), and the date applied. Saved with the "Save details" button.
// props.app            the application (app.link, app.statusDetail, app.appliedOn)
// props.onTypingChange tells the card when typing starts and stops (see TrackerCard)
function TrackerDetails(props) {
  const app = props.app;
  const idStart = "tracker-details-" + app.id;
  // What's typed in each box (filled in from the saved details when it opens)
  const [link, setLink] = useState("");
  const [statusDetail, setStatusDetail] = useState("");
  const [appliedOn, setAppliedOn] = useState("");
  // The message under the link box when it isn't a web address ("" when it's fine)
  const [linkError, setLinkError] = useState("");
  // "Saved." after pressing Save (screen readers hear it too)
  const [saved, setSaved] = useState("");
  const hasDetails = Boolean(app.link || app.statusDetail || app.appliedOn);

  // Opening it: start from what's saved now (it may have changed on another device)
  function handleToggle(event) {
    if (!event.currentTarget.open) return;
    setLink(app.link ?? "");
    setStatusDetail(app.statusDetail ?? "");
    setAppliedOn(app.appliedOn ?? "");
    setLinkError("");
    setSaved("");
  }

  // "Save details". event.preventDefault() stops the browser from reloading the page
  function handleSubmit(event) {
    event.preventDefault();
    const cleanLink = link.trim();
    if (cleanLink && !isWebLink(cleanLink)) {
      // Say what's wrong next to the box, and put the focus there (WCAG)
      setLinkError("The link has to start with http:// or https://");
      document.getElementById(idStart + "-link")?.focus();
      return;
    }
    saveTrackerDetails(app.id, { link: cleanLink, statusDetail: statusDetail.trim(), appliedOn: appliedOn });
    setLinkError("");
    setSaved("Saved.");
  }

  return (
    <details className="tracker-details" onToggle={handleToggle}>
      <summary className="tracker-notes-summary">{hasDetails ? "Details" : "Add details"}</summary>
      {/* onFocus/onBlur here hear every box inside, so the card can't be dragged
          while typing (selecting words with the mouse would pick the card up) */}
      <form
        className="tracker-details-form"
        onSubmit={handleSubmit}
        onFocus={() => props.onTypingChange(true)}
        onBlur={() => props.onTypingChange(false)}
        noValidate
      >
        <div className="tracker-add-field">
          <label htmlFor={idStart + "-status"} className="tracker-add-label">Status</label>
          <p id={idStart + "-status-hint"} className="tracker-details-hint">Like "Interview Dec 3" or "Waiting to hear back"</p>
          <input
            id={idStart + "-status"}
            className="tracker-add-input"
            type="text"
            maxLength={200}
            value={statusDetail}
            onChange={(event) => setStatusDetail(event.target.value)}
            aria-describedby={idStart + "-status-hint"}
          />
        </div>
        <div className="tracker-add-field">
          <label htmlFor={idStart + "-link"} className="tracker-add-label">Link to the posting</label>
          {/* aria-invalid and aria-describedby point screen readers at the message (WCAG) */}
          <input
            id={idStart + "-link"}
            className="tracker-add-input"
            type="url"
            maxLength={500}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            aria-invalid={linkError ? "true" : "false"}
            aria-describedby={linkError ? idStart + "-link-error" : undefined}
          />
          {linkError && <p id={idStart + "-link-error"} className="tracker-add-error">{linkError}</p>}
        </div>
        <div className="tracker-add-field">
          <label htmlFor={idStart + "-applied"} className="tracker-add-label">Date applied</label>
          <input
            id={idStart + "-applied"}
            className="tracker-add-input"
            type="date"
            value={appliedOn}
            onChange={(event) => setAppliedOn(event.target.value)}
          />
        </div>
        <div className="tracker-details-actions">
          <button type="submit" className="tracker-add-submit">Save details</button>
          {/* role="status" reads "Saved." out when it appears (WCAG) */}
          <p className="tracker-details-saved" role="status">{saved}</p>
        </div>
      </form>
    </details>
  );
}

// One card on the board.
// props.app       the application ({ id, title, ... })
// props.dragging  true while this card is being dragged (it fades a little)
// props.onDragStart / props.onDragEnd   tell the board a drag started or ended
// props.onMove    moves this card to another column (used by the "Move to" menu)
// props.onRemove  takes this card off the tracker (the page shows Undo)
function TrackerCard(props) {
  const app = props.app;
  // A unique id, so the "Move to" menu's label can point at it
  const selectId = "tracker-move-" + app.id;
  // true while typing in this card's notes or details. The card can't be dragged then:
  // otherwise selecting words in the box with the mouse would pick the whole card up
  const [typingNotes, setTypingNotes] = useState(false);
  // "Due soon": the deadline is in the next 7 days, and it hasn't been sent yet
  const dueSoon = app.stage !== "submitted" && isDueWithin(app.deadline, 7);

  // The small line at the bottom of the card changes with the column,
  // and says "Closed" once the deadline has gone by (if you never sent it).
  // Many real jobs don't list a deadline at all
  let note = "No deadline listed";
  if (app.stage === "submitted") {
    note = app.appliedOn ? "Applied " + formatDate(app.appliedOn) : "Application sent";
  } else if (isPastDeadline(app.deadline)) {
    note = "Closed " + formatDate(app.deadline);
  } else if (app.deadline) {
    note = "Apply by " + formatDate(app.deadline);
  }

  return (
    <li
      className={props.dragging ? "tracker-card tracker-card-dragging" : "tracker-card"}
      // draggable lets the mouse pick the card up and drag it
      draggable={typingNotes ? "false" : "true"}
      onDragStart={(event) => props.onDragStart(event, app.id)}
      onDragEnd={props.onDragEnd}
    >
      <div className="tracker-card-top">
        {/* The company's initials (decoration: the name is in the words) */}
        <span className="tracker-logo" aria-hidden="true">
          {app.initials}
        </span>
        <div className="tracker-card-words">
          <h3 className="tracker-card-title">{app.title}</h3>
          <p className="tracker-card-org">{app.organization}</p>
          {/* Where things stand, if you wrote it in Details */}
          {app.statusDetail && <p className="tracker-card-status">{app.statusDetail}</p>}
          {/* The posting itself, in a new tab. rel="noopener noreferrer" stops that site
              from controlling or seeing this tab; the hidden words say which job, and
              that a new tab opens (WCAG) */}
          {isWebLink(app.link) && (
            <a className="tracker-posting-link" href={app.link} target="_blank" rel="noopener noreferrer">
              Open posting<span className="sr-only">{" for " + app.title + " (opens in a new tab)"}</span>
            </a>
          )}
          {/* Only when it's due in the next 7 days ("&&": draw it only if true) */}
          {dueSoon && <p className="tracker-due-tag">Due soon</p>}
        </div>
        {/* The six dots that show the card can be dragged */}
        <span className="tracker-grip">
          <GripIcon />
        </span>
      </div>

      <div className="tracker-card-bottom">
        <p className="tracker-card-note">{note}</p>

        {/* "Move to": does the same as dragging, for keyboards and phones (WCAG).
            The label is hidden on screen but read by screen readers, and says
            which card it moves. */}
        <label htmlFor={selectId} className="sr-only">
          {"Move " + app.title + " to"}
        </label>
        <select
          id={selectId}
          className="tracker-move"
          value={app.stage}
          // true at the end means "moved with this menu" (see moveApplication)
          onChange={(event) => props.onMove(app.id, event.target.value, true)}
        >
          {/* One choice per column, in order */}
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>

      {/* Details and Notes on the left, Remove on the right */}
      <div className="tracker-card-extras">
        <TrackerDetails app={app} onTypingChange={setTypingNotes} />
        <TrackerNotes app={app} onTypingChange={setTypingNotes} />
        {/* aria-label starts with the word you see, and says which job (WCAG) */}
        <button
          type="button"
          className="tracker-remove"
          aria-label={"Remove " + app.title}
          onClick={() => props.onRemove(app)}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

// "Add a job from another site": a button that opens a small form, for jobs
// found anywhere (not only on Opportunities).
// props.onAdd gets { title, organization, deadline, stage, link, statusDetail } when the form is sent
function AddJob(props) {
  // true while the form is open
  const [open, setOpen] = useState(false);
  // What's typed in each box
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [deadline, setDeadline] = useState("");
  const [stage, setStage] = useState("saved");
  const [link, setLink] = useState("");
  const [statusDetail, setStatusDetail] = useState("");
  // The messages under the title and link boxes when something's wrong ("" when fine)
  const [titleError, setTitleError] = useState("");
  const [linkError, setLinkError] = useState("");
  // The title box, to put the keyboard focus in it (useRef: a handle on it)
  const titleRef = useRef(null);
  // The button that opens the form, to put the focus back on it after Cancel
  const toggleRef = useRef(null);

  // When the form opens, the focus goes into its first box, ready to type
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  // Closes the form and empties it
  function close() {
    setOpen(false);
    setTitle("");
    setOrganization("");
    setDeadline("");
    setStage("saved");
    setLink("");
    setStatusDetail("");
    setTitleError("");
    setLinkError("");
  }

  // "Add to tracker". event.preventDefault() stops the browser from reloading the page
  function handleSubmit(event) {
    event.preventDefault();
    // Say what's wrong next to each box, and put the focus on the first one (WCAG)
    const cleanLink = link.trim();
    const missingTitle = title.trim() === "";
    const badLink = cleanLink !== "" && !isWebLink(cleanLink);
    setTitleError(missingTitle ? "Add the job's title." : "");
    setLinkError(badLink ? "The link has to start with http:// or https://" : "");
    if (missingTitle) {
      titleRef.current?.focus();
      return;
    }
    if (badLink) {
      document.getElementById("tracker-add-link")?.focus();
      return;
    }
    props.onAdd({
      title: title.trim(),
      organization: organization.trim(),
      deadline: deadline,
      stage: stage,
      link: cleanLink,
      statusDetail: statusDetail.trim(),
    });
    close();
  }

  return (
    <div className="tracker-add">
      {/* aria-expanded tells screen readers whether the form is open (WCAG) */}
      <button
        type="button"
        ref={toggleRef}
        className="tracker-add-toggle"
        aria-expanded={open}
        aria-controls="tracker-add-form"
        onClick={() => (open ? close() : setOpen(true))}
      >
        + Add a job from another site
      </button>

      {open && (
        // noValidate: our own message shows instead of the browser's bubble
        <form id="tracker-add-form" className="tracker-add-form" onSubmit={handleSubmit} noValidate>
          <div className="tracker-add-fields">
            <div className="tracker-add-field tracker-add-field-title">
              <label htmlFor="tracker-add-title" className="tracker-add-label">
                Job title
              </label>
              {/* aria-invalid and aria-describedby point screen readers at the
                  message below when the box is empty (WCAG) */}
              <input
                id="tracker-add-title"
                ref={titleRef}
                className="tracker-add-input"
                type="text"
                maxLength={300}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-invalid={titleError ? "true" : "false"}
                aria-describedby={titleError ? "tracker-add-title-error" : undefined}
              />
              {titleError && (
                <p id="tracker-add-title-error" className="tracker-add-error">
                  {titleError}
                </p>
              )}
            </div>
            <div className="tracker-add-field">
              <label htmlFor="tracker-add-org" className="tracker-add-label">
                Company
              </label>
              <input
                id="tracker-add-org"
                className="tracker-add-input"
                type="text"
                maxLength={300}
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
              />
            </div>
            <div className="tracker-add-field">
              <label htmlFor="tracker-add-deadline" className="tracker-add-label">
                Deadline
              </label>
              {/* type="date" gives the browser's own date picker, and always
                  hands back "2026-12-01" (or "" when left empty) */}
              <input
                id="tracker-add-deadline"
                className="tracker-add-input"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </div>
            <div className="tracker-add-field">
              <label htmlFor="tracker-add-stage" className="tracker-add-label">
                Column
              </label>
              <select
                id="tracker-add-stage"
                className="tracker-add-input"
                value={stage}
                onChange={(event) => setStage(event.target.value)}
              >
                {stages.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Optional: the posting's web address, and where things stand */}
            <div className="tracker-add-field">
              <label htmlFor="tracker-add-link" className="tracker-add-label">
                Link to the posting
              </label>
              <input
                id="tracker-add-link"
                className="tracker-add-input"
                type="url"
                maxLength={500}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                aria-invalid={linkError ? "true" : "false"}
                aria-describedby={linkError ? "tracker-add-link-error" : undefined}
              />
              {linkError && (
                <p id="tracker-add-link-error" className="tracker-add-error">
                  {linkError}
                </p>
              )}
            </div>
            <div className="tracker-add-field">
              <label htmlFor="tracker-add-status" className="tracker-add-label">
                Status
              </label>
              <input
                id="tracker-add-status"
                className="tracker-add-input"
                type="text"
                maxLength={200}
                value={statusDetail}
                onChange={(event) => setStatusDetail(event.target.value)}
              />
            </div>
          </div>
          <div className="tracker-add-actions">
            <button type="submit" className="tracker-add-submit">
              Add to tracker
            </button>
            <button
              type="button"
              className="tracker-add-cancel"
              onClick={() => {
                close();
                // the form is gone, so the focus goes back to its button (WCAG)
                toggleRef.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// One column of the board.
// props.stage     one { } from the stages list (name, hint, ...)
// props.apps      the applications in this column
// props.isOver    true while a card is being dragged over this column
// The rest are passed through to each card, or handle dropping.
function StageColumn(props) {
  const stage = props.stage;
  // A unique id, so the column can be named by its title (WCAG)
  const titleId = "tracker-stage-" + stage.id;

  return (
    <section
      className={props.isOver ? "tracker-column tracker-column-over" : "tracker-column"}
      aria-labelledby={titleId}
      // While a card is dragged over this column. preventDefault() is what
      // tells the browser "you're allowed to drop here".
      onDragOver={(event) => {
        event.preventDefault();
        props.onDragOver(stage.id);
      }}
      // When the dragged card leaves the column. relatedTarget is where the
      // mouse went; if that's still inside this column (like onto a card),
      // it hasn't really left, so nothing changes.
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          props.onDragLeave();
        }
      }}
      // When the card is let go over this column
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop(stage.id);
      }}
    >
      {/* The top of the column: dot, title, count, and the small line */}
      <div className="tracker-column-top">
        <h2 id={titleId} className="tracker-column-title">
          {/* The colored dot (decoration: the title says the same thing) */}
          <span className={"tracker-dot tracker-dot-" + stage.id} aria-hidden="true" />
          {stage.name}
        </h2>
        {/* The number, then the word for screen readers only (hidden on
            screen), so they hear "2 applications", not just "2" (WCAG).
            (An aria-label on a plain <span> is skipped by many screen readers) */}
        <span className="tracker-count">
          {props.apps.length}
          <span className="sr-only">{props.apps.length === 1 ? " application" : " applications"}</span>
        </span>
      </div>
      <p className="tracker-column-hint">{stage.hint}</p>

      {/* The cards, or the empty message if there are none.
          "? :" picks one of the two. */}
      {props.apps.length === 0 ? (
        <div className="tracker-empty">
          <stage.Icon />
          <p>{stage.empty}</p>
        </div>
      ) : (
        <ul className="tracker-cards">
          {props.apps.map((app) => (
            <TrackerCard
              key={app.id}
              app={app}
              dragging={props.draggingId === app.id}
              onDragStart={props.onDragStart}
              onDragEnd={props.onDragEnd}
              onMove={props.onMove}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ApplicationTracker is the whole page. It remembers where every card is,
// and handles dragging and dropping.
function ApplicationTracker() {
  // The tracker's list, and how syncing with your account is going
  // ({ state, problem }, see tracker.js). The page redraws when either changes
  const items = useTrackerItems();
  const sync = useTrackerSync();
  // Every application and its column, made from the list
  const applications = toApplications(items);
  // The id of the card being dragged right now (null when nothing is)
  const [draggingId, setDraggingId] = useState(null);
  // The column a card is being dragged over right now (null when none)
  const [overStage, setOverStage] = useState(null);
  // The sentence screen readers hear after a card moves
  const [announcement, setAnnouncement] = useState("");

  // The id of the "Move to" menu to put the keyboard focus back on, after a
  // move (see moveApplication). null when there's nothing to do
  const focusAfterMove = useRef(null);
  // A moved card is drawn again in its new column, and the menu you were using
  // goes with the old one, so the focus would drop to the top of the page.
  // After the list changes, put it back on the moved card's menu (it has the
  // same id). [items] at the end means "only run this when the list changes"
  useEffect(() => {
    if (focusAfterMove.current) {
      document.getElementById(focusAfterMove.current)?.focus();
      focusAfterMove.current = null;
    }
  }, [items]);

  // Moves one card to another column.
  // fromMenu is true when the card's "Move to" menu did it (not dragging)
  function moveApplication(id, newStage, fromMenu) {
    // Find the card, so we can say its name in the announcement
    const app = applications.find((item) => item.id === id);
    // Nothing to do if it's already in that column
    if (!app || app.stage === newStage) {
      return;
    }
    // Moves it on this device right away, and saves the move to your account
    moveOnTracker(id, newStage);
    // Keyboard and screen reader users stay on the card they moved
    if (fromMenu) {
      focusAfterMove.current = "tracker-move-" + id;
    }
    // Find the column's name ("Submitted") for the announcement
    const stage = stages.find((item) => item.id === newStage);
    setAnnouncement("Moved " + app.title + " to " + stage.name + ".");
  }

  // The job Remove just took off, kept so Undo can put it back exactly as it
  // was (its column and notes). null when there's nothing to undo
  const [removed, setRemoved] = useState(null);

  // Remove on a card: it comes off right away, and the Undo bar shows up.
  // (No "Are you sure?" pop-up: Undo is easier to get out of, and less in the way)
  function removeApplication(app) {
    const item = items.find((each) => each.id === app.id);
    if (!item) return;
    removeFromTracker(app.id);
    setRemoved({ item: item, title: app.title });
    setAnnouncement("Removed " + app.title + ".");
    // Its Remove button is gone, so the focus goes to Undo, ready to press (WCAG)
    focusAfterMove.current = "tracker-undo-button";
  }

  // Undo: the job goes back in its column, and the focus goes back on its card
  function undoRemove() {
    putBackOnTracker(removed.item);
    const stage = stages.find((each) => each.id === removed.item.stage);
    setAnnouncement("Put " + removed.title + " back in " + stage.name + ".");
    focusAfterMove.current = "tracker-move-" + removed.item.id;
    setRemoved(null);
  }

  // "Add a job from another site" was sent: put it on the board, and the
  // focus on its card (the form closes)
  function addJob(job) {
    const id = addOtherJob(job);
    const stage = stages.find((each) => each.id === job.stage);
    setAnnouncement("Added " + job.title + " to " + stage.name + ".");
    focusAfterMove.current = "tracker-move-" + id;
  }

  // A card was picked up: remember which one
  function handleDragStart(event, id) {
    // "move" shows the move cursor instead of a copy cursor
    event.dataTransfer.effectAllowed = "move";
    // Some browsers (Firefox) only start a drag if some data is attached
    event.dataTransfer.setData("text/plain", String(id));
    setDraggingId(id);
  }

  // The card was let go, anywhere: clear everything
  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }

  // The card was dropped on a column: move it there
  function handleDrop(stageId) {
    if (draggingId !== null) {
      moveApplication(draggingId, stageId);
    }
    setDraggingId(null);
    setOverStage(null);
  }

  // Numbers for the "active" box
  const submittedCount = applications.filter((app) => app.stage === "submitted").length;

  // The line under the title: is the board saved to your account?
  //   a refused change   say what went wrong
  //   "saved"            your account has everything
  //   "offline"          changes are waiting on this device
  //   "waiting"          nothing known yet (the first moment): say nothing
  let syncMessage = "";
  if (sync.problem) {
    syncMessage = sync.problem;
  } else if (sync.state === "saved") {
    syncMessage = "Saved to your account.";
  } else if (sync.state === "offline") {
    syncMessage = "Not saved to your account yet: the server can't be reached. Your board is kept on this device and will be sent when the server is back.";
  }

  return (
    <>
      <title>Application tracker | ScoutSearch</title>
      <NavBar />
      <main className="tracker-page">
        <TrackerHeader total={applications.length} submitted={submittedCount} syncMessage={syncMessage} />

        {/* "Add a job from another site" and its form */}
        <AddJob onAdd={addJob} />

        {/* After Remove: what was removed, and Undo. It stays until the next
            Remove or Undo (no timer, so nobody has to rush, WCAG). Screen
            readers hear "Removed ..." from the message at the bottom, and the
            focus lands on Undo */}
        {removed && (
          <div className="tracker-undo">
            <p>{"Removed " + removed.title + "."}</p>
            <button id="tracker-undo-button" type="button" className="tracker-undo-button" onClick={undoRemove}>
              Undo
            </button>
          </div>
        )}

        {/* The board: one column per stage, in order */}
        <div className="tracker-board">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              // Only the applications whose stage is this column
              apps={applications.filter((app) => app.stage === stage.id)}
              isOver={overStage === stage.id}
              draggingId={draggingId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={setOverStage}
              onDragLeave={() => setOverStage(null)}
              onDrop={handleDrop}
              onMove={moveApplication}
              onRemove={removeApplication}
            />
          ))}
        </div>

        {/* Hidden on screen, but screen readers read it out whenever a card
            moves, so they know it worked (WCAG) */}
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </main>
    </>
  );
}

// "export default" lets App.jsx import this page.
export default ApplicationTracker;
