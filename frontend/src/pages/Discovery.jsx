// Discovery.jsx is the Discovery page (yoursite.com/discovery).
// It shows internships, co-ops, and part-time and full-time jobs matched to your profile.
// Everything on it is made-up sample data for now, because the site
// isn't connected to the backend yet.
// The styles for this page are in index.css, under "Discovery page".
//
// Since the 2026-11 revamp it's laid out like a dashboard, one column:
//   1. DiscoveryHeader   the title, one sentence, the "Examples" tag, and the search bar
//   2. SummaryBoxes      three number boxes: open to you, due soon, on your tracker
//   3. TypeTabs + Sort   tabs (All, Internship, Co-op, ...) with counts, and the Sort menu
//   4. ResultsSection    the table: one row per opportunity (OpportunityRow)
//   5. ProfileTip        a one-line tip under the table
//
// The search bar and the tabs both really work: the Discovery function at
// the bottom remembers what you typed and which tab is picked (with
// useState), and only shows the opportunities that match both.

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen (here: each row's pop-up,
// so its buttons can open it).
// useEffect runs code after the page is drawn (here: opening a pop-up).
import { useEffect, useRef, useState } from "react";
// Link goes to another page of the site without reloading everything.
// useSearchParams reads the extra info at the end of the address, like the
// "?job=1" in "/discovery?job=1" (the Feed page links here that way).
import { Link, useSearchParams } from "react-router";
// NavBar is the bar across the top of the page. It lives in its own file
// (components/NavBar.jsx) because every page uses it.
import NavBar from "../components/NavBar.jsx";

// ---------- Sample data ----------
// The job listings live in their own file, because the Application tracker
// page uses them too. See src/data/opportunities.js.
// isPastDeadline says if a job's deadline has gone by (it then says "Closed")
import { isPastDeadline, opportunities } from "../data/opportunities.js";
// The helpers that add a job to (or take it off) the Application tracker.
// See src/data/tracker.js.
import { addToTracker, isOnTracker, loadTracker, removeFromTracker } from "../data/tracker.js";

// The tabs across the page. "All" shows everything; the rest match the
// "type" of each opportunity above.
const tabs = ["All", "Internship", "Co-op", "Part-time", "Full-time"];

// ---------- Helpers ----------

// Turns a date like "2027-06-28" into words, like "Jun 28".
// "options" says which parts to show, for example { month: "short" } gives "Jun".
// The "T00:00" means midnight, so the date doesn't slip back a day in some time zones.
function formatDate(date, options) {
  return new Date(date + "T00:00").toLocaleDateString("en-US", options);
}

// Puts opportunities in order of deadline, soonest first.
// [...list] makes a copy first, because .sort() changes the list it's given,
// and we don't want to shuffle the original sample data.
// localeCompare compares two words A to Z; because the dates are written
// year-month-day, A to Z is also earliest to latest.
function sortByDeadline(list) {
  return [...list].sort((a, b) => a.deadline.localeCompare(b.deadline));
}

// Puts opportunities in order of match, highest first.
// b.match - a.match is a positive number when b fits better, which tells
// .sort() to put b first.
function sortByMatch(list) {
  return [...list].sort((a, b) => b.match - a.match);
}

// True if every word typed in the search bar appears somewhere in this
// opportunity's title, company, type, place, or skill tags.
// toLowerCase() makes "REACT", "React", and "react" all count as the same.
function matchesSearch(opportunity, search) {
  // trim() removes spaces at the start and end, so "  react " still works.
  // split(/\s+/) cuts it into separate words at the spaces, so "python cambridge"
  // finds a job with both words in it, in any order, not only that exact phrase
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // An empty search bar matches everything
  if (words.length === 0) {
    return true;
  }
  // All the searchable text joined into one long piece of lowercase text
  const text = [
    opportunity.title,
    opportunity.organization,
    opportunity.type,
    opportunity.place,
    ...opportunity.tags,
  ]
    .join(" ")
    .toLowerCase();
  // every() is true only if EVERY word is somewhere inside that text
  // (includes() checks one word)
  return words.every((word) => text.includes(word));
}

// ---------- Icons ----------
// Small drawings made with SVG. Every one has aria-hidden="true", which hides
// it from screen readers, because the words next to it already say the same
// thing (WCAG).

// The magnifying glass in the search bar.
function SearchIcon() {
  return (
    <svg
      className="discovery-search-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* the glass */}
      <circle cx="11" cy="11" r="7" />
      {/* the handle */}
      <path d="M20 20l-4-4" />
    </svg>
  );
}

// A bookmark, on the Save button. The CSS fills it in once it's saved.
function BookmarkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

// An arrow pointing right, for links and buttons that go somewhere.
function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// ---------- Pieces of the page ----------

// The top of the page: the title, one sentence, the "Examples" tag, and the
// search bar (the 2026-11 revamp: a calm title on the page, like a dashboard,
// instead of the old dark navy box).
// props.search is what's typed in the search bar right now, and
// props.setSearch changes it. Discovery (at the bottom) remembers it, so the
// list can use it to filter.
function DiscoveryHeader(props) {
  // Pressing Enter in a form normally reloads the whole page. This stops
  // that. The list already updates as you type, so Enter doesn't need to do
  // anything else.
  function handleSubmit(event) {
    event.preventDefault();
  }

  return (
    <header className="discovery-head">
      <div className="discovery-head-words">
        {/* The page's one h1 (WCAG) */}
        <h1 className="discovery-head-title">Opportunities</h1>
        <p className="discovery-head-text">
          Internships, co-ops, and jobs matched to your profile.{" "}
          {/* The team's rule: anything made up is clearly labeled as an example */}
          <span className="discovery-examples-tag">Examples</span>
        </p>
      </div>

      {/* role="search" tells screen readers this is the page's search (WCAG) */}
      <form className="discovery-search" role="search" onSubmit={handleSubmit}>
        <SearchIcon />

        {/* A real label for the typing box. sr-only hides it on screen but
            screen readers still read it. A placeholder is not a label (WCAG). */}
        <label htmlFor="discovery-search-input" className="sr-only">
          Search opportunities
        </label>
        {/* value is what's in the box; onChange runs on every key press and
            saves the new text. event.target.value is the text in the box. */}
        <input
          id="discovery-search-input"
          className="discovery-search-input"
          type="search"
          placeholder="Search by role, company, skill, or city"
          value={props.search}
          onChange={(event) => props.setSearch(event.target.value)}
        />
      </form>
    </header>
  );
}

// The three summary boxes under the title: how many opportunities there are,
// how many are due soon, and how many are on your tracker. Like the number
// boxes at the top of a dashboard, so you see the big picture first.
// props.dueSoon is the list of opportunities due in the next 14 days
// (soonest first), and props.trackerCount is how many are on your tracker.
function SummaryBoxes(props) {
  // The first one due, for the note under the number ("First up: ...")
  const first = props.dueSoon[0];

  return (
    // A list, so screen readers say "list, 3 items" (WCAG)
    <ul className="discovery-summary" aria-label="Summary">
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Open to you</span>
        {/* Only the ones you can still apply to (not past their deadline) */}
        <span className="discovery-summary-number">{opportunities.filter((o) => !isPastDeadline(o.deadline)).length}</span>
        <span className="discovery-summary-note">Internships, co-ops, and jobs</span>
      </li>
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Due in the next 2 weeks</span>
        <span className="discovery-summary-number">{props.dueSoon.length}</span>
        <span className="discovery-summary-note">
          {/* "first ? (...) : (...)" means "if there's one due, name it; if not, say so" */}
          {first
            ? "First up: " + first.title + ", " + formatDate(first.deadline, { month: "short", day: "numeric" })
            : "Nothing due soon"}
        </span>
      </li>
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">On your tracker</span>
        <span className="discovery-summary-number">{props.trackerCount}</span>
        {/* A real link, so the whole idea "go see them" is one click away */}
        <Link to="/applications" className="discovery-summary-link">
          Open My applications
          <ArrowIcon />
        </Link>
      </li>
    </ul>
  );
}

// The row of tabs (All, Internship, Co-op, ...), drawn as one gray strip
// with the picked tab as a white pill (the revamp's "segmented" look). Each
// tab shows how many opportunities it has.
// props.picked is the tab that's on right now, and props.setPicked changes it.
// props.counts holds the number for each tab, like counts["Co-op"] = 3.
// (Before the revamp, a blue line slid under the picked tab. The white pill
// shows the same thing without needing to measure the page.)
function TypeTabs(props) {
  return (
    // role="group" + aria-label tells screen readers these buttons belong
    // together and what they're for (WCAG)
    <div className="discovery-tabs" role="group" aria-label="Show opportunity type">
      {/* One button per tab. .map() goes through the tabs list in order. */}
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          // The picked tab also gets "discovery-tab-picked", which makes it the white pill
          className={tab === props.picked ? "discovery-tab discovery-tab-picked" : "discovery-tab"}
          // aria-pressed tells screen readers which tab is on (WCAG)
          aria-pressed={tab === props.picked}
          onClick={() => props.setPicked(tab)}
        >
          {tab}
          {/* The number, a little quieter than the name */}
          <span className="discovery-tab-count">{props.counts[tab]}</span>
        </button>
      ))}
    </div>
  );
}

// An X, for the pop-up's close button.
function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// The pop-up with everything about one opportunity. It opens when you press
// "View opportunity".
//
// It's a <dialog>, the browser's own pop-up. Opened with showModal(), the
// browser does the hard parts for us (WCAG):
//   - the page behind it is dimmed and can't be clicked or tabbed to
//   - the Escape key closes it
//   - when it closes, the keyboard goes back to the button that opened it
//
// What's passed in:
//   opportunity        the opportunity to show
//   ref                a reference to the <dialog>, so the card can open it.
//                      (In React 19, "ref" can be passed in like any other prop.)
//   saved, toggleSave  the same Save on/off as the card's button, and the
//                      function that flips it (and updates the tracker)
//
// { opportunity, ref, saved, toggleSave } below "unpacks" the props: it's a
// shorter way of writing props.opportunity, props.ref, and so on. It's
// needed here because React's rules check that a ref is never read while
// the page is being drawn, and keeping it separate from the other props
// makes that clear.
function OpportunityDialog({ opportunity, ref, saved, toggleSave }) {
  // Whether Apply has been pressed (shows a message, since applying isn't built yet)
  const [applied, setApplied] = useState(false);
  // A unique id for the title, so the dialog can be named by it (WCAG)
  const titleId = "discovery-dialog-title-" + opportunity.id;

  // Clicking the dark area around the pop-up closes it. The <dialog> has no
  // padding of its own, so a click whose target is the <dialog> itself (not
  // something inside it) must be on that dark area.
  // event.target = what was clicked; event.currentTarget = the <dialog>.
  function closeIfOutside(event) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    // aria-labelledby names the pop-up with its title (WCAG)
    <dialog
      ref={ref}
      className="discovery-dialog"
      aria-labelledby={titleId}
      onClick={closeIfOutside}
    >
      {/* The top: the square logo, the title with who and where under it,
          then the kind of job and the match as small tags, and the X */}
      <div className="discovery-dialog-top">
        <span className="discovery-logo" aria-hidden="true">
          {opportunity.initials}
        </span>
        <div className="discovery-dialog-heading-words">
          <h2 id={titleId} className="discovery-dialog-title">
            {opportunity.title}
          </h2>
          <p className="discovery-dialog-facts">
            {opportunity.organization} · {opportunity.place}
          </p>
          <p className="discovery-dialog-tags">
            {/* The same colored tag as the table (typeTagClass, further down) */}
            <span className={typeTagClass[opportunity.type]}>{opportunity.type}</span>
            <span className="discovery-dialog-match">{opportunity.match}% match</span>
          </p>
        </div>
        {/* A form with method="dialog" closes the pop-up when its button is
            pressed, with no extra code. aria-label says what the X does (WCAG). */}
        <form method="dialog">
          <button className="discovery-dialog-close" aria-label="Close">
            <CloseIcon />
          </button>
        </form>
      </div>

      {/* The middle part scrolls if the details are longer than the screen */}
      <div className="discovery-dialog-body">
        {/* The 4 quick facts in one row, as labels and values (dl = description list) */}
        <dl className="discovery-dialog-facts-grid">
          <div>
            <dt>Pay</dt>
            <dd>{opportunity.pay}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>{opportunity.length}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{opportunity.hours}</dd>
          </div>
          <div>
            <dt>Apply by</dt>
            <dd>
              <time dateTime={opportunity.deadline}>
                {formatDate(opportunity.deadline, { month: "short", day: "numeric", year: "numeric" })}
              </time>
            </dd>
          </div>
        </dl>

        <h3 className="discovery-dialog-heading">About the role</h3>
        <p className="discovery-dialog-text">{opportunity.description}</p>

        <h3 className="discovery-dialog-heading">What you'll do</h3>
        {/* .map() makes one <li> per item, in order. The item's own words
            are its key, since they're all different. */}
        <ul className="discovery-dialog-list">
          {opportunity.responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h3 className="discovery-dialog-heading">What you need</h3>
        <ul className="discovery-dialog-list">
          {opportunity.requirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h3 className="discovery-dialog-heading">Skills</h3>
        <ul className="discovery-tags" aria-label="Skills">
          {opportunity.tags.map((tag) => (
            <li key={tag} className="discovery-tag">
              {tag}
            </li>
          ))}
        </ul>

        <h3 className="discovery-dialog-heading">About {opportunity.organization}</h3>
        <p className="discovery-dialog-text">{opportunity.about}</p>
      </div>

      {/* The bottom: a message on the left, Save and Apply on the right.
          It stays put while the middle scrolls. */}
      <div className="discovery-dialog-bottom">
        {/* role="status" reads the message out when it appears (WCAG) */}
        <p className="discovery-dialog-message" role="status">
          {applied ? "Applying isn't built yet." : ""}
        </p>
        <div className="discovery-actions">
          {/* aria-label starts with the word you see ("Save" or "Saved"),
              so voice control users can say what's on the button (WCAG) */}
          <button
            type="button"
            className="discovery-outline-button"
            aria-pressed={saved}
            aria-label={(saved ? "Saved " : "Save ") + opportunity.title}
            onClick={toggleSave}
          >
            <BookmarkIcon />
            {saved ? "Saved" : "Save"}
          </button>
          {/* After the deadline, Apply turns off and says why ("disabled"
              also stops it from being clicked or reached with Tab) */}
          <button
            type="button"
            className="discovery-solid-button"
            onClick={() => setApplied(true)}
            disabled={isPastDeadline(opportunity.deadline)}
          >
            {isPastDeadline(opportunity.deadline) ? (
              "Applications closed"
            ) : (
              <>
                Apply
                <ArrowIcon />
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// True if a deadline is within the next "days" days (and not already past).
// Used for the "Due soon" tag (7 days) and the summary box (14 days).
// 1000 * 60 * 60 * 24 is the number of milliseconds in one day.
function isDueWithin(deadline, days) {
  const msLeft = new Date(deadline + "T23:59") - new Date();
  return msLeft >= 0 && msLeft <= days * 1000 * 60 * 60 * 24;
}

// The colored tag for each kind of job. Each kind has its own color, and
// the word is always written in it too, so it never relies on color alone (WCAG)
const typeTagClass = {
  Internship: "discovery-type-tag discovery-type-internship",
  "Co-op": "discovery-type-tag discovery-type-coop",
  "Part-time": "discovery-type-tag discovery-type-parttime",
  "Full-time": "discovery-type-tag discovery-type-fulltime",
};

// One row of the table: one opportunity.
// props.opportunity is one { } from the opportunities list.
// props.isBest is true for the opportunity with the highest match.
function OpportunityRow(props) {
  // A shorter name, so we can write opportunity.title instead of props.opportunity.title.
  const opportunity = props.opportunity;

  // Each row remembers its own Save button (on/off), like Feed's Like button.
  // The pop-up uses the same one, so saving in either place saves both.
  // It starts as "on" if this job is already on the Application tracker, so
  // a job you saved before still says "Saved" when you come back.
  // (useState(() => ...) runs that check only once, when the row first appears.)
  const [saved, setSaved] = useState(() => isOnTracker(opportunity.id));

  // Runs when Save is pressed, in the row or in the pop-up.
  // Saving puts the job in the tracker's "Saved" column; pressing again
  // ("Saved") takes it off the tracker.
  function toggleSave() {
    if (saved) {
      removeFromTracker(opportunity.id);
    } else {
      addToTracker(opportunity.id);
    }
    setSaved(!saved);
    // Tells the Discovery page, so "On your tracker" at the top updates
    // right away (not only after a refresh)
    props.onSaveChange();
  }
  // A reference to this row's pop-up, so "View" can open it
  const dialogRef = useRef(null);
  // A reference to this row's View button (see the useEffect below)
  const viewButtonRef = useRef(null);

  // If the Feed page sent you here for THIS job ("/discovery?job=1"), open its
  // pop-up as soon as the row is on the screen. props.openOnArrival is true
  // only for that job. After opening, props.onOpened clears the "?job=1", so
  // the pop-up doesn't open again by itself (for example after switching tabs).
  const openOnArrival = props.openOnArrival;
  const onOpened = props.onOpened;
  useEffect(() => {
    // ".open" is true if the pop-up is already open. Opening it twice would
    // cause an error, so only open it if it isn't open yet.
    if (openOnArrival && !dialogRef.current.open) {
      // Focus this row's View button first: closing a pop-up puts the focus
      // back where it was before it opened. Coming from the Feed, nothing had
      // the focus yet, so keyboard users would land back at the top of the page
      viewButtonRef.current.focus();
      dialogRef.current.showModal();
      onOpened();
    }
  }, [openOnArrival, onOpened]);

  return (
    <tr className="discovery-row">
      {/* Role: the square logo, the title, and the organization.
          data-label is the column's name, shown above each piece on phones,
          where the table turns into one small box per opportunity (index.css) */}
      <td className="discovery-cell-role" data-label="Role">
        <span className="discovery-role">
          {/* The square logo (decoration: the name is in the words) */}
          <span className="discovery-logo" aria-hidden="true">
            {opportunity.initials}
          </span>
          <span className="discovery-role-words">
            {/* The title opens the pop-up too, since it's what people click first.
                aria-haspopup tells screen readers a pop-up will open (WCAG) */}
            <button
              type="button"
              className="discovery-role-title"
              aria-haspopup="dialog"
              onClick={() => dialogRef.current.showModal()}
            >
              {opportunity.title}
            </button>
            <span className="discovery-role-org">
              {opportunity.organization}
              {/* The best match gets a small tag after the name */}
              {props.isBest && <span className="discovery-best-tag">Best match</span>}
            </span>
          </span>
        </span>
      </td>

      <td data-label="Type">
        <span className={typeTagClass[opportunity.type]}>{opportunity.type}</span>
      </td>

      <td data-label="Location">{opportunity.place}</td>

      <td data-label="Pay" className="discovery-cell-nowrap">
        {opportunity.pay}
      </td>

      <td data-label="Apply by">
        <span className="discovery-apply-by">
          {/* <time> marks this as a date for computers, using the
              year-month-day version in dateTime */}
          <time dateTime={opportunity.deadline}>
            {formatDate(opportunity.deadline, { month: "short", day: "numeric", year: "numeric" })}
          </time>
          {/* "Due soon" when it's within a week, and "Closed" once the deadline
              has gone by. Written out, not only a color (WCAG) */}
          {isDueWithin(opportunity.deadline, 7) && <span className="discovery-due-tag">Due soon</span>}
          {isPastDeadline(opportunity.deadline) && <span className="discovery-due-tag discovery-closed-tag">Closed</span>}
        </span>
      </td>

      <td data-label="Match">
        <span className="discovery-match-cell">
          {/* The bar is decoration: the number next to it says the same (WCAG).
              --fill sets how much of the bar is colored in (see index.css) */}
          <span className="discovery-match-bar" aria-hidden="true">
            <span className="discovery-match-fill" style={{ "--fill": opportunity.match + "%" }} />
          </span>
          <span className="discovery-match-number">{opportunity.match}%</span>
        </span>
      </td>

      <td className="discovery-cell-actions">
        <span className="discovery-actions">
          {/* Save: an on/off button. !saved flips true to false and false
              to true. aria-pressed tells screen readers if it's on (WCAG).
              aria-label says which opportunity, because every row has a
              Save button. It starts with the visible word ("Save" or
              "Saved") so voice control still works (WCAG). */}
          <button
            type="button"
            className="discovery-outline-button discovery-small-button"
            aria-pressed={saved}
            aria-label={(saved ? "Saved " : "Save ") + opportunity.title}
            onClick={toggleSave}
          >
            <BookmarkIcon />
            {saved ? "Saved" : "Save"}
          </button>

          {/* Opens this row's pop-up. showModal() is the <dialog>'s own
              "open as a pop-up" command (WCAG: see OpportunityDialog above) */}
          <button
            type="button"
            className="discovery-solid-button discovery-small-button"
            aria-label={"View " + opportunity.title}
            aria-haspopup="dialog"
            ref={viewButtonRef}
            onClick={() => dialogRef.current.showModal()}
          >
            View
            <ArrowIcon />
          </button>
        </span>

        {/* Hidden on screen. Screen readers hear it when Save is pressed (WCAG) */}
        <span className="sr-only" role="status">
          {saved ? "Saved to My applications." : ""}
        </span>

        {/* The pop-up. It's on the page all the time but hidden until it's opened. */}
        <OpportunityDialog opportunity={opportunity} ref={dialogRef} saved={saved} toggleSave={toggleSave} />
      </td>
    </tr>
  );
}

// The list of opportunities: the count and Sort above, then the table.
// props.shown is the opportunities that pass the search and tab, already sorted.
function ResultsSection(props) {
  // "opportunity" for 1, "opportunities" for anything else.
  const word = props.shown.length === 1 ? "opportunity" : "opportunities";

  return (
    // aria-labelledby names this section with the heading's words (WCAG)
    <section className="discovery-results" aria-labelledby="discovery-results-title">
      {/* A heading for screen readers only (sr-only), so the list has a
          name in the page's outline. The tabs already show it on screen. */}
      <h2 id="discovery-results-title" className="sr-only">
        Opportunities
      </h2>

      {/* If nothing passes the search and tab, show a message and a way back.
          Otherwise, show the table. "? :" picks one of the two. */}
      {props.shown.length === 0 ? (
        <div className="discovery-empty">
          <p className="discovery-empty-title">No opportunities match</p>
          <p className="discovery-empty-text">Try different words, or pick another tab.</p>
          <button type="button" className="discovery-outline-button" onClick={props.showAll}>
            Show all opportunities
          </button>
        </div>
      ) : (
        // The white box around the table. On small screens the table can't
        // fit, so it turns into one box per opportunity instead (index.css)
        <div className="discovery-table-box">
          <table className="discovery-table">
            {/* The table's name, for screen readers (WCAG) */}
            <caption className="sr-only">Opportunities, {props.sortBy === "match" ? "best match first" : "soonest deadline first"}</caption>
            <thead>
              <tr>
                {/* scope="col" tells screen readers each one names a column (WCAG) */}
                <th scope="col">Role</th>
                <th scope="col">Type</th>
                <th scope="col">Location</th>
                <th scope="col">Pay</th>
                <th scope="col">Apply by</th>
                <th scope="col">Match</th>
                {/* The buttons' column has no words on screen, but screen readers get a name */}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.shown.map((opportunity) => (
                <OpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  isBest={opportunity.id === props.bestMatchId}
                  // true only for the job the Feed page linked to (see Discovery below)
                  openOnArrival={opportunity.id === props.openJobId}
                  onOpened={props.onOpened}
                  // runs after Save is pressed (see Discovery below)
                  onSaveChange={props.onSaveChange}
                />
              ))}
            </tbody>
          </table>

          {/* The bottom of the box: the count. role="status" reads the new
              count out when it changes (WCAG) */}
          <p className="discovery-results-count" role="status">
            Showing {props.shown.length} {word}
          </p>
        </div>
      )}
    </section>
  );
}

// A small tip under the table (it used to be the "Profile boost" box in a
// side column, which the revamp's full-width table doesn't have)
function ProfileTip() {
  return (
    <p className="discovery-tip">
      Better matches: the more skills your profile shows, the more accurate your matches get.{" "}
      <Link to="/editprofile" className="discovery-text-link">
        Add a skill
        <ArrowIcon />
      </Link>
    </p>
  );
}

// Discovery is the whole page. It puts the pieces above together, and it
// remembers the search and the picked tab so everything stays in sync.
function Discovery() {
  // What's typed in the search bar. Starts empty.
  const [search, setSearch] = useState("");
  // Which tab is picked. Starts on "All".
  const [picked, setPicked] = useState("All");
  // How the list is sorted: "match" or "deadline".
  const [sortBy, setSortBy] = useState("match");
  // The extra info at the end of the address. For "/discovery?job=1",
  // searchParams.get("job") gives "1". setSearchParams changes it.
  const [searchParams, setSearchParams] = useSearchParams();
  // The job to open right away, as a number (Number("1") is 1), or null if
  // the address has no "?job=". Number(null) would be 0, so check first.
  const openJobId = searchParams.get("job") ? Number(searchParams.get("job")) : null;

  // Runs after that job's pop-up opens: removes "?job=1" from the address.
  // replace: true swaps the address instead of adding a new one, so the
  // browser's Back button still goes back to the Feed page.
  function clearOpenJob() {
    setSearchParams({}, { replace: true });
  }

  // The opportunity with the highest match: sort by match, take the first.
  const bestMatch = sortByMatch(opportunities)[0];

  // The opportunities that pass the search (see matchesSearch above)
  const searched = opportunities.filter((opportunity) => matchesSearch(opportunity, search));

  // How many opportunities each tab has, for the numbers on the tabs.
  // For each tab name, count the opportunities of that type ("All" counts all).
  // They're counted after the search, so with "python" typed, "Co-op 1" means
  // one co-op matches, and a tab's number is always what clicking it shows
  const counts = {};
  tabs.forEach((tab) => {
    counts[tab] = tab === "All" ? searched.length : searched.filter((o) => o.type === tab).length;
  });

  // For the summary boxes: what's due in the next 2 weeks (soonest first),
  // and how many jobs are on your tracker (saved in this browser).
  const dueSoon = sortByDeadline(opportunities.filter((o) => isDueWithin(o.deadline, 14)));
  // The tracker count is state, so the page redraws when it changes. Each row's
  // Save button runs updateTrackerCount (through ResultsSection) after saving.
  // Before, it was only read when the page opened, so it stayed at the old
  // number until a refresh
  const [trackerCount, setTrackerCount] = useState(() => loadTracker().length);
  function updateTrackerCount() {
    setTrackerCount(loadTracker().length);
  }

  // Of the ones that pass the search, keep only the picked tab's:
  // "All" is picked, or its type is the picked one ("||" means "or")
  const filtered = searched.filter((opportunity) => picked === "All" || opportunity.type === picked);

  // Then sort what's left, the way the Sort dropdown says.
  const shown = sortBy === "match" ? sortByMatch(filtered) : sortByDeadline(filtered);

  // The "Show all opportunities" button: empty search bar, back to All.
  function showAll() {
    setSearch("");
    setPicked("All");
  }

  return (
    <>
      <title>Opportunities | ScoutSearch</title>
      <NavBar />
      {/* One column, like a dashboard: the title and search, the summary
          boxes, the tabs and Sort, then the table */}
      <main className="discovery-page">
        <DiscoveryHeader search={search} setSearch={setSearch} />
        <SummaryBoxes dueSoon={dueSoon} trackerCount={trackerCount} />

        {/* The tabs on the left, Sort on the right */}
        <div className="discovery-toolbar">
          <TypeTabs picked={picked} setPicked={setPicked} counts={counts} />

          {/* The Sort dropdown. value is what's chosen right now; onChange
              runs when you pick another one. */}
          <div className="discovery-sort">
            <label htmlFor="discovery-sort-select">Sort by</label>
            <select
              id="discovery-sort-select"
              className="discovery-sort-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="match">Best match</option>
              <option value="deadline">Deadline</option>
            </select>
          </div>
        </div>

        <ResultsSection
          shown={shown}
          bestMatchId={bestMatch.id}
          sortBy={sortBy}
          showAll={showAll}
          openJobId={openJobId}
          onOpened={clearOpenJob}
          onSaveChange={updateTrackerCount}
        />

        <ProfileTip />
      </main>
    </>
  );
}

// "export default" lets App.jsx import this page.
export default Discovery;
