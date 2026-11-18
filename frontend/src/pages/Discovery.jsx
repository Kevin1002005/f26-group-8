// Discovery.jsx is the Discovery page (yoursite.com/discovery).
// It shows real internships, co-ops, research positions, and programs.
// The jobs come from our backend (GET /api/jobs/for-me), which gets them from
// company job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable), lists
// like SimplifyJobs, USAJOBS, JSearch, and Adzuna. See backend/src/jobs.ts.
// The backend does the filtering, sorting, and "best fit" scoring (backend/src/fit.ts)
// across every job, and sends 50 at a time ("Show more" gets the next 50).
// The styles for this page are in index.css, under "Discovery page".
//
// Since the 2026-11 revamp it's laid out like a dashboard, one column:
//   1. DiscoveryHeader   the title, one sentence, and the search bar
//   2. SummaryBoxes      three number boxes: open to you, due soon, on your tracker
//   3. TypeTabs + Sort   tabs (All, Internship, Co-op, Research, Program), Sort, and Refresh
//   4. FilterBar         "For your major", who it's for, where, posted, deadline, paid,
//                        and "More filters" (must mention, leave out, city, hidden companies)
//   5. ResultsSection    the table: one row per opportunity (OpportunityRow), and "Show more"
//   6. ProfileTip        a one-line tip under the table
//
// The Discovery function at the bottom remembers the search, the tab, the sort, and
// the filters (with useState), and asks the backend again whenever one changes.

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen (here: each row's pop-up,
// so its buttons can open it).
// useEffect runs code after the page is drawn (here: getting the jobs, and opening a pop-up).
import { useEffect, useRef, useState } from "react";
// Link goes to another page of the site without reloading everything.
// useSearchParams reads the extra info at the end of the address, like the
// "?job=..." in "/discovery?job=..." (the Feed page links here that way).
import { Link, useSearchParams } from "react-router";
// NavBar is the bar across the top of the page. It lives in its own file
// (components/NavBar.jsx) because every page uses it.
import NavBar from "../components/NavBar.jsx";

// api() is how pages talk to our backend (src/api.js).
import { api } from "../api.js";
// Your profile, for "For your major" (data/profile.js), and the "undecided" choice (data/majors.js)
import { useMyProfile } from "../data/profile.js";
import { undecided } from "../data/majors.js";
// accountKey keeps each account's hidden companies apart on a shared computer (login-status.js)
import { accountKey } from "../login-status.js";
// isPastDeadline says if a job's deadline has gone by (it then says "Closed").
// (The made-up example jobs in that file are still used by the Feed page.)
// isDueWithin says if it's due in the next few days, and initialsOf makes the "GL" for a logo.
import { initialsOf, isDueWithin, isPastDeadline } from "../data/opportunities.js";
// The Application tracker's list, saved with your account (src/data/tracker.js):
// the helpers that add a job to it (or take it off, or mark it applied), useTrackerItems (the list,
// redrawing the page when it changes), useTrackerSync (syncs with your account
// when the page opens), and trackerJob, which finds the job behind each saved item.
import { addToTracker, markApplied, removeFromTracker, trackerJob, useTrackerItems, useTrackerSync } from "../data/tracker.js";

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
  simplify: "SimplifyJobs",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  nsf: "NSF ETAP",
  precollege: "precollege-finder",
  vanshb03: "the vanshb03 list",
  co0oper: "the CO0Oper list",
  speedyapply: "SpeedyApply",
};

// The tab names as the backend writes them (the other way round from typeNames)
const typeValues = { Internship: "internship", "Co-op": "co-op", Research: "research", Program: "program" };

// Turns one job from the backend into the shape the rest of this page uses.
// The names on the left are what the table and the pop-up read; the names on
// the right are the backend's (see JOB_COLUMNS in backend/src/jobs.ts).
// "??" means "if this is missing (null), use the thing on the right instead".
function toOpportunity(job) {
  return {
    id: job.id,
    // "Greenline Labs" -> "GL", for the square logo
    initials: initialsOf(job.organization),
    title: job.title,
    organization: job.organization,
    type: typeNames[job.type],
    place: job.location ?? (job.setting === "remote" ? "Remote" : "Location not listed"),
    deadline: job.deadline, // can be null: many jobs don't list one
    description: job.description ?? "", // the whole description, for the pop-up
    tags: [], // the backend doesn't have skill tags yet
    pay: job.pay_text, // can be null
    requirements: job.requirements,
    applyUrl: job.apply_url, // the original posting; Apply opens it
    source: sourceNames[job.source] ?? job.source,
    // When the company posted it (an ISO time), or null if its job site didn't say.
    // addedAt is when ScoutSearch first saved it, shown only when postedAt is missing
    postedAt: job.posted_at ?? null,
    addedAt: job.created_at ?? null,
    // How well it fits you: { score (0-100, or null if your profile doesn't say
    // enough yet), reasons ["Fits your major...", ...] } (backend/src/fit.ts)
    fit: job.fit ?? null,
  };
}

// Asks the backend for one page (50) of the jobs that pass the filters, and
// turns each one into the page's shape. query is the filters, written the way
// a web address carries them ("type=co-op&sort=fit", see queryFor below).
// It's "async", so it hands back a promise: the page arrives a moment later.
// Gives back { list, total (how many match in all), more (true if there's
// another page), major (your major, from your profile), near (where the
// "City or state" box was found on the map, or null), suggestions (ways to see
// more when only a few match, see MoreSuggestions) }
async function fetchPage(query, page) {
  const body = await api("/jobs/for-me?" + query + (page > 1 ? "&page=" + page : ""));
  // Our backend always sends a list. Anything else didn't come from it
  if (!Array.isArray(body.jobs)) {
    throw new Error("Couldn't reach the server. Try again in a minute.");
  }
  return {
    list: body.jobs.map(toOpportunity),
    total: body.total ?? body.jobs.length,
    more: body.more === true,
    major: body.major ?? "",
    near: body.near ?? null,
    suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
  };
}

// The filters before you change any (see FilterBar). within is how many miles
// around the city in "City or state" (25, like most job sites start at)
const noFilters = { level: "", setting: "", posted: "", deadline: "", paidOnly: false, include: "", exclude: "", location: "", within: "25" };

// Everything the page is showing, written as a web address's "?a=1&b=2" part
// for the backend. URLSearchParams takes care of spaces and odd letters.
// Empty filters are left out. Each hidden company is its own "hide=..."
// withRelated adds the fields next to your major (see MoreSuggestions)
function queryFor({ search, picked, sortBy, filters, forMajor, withRelated, hidden }) {
  const query = new URLSearchParams();
  if (search.trim()) query.set("q", search.trim());
  if (picked !== "All") query.set("type", typeValues[picked]);
  if (sortBy !== "newest") query.set("sort", sortBy);
  if (forMajor) query.set("major", withRelated ? "related" : "only");
  for (const name of ["level", "setting", "posted", "deadline", "include", "exclude", "location"]) {
    if (filters[name].trim()) query.set(name, filters[name].trim());
  }
  // the distance only matters with a city, and 25 is the backend's default too
  if (filters.location.trim() && filters.within !== "25") query.set("within", filters.within);
  if (filters.paidOnly) query.set("paid", "true");
  for (const company of hidden) query.append("hide", company);
  return query.toString();
}

// ---------- Hidden companies ----------
// "Hide jobs from Acme" in a job's pop-up. The list is kept in this browser,
// under your account (so on a shared computer, the next person has their own).
// try/catch: the browser's storage can be turned off; then it only lasts until
// you leave the page
const hiddenKey = "scoutsearch-hidden-companies";
function loadHidden() {
  try {
    const saved = JSON.parse(localStorage.getItem(accountKey(hiddenKey)));
    return Array.isArray(saved) ? saved.filter((name) => typeof name === "string") : [];
  } catch {
    return [];
  }
}
function saveHidden(list) {
  try {
    localStorage.setItem(accountKey(hiddenKey), JSON.stringify(list));
  } catch {
    // Storage is off: it still works until you leave the page
  }
}

// ---------- Helpers ----------

// Turns a date like "2027-06-28" into words, like "Jun 28".
// "options" says which parts to show, for example { month: "short" } gives "Jun".
// The "T00:00" means midnight, so the date doesn't slip back a day in some time zones.
function formatDate(date, options) {
  return new Date(date + "T00:00").toLocaleDateString("en-US", options);
}

// How long ago a time was, in words: "today", "yesterday", "3 days ago",
// "2 weeks ago", "4 months ago", or "over a year ago". It counts calendar days
// where you are, so a job posted at 11pm last night says "yesterday".
// Math.round handles the days that are 23 or 25 hours long (clocks changing)
function timeAgo(time) {
  const dayOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((dayOf(new Date()) - dayOf(new Date(time))) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  if (days < 30) return Math.floor(days / 7) === 1 ? "1 week ago" : Math.floor(days / 7) + " weeks ago";
  if (days < 365) return Math.floor(days / 30) === 1 ? "1 month ago" : Math.floor(days / 30) + " months ago";
  return "over a year ago";
}

// When an opportunity was posted, for its row and its pop-up:
// { label: "Posted", time } from the company's job site, or, if the site didn't
// say, { label: "Added to ScoutSearch", time } (when we found it), so it never
// claims a job is newer than it is. null if neither is known
function postedOf(opportunity) {
  if (opportunity.postedAt) return { label: "Posted", time: opportunity.postedAt };
  if (opportunity.addedAt) return { label: "Added to ScoutSearch", time: opportunity.addedAt };
  return null;
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

// The top of the page: the title, one sentence, and the search bar (the
// 2026-11 revamp: a calm title on the page, like a dashboard, instead of the
// old dark navy box).
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
          Real internships, co-ops, research positions, and programs, from company job boards.
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
          placeholder="Search by role, company, or city"
          value={props.search}
          onChange={(event) => props.setSearch(event.target.value)}
        />
      </form>
    </header>
  );
}

// The three summary boxes under the title: how many opportunities match your
// filters, how many are due soon, and how many are on your tracker. Like the
// number boxes at the top of a dashboard, so you see the big picture first.
// props.total is how many match, props.dueSoon is { count, first } for the jobs
// matching your filters that are due in the next 14 days (null until it arrives), props.trackerCount is how many
// are on your tracker, and props.loading is true while the jobs are still on their
// way (the numbers show "…" until then, not a wrong 0).
function SummaryBoxes(props) {
  // The first one due, for the note under the number ("First up: ...")
  const first = props.dueSoon?.first;

  return (
    // A list, so screen readers say "list, 3 items" (WCAG)
    <ul className="discovery-summary" aria-label="Summary">
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Match your filters</span>
        <span className="discovery-summary-number">{props.loading ? "…" : props.total.toLocaleString()}</span>
        <span className="discovery-summary-note">Internships, co-ops, research, and programs</span>
      </li>
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Due in the next 2 weeks</span>
        <span className="discovery-summary-number">{props.dueSoon ? props.dueSoon.count : "…"}</span>
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
// with the picked tab as a white pill (the revamp's "segmented" look).
// props.picked is the tab that's on right now, and props.setPicked changes it.
// (The tabs used to show a count each. The backend filters now, so the number
// for the picked tab is in the first summary box instead.)
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
// "View" or the job's title.
//
// It's a <dialog>, the browser's own pop-up. Opened with showModal(), the
// browser does the hard parts for us (WCAG):
//   - the page behind it is dimmed and can't be clicked or tabbed to
//   - the Escape key closes it
//   - when it closes, the keyboard goes back to the button that opened it
//
// What's passed in:
//   opportunity        the opportunity to show
//   ref                a reference to the <dialog>, so the row can open it.
//                      (In React 19, "ref" can be passed in like any other prop.)
//   saved, toggleSave  the same Save on/off as the row's button, and the
//                      function that flips it (and updates the tracker)
//   applied, onApply   true once Apply was pressed, and what Apply runs (it
//                      moves the job to Submitted on the tracker)
//
// { opportunity, ref, saved, ... } below "unpacks" the props: it's a
// shorter way of writing props.opportunity, props.ref, and so on. It's
// needed here because React's rules check that a ref is never read while
// the page is being drawn, and keeping it separate from the other props
// makes that clear.
function OpportunityDialog({ opportunity, ref, saved, toggleSave, applied, onApply, onHide }) {
  // A unique id for the title, so the dialog can be named by it (WCAG)
  const titleId = "discovery-dialog-title-" + opportunity.id;
  // true once the deadline has gone by: Apply then turns off (see the bottom)
  const closed = isPastDeadline(opportunity.deadline);
  // When it was posted (see postedOf above)
  const posted = postedOf(opportunity);

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
      {/* The top: the square logo, the title with who, where, and which site we
          found it on under it, then the kind of job as a small tag, and the X */}
      <div className="discovery-dialog-top">
        <span className="discovery-logo" aria-hidden="true">
          {opportunity.initials}
        </span>
        <div className="discovery-dialog-heading-words">
          <h2 id={titleId} className="discovery-dialog-title">
            {opportunity.title}
          </h2>
          <p className="discovery-dialog-facts">
            {opportunity.organization} · {opportunity.place} · via {opportunity.source}
          </p>
          <p className="discovery-dialog-tags">
            {/* The same colored tag as the table (typeTagClass, further down) */}
            <span className={typeTagClass[opportunity.type]}>{opportunity.type}</span>
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
        {/* The quick facts, as labels and values (dl = description list).
            Real jobs often leave pay or a deadline out, so each one only shows
            when the job has it. "&&" means: only draw the part on the right if
            the left side is there. The whole list is left out if all are missing. */}
        {(posted || opportunity.pay || opportunity.deadline) && (
          <dl className="discovery-dialog-facts-grid">
            {/* "Posted Nov 3, 2026" with "2 weeks ago" under it */}
            {posted && (
              <div>
                <dt>{posted.label}</dt>
                <dd>
                  <time dateTime={posted.time}>
                    {new Date(posted.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </time>
                  <span className="discovery-dialog-ago">{timeAgo(posted.time)}</span>
                </dd>
              </div>
            )}
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

        {/* How well it fits you, and why (only if your profile says enough) */}
        {opportunity.fit?.score != null && (
          <>
            <h3 className="discovery-dialog-heading">Why it fits you: {opportunity.fit.score}%</h3>
            {opportunity.fit.reasons.length > 0 ? (
              <ul className="discovery-fit-list">
                {opportunity.fit.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="discovery-dialog-text">Nothing on your profile matches it yet.</p>
            )}
          </>
        )}

        {opportunity.description && (
          <>
            <h3 className="discovery-dialog-heading">About the role</h3>
            {/* The description is plain text (the backend removes any HTML), and
                React shows it as text, so nothing in it can run as code */}
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

        {/* Not interested in this company? Its jobs stop showing (you can show
            them again under "More filters"). It closes the pop-up first */}
        <button
          type="button"
          className="discovery-hide-company"
          onClick={() => {
            ref.current?.close();
            onHide(opportunity.organization);
          }}
        >
          Hide jobs from {opportunity.organization}
        </button>
      </div>

      {/* The bottom: a note on the left, Save and Apply on the right.
          It stays put while the middle scrolls. */}
      <div className="discovery-dialog-bottom">
        {/* After Apply, it says where the job went on your tracker. role="status"
            makes screen readers read that out (WCAG). It's inside the pop-up
            because while it's open, the page behind it is shut off, and screen
            readers don't hear messages from there */}
        <p className="discovery-dialog-message" role="status">
          {applied
            ? "Moved to Submitted on My applications. (Didn't send it? Move it back there.)"
            : "You'll apply on " + opportunity.organization + "'s own site."}
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
              also stops it from being clicked or reached with Tab).
              Before it, Apply opens the original posting in a new tab, so students
              apply on the real site. It's a link (<a>), not a button, because it
              goes somewhere. target="_blank" opens a new tab; rel="noopener
              noreferrer" stops that other site from controlling or seeing this tab.
              aria-label warns that a new tab opens, and starts with the visible
              word "Apply" so voice control still works (WCAG). */}
          {closed ? (
            <button type="button" className="discovery-solid-button" disabled>
              Applications closed
            </button>
          ) : (
            opportunity.applyUrl && (
              <a
                href={opportunity.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="discovery-solid-button"
                aria-label={"Apply to " + opportunity.title + " (opens in a new tab)"}
                // the posting opens, and the job goes in Submitted on your tracker
                onClick={onApply}
              >
                Apply
                <ArrowIcon />
              </a>
            )
          )}
        </div>
      </div>
    </dialog>
  );
}

// The colored tag for each kind of job. Each kind has its own color, and
// the word is always written in it too, so it never relies on color alone (WCAG)
const typeTagClass = {
  Internship: "discovery-type-tag discovery-type-internship",
  "Co-op": "discovery-type-tag discovery-type-coop",
  Research: "discovery-type-tag discovery-type-research",
  Program: "discovery-type-tag discovery-type-program",
};

// One row of the table: one opportunity.
// props.opportunity is one { } from the opportunities list.
function OpportunityRow(props) {
  // A shorter name, so we can write opportunity.title instead of props.opportunity.title.
  const opportunity = props.opportunity;
  // When it was posted (see postedOf near the top of this file)
  const posted = postedOf(opportunity);

  // The Save button (on/off) is "on" while this job is on the Application
  // tracker. It reads the tracker's list instead of remembering its own, so it
  // stays right when the list changes some other way: your account's list
  // arriving (a job you saved on another device), or Save in another tab.
  // The pop-up uses the same one, so saving in either place saves both.
  const trackerItems = useTrackerItems();
  const saved = trackerItems.some((item) => item.id === opportunity.id);
  // What screen readers hear after Save is pressed (see the end of the row)
  const [announcement, setAnnouncement] = useState("");
  // true once Apply was pressed in the pop-up (it then says where the job went)
  const [applied, setApplied] = useState(false);

  // Apply was pressed: the posting opens in a new tab (the link does that),
  // and the job goes in the tracker's "Submitted" column, saved or not
  function apply() {
    markApplied(opportunity.id, {
      title: opportunity.title,
      organization: opportunity.organization,
      deadline: opportunity.deadline,
      initials: opportunity.initials,
      link: opportunity.applyUrl ?? null,
    });
    setApplied(true);
  }

  // Runs when Save is pressed, in the row or in the pop-up.
  // Saving puts the job in the tracker's "Saved" column; pressing again
  // ("Saved") takes it off the tracker. Either way, it's saved to your account.
  // The title, company, deadline, and initials are kept with it, so the
  // tracker can show the job right away (and when the server can't be reached)
  function toggleSave() {
    if (saved) {
      removeFromTracker(opportunity.id);
      setAnnouncement("");
    } else {
      setAnnouncement("Saved to My applications.");
      addToTracker(opportunity.id, {
        title: opportunity.title,
        organization: opportunity.organization,
        deadline: opportunity.deadline,
        initials: opportunity.initials,
        link: opportunity.applyUrl ?? null,
      });
    }
    // (No more to do: the list changed, so this button and "On your tracker"
    // at the top redraw by themselves)
  }
  // A reference to this row's pop-up, so "View" can open it
  const dialogRef = useRef(null);
  // A reference to this row's View button (see the useEffect below)
  const viewButtonRef = useRef(null);

  // If the Feed page sent you here for THIS job ("/discovery?job=..."), open its
  // pop-up as soon as the row is on the screen. props.openOnArrival is true
  // only for that job. After opening, props.onOpened clears the "?job=...", so
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
      {/* Role: the square logo, the title, and the organization (with which
          site we found the job on: every outside job says where it's from).
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
              {opportunity.organization} · via {opportunity.source}
            </span>
            {/* "Posted 3 days ago". <time> holds the exact time for computers */}
            {posted && (
              <span className="discovery-role-posted">
                {posted.label} <time dateTime={posted.time}>{timeAgo(posted.time)}</time>
              </span>
            )}
            {/* How well it fits you (the pop-up says why) */}
            {opportunity.fit?.score != null && <span className="discovery-fit">{opportunity.fit.score}% fit</span>}
          </span>
        </span>
      </td>

      <td data-label="Type">
        <span className={typeTagClass[opportunity.type]}>{opportunity.type}</span>
      </td>

      <td data-label="Location">{opportunity.place}</td>

      {/* Many real jobs don't say what they pay, so this says so instead of
          leaving the box empty ("??" = use "Not listed" if pay is null) */}
      <td data-label="Pay" className="discovery-cell-nowrap">
        {opportunity.pay ?? "Not listed"}
      </td>

      <td data-label="Apply by">
        {/* Many real jobs don't list a deadline, so this says so instead of a
            broken date. "? :" picks one of the two */}
        {opportunity.deadline ? (
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
        ) : (
          "No deadline listed"
        )}
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

        {/* Hidden on screen. Screen readers hear it when Save is pressed (WCAG).
            Only then: not when "saved" changes by itself (your account's list
            arriving would otherwise make every saved row speak at once) */}
        <span className="sr-only" role="status">
          {announcement}
        </span>

        {/* The pop-up. It's on the page all the time but hidden until it's opened. */}
        <OpportunityDialog
          opportunity={opportunity}
          ref={dialogRef}
          saved={saved}
          toggleSave={toggleSave}
          applied={applied}
          onApply={apply}
          onHide={props.onHide}
        />
      </td>
    </tr>
  );
}

// The words on each "Want more?" button. The backend sends what it found
// (backend/src/jobs.ts, pickJobs): { kind, count, and within or majors }
function suggestionWords(suggestion) {
  const count = suggestion.count.toLocaleString();
  if (suggestion.kind === "wider") return "Show " + count + " more within " + suggestion.within + " miles";
  if (suggestion.kind === "remote") return "See " + count + " remote " + (suggestion.count === 1 ? "job" : "jobs") + " instead";
  return "Add " + count + " from related fields (" + suggestion.majors.join(", ") + ")";
}

// "Want more?": when only a few jobs match, buttons that widen the search, so a
// small city or a narrow major isn't a dead end. props.suggestions is the
// backend's list, props.onPick(suggestion) changes the filters to match it.
// props.inBox is true inside "No opportunities match" (it has its own box there)
function MoreSuggestions(props) {
  if (props.suggestions.length === 0) return null;
  const list = (
    // a list, so screen readers say how many buttons there are (WCAG)
    <ul className="discovery-suggestion-list">
      {props.suggestions.map((suggestion) => (
        // kind is different for each one, so it works as the key
        <li key={suggestion.kind}>
          <button type="button" className="discovery-outline-button" onClick={() => props.onPick(suggestion)}>
            {suggestionWords(suggestion)}
          </button>
        </li>
      ))}
    </ul>
  );
  if (props.inBox) return list;
  const word = props.total === 1 ? "opportunity matches" : "opportunities match";
  return (
    <div className="discovery-suggestions">
      <p className="discovery-suggestions-text">
        Only {props.total} {word}. Want more?
      </p>
      {list}
    </div>
  );
}

// The list of opportunities: the table, with the count and "Show more" under it.
// props.results is what the backend sent ({ list, total, more }), or null while
// the first answer is on its way. props.loadError is true if getting them
// failed (props.retry tries again). props.updating is true while new filters
// are loading (the old list stays on screen until then)
function ResultsSection(props) {
  // While waiting the first time, or if it failed, show a message in place of
  // the table. role="status" reads it out when it appears (WCAG).
  // It reuses the "nothing here" box below, so it needs no new styles.
  if (props.results === null || props.loadError) {
    return (
      <section className="discovery-results" aria-labelledby="discovery-results-title">
        <h2 id="discovery-results-title" className="sr-only">
          Opportunities
        </h2>
        <div className="discovery-empty" role="status">
          {props.loadError ? (
            <>
              <p className="discovery-empty-title">Couldn't load opportunities</p>
              <p className="discovery-empty-text">Check your connection, then try again.</p>
              <button type="button" className="discovery-outline-button" onClick={props.retry}>
                Try again
              </button>
            </>
          ) : (
            <p className="discovery-empty-title">Loading opportunities...</p>
          )}
        </div>
      </section>
    );
  }

  const shown = props.results.list;
  const total = props.results.total;
  // the "Want more?" buttons, but not while new filters load (they'd be for the old ones)
  const suggestions = props.updating ? [] : props.results.suggestions;
  // "opportunity" for 1, "opportunities" for anything else.
  const word = total === 1 ? "opportunity" : "opportunities";
  // What the table is sorted by, for screen readers
  const sortWords = { newest: "newest first", fit: "best fit first", deadline: "soonest deadline first", company: "by company, A to Z" };

  return (
    // aria-labelledby names this section with the heading's words (WCAG)
    <section className="discovery-results" aria-labelledby="discovery-results-title">
      {/* A heading for screen readers only (sr-only), so the list has a
          name in the page's outline. The tabs already show it on screen. */}
      <h2 id="discovery-results-title" className="sr-only">
        Opportunities
      </h2>

      {/* If nothing passes the filters, show a message and a way back.
          Otherwise, show the table. "? :" picks one of the two. */}
      {shown.length === 0 ? (
        <div className="discovery-empty">
          <p className="discovery-empty-title">No opportunities match</p>
          <p className="discovery-empty-text">
            {suggestions.length > 0 ? "Try one of these to see more:" : "Try different words, fewer filters, or another tab."}
          </p>
          <MoreSuggestions suggestions={suggestions} onPick={props.onSuggestion} inBox />
          <button type="button" className="discovery-outline-button" onClick={props.showAll}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
        {/* "Only 1 opportunity matches. Want more?" (only when a few match) */}
        <MoreSuggestions suggestions={suggestions} total={total} onPick={props.onSuggestion} />
        {/* The white box around the table. On small screens the table can't
            fit, so it turns into one box per opportunity instead (index.css) */}
        <div className="discovery-table-box">
          <table className="discovery-table">
            {/* The table's name, for screen readers (WCAG) */}
            <caption className="sr-only">Opportunities, {sortWords[props.sortBy]}</caption>
            <thead>
              <tr>
                {/* scope="col" tells screen readers each one names a column (WCAG) */}
                <th scope="col">Role</th>
                <th scope="col">Type</th>
                <th scope="col">Location</th>
                <th scope="col">Pay</th>
                <th scope="col">Apply by</th>
                {/* The buttons' column has no words on screen, but screen readers get a name */}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((opportunity) => (
                <OpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  // true only for the job the Feed page linked to (see Discovery below)
                  openOnArrival={opportunity.id === props.openJobId}
                  onOpened={props.onOpened}
                  onHide={props.onHide}
                />
              ))}
            </tbody>
          </table>

          {/* The bottom of the box: the count, and "Show more" if there are
              more. role="status" reads the new count out when it changes (WCAG) */}
          <div className="discovery-more-row">
            <p className="discovery-results-count" role="status">
              {props.updating ? "Updating..." : "Showing " + shown.length.toLocaleString() + " of " + total.toLocaleString() + " " + word}
            </p>
            {props.results.more && (
              <button type="button" className="discovery-outline-button" onClick={props.showMore} disabled={props.loadingMore}>
                {props.loadingMore ? "Loading..." : "Show more"}
              </button>
            )}
          </div>
        </div>
        </>
      )}
    </section>
  );
}

// The filters, under the tabs. props.filters is what's picked ({ level, setting,
// ... }, see noFilters near the top), and props.change(name, value) changes one.
// "For your major" is a separate on/off (props.forMajor, props.setForMajor),
// because it starts on when your profile has a major.
// props.hidden is the companies you've hidden, and props.unhide shows one again
function FilterBar(props) {
  const filters = props.filters;
  // true while a box in "More filters" has something in it, so it starts open
  const moreInUse = filters.include || filters.exclude || filters.location || props.hidden.length > 0;

  return (
    // aria-labelledby names the box (WCAG)
    <section className="discovery-filters" aria-labelledby="discovery-filters-title">
      <h2 id="discovery-filters-title" className="sr-only">
        Filters
      </h2>
      <div className="discovery-filter-row">
        {/* "For your major": on/off. Without a major on your profile, it's a
            link to add one instead */}
        {props.major ? (
          <button
            type="button"
            className="discovery-chip"
            aria-pressed={props.forMajor}
            onClick={() => props.setForMajor(!props.forMajor)}
          >
            {/* The check mark only shows while it's on; the words say the same */}
            {props.forMajor && <span aria-hidden="true">✓ </span>}
            {/* "and related fields" after you pick "Add ... from related fields" */}
            {props.forMajor && props.withRelated ? "For your major and related fields" : "For your major"} ({props.major})
          </button>
        ) : (
          <Link to="/editprofile#basics" className="discovery-text-link">
            Add your major to see jobs for it
            <ArrowIcon />
          </Link>
        )}

        {/* Each menu has a real label above it (WCAG) */}
        <label className="discovery-filter">
          Who it's for
          <select className="discovery-sort-select" value={filters.level} onChange={(e) => props.change("level", e.target.value)}>
            <option value="">Anyone</option>
            <option value="high-school">High school students</option>
            <option value="college">College students</option>
          </select>
        </label>
        <label className="discovery-filter">
          Where
          <select className="discovery-sort-select" value={filters.setting} onChange={(e) => props.change("setting", e.target.value)}>
            <option value="">Anywhere</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on-site">On-site</option>
          </select>
        </label>
        <label className="discovery-filter">
          Posted
          <select className="discovery-sort-select" value={filters.posted} onChange={(e) => props.change("posted", e.target.value)}>
            <option value="">Any time</option>
            <option value="day">In the last day</option>
            <option value="week">In the last week</option>
            <option value="month">In the last month</option>
          </select>
        </label>
        <label className="discovery-filter">
          Deadline
          <select className="discovery-sort-select" value={filters.deadline} onChange={(e) => props.change("deadline", e.target.value)}>
            <option value="">Any</option>
            <option value="has">Has a deadline</option>
            <option value="soon">Due in the next 2 weeks</option>
          </select>
        </label>
        <label className="discovery-check">
          <input type="checkbox" checked={filters.paidOnly} onChange={(e) => props.change("paidOnly", e.target.checked)} />
          Paid only
        </label>
      </div>

      {/* <details> opens and closes by itself, and tells screen readers if it's open */}
      <details className="discovery-more-filters" open={moreInUse ? true : undefined}>
        <summary>More filters</summary>
        <div className="discovery-filter-row">
          {/* aria-describedby reads the tip with the label (WCAG) */}
          <label className="discovery-filter">
            Must mention
            <input
              className="discovery-filter-input"
              type="text"
              placeholder="e.g. Python, Spanish"
              aria-describedby="discovery-words-hint"
              value={filters.include}
              onChange={(e) => props.change("include", e.target.value)}
            />
          </label>
          <label className="discovery-filter">
            Leave out
            <input
              className="discovery-filter-input"
              type="text"
              placeholder="e.g. PhD, US citizen"
              aria-describedby="discovery-words-hint"
              value={filters.exclude}
              onChange={(e) => props.change("exclude", e.target.value)}
            />
          </label>
          <label className="discovery-filter">
            City or state
            <input
              className="discovery-filter-input"
              type="text"
              autoComplete="address-level2"
              placeholder="e.g. Worcester or MA"
              value={filters.location}
              onChange={(e) => props.change("location", e.target.value)}
            />
          </label>
          {/* How far around the city to look. Only shown once the box was
              found as a city (not a state, or a place we couldn't find),
              since it does nothing otherwise. props.nearCity is the last city
              found, so it doesn't flicker while new results load */}
          {filters.location.trim() && props.nearCity && (
            <label className="discovery-filter">
              Distance
              <select className="discovery-sort-select" value={filters.within} onChange={(e) => props.change("within", e.target.value)}>
                <option value="10">Within 10 miles</option>
                <option value="25">Within 25 miles</option>
                <option value="50">Within 50 miles</option>
                <option value="100">Within 100 miles</option>
              </select>
            </label>
          )}
          {/* Where the backend found the city or state on the map, so you can
              tell if it picked the right Worcester. role="status" reads it out
              when it changes (WCAG). props.near is undefined while it loads,
              and null when the place wasn't found */}
          {filters.location.trim() && (
            <p className="discovery-near" role="status">
              {props.near === undefined
                ? ""
                : props.near?.city
                  ? "Within " + props.near.within + " miles of " + props.near.city + "."
                  : props.near?.state
                    ? "Jobs in " + props.near.state + "."
                    : "Couldn't find \"" + filters.location.trim() + "\" on the map, so this matches the words in each job's location."}
            </p>
          )}
        </div>
        <p className="discovery-filter-hint" id="discovery-words-hint">
          Put commas between words. Each one is matched as a whole word in the job's title, description, and requirements.
        </p>

        {props.hidden.length > 0 && (
          <div className="discovery-hidden">
            Hidden companies:
            <ul className="discovery-hidden-list">
              {props.hidden.map((company) => (
                <li key={company} className="discovery-hidden-item">
                  {company}
                  {/* aria-label says which company (every one has this button) (WCAG) */}
                  <button type="button" className="discovery-unhide" aria-label={"Show " + company + " again"} onClick={() => props.unhide(company)}>
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      {props.inUse && (
        <div className="discovery-filter-actions">
          <button type="button" className="discovery-outline-button" onClick={props.clear}>
            Clear filters
          </button>
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
      Best fit uses your major, skills, and what you're looking for (from your profile), and your resume's
      skills and experience. The more you fill in, the better it gets.{" "}
      <Link to="/editprofile" className="discovery-text-link">
        Edit profile
        <ArrowIcon />
      </Link>
    </p>
  );
}

// Waits this many milliseconds (for checking how Refresh is going)
function wait(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

// Discovery is the whole page. It puts the pieces above together, and it
// remembers the search, the tab, the sort, and the filters, so everything stays in sync.
function Discovery() {
  // What's typed in the search bar. Starts empty.
  const [search, setSearch] = useState("");
  // Which tab is picked. Starts on "All".
  const [picked, setPicked] = useState("All");
  // How the list is sorted: "newest", "fit" (best fit), "deadline", or "company"
  const [sortBy, setSortBy] = useState("newest");
  // The filters (see noFilters near the top)
  const [filters, setFilters] = useState(noFilters);
  // "For your major": null means "you haven't touched it", which means on if
  // your profile has a major. The button sets it to true or false
  const [majorChoice, setMajorChoice] = useState(null);
  // The companies you've hidden (kept in this browser, see loadHidden)
  const [hidden, setHidden] = useState(() => loadHidden());

  // Your profile's major ("" if none, or undecided)
  const profile = useMyProfile();
  const major = profile.data.major === undecided ? "" : profile.data.major.trim();
  const forMajor = major !== "" && (majorChoice ?? true);
  // "Add ... from related fields" (a "Want more?" button) turns this on: "For
  // your major" then also shows the fields next to it. Turning "For your
  // major" off turns this off too
  const [withRelated, setWithRelated] = useState(false);

  // "Who it's for" starts at your level, from the school on your profile: a high
  // school senior starts on what high schoolers can apply to, a college student on
  // college jobs, so nobody starts on a list of jobs they can't get. (The same
  // check the backend's Best fit uses, backend/src/fit.ts.) levelChoice is null
  // until you pick one yourself; picking "Anyone" shows everything
  const [levelChoice, setLevelChoice] = useState(null);
  const school = profile.data.school.trim();
  // only when the name says which it is: "Worcester Academy" or "Boston Latin
  // School" could be either, so those start on "Anyone"
  const profileLevel = /high school|\bhs\b/i.test(school)
    ? "high-school"
    : /universit|college|institute|polytechnic/i.test(school)
      ? "college"
      : "";
  // the filters as they show on screen, with that level in them
  const shownFilters = { ...filters, level: levelChoice ?? profileLevel };

  // Everything above, written for the backend (see queryFor)
  const query = queryFor({ search, picked, sortBy, filters: shownFilters, forMajor, withRelated, hidden });

  // What the backend sent: { query (which filters it's for), list, total, more,
  // page }. null until the first answer arrives
  const [results, setResults] = useState(null);
  // true if getting the jobs failed, so the list can show "Try again"
  const [loadError, setLoadError] = useState(false);
  // Counts "Try again" and Refresh presses. Changing it makes the useEffect
  // below run again (it's in the [ ] list at the end).
  const [tries, setTries] = useState(0);
  // true while "Show more" is loading
  const [loadingMore, setLoadingMore] = useState(false);
  // Everything due in the next 2 weeks, for the summary box: { count, first }
  const [dueSoon, setDueSoon] = useState(null);
  // Refresh: true while it's checking, and what it says after
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");

  // Asks the backend for the first page whenever the filters change (and
  // after each "Try again" or Refresh). It waits 0.3 seconds first, so typing a
  // word in a box is one request, not one per letter. The old list stays on
  // screen until the new one arrives
  useEffect(() => {
    // If the filters change again (or you leave) before the answer arrives,
    // "ignore" becomes true (in the cleanup at the bottom), so an old answer
    // never replaces a newer one
    let ignore = false;
    const timer = setTimeout(() => {
      fetchPage(query, 1)
        .then((page) => {
          if (!ignore) {
            setResults({ query: query, ...page, page: 1 });
            setLoadError(false);
          }
        })
        .catch((error) => {
          // The real reason goes to the console (F12); the page shows a simple message
          console.error("Loading jobs failed:", error);
          if (!ignore) setLoadError(true);
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, tries]);

  // The jobs due in the next 2 weeks, for the summary box. Same filters as the
  // list (your major, search, tab, ...), but only ones due soon, soonest first,
  // so it agrees with "Match your filters" next to it. (It used to count every
  // job on the site, so a CS major's "First up" could be any field's job)
  const dueSoonQuery = queryFor({ search, picked, sortBy: "deadline", filters: { ...shownFilters, deadline: "soon" }, forMajor, withRelated, hidden });
  useEffect(() => {
    let ignore = false;
    // waits 0.3 seconds like the list, so typing a word is one request, not one per letter
    const timer = setTimeout(() => {
      fetchPage(dueSoonQuery, 1)
        .then((page) => {
          if (!ignore) setDueSoon({ count: page.total, first: page.list[0] });
        })
        .catch(() => {
          // The box just keeps showing "…"
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [dueSoonQuery, tries]);

  // true while the list on screen is for older filters
  const updating = results !== null && results.query !== query;

  // Runs when "Try again" is pressed: back to "Loading...", then ask again
  function retry() {
    setResults(null);
    setLoadError(false);
    setTries(tries + 1);
  }

  // "Show more": the next 50, added under the ones showing
  async function showMore() {
    setLoadingMore(true);
    try {
      const page = await fetchPage(results.query, results.page + 1);
      // (only if the filters haven't changed meanwhile: then the new list stays as it is)
      setResults((now) => !now || now.query !== results.query ? now : {
        ...now,
        // .some() leaves out any job that's already showing, so none shows twice
        list: [...now.list, ...page.list.filter((job) => !now.list.some((j) => j.id === job.id))],
        more: page.more,
        page: now.page + 1,
      });
    } catch (error) {
      console.error("Loading more jobs failed:", error);
    }
    setLoadingMore(false);
  }

  // Changes one filter
  function changeFilter(name, value) {
    // "Who it's for" is kept on its own (see levelChoice above)
    if (name === "level") setLevelChoice(value);
    else setFilters({ ...filters, [name]: value });
  }

  // The "For your major" button: on or off (off also drops the related fields)
  function chooseMajor(on) {
    setMajorChoice(on);
    if (!on) setWithRelated(false);
  }

  // A "Want more?" button (MoreSuggestions): changes the filters to what it said
  function pickSuggestion(suggestion) {
    if (suggestion.kind === "wider") changeFilter("within", String(suggestion.within));
    // remote jobs aren't in a city, so the city comes out
    if (suggestion.kind === "remote") setFilters({ ...filters, location: "", setting: "remote" });
    if (suggestion.kind === "related") setWithRelated(true);
  }

  // "Clear filters" (and "Show all opportunities"): the search, the tab, and
  // every filter back to the start. "For your major" turns off (it's a filter
  // too); your hidden companies stay hidden
  function clearFilters() {
    setSearch("");
    setPicked("All");
    setFilters(noFilters);
    setLevelChoice("");
    setMajorChoice(false);
    setWithRelated(false);
  }
  const filtersInUse = JSON.stringify(shownFilters) !== JSON.stringify(noFilters) || search.trim() !== "" || picked !== "All" || forMajor;

  // "Hide jobs from Acme" (in a job's pop-up), and "Show again" (under More filters)
  function hideCompany(company) {
    const next = [...hidden.filter((c) => c !== company), company];
    setHidden(next);
    saveHidden(next);
  }
  function unhideCompany(company) {
    const next = hidden.filter((c) => c !== company);
    setHidden(next);
    saveHidden(next);
  }

  // Refresh: asks the server to check the job sites for new listings (at most
  // once every 30 minutes for the whole site), waits for it (checking every 5
  // seconds, for up to 3 minutes), then loads the list again
  async function refresh() {
    setRefreshing(true);
    setRefreshMessage("Checking the job sites for new listings. This can take a minute...");
    try {
      const answer = await api("/jobs/refresh", { method: "POST" });
      let info = answer.refresh;
      if (answer.started || info.running) {
        for (let i = 0; i < 36 && info.running; i++) {
          await wait(5000);
          info = (await api("/jobs/refresh")).refresh;
        }
        setRefreshMessage(info.running ? "Still checking. New jobs will show up in a few minutes." : "Up to date: the job sites were just checked.");
      } else {
        // Someone checked less than 30 minutes ago: the list already has what they found
        const next = new Date(info.next_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        setRefreshMessage("Up to date: the job sites were checked recently. You can check again after " + next + ".");
      }
    } catch (error) {
      setRefreshMessage("Couldn't check the job sites: " + error.message);
    }
    setTries((n) => n + 1);
    setRefreshing(false);
  }

  // The extra info at the end of the address. For "/discovery?job=abc",
  // searchParams.get("job") gives "abc". setSearchParams changes it.
  const [searchParams, setSearchParams] = useSearchParams();
  // The job to open right away, or null if the address has no "?job=".
  // Real job ids are long codes (uuids) like "3f2a...", so it stays as text.
  const openJobId = searchParams.get("job");

  // Runs after that job's pop-up opens: removes "?job=..." from the address.
  // replace: true swaps the address instead of adding a new one, so the
  // browser's Back button still goes back to the Feed page.
  function clearOpenJob() {
    setSearchParams({}, { replace: true });
  }

  // If the linked job isn't in the list (it's further down, or a filter hides
  // it), get it on its own and show it at the top, so its pop-up can open.
  // It's kept with the filters it came with ({ query, job })
  const [linkedJob, setLinkedJob] = useState(null);
  useEffect(() => {
    if (!openJobId || !results || results.list.some((job) => job.id === openJobId)) return;
    // Only a real job id (a uuid) is asked for. The address can be changed by anyone who
    // sends you a link, and something like "../account/export" would otherwise make your
    // browser call a different part of the API with your login
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(openJobId)) return;
    let ignore = false;
    api("/jobs/" + encodeURIComponent(openJobId))
      .then((body) => {
        if (!ignore && body.job) setLinkedJob({ query: results.query, job: toOpportunity(body.job) });
      })
      .catch(() => {
        // Not found (or no internet): nothing to open
      });
    return () => {
      ignore = true;
    };
  }, [openJobId, results]);
  const shownResults =
    results && linkedJob && linkedJob.query === results.query && !results.list.some((job) => job.id === linkedJob.job.id)
      ? { ...results, list: [linkedJob.job, ...results.list] }
      : results;

  // The tracker count: how many items on the tracker have a job behind them
  // (trackerJob), so it matches what the Application tracker page shows.
  // useTrackerItems redraws the page whenever the list changes (a Save, or
  // your account's list arriving), so the number is always up to date.
  // useTrackerSync syncs with your account when the page opens
  const trackerItems = useTrackerItems();
  useTrackerSync();
  const trackerCount = trackerItems.filter((item) => trackerJob(item)).length;

  return (
    <>
      <title>Opportunities | ScoutSearch</title>
      <NavBar />
      {/* One column, like a dashboard: the title and search, the summary
          boxes, the tabs and Sort, the filters, then the table */}
      <main className="discovery-page">
        <DiscoveryHeader search={search} setSearch={setSearch} />
        <SummaryBoxes total={results?.total ?? 0} dueSoon={dueSoon} trackerCount={trackerCount} loading={results === null} />

        {/* The tabs on the left; Sort and Refresh on the right */}
        <div className="discovery-toolbar">
          <TypeTabs picked={picked} setPicked={setPicked} />

          <div className="discovery-refresh">
            {/* The Sort menu. value is what's chosen right now; onChange
                runs when you pick another one. The backend sorts every job */}
            <div className="discovery-sort">
              <label htmlFor="discovery-sort-select">Sort by</label>
              <select
                id="discovery-sort-select"
                className="discovery-sort-select"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="newest">Newest</option>
                <option value="fit">Best fit for you</option>
                <option value="deadline">Deadline (soonest)</option>
                <option value="company">Company (A to Z)</option>
              </select>
            </div>
            {/* Refresh: checks the job sites for new listings (see refresh above) */}
            <button type="button" className="discovery-outline-button" onClick={refresh} disabled={refreshing}>
              {refreshing ? "Checking..." : "Refresh"}
            </button>
          </div>
        </div>
        {/* What Refresh found. role="status" reads it out (WCAG) */}
        <p className="discovery-refresh-message" role="status">
          {refreshMessage}
        </p>

        <FilterBar
          filters={shownFilters}
          change={changeFilter}
          major={major}
          forMajor={forMajor}
          setForMajor={chooseMajor}
          withRelated={withRelated}
          // where "City or state" was found, or undefined while the answer for it is on its way
          near={results && !updating ? results.near : undefined}
          // the last city the box was found as, for showing the Distance menu
          nearCity={results?.near?.city ?? ""}
          hidden={hidden}
          unhide={unhideCompany}
          inUse={filtersInUse}
          clear={clearFilters}
        />

        <ResultsSection
          results={shownResults}
          loadError={loadError}
          retry={retry}
          updating={updating}
          sortBy={sortBy}
          showAll={clearFilters}
          onSuggestion={pickSuggestion}
          showMore={showMore}
          loadingMore={loadingMore}
          openJobId={openJobId}
          onOpened={clearOpenJob}
          onHide={hideCompany}
        />

        <ProfileTip />
      </main>
    </>
  );
}

// "export default" lets App.jsx import this page.
export default Discovery;
