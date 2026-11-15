// Discovery.jsx is the Discovery page (yoursite.com/discovery).
// It shows real internships, co-ops, research positions, and programs.
// The jobs come from our backend (GET /api/jobs), which gets them from
// company job boards (Greenhouse, Lever) and JSearch. See backend/src/jobs.ts.
// The styles for this page are in index.css, under "Discovery page".
//
// It's laid out the same way as the Feed page, so the two feel like one site:
//   1. DiscoveryHeader   the dark box: big title, one sentence, and the search bar
//   2. TypeTabs          a row of tabs: All, Internship, Co-op, Research, Program
//   3. Two columns:
//        ResultsSection  left:  the count, Sort, and the opportunity boxes
//        SideColumn      right: My applications and Profile boost
//
// The search bar and the tabs both really work: the Discovery function at
// the bottom remembers what you typed and which tab is picked (with
// useState), and only shows the opportunities that match both.

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen, so the code can
// measure it. useLayoutEffect runs code right after React draws the page but
// BEFORE you see it, so a measurement can be used without a flicker.
// useEffect runs code after the page is drawn (here: opening a pop-up).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
// Link goes to another page of the site without reloading everything.
// useSearchParams reads the extra info at the end of the address, like the
// "?job=1" in "/discovery?job=1" (the Feed page links here that way).
import { Link, useSearchParams } from "react-router";
// NavBar is the bar across the top of the page. It lives in its own file
// (components/NavBar.jsx) because every page uses it.
import NavBar from "../components/NavBar.jsx";

// api() is how pages talk to our backend (src/api.js).
import { api } from "../api.js";
// The helpers that add a job to (or take it off) the Application tracker.
// See src/data/tracker.js.
import { addToTracker, isOnTracker, removeFromTracker } from "../data/tracker.js";

// The tabs across the page. "All" shows everything; the rest match the
// "type" of each opportunity (the same four types the database allows).
const tabs = ["All", "Internship", "Co-op", "Research", "Program"];

// ---------- Turning backend jobs into what this page shows ----------

// The database writes types in lowercase ("co-op"); the tabs show them capitalized.
const typeNames = {
  internship: "Internship",
  "co-op": "Co-op",
  research: "Research",
  program: "Program",
};

// Where each job came from, in words students know. Every outside job has to
// say where it's from (backend/plans.md: "Every outside job shows its source").
const sourceNames = {
  employer: "ScoutSearch",
  greenhouse: "Greenhouse",
  lever: "Lever",
  usajobs: "USAJOBS",
  adzuna: "Adzuna",
  jsearch: "JSearch",
};

// Real job descriptions can be thousands of letters long. The box only shows
// the start; the pop-up shows all of it.
// It cuts at the last space before 220 letters, so a word isn't cut in half.
function shorten(text) {
  if (text.length <= 220) {
    return text;
  }
  const start = text.slice(0, 220);
  return start.slice(0, start.lastIndexOf(" ")) + "…";
}

// Turns one job from the backend into the shape the rest of this page uses.
// The names on the left are what the boxes and the pop-up read; the names on
// the right are the backend's (see JOB_COLUMNS in backend/src/jobs.ts).
// "??" means "if this is missing (null), use the thing on the right instead".
function toOpportunity(job) {
  return {
    id: job.id,
    // "Greenline Labs" -> "GL", for the square logo
    initials: job.organization
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    title: job.title,
    organization: job.organization,
    type: typeNames[job.type],
    place: job.location ?? (job.setting === "remote" ? "Remote" : "Location not listed"),
    deadline: job.deadline, // can be null: many jobs don't list one
    // the whole description for the pop-up, and the start of it for the box
    description: job.description ?? "",
    summary: shorten(job.description ?? ""),
    tags: [], // the backend doesn't have skill tags yet
    pay: job.pay_text, // can be null
    requirements: job.requirements,
    applyUrl: job.apply_url, // the original posting; Apply opens it
    source: sourceNames[job.source] ?? job.source,
  };
}

// Asks the backend for the jobs, and turns each one into the page's shape.
// It's "async", so it hands back a promise: the list arrives a moment later.
// The backend sends the newest 50 open jobs ({ jobs: [...] }).
async function fetchOpportunities() {
  const body = await api("/jobs");
  return body.jobs.map(toOpportunity);
}

// ---------- Helpers ----------

// Turns a date like "2027-06-28" into words, like "Jun 28".
// "options" says which parts to show, for example { month: "short" } gives "Jun".
// The "T00:00" means midnight, so the date doesn't slip back a day in some time zones.
function formatDate(date, options) {
  return new Date(date + "T00:00").toLocaleDateString("en-US", options);
}

// Puts opportunities in order of deadline, soonest first.
// [...list] makes a copy first, because .sort() changes the list it's given,
// and we don't want to shuffle the list the page remembers.
// localeCompare compares two words A to Z; because the dates are written
// year-month-day, A to Z is also earliest to latest.
// Jobs with no deadline (null) count as "9999-12-31", so they go last.
function sortByDeadline(list) {
  return [...list].sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));
}

// True if what was typed in the search bar appears anywhere in this
// opportunity's title, company, type, place, or skill tags.
// toLowerCase() makes "REACT", "React", and "react" all count as the same.
function matchesSearch(opportunity, search) {
  // trim() removes spaces at the start and end, so "  react " still works
  const words = search.trim().toLowerCase();
  // An empty search bar matches everything
  if (words === "") {
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
  // includes() checks if the search words are somewhere inside that text
  return text.includes(words);
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

// A small calendar, in front of "Apply by".
function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* the page of the calendar */}
      <rect x="3" y="5" width="18" height="16" rx="2" />
      {/* the line under the top, and the two rings at the top */}
      <path d="M3 10h18M8 3v4M16 3v4" />
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

// The top of the page: the big title, one sentence, and the search bar.
// They sit inside a dark navy box at the top of the page.
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
    <header className="discovery-header">
      {/* The page's one h1 (WCAG). The span colors the last words sky blue. */}
      <h1 className="discovery-title">
        Find a place to put your <span className="discovery-title-blue">skills to work.</span>
      </h1>

      <p className="discovery-subtitle">Internships, co-ops, and jobs matched to your ScoutSearch profile.</p>

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

// The row of tabs (All, Internship, Co-op, ...). Same look as Feed's tabs.
// props.picked is the tab that's on right now, and props.setPicked changes it.
//
// The blue line under the picked tab SLIDES to the new tab when you click
// one, so you can see where you moved from and to. There's only one line,
// and the code moves it under whichever tab is picked.
function TypeTabs(props) {
  // References to the row of tabs and the blue line, so we can measure and move them
  const rowRef = useRef(null);
  const lineRef = useRef(null);

  // Runs every time the picked tab changes (that's what [props.picked] at
  // the end means), and before the page is shown.
  useLayoutEffect(() => {
    // Puts the blue line under the picked tab
    function moveLine() {
      // Find the picked tab's button inside the row
      const pickedTab = rowRef.current.querySelector('[aria-pressed="true"]');
      // offsetLeft = how far the tab is from the left of the row (in px)
      // offsetWidth = how wide the tab is (in px)
      // The line is 1px wide in the CSS, so scaleX(width) stretches it to the
      // tab's width. Moving it with transform (instead of left and width) is
      // what keeps the slide smooth.
      lineRef.current.style.transform =
        "translateX(" + pickedTab.offsetLeft + "px) scaleX(" + pickedTab.offsetWidth + ")";
    }

    moveLine();
    // The tabs move when the window changes size (the space between them
    // changes on phones), so move the line again then too
    window.addEventListener("resize", moveLine);
    // When the picked tab changes again (or you leave the page), stop
    // listening to the old one, so they don't pile up
    return () => window.removeEventListener("resize", moveLine);
  }, [props.picked]);

  return (
    // role="group" + aria-label tells screen readers these buttons belong
    // together and what they're for (WCAG)
    <div className="discovery-tabs" role="group" aria-label="Show opportunity type" ref={rowRef}>
      {/* One button per tab. .map() goes through the tabs list in order. */}
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          // The picked tab also gets "discovery-tab-picked", which makes its words navy
          className={tab === props.picked ? "discovery-tab discovery-tab-picked" : "discovery-tab"}
          // aria-pressed tells screen readers which tab is on (WCAG)
          aria-pressed={tab === props.picked}
          onClick={() => props.setPicked(tab)}
        >
          {tab}
        </button>
      ))}

      {/* The sliding blue line. Decoration only: aria-pressed already tells
          screen readers which tab is picked */}
      <span className="discovery-tab-line" ref={lineRef} aria-hidden="true" />
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
      {/* The dark band at the top, like the dark box on the page */}
      <div className="discovery-dialog-top">
        <span className="discovery-logo" aria-hidden="true">
          {opportunity.initials}
        </span>
        <div>
          <p className="discovery-dialog-type">{opportunity.type}</p>
          <h2 id={titleId} className="discovery-dialog-title">
            {opportunity.title}
          </h2>
          {/* The company, where, and which site we found the job on */}
          <p className="discovery-dialog-facts">
            {opportunity.organization} · {opportunity.place} · via {opportunity.source}
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
        {/* The quick facts, as a list of labels and values (dl = description list).
            Real jobs often leave pay or a deadline out, so each one only shows
            when the job has it. "&&" means: only draw the part on the right if
            the left side is there. The whole list is left out if both are missing. */}
        {(opportunity.pay || opportunity.deadline) && (
          <dl className="discovery-dialog-facts-grid">
            {opportunity.pay && (
              <div>
                <dt>Pay</dt>
                <dd>{opportunity.pay}</dd>
              </div>
            )}
            {opportunity.deadline && (
              <div>
                <dt>Apply by</dt>
                <dd>
                  <time dateTime={opportunity.deadline}>
                    {formatDate(opportunity.deadline, { month: "short", day: "numeric", year: "numeric" })}
                  </time>
                </dd>
              </div>
            )}
          </dl>
        )}

        {opportunity.description && (
          <>
            <h3 className="discovery-dialog-heading">About the role</h3>
            <p className="discovery-dialog-text">{opportunity.description}</p>
          </>
        )}

        {/* Only if the job lists what they're looking for.
            .map() makes one <li> per item, in order. Real posts sometimes say
            the same thing twice, so the key adds the item's place in the list
            (index) to its words, to keep every key different. */}
        {opportunity.requirements.length > 0 && (
          <>
            <h3 className="discovery-dialog-heading">What they're looking for</h3>
            <ul className="discovery-dialog-list">
              {opportunity.requirements.map((item, index) => (
                <li key={index + item}>{item}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* The bottom: a note on the left, Save and Apply on the right.
          It stays put while the middle scrolls. */}
      <div className="discovery-dialog-bottom">
        <p className="discovery-dialog-message">You'll apply on {opportunity.organization}'s own site.</p>
        <div className="discovery-actions">
          <button
            type="button"
            className="discovery-outline-button"
            aria-pressed={saved}
            aria-label={"Save " + opportunity.title}
            onClick={toggleSave}
          >
            <BookmarkIcon />
            {saved ? "Saved" : "Save"}
          </button>
          {/* Apply opens the original posting in a new tab, so students apply
              on the real site. It's a link (<a>), not a button, because it goes
              somewhere. target="_blank" opens a new tab; rel="noopener noreferrer"
              stops that other site from controlling or seeing this tab.
              aria-label warns that a new tab opens, and starts with the visible
              word "Apply" so voice control still works (WCAG). */}
          {opportunity.applyUrl && (
            <a
              href={opportunity.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="discovery-solid-button"
              aria-label={"Apply to " + opportunity.title + " (opens in a new tab)"}
            >
              Apply
              <ArrowIcon />
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}

// One opportunity box.
// props.opportunity is one { } from the opportunities list.
function OpportunityCard(props) {
  // A shorter name, so we can write opportunity.title instead of props.opportunity.title.
  const opportunity = props.opportunity;

  // Each box remembers its own Save button (on/off), like Feed's Like button.
  // The pop-up uses the same one, so saving in either place saves both.
  // It starts as "on" if this job is already on the Application tracker, so
  // a job you saved before still says "Saved" when you come back.
  // (useState(() => ...) runs that check only once, when the box first appears.)
  const [saved, setSaved] = useState(() => isOnTracker(opportunity.id));

  // Runs when Save is pressed, on the card or in the pop-up.
  // Saving puts the job in the tracker's "Saved" column; pressing again
  // ("Saved") takes it off the tracker.
  function toggleSave() {
    if (saved) {
      removeFromTracker(opportunity.id);
    } else {
      addToTracker(opportunity.id);
    }
    setSaved(!saved);
  }
  // A reference to this box's pop-up, so "View opportunity" can open it
  const dialogRef = useRef(null);

  // If the Feed page sent you here for THIS job ("/discovery?job=1"), open its
  // pop-up as soon as the box is on the screen. props.openOnArrival is true
  // only for that job. After opening, props.onOpened clears the "?job=1", so
  // the pop-up doesn't open again by itself (for example after switching tabs).
  const openOnArrival = props.openOnArrival;
  const onOpened = props.onOpened;
  useEffect(() => {
    // ".open" is true if the pop-up is already open. Opening it twice would
    // cause an error, so only open it if it isn't open yet.
    if (openOnArrival && !dialogRef.current.open) {
      dialogRef.current.showModal();
      onOpened();
    }
  }, [openOnArrival, onOpened]);

  // The words under the buttons
  let message = "";
  if (saved) {
    message = "Saved to My applications.";
  }

  return (
    <li className="discovery-opportunity">
      {/* The blue strip across the top, like the "UPDATE" strip on Feed's
          posts. It shows the type (Internship, Co-op, ...). */}
      <p className="discovery-strip">{opportunity.type}</p>

      <div className="discovery-opportunity-body">
        {/* Row 1, left: the square logo (decoration: the name is in the words) */}
        <span className="discovery-logo" aria-hidden="true">
          {opportunity.initials}
        </span>

        {/* Row 1, right of the logo: title and facts (company, where, and
            which site we found it on) */}
        <div>
          <h3 className="discovery-opportunity-title">{opportunity.title}</h3>
          <p className="discovery-opportunity-facts">
            {opportunity.organization} · {opportunity.place} · via {opportunity.source}
          </p>
        </div>

        {/* Everything below goes under the title (the "wide" class, see index.css).
            The box shows only the start of the description (see shorten above). */}
        {opportunity.summary && (
          <p className="discovery-opportunity-description discovery-opportunity-wide">{opportunity.summary}</p>
        )}

        {/* The skill tags, only if the job has any. .map() makes one <li> per tag, in order. */}
        {opportunity.tags.length > 0 && (
          <ul className="discovery-tags discovery-opportunity-wide" aria-label="Skills">
            {opportunity.tags.map((tag) => (
              <li key={tag} className="discovery-tag">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {/* The bottom: "Apply by" on the left, buttons on the right */}
        <div className="discovery-opportunity-footer discovery-opportunity-wide">
          <div className="discovery-footer-row">
            {/* Many real jobs don't list a deadline, so this says so instead
                of showing a broken date */}
            <p className="discovery-apply-by">
              <CalendarIcon />
              {opportunity.deadline ? (
                // <time> marks this as a date for computers, using the
                // year-month-day version in dateTime
                <span>
                  Apply by{" "}
                  <time dateTime={opportunity.deadline}>
                    {formatDate(opportunity.deadline, { month: "short", day: "numeric" })}
                  </time>
                </span>
              ) : (
                <span>No deadline listed</span>
              )}
            </p>

            <div className="discovery-actions">
              {/* Save: an on/off button. !saved flips true to false and false
                  to true. aria-pressed tells screen readers if it's on (WCAG).
                  aria-label says which opportunity, because every box has a
                  Save button. It starts with the visible word "Save" so
                  voice control still works (WCAG). */}
              <button
                type="button"
                className="discovery-outline-button"
                aria-pressed={saved}
                aria-label={"Save " + opportunity.title}
                onClick={toggleSave}
              >
                <BookmarkIcon />
                {saved ? "Saved" : "Save"}
              </button>

              {/* Opens this box's pop-up. showModal() is the <dialog>'s own
                  "open as a pop-up" command. aria-haspopup tells screen
                  readers a pop-up will open (WCAG). */}
              <button
                type="button"
                className="discovery-solid-button"
                aria-label={"View opportunity: " + opportunity.title}
                aria-haspopup="dialog"
                onClick={() => dialogRef.current.showModal()}
              >
                View opportunity
                <ArrowIcon />
              </button>
            </div>
          </div>

          {/* Always on the page, empty until there's something to say.
              role="status" reads it out when it changes (WCAG). */}
          <p className="discovery-card-message" role="status">
            {message}
          </p>
        </div>
      </div>

      {/* The pop-up. It's on the page all the time but hidden until it's opened. */}
      <OpportunityDialog opportunity={opportunity} ref={dialogRef} saved={saved} toggleSave={toggleSave} />
    </li>
  );
}

// The left column: the count, Sort, and the list of opportunity boxes.
// props.shown is the opportunities that pass the search and tab, already sorted.
// props.loading is true while the jobs are still on their way from the backend,
// and props.loadError is true if getting them failed (props.retry tries again).
function ResultsSection(props) {
  // While waiting, or if it failed, show a message in place of the count and list.
  // role="status" reads it out when it appears (WCAG).
  // It reuses the dashed "nothing here" box, so it needs no new styles.
  if (props.loading) {
    return (
      <section className="discovery-results" aria-labelledby="discovery-results-title">
        <h2 id="discovery-results-title" className="sr-only">
          Opportunities
        </h2>
        <div className="discovery-empty" role="status">
          <p className="discovery-empty-title">Loading opportunities...</p>
        </div>
      </section>
    );
  }
  if (props.loadError) {
    return (
      <section className="discovery-results" aria-labelledby="discovery-results-title">
        <h2 id="discovery-results-title" className="sr-only">
          Opportunities
        </h2>
        <div className="discovery-empty" role="status">
          <p className="discovery-empty-title">Couldn't load opportunities</p>
          <p className="discovery-empty-text">Check your connection, then try again.</p>
          <button type="button" className="discovery-outline-button" onClick={props.retry}>
            Try again
          </button>
        </div>
      </section>
    );
  }

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

      {/* The small row above the list: the count on the left, Sort on the right */}
      <div className="discovery-results-top">
        {/* role="status" reads the new count out when it changes (WCAG) */}
        <p className="discovery-results-count" role="status">
          {props.shown.length} {word}
        </p>

        {/* The Sort dropdown. value is what's chosen right now; onChange
            runs when you pick another one. */}
        <div className="discovery-sort">
          <label htmlFor="discovery-sort-select">Sort by</label>
          <select
            id="discovery-sort-select"
            className="discovery-sort-select"
            value={props.sortBy}
            onChange={(event) => props.setSortBy(event.target.value)}
          >
            {/* "Newest" is the order the backend sends: newest jobs first.
                (There's no "Best match" yet, because matching jobs to your
                profile isn't built.) */}
            <option value="newest">Newest</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>
      </div>

      {/* If nothing passes the search and tab, show a message and a way back.
          Otherwise, show the list. "? :" picks one of the two. */}
      {props.shown.length === 0 ? (
        <div className="discovery-empty">
          <p className="discovery-empty-title">No opportunities match</p>
          <p className="discovery-empty-text">Try different words, or pick another tab.</p>
          <button type="button" className="discovery-outline-button" onClick={props.showAll}>
            Show all opportunities
          </button>
        </div>
      ) : (
        <ul className="discovery-opportunities">
          {props.shown.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              // true only for the job the Feed page linked to (see Discovery below)
              openOnArrival={opportunity.id === props.openJobId}
              onOpened={props.onOpened}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// The right column: the blue My applications box, then Profile boost.
function SideColumn() {
  return (
    // aside = a side column. aria-label names it for screen readers.
    <aside className="discovery-side" aria-label="Your applications and profile">
      {/* The blue box at the top, like Feed's date box. It goes to the
          application tracker, which isn't built yet, so the link leads to an
          empty page for now. */}
      <Link to="/applications" className="discovery-tracker-link">
        <span className="discovery-tracker-words">
          <span className="discovery-tracker-title">My applications</span>
          <span className="discovery-tracker-text">Track everything you've applied to</span>
        </span>
        <ArrowIcon />
      </Link>

      <section className="discovery-side-card" aria-labelledby="discovery-boost-title">
        <h2 id="discovery-boost-title" className="discovery-side-title">
          Profile boost
        </h2>
        <p className="discovery-side-text">
          The more skills your profile shows, the more accurate your matches get. Add the ones you've used in class
          or in a project.
        </p>
        <Link to="/editprofile" className="discovery-text-link">
          Add a skill
          <ArrowIcon />
        </Link>
      </section>
    </aside>
  );
}

// Discovery is the whole page. It puts the pieces above together, and it
// remembers the search and the picked tab so everything stays in sync.
function Discovery() {
  // What's typed in the search bar. Starts empty.
  const [search, setSearch] = useState("");
  // Which tab is picked. Starts on "All".
  const [picked, setPicked] = useState("All");
  // How the list is sorted: "newest" or "deadline".
  const [sortBy, setSortBy] = useState("newest");

  // The jobs from the backend. Starts as an empty list until they arrive.
  const [opportunities, setOpportunities] = useState([]);
  // true while waiting for the backend, so the list can say "Loading..."
  const [loading, setLoading] = useState(true);
  // true if getting the jobs failed, so the list can show "Try again"
  const [loadError, setLoadError] = useState(false);
  // Counts how many times "Try again" was pressed. Changing it makes the
  // useEffect below run again (it's in the [ ] list at the end).
  const [tries, setTries] = useState(0);

  // Runs when the page opens, and again after each "Try again":
  // asks the backend for the jobs.
  useEffect(() => {
    // If you leave the page before the answer arrives, "ignore" becomes true
    // (in the cleanup at the bottom), so we don't update a page that's gone.
    let ignore = false;
    fetchOpportunities()
      .then((list) => {
        if (!ignore) {
          setOpportunities(list);
        }
      })
      .catch((error) => {
        // The real reason goes to the console (F12); the page shows a simple message
        console.error("Loading jobs failed:", error);
        if (!ignore) {
          setLoadError(true);
        }
      })
      // .finally runs either way, worked or failed
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [tries]);

  // Runs when "Try again" is pressed: back to "Loading...", then ask again
  function retry() {
    setLoading(true);
    setLoadError(false);
    setTries(tries + 1);
  }

  // The extra info at the end of the address. For "/discovery?job=abc",
  // searchParams.get("job") gives "abc". setSearchParams changes it.
  const [searchParams, setSearchParams] = useSearchParams();
  // The job to open right away, or null if the address has no "?job=".
  // Real job ids are long codes (uuids) like "3f2a...", so it stays as text.
  const openJobId = searchParams.get("job");

  // Runs after that job's pop-up opens: removes "?job=1" from the address.
  // replace: true swaps the address instead of adding a new one, so the
  // browser's Back button still goes back to the Feed page.
  function clearOpenJob() {
    setSearchParams({}, { replace: true });
  }

  // Keep only the opportunities that pass BOTH tests:
  //   1. the tab: "All" is picked, or its type is the picked one ("||" means "or")
  //   2. the search: the typed words appear in it (see matchesSearch above)
  // "&&" means "and": both have to be true.
  const filtered = opportunities.filter(
    (opportunity) => (picked === "All" || opportunity.type === picked) && matchesSearch(opportunity, search),
  );

  // Then sort what's left, the way the Sort dropdown says.
  // "newest" keeps the backend's order (newest first), so there's nothing to do.
  const shown = sortBy === "deadline" ? sortByDeadline(filtered) : filtered;

  // The "Show all opportunities" button: empty search bar, back to All.
  function showAll() {
    setSearch("");
    setPicked("All");
  }

  return (
    <>
      <title>Discovery | ScoutSearch</title>
      <NavBar />
      {/* Same grid as the Feed page: the header and tabs stretch across the
          top, then the list on the left and the side column on the right */}
      <main className="discovery-page">
        <DiscoveryHeader search={search} setSearch={setSearch} />
        <TypeTabs picked={picked} setPicked={setPicked} />

        <ResultsSection
          shown={shown}
          loading={loading}
          loadError={loadError}
          retry={retry}
          sortBy={sortBy}
          setSortBy={setSortBy}
          showAll={showAll}
          openJobId={openJobId}
          onOpened={clearOpenJob}
        />

        <SideColumn />
      </main>
    </>
  );
}

// "export default" lets App.jsx import this page.
export default Discovery;
