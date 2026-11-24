// Discovery.jsx is the Discovery page (yoursite.com/discovery).
// It shows real internships, co-ops, research positions, and programs.
// The jobs come from our backend (GET /api/jobs/for-me), which gets them from
// company job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable), lists
// like SimplifyJobs, USAJOBS, JSearch, and Adzuna. See backend/src/jobs.ts.
// The backend does the filtering, sorting, and "best fit" scoring (backend/src/fit.ts)
// across every job, and sends 50 at a time, one page each (Previous and Next
// under the table go to the page before or after it).
// Anyone can open it without an account: guests see the public list (GET /api/jobs)
// with fewer filters, and no parts that need an account (see "Guests" below).
// A link can set "Who it's for": /discovery?level=high-school (or college).
// The styles for this page are in index.css, under "Discovery page".
//
// Since the 2026-11 revamp it's laid out like a dashboard, one column:
//   1. DiscoveryHeader   the title, one sentence, and the search bar
//   2. SummaryBoxes      three number boxes: open to you, due soon, on your tracker
//   3. TypeTabs + Sort   tabs (All, Internship, Co-op, Research, Program), Sort, and Refresh
//   4. FilterBar         "For your major", who it's for, where, posted, deadline, paid,
//                        and "More filters" (must mention, leave out, city, hidden companies)
//   5. ResultsSection    the table: one row per opportunity (OpportunityRow), and Previous / Next
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
// "?job=..." in "/discovery?job=..." (a shared link to one job), or "?level=..."
import { Link, useSearchParams } from "react-router";
// NavBar is the bar across the top of the page. It lives in its own file
// (components/NavBar.jsx) because every page uses it.
import NavBar from "../components/NavBar.jsx";
// For guests' simpler top bar (GuestBar below): the logo, and the sun/moon button
import SiteLogo from "../components/SiteLogo.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

// api() is how pages talk to our backend (src/api.js).
import { api } from "../api.js";
// Your profile, for "For your major" and high school or college (data/profile.js),
// and saving that choice (LevelPrompt). And the "undecided" choice (data/majors.js)
import { latestProfile, saveProfile, useMyProfile } from "../data/profile.js";
import { undecided } from "../data/majors.js";
// accountKey keeps each account's hidden companies apart on a shared computer, and
// useLoggedInId says who's logged in (null for a guest, see "Guests" below) (login-status.js)
import { accountKey, useLoggedInId } from "../login-status.js";
// isPastDeadline says if a job's deadline has gone by (it then says "Closed").
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
  // found by "Search the web" (WebSearch below), then checked on its hiring site
  web: "AI web search",
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
    // "open", or "closed" once the company took the posting down. The list only has open
    // jobs, but a job opened from a link ("?job=...") can be closed (see isClosed below)
    status: job.status ?? "open",
    source: sourceNames[job.source] ?? job.source,
    // When the company posted it (an ISO time), or null if its job site didn't say.
    // addedAt is when ScoutSearch first saved it, shown only when postedAt is missing
    postedAt: job.posted_at ?? null,
    addedAt: job.created_at ?? null,
    // How well it fits you: { score (0-100, or null if your profile doesn't say
    // enough yet), reasons ["Fits your major...", ...] } (backend/src/fit.ts)
    fit: job.fit ?? null,
    // "Can I apply?": each thing the job asks for, marked from your profile and
    // resume (checklistFor in backend/src/fit.ts, shown by ApplyChecklist).
    // Only items with words and one of the four known marks are kept, so an odd
    // answer can't break the pop-up. null when there isn't one: guests, and a
    // job opened from a link (see checklistOf below)
    checklist: checklistOf(job),
  };
}

// The checklist of a job from the backend, keeping only items with words and
// one of the four known marks (checkWords, under "Can I apply?" below), or null
// if there's nothing to show
function checklistOf(job) {
  if (!Array.isArray(job.checklist)) return null;
  const kept = job.checklist.filter((item) => item && typeof item.text === "string" && Object.hasOwn(checkWords, item.status));
  return kept.length > 0 ? kept : null;
}

// Asks the backend for one page (50) of the jobs that pass the filters, and
// turns each one into the page's shape. path is which list and the filters,
// written the way a web address carries them: "/jobs/for-me?type=co-op&sort=fit"
// for a logged-in student (see queryFor below), or "/jobs?type=co-op" for a
// guest (the public list, see guestQueryFor below).
// It's "async", so it hands back a promise: the page arrives a moment later.
// Gives back { list, total (how many match in all, or null when the backend
// doesn't say), more (true if there's another page), major (your major, from
// your profile), majorIgnored (true if "For your major" was skipped, because
// the backend has no words to look for in the major you typed, see FilterBar),
// near (where the "City or state" box was found on the map, or null),
// suggestions (ways to see more when only a few match, see MoreSuggestions) }
async function fetchPage(path, page) {
  const body = await api(path + (page > 1 ? "&page=" + page : ""));
  // Our backend always sends a list. Anything else didn't come from it
  if (!Array.isArray(body.jobs)) {
    throw new Error("Couldn't reach the server. Try again in a minute.");
  }
  return {
    list: body.jobs.map(toOpportunity),
    // The public list (guests) sends only the jobs: no total, and a full page
    // of 50 means there may be more after it (backend/src/jobs.ts)
    total: typeof body.total === "number" ? body.total : null,
    more: typeof body.more === "boolean" ? body.more : body.jobs.length >= 50,
    major: body.major ?? "",
    majorIgnored: body.major_ignored === true,
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

// The same, for a guest (not logged in): the public list, GET /api/jobs in
// backend/src/jobs.ts, which anyone can read. It only knows the search, the
// tab, "Who it's for", "Where", and "Paid only" (the page hides the other
// filters for guests), and always lists the newest first. Nothing about the
// guest is sent: there's no login, and these are only the filters on screen
function guestQueryFor({ search, picked, filters }) {
  const query = new URLSearchParams();
  if (search.trim()) query.set("q", search.trim());
  if (picked !== "All") query.set("type", typeValues[picked]);
  if (filters.level) query.set("level", filters.level);
  if (filters.setting) query.set("setting", filters.setting);
  if (filters.paidOnly) query.set("paid", "true");
  return query.toString();
}

// ---------- Hidden companies ----------
// "Hide jobs from Acme" in a job's pop-up. The list is kept in this browser,
// under your account (so on a shared computer, the next person has their own).
// It isn't saved to your account, and Log out clears it with this browser's
// other copies (forgetAccountCopies in login-status.js). The Cookie Policy says
// so (data/legal.js): change that too if this ever moves to your account.
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

// True when you can't apply anymore: the deadline has gone by, or the company
// took the posting down (status "closed"). A job saved on the tracker, or shared
// in a link, can close after you first saw it. The backend still sends it then
// (so the link doesn't turn into "not found"), and this makes the row and the
// pop-up say "Closed" instead of offering an Apply that leads nowhere
function isClosed(opportunity) {
  return opportunity.status === "closed" || isPastDeadline(opportunity.deadline);
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

// ---------- Guests ----------
// Anyone can open Opportunities without an account (App.jsx), so a counselor
// can share a link like /discovery?level=high-school. A guest sees the public
// job list (guestQueryFor above), and the page leaves out what needs an
// account or uses up a daily limit: Best fit and the other sorts, "For your
// major", Search the web, Refresh, "Where are you in school?", the number
// boxes (they count your tracker), the filters the public list doesn't know,
// and hiding a company. Save asks them to sign up instead (SignUpNote), and
// Apply just opens the company's site. Nothing new is saved in a guest's
// browser, and nothing about them is sent anywhere.

// The top bar for guests: the logo (back to the About page), the sun/moon
// button, Log in, and Sign up. It uses the About page's top bar styles
// ("about-bar" in index.css), so it looks like the bar guests already saw there.
// Logged-in students get NavBar instead
function GuestBar() {
  return (
    <header className="about-bar discovery-guest-bar">
      <div className="about-inner about-bar-row">
        <Link className="about-logo" to="/about">
          <SiteLogo />
        </Link>
        {/* <nav> + aria-label: screen readers can find these links by name (WCAG) */}
        <nav className="about-bar-actions" aria-label="Account">
          <ThemeToggle />
          <Link to="/login" className="about-login-link">
            Log in
          </Link>
          {/* Sign up is the accent blue, so it's the one that stands out */}
          <Link to="/signup" className="about-button">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}

// What Save says to a guest: saving needs an account, so it says what an
// account gives you, with the two ways to get one as links inside the
// sentence. The row and the pop-up both show it inside their one
// role="status" message, so screen readers read it when it appears (WCAG).
// {" "} keeps the space before a link (JSX drops it at a line break).
// The links are underlined (discovery-inline-link), so inside a sentence they
// don't rely on color alone (WCAG)
function SignUpNote() {
  return (
    <>
      <Link to="/signup" className="discovery-inline-link">
        Sign up free
      </Link>{" "}
      to save jobs, track deadlines, and see which jobs fit you best, or{" "}
      <Link to="/login" className="discovery-inline-link">
        log in
      </Link>
      .
    </>
  );
}

// "via Adzuna": Adzuna's terms ask every site that shows its jobs to link back
// to it, so its name is a link to adzuna.com (in a new tab: the hidden words say
// so, WCAG). Every other source is plain words. props.source is the source's
// name as shown ("Adzuna", see sourceNames near the top of this file)
function SourceName(props) {
  if (props.source !== sourceNames.adzuna) return props.source;
  return (
    <a href="https://www.adzuna.com" target="_blank" rel="noopener noreferrer" className="discovery-inline-link">
      {props.source}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

// The top of the page: the title, one sentence, and the search bar (the
// 2026-11 revamp: a calm title on the page, like a dashboard, instead of the
// old dark navy box).
// props.search is what's typed in the search bar right now, and
// props.setSearch changes it. Discovery (at the bottom) remembers it, so the
// list can use it to filter. props.forHighSchool is true when you're in high
// school (see profileLevel in Discovery): then one more line under the title
// says what's here for you. props.isGuest is true when nobody is logged in:
// then a line says so, with a link to sign up.
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
        {/* Only for high schoolers: ScoutSearch's main idea is helping them get
            experience before college, so the page says so */}
        {props.forHighSchool && (
          <p className="discovery-head-note">
            Summer programs, research, and internships open to high schoolers: experience you can write about on college
            applications.
          </p>
        )}
        {/* Only for guests: what an account adds. It's always there for them
            (it doesn't change), so it isn't a role="status" message */}
        {props.isGuest && (
          <p className="discovery-head-text">
            You're browsing as a guest.{" "}
            <Link to="/signup" className="discovery-inline-link">
              Sign up free
            </Link>{" "}
            to save jobs, track deadlines, and see which jobs fit you best.
          </p>
        )}
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

// "Where are you in school?" under the title, for students who haven't picked
// high school or college yet (accounts made before the welcome guide asked,
// or that skipped the guide). Each button saves the answer to your profile,
// and the box goes away: Opportunities then starts on what you can apply to,
// and Best fit uses it too.
// It only shows once the server has sent your profile (state "ready"): before
// that we don't know yet, and with no server the answer couldn't be saved.
// props.profile is useMyProfile() from Discovery
function LevelPrompt(props) {
  const profile = props.profile;
  // true while saving, so the buttons can't be pressed twice
  const [saving, setSaving] = useState(false);
  // What happened, read out by screen readers (role="status" below)
  const [message, setMessage] = useState("");
  // The message, so the keyboard focus can go there once the buttons are gone
  const messageRef = useRef(null);
  const needsLevel = profile.state === "ready" && !profile.data.level;

  async function pick(level) {
    // Already saving: ignore a second click (see aria-disabled on the buttons)
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      // Saving replaces the whole profile, so it starts from the newest copy
      // (latestProfile), with only the level changed
      const latest = await latestProfile();
      if (!latest) throw new Error("Couldn't reach the server. Try again in a minute.");
      await saveProfile({ ...latest, level: level });
      setMessage(
        (level === "high-school" ? "Saved: you're in high school." : "Saved: you're in college.") +
          " You can change it any time on My info.",
      );
      // The button you pressed is gone now, so the focus goes to the message
      // instead of dropping to the top of the page (WCAG)
      messageRef.current?.focus();
    } catch (error) {
      // The buttons stay, so you can try again
      setMessage("Couldn't save it: " + error.message);
    }
    setSaving(false);
  }

  return (
    <>
      {needsLevel && (
        <section className="discovery-level" aria-labelledby="discovery-level-title">
          <div className="discovery-level-words">
            <h2 id="discovery-level-title" className="discovery-level-title">
              Where are you in school?
            </h2>
            <p className="discovery-level-text">
              So Opportunities starts with what you can apply to.
            </p>
          </div>
          {/* aria-disabled (not "disabled") while saving: "disabled" would drop
              the keyboard focus from the button you just pressed. pick() ignores
              clicks meanwhile, like Sign up's button (Signup.jsx) */}
          <div className="discovery-level-buttons">
            <button type="button" className="discovery-outline-button" onClick={() => pick("high-school")} aria-disabled={saving}>
              I'm in high school
            </button>
            <button type="button" className="discovery-outline-button" onClick={() => pick("college")} aria-disabled={saving}>
              I'm in college
            </button>
          </div>
        </section>
      )}
      {/* Always on the page, so screen readers hear it when it changes (WCAG).
          tabIndex -1 lets the code above focus it, without making it a Tab stop */}
      <p className="discovery-level-message" role="status" tabIndex={-1} ref={messageRef}>
        {message}
      </p>
    </>
  );
}

// The green loading bar: a gray pill that fills up with green, while jobs are
// on their way (index.css, "The green loading bars"). It can't know how far
// along the server really is, so it shows no number: it fills fast at first,
// then slower, and stops at about 90% until the jobs arrive.
// props.className says where it is (in a summary box, or under "Loading
// opportunities..."). It's only a picture, so screen readers skip it
// (aria-hidden): the words next to it say it's loading (WCAG)
function LoadingBar(props) {
  return (
    <span className={"discovery-progress " + props.className} aria-hidden="true">
      <span className="discovery-progress-fill" />
    </span>
  );
}

// What a summary box shows where its number will go, while it's on its way:
// the green loading bar, and the word "Loading" for screen readers (WCAG)
function NumberLoading() {
  return (
    <>
      <LoadingBar className="discovery-summary-progress" />
      <span className="sr-only">Loading</span>
    </>
  );
}

// A dash where a summary box's number would go, when it couldn't be loaded, so
// it doesn't look like it's still loading, or like a real 0. Screen readers
// hear "Couldn't load" instead of "dash" (WCAG)
function NumberMissing() {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">Couldn't load</span>
    </>
  );
}

// The three summary boxes under the title: how many opportunities match your
// filters, how many are due soon, and how many are on your tracker. Like the
// number boxes at the top of a dashboard, so you see the big picture first.
// props.total is how many match (null if they couldn't be loaded), props.dueSoon
// is { count, first } for the jobs matching your filters that are due in the
// next 14 days (null until it arrives, and count is null if it couldn't be
// loaded), props.trackerCount is how many are on your tracker, and props.loading
// is true while the jobs are still on their way (the numbers show a gray
// loading bar until then, not a wrong 0; a dash if they can't be loaded).
function SummaryBoxes(props) {
  // The first one due, for the note under the number ("First up: ...")
  const first = props.dueSoon?.first;
  // true if the due-soon jobs couldn't be loaded
  const dueSoonFailed = props.dueSoon !== null && props.dueSoon.count === null;

  return (
    // A list, so screen readers say "list, 3 items" (WCAG)
    <ul className="discovery-summary" aria-label="Summary">
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Match your filters</span>
        <span className="discovery-summary-number">
          {props.loading ? <NumberLoading /> : props.total === null ? <NumberMissing /> : props.total.toLocaleString()}
        </span>
        <span className="discovery-summary-note">Internships, co-ops, research, and programs</span>
      </li>
      <li className="discovery-summary-box">
        <span className="discovery-summary-label">Due in the next 2 weeks</span>
        <span className="discovery-summary-number">
          {props.dueSoon === null ? <NumberLoading /> : dueSoonFailed ? <NumberMissing /> : props.dueSoon.count}
        </span>
        <span className="discovery-summary-note">
          {/* "first ? (...) : (...)" means "if there's one due, name it; if not, say so" */}
          {dueSoonFailed
            ? "Couldn't load this right now"
            : first
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

// ---------- "Can I apply?" ----------
// The checklist in the pop-up (plan item #21). The backend marks each thing the
// job asks for against your profile and resume (checklistFor in
// backend/src/fit.ts), and this shows it. Each item is
// { kind, text, status, note }:
//   kind    "level" (who it's for), "line" (a line from the post), or "skill"
//   status  one of the four marks below
//   note    a short extra line, like "Not on your profile or resume yet: SQL"

// The words for each mark
const checkWords = { have: "You have this", missing: "Not yet", no: "Not for you", check: "Check yourself" };

// The little picture for each mark: a check, an empty circle (not yet), an X,
// or a question mark. The mark is written in words next to it, so screen
// readers skip the picture (WCAG)
function MarkIcon(props) {
  const drawings = {
    have: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    missing: <circle cx="12" cy="12" r="7.5" />,
    no: <path d="M7 7l10 10M17 7L7 17" />,
    check: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.4v.4" />
        <path d="M12 16.8h.01" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {drawings[props.status] ?? drawings.check}
    </svg>
  );
}

// The verdict over the checklist: how many of the things that could be checked
// you have. "Check yourself" ones don't count either way (they can't be told
// from your profile), so they're mentioned after it instead.
// Gives back { words, more }, like { words: "Within reach: you have 3 of 5.",
// more: "2 more to check yourself." }
function verdictFor(items) {
  // Who it's for decides first:
  // - a high school job, for a college student ("Not for you")
  const level = items.find((item) => item.kind === "level");
  if (level?.status === "no") return { words: "Probably not for you: it's for high school students.", more: "" };
  // - a college job, for a high schooler ("Not yet"): for later, whatever the
  //   rest says, so the rest is counted on its own
  const forLater = level?.status === "missing";
  const rest = forLater ? items.filter((item) => item !== level) : items;

  // how many of the items have this mark
  const count = (status) => rest.filter((item) => item.status === status).length;
  const have = count("have");
  const missing = count("missing");
  const toCheck = count("check");
  const checked = have + missing;
  const more = toCheck === 0 ? "" : toCheck === 1 ? "1 more to check yourself." : toCheck + " more to check yourself.";

  if (forLater) {
    return {
      words: checked === 0 ? "For later: it's for college students." : "For later: it's for college students, but you have " + have + " of " + checked + " of the rest.",
      more,
    };
  }
  if (checked === 0) return { words: "These couldn't be checked against your profile, so read them and decide.", more: "" };
  if (missing === 0) {
    return { words: checked === 1 ? "You have the one thing that could be checked." : "You have all " + checked + " things that could be checked.", more };
  }
  // at least half: worth a try. Fewer: still worth applying (many students do)
  if (have >= missing) return { words: "Within reach: you have " + have + " of " + checked + ".", more };
  return { words: "A stretch: you have " + have + " of " + checked + ". You can still apply.", more };
}

// One list of marked items (see ApplyChecklist below).
// Real posts sometimes say the same thing twice, so the key adds the item's
// place in the list (index) to its words, to keep every key different
function CheckList(props) {
  return (
    <ul className="discovery-check-list">
      {props.items.map((item, index) => (
        // the mark's class picks its colors (index.css, "Can I apply?")
        <li key={index + item.text} className={"discovery-check-item discovery-check-" + item.status}>
          <span className="discovery-check-icon">
            <MarkIcon status={item.status} />
          </span>
          <span>
            <span className="discovery-check-text">{item.text}</span>
            {item.note && <span className="discovery-check-note">{item.note}</span>}
          </span>
          <span className="discovery-check-status">{checkWords[item.status]}</span>
        </li>
      ))}
    </ul>
  );
}

// "Can I apply?": the verdict, then who it's for and the post's own lines,
// then the skills the post names, then where the marks come from.
// props.items is the job's checklist (see above)
function ApplyChecklist(props) {
  const items = props.items;
  // the skills get their own list, under "Skills the post names"
  const main = items.filter((item) => item.kind !== "skill");
  const skills = items.filter((item) => item.kind === "skill");
  // Only "who it's for" (the post lists no skills or requirements): a verdict
  // like "You have the one thing" would promise too much, so there's none
  const onlyLevel = skills.length === 0 && main.every((item) => item.kind === "level");
  const verdict = verdictFor(items);

  return (
    <>
      <h3 className="discovery-dialog-heading">Can I apply?</h3>
      {!onlyLevel && (
        <p className="discovery-check-verdict">
          {verdict.words}
          {verdict.more && <span className="discovery-check-verdict-more"> {verdict.more}</span>}
        </p>
      )}
      <CheckList items={main} />
      {skills.length > 0 && (
        <>
          <h4 className="discovery-check-label">Skills the post names</h4>
          <CheckList items={skills} />
        </>
      )}
      <p className="discovery-check-footnote">
        {onlyLevel
          ? "The post doesn't list skills or requirements that can be checked, so read it to be sure. "
          : "Checked against your profile and resume, so read the post too. "}
        Have something marked Not yet?{" "}
        <Link to="/my-info#skills" className="discovery-text-link">
          Add it on My info
          <ArrowIcon />
        </Link>
      </p>
    </>
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
//   applyStep          "none", "asked" once Apply was pressed (the pop-up asks
//                      if you sent your application), "applied" once you said
//                      Yes, or "later" once you said Not yet
//   onApply            what Apply runs (it only asks, see OpportunityRow)
//   onConfirmApplied   what "Yes, I sent it" runs (it moves the job to
//                      Submitted on the tracker)
//   onNotYet           what "Not yet" runs (it keeps the job in Saved on the
//                      tracker, so it isn't lost)
//   isGuest            true when nobody is logged in (see "Guests" above): no
//                      "Hide jobs from ...", and Save isn't an on/off
//   askedToSignUp      true once a guest pressed Save: the note says to sign up
//
// { opportunity, ref, saved, ... } below "unpacks" the props: it's a
// shorter way of writing props.opportunity, props.ref, and so on. It's
// needed here because React's rules check that a ref is never read while
// the page is being drawn, and keeping it separate from the other props
// makes that clear.
function OpportunityDialog({ opportunity, ref, saved, toggleSave, applyStep, onApply, onConfirmApplied, onNotYet, onHide, idPrefix, isGuest, askedToSignUp }) {
  // A unique id for the title, so the dialog can be named by it (WCAG). idPrefix keeps it unique
  // when the same job is in two tables (the main list and "Found on the web")
  const titleId = (idPrefix ?? "discovery-dialog-title-") + opportunity.id;
  // true once the deadline has gone by or the posting was taken down: Apply
  // then turns off (see the bottom, and isClosed near the top of this file)
  const closed = isClosed(opportunity);
  // The Apply link, so the answer buttons can put the keyboard focus back on it
  const applyLinkRef = useRef(null);

  // "Yes, I sent it" or "Not yet": the focus goes to Apply first, because both
  // buttons disappear once one is pressed, and the focus would otherwise drop
  // to the top of the pop-up (WCAG). Then the answer runs (onConfirmApplied
  // or onNotYet)
  function answer(runAnswer) {
    applyLinkRef.current?.focus();
    runAnswer();
  }
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
            {opportunity.organization} · {opportunity.place} · via <SourceName source={opportunity.source} />
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

        {/* "Can I apply?": each thing the job asks for, marked from your
            profile and resume (only on your own list: guests, and a job opened
            from a link, don't have one, so they get "What they're looking for" below) */}
        {opportunity.checklist && <ApplyChecklist items={opportunity.checklist} />}

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

        {/* Only if the job lists what they're looking for, and there's no
            "Can I apply?" checklist above (that one already has every line).
            .map() makes one <li> per item, in order. Real posts sometimes say
            the same thing twice, so the key adds the item's place in the list
            (index) to its words, to keep every key different. */}
        {!opportunity.checklist && opportunity.requirements.length > 0 && (
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
            them again under "More filters"). It closes the pop-up first.
            Not for guests: the public list can't leave companies out */}
        {!isGuest && (
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
        )}
      </div>

      {/* The bottom: a note on the left, Save and Apply on the right.
          It stays put while the middle scrolls. */}
      <div className="discovery-dialog-bottom">
        {/* The note, and after Apply, the question "Did you send your
            application?" with Yes and Not yet. Opening the posting isn't the
            same as applying, so the job only moves to Submitted if you say so.
            Not yet keeps it in Saved, so it isn't lost. Saying nothing changes
            nothing (it stays where it was on your tracker, or off it) */}
        <div className="discovery-dialog-note">
          {/* role="status" makes screen readers read the question, and then
              where the job went, when they appear (WCAG). It's inside the
              pop-up because while it's open, the page behind it is shut off,
              and screen readers don't hear messages from there */}
          <p className="discovery-dialog-message" role="status">
            {/* A guest who pressed Save: how to save (SignUpNote). Guests are
                never asked "Did you send it?", so the rest is for students */}
            {isGuest && askedToSignUp ? (
              <SignUpNote />
            ) : applyStep === "applied" ? (
              "Moved to Submitted on My applications."
            ) : applyStep === "later" ? (
              "Kept on My applications, so you won't lose it."
            ) : applyStep === "asked" ? (
              "Did you send your application on " + opportunity.organization + "'s site?"
            ) : (
              "You'll apply on " + opportunity.organization + "'s own site."
            )}
          </p>
          {/* Only while it's asking. The words say what each answer means, so
              they make sense on their own to screen readers and voice control (WCAG) */}
          {applyStep === "asked" && (
            <>
              <button type="button" className="discovery-outline-button discovery-small-button" onClick={() => answer(onConfirmApplied)}>
                Yes, I sent it
              </button>
              <button type="button" className="discovery-outline-button discovery-small-button" onClick={() => answer(onNotYet)}>
                Not yet
              </button>
            </>
          )}
        </div>
        <div className="discovery-actions">
          {/* aria-label starts with the word you see ("Save" or "Saved"),
              so voice control users can say what's on the button (WCAG).
              For guests it isn't an on/off (no aria-pressed): it only shows
              the sign-up note */}
          <button
            type="button"
            className="discovery-outline-button"
            aria-pressed={isGuest ? undefined : saved}
            aria-label={(saved ? "Saved " : "Save ") + opportunity.title}
            onClick={toggleSave}
          >
            <BookmarkIcon />
            {saved ? "Saved" : "Save"}
          </button>
          {/* After the deadline, or once the posting is taken down, Apply turns
              off and says why ("disabled" also stops it from being clicked or
              reached with Tab).
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
                ref={applyLinkRef}
                href={opportunity.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="discovery-solid-button"
                aria-label={"Apply to " + opportunity.title + " (opens in a new tab)"}
                // the posting opens, and the pop-up asks if you applied (see above)
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
  // true when you can't apply anymore (see isClosed near the top of this file)
  const closed = isClosed(opportunity);

  // The Save button (on/off) is "on" while this job is on the Application
  // tracker. It reads the tracker's list instead of remembering its own, so it
  // stays right when the list changes some other way: your account's list
  // arriving (a job you saved on another device), or Save in another tab.
  // The pop-up uses the same one, so saving in either place saves both.
  const trackerItems = useTrackerItems();
  const saved = trackerItems.some((item) => item.id === opportunity.id);
  // What screen readers hear after Save is pressed (see the end of the row)
  const [announcement, setAnnouncement] = useState("");
  // true when nobody is logged in (see "Guests" near the top of this file)
  const isGuest = props.isGuest === true;
  // true once a guest pressed Save: the row and the pop-up then say how to sign up
  const [askedToSignUp, setAskedToSignUp] = useState(false);
  // Where Apply is at in the pop-up: "none", "asked" (Apply was pressed, and
  // the pop-up asks if you sent your application), "applied" (you said Yes),
  // or "later" (you said Not yet)
  const [applyStep, setApplyStep] = useState("none");

  // What the tracker keeps with this job (Save, "Yes, I sent it", and "Not
  // yet" all use it), so it can show the job right away, even offline
  const trackerDetails = {
    title: opportunity.title,
    organization: opportunity.organization,
    deadline: opportunity.deadline,
    initials: opportunity.initials,
    link: opportunity.applyUrl ?? null,
  };

  // Apply was pressed: the posting opens in a new tab (the link does that).
  // Opening a posting isn't applying (many students look first, and apply
  // later or never), so nothing moves on the tracker yet: the pop-up asks
  // instead. (Before, Apply moved the job to Submitted right away, so the
  // tracker filled up with jobs nobody had applied to, and their deadlines
  // dropped out of "Due soon".) After Not yet, pressing Apply again asks again;
  // after Yes, it changes nothing. Guests aren't asked: they have no tracker
  // to put the answer on, so Apply only opens the company's site
  function askIfApplied() {
    if (isGuest) return;
    if (applyStep !== "applied") setApplyStep("asked");
  }

  // "Yes, I sent it": the job goes in the tracker's "Submitted" column, dated
  // today, saved or not
  function confirmApplied() {
    markApplied(opportunity.id, trackerDetails);
    setApplyStep("applied");
  }

  // "Not yet": the job goes in the tracker's "Saved" column, so it isn't lost.
  // If it's on the tracker already (in any column), it stays where it is
  function notYet() {
    if (!saved) addToTracker(opportunity.id, trackerDetails);
    setApplyStep("later");
  }

  // Runs when Save is pressed, in the row or in the pop-up.
  // Saving puts the job in the tracker's "Saved" column; pressing again
  // ("Saved") takes it off the tracker. Either way, it's saved to your account.
  // The title, company, deadline, and initials are kept with it, so the
  // tracker can show the job right away (and when the server can't be reached).
  // A guest has no tracker (it's saved with an account), so Save shows how to
  // sign up instead, and nothing is saved
  function toggleSave() {
    if (isGuest) {
      setAskedToSignUp(true);
      return;
    }
    if (saved) {
      removeFromTracker(opportunity.id);
      setAnnouncement("");
    } else {
      setAnnouncement("Saved to My applications.");
      addToTracker(opportunity.id, trackerDetails);
    }
    // (No more to do: the list changed, so this button and "On your tracker"
    // at the top redraw by themselves)
  }
  // A reference to this row's pop-up, so "View" can open it
  const dialogRef = useRef(null);
  // A reference to this row's View button (see the useEffect below)
  const viewButtonRef = useRef(null);

  // If a link sent you here for THIS job ("/discovery?job=..."), open its
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
      // back where it was before it opened. Coming from a link, nothing had
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
              {opportunity.organization} · via <SourceName source={opportunity.source} />
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
          leaving the box empty ("??" = use "Not listed" if pay is null).
          The words are in their own box (discovery-pay-words): short pay
          ("$27–30/hr") stays on one line, and the long sentence some job sites
          send wraps onto a few lines, instead of stretching the Pay column so
          far that Save and View were cut off at the right edge */}
      <td data-label="Pay">
        <span className="discovery-pay-words">{opportunity.pay ?? "Not listed"}</span>
      </td>

      <td data-label="Apply by">
        <span className="discovery-apply-by">
          {/* Many real jobs don't list a deadline, so this says so instead of a
              broken date. "? :" picks one of the two */}
          {opportunity.deadline ? (
            // <time> marks this as a date for computers, using the
            // year-month-day version in dateTime
            <time dateTime={opportunity.deadline}>
              {formatDate(opportunity.deadline, { month: "short", day: "numeric", year: "numeric" })}
            </time>
          ) : (
            "No deadline listed"
          )}
          {/* "Due soon" when it's within a week, and "Closed" once the deadline
              has gone by or the posting was taken down (see isClosed), even
              with no deadline. Written out, not only a color (WCAG) */}
          {!closed && isDueWithin(opportunity.deadline, 7) && <span className="discovery-due-tag">Due soon</span>}
          {closed && <span className="discovery-due-tag discovery-closed-tag">Closed</span>}
        </span>
      </td>

      <td className="discovery-cell-actions">
        <span className="discovery-actions">
          {/* Save: an on/off button. !saved flips true to false and false
              to true. aria-pressed tells screen readers if it's on (WCAG).
              aria-label says which opportunity, because every row has a
              Save button. It starts with the visible word ("Save" or
              "Saved") so voice control still works (WCAG). For guests it
              isn't an on/off (no aria-pressed): it shows the sign-up note */}
          <button
            type="button"
            className="discovery-outline-button discovery-small-button"
            aria-pressed={isGuest ? undefined : saved}
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
            arriving would otherwise make every saved row speak at once).
            For guests it's on screen instead, under the buttons, since it has
            the Sign up and Log in links: empty until Save is pressed */}
        {isGuest ? (
          <span className="discovery-guest-note" role="status">
            {askedToSignUp && <SignUpNote />}
          </span>
        ) : (
          <span className="sr-only" role="status">
            {announcement}
          </span>
        )}

        {/* The pop-up. It's on the page all the time but hidden until it's opened. */}
        <OpportunityDialog
          opportunity={opportunity}
          ref={dialogRef}
          saved={saved}
          toggleSave={toggleSave}
          applyStep={applyStep}
          onApply={askIfApplied}
          onConfirmApplied={confirmApplied}
          onNotYet={notYet}
          onHide={props.onHide}
          idPrefix={props.idPrefix}
          isGuest={isGuest}
          askedToSignUp={askedToSignUp}
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

// How many jobs each page has: the same as PAGE_SIZE in backend/src/jobs.ts
const pageSize = 50;

// What the list shows while jobs are on their way (the first time, and after
// Previous or Next): props.words, like "Loading opportunities...", with the
// green loading bar under them (LoadingBar above), over six gray bars in the
// shape of the table's rows. The gray bars fade in and out, one row after
// another, so it's clear the page is working and not stuck (index.css, "While
// the jobs are loading"; nothing moves if motion is turned off).
// role="status" reads the words out when they appear, and the bars are only a
// picture, so screen readers skip them (aria-hidden) (WCAG)
function LoadingRows(props) {
  return (
    <div className="discovery-loading">
      {/* The top of the box: the words, and the green bar under them */}
      <div className="discovery-loading-top">
        {/* props.quiet: another status line reads these words out (after
            Previous or Next, see ResultsSection), so this one isn't a status
            too, or screen readers could say it twice */}
        <p className="discovery-loading-words" role={props.quiet ? undefined : "status"}>
          {props.words}
        </p>
        <LoadingBar className="discovery-list-progress" />
      </div>
      <div aria-hidden="true">
        {/* Six pretend rows. They never change, so their number works as the key */}
        {[1, 2, 3, 4, 5, 6].map((row) => (
          <div key={row} className="discovery-loading-row">
            <div className="discovery-loading-role">
              <span className="discovery-loading-bar discovery-loading-title" />
              <span className="discovery-loading-bar discovery-loading-company" />
            </div>
            <span className="discovery-loading-bar discovery-loading-fact" />
            <span className="discovery-loading-bar discovery-loading-fact" />
            <span className="discovery-loading-bar discovery-loading-fact" />
          </div>
        ))}
      </div>
    </div>
  );
}

// The list of opportunities: the table, with the count and the page buttons
// (Previous, "Page 2 of 14", Next) under it. What's inside depends on what's
// happening (see ResultsBody below). The heading always comes first, so React
// keeps the same heading on the page whatever is under it: Previous and Next
// move the keyboard focus onto it (they find it by its id), and the focus stays
// there while the next page loads
function ResultsSection(props) {
  return (
    // aria-labelledby names this section with the heading's words (WCAG)
    <section className="discovery-results" aria-labelledby="discovery-results-title">
      {/* A heading for screen readers only (sr-only), so the list has a
          name in the page's outline. The tabs already show it on screen.
          tabIndex -1 lets Previous and Next move the focus here, so the
          keyboard starts from the top of the new page, without making it a
          stop when you press Tab (WCAG) */}
      <h2 id="discovery-results-title" className="sr-only" tabIndex={-1}>
        Opportunities
      </h2>
      {/* What screen readers hear after Previous or Next: "Loading page 2...",
          then "Page 2 of 14" (or why it couldn't load). Screen readers only
          read a role="status" out when its words CHANGE, and the boxes under
          it are swapped for new ones on every page, so this one stays on the
          page the whole time, and only its words change (WCAG) */}
      <p className="sr-only" role="status">
        {props.pageNote}
      </p>
      <ResultsBody {...props} />
    </section>
  );
}

// What's under the list's heading.
// props.results is what the backend sent ({ list, total, more, page }), or null
// while the first answer is on its way. props.loadError is true if getting them
// failed (props.retry tries again). props.updating is true while new filters
// are loading (the old list stays on screen until then). props.pageLoading is
// the page on its way after Previous or Next (0 when there isn't one), and
// props.goToPage(n) asks for page n. props.pageProblem says why a page
// couldn't be loaded ("" when it could). props.isGuest is true when nobody is
// logged in (each row then works the guest way, see OpportunityRow)
function ResultsBody(props) {
  // If getting them failed, say so in place of the table, with "Try again".
  // role="status" reads it out when it appears (WCAG).
  // It reuses the "nothing here" box below, so it needs no new styles.
  if (props.loadError) {
    return (
      <div className="discovery-empty" role="status">
        <p className="discovery-empty-title">Couldn't load opportunities</p>
        <p className="discovery-empty-text">Check your connection, then try again.</p>
        <button type="button" className="discovery-outline-button" onClick={props.retry}>
          Try again
        </button>
      </div>
    );
  }

  // The first answer is still on its way
  if (props.results === null) {
    return <LoadingRows words="Loading opportunities..." />;
  }

  // Previous or Next was pressed, and that page is on its way. quiet: the
  // words are read out by the status line in ResultsSection instead
  if (props.pageLoading) {
    return <LoadingRows words={"Loading page " + props.pageLoading + "..."} quiet />;
  }

  const shown = props.results.list;
  // Which page this is (1, 2, 3...)
  const page = props.results.page;

  // A page after the first with nothing on it. It can happen when exactly 50
  // or 100 match (the guests' list can't tell there's no next page until it
  // asks), or when jobs closed since the last page. Say so, with a way back
  if (shown.length === 0 && page > 1) {
    return (
      <div className="discovery-empty">
        <p className="discovery-empty-title">No more opportunities</p>
        <p className="discovery-empty-text">That's the end of the list.</p>
        <button type="button" className="discovery-outline-button" onClick={() => props.goToPage(page - 1)}>
          Back to page {page - 1}
        </button>
      </div>
    );
  }
  // how many match in all, or null for guests (the public list doesn't say)
  const total = props.results.total;
  // the "Want more?" buttons, but not while new filters load (they'd be for the old ones)
  const suggestions = props.updating ? [] : props.results.suggestions;
  // "opportunity" for 1, "opportunities" for anything else.
  const word = (total ?? shown.length) === 1 ? "opportunity" : "opportunities";
  // How many jobs this page really has: a job a "?job=" link opened can be
  // added at the top of page 1 (extra: 1, see shownResults in Discovery), and
  // it isn't counted
  const onThisPage = shown.length - (props.results.extra ?? 0);
  // Where this page starts and ends in the whole list: page 1 is 1 to 50,
  // page 2 is 51 to 100, and so on
  const first = (page - 1) * pageSize + 1;
  const last = first + onThisPage - 1;
  // How many pages there are in all, or null for guests (the public list doesn't
  // say how many match). Math.ceil rounds up: 61 jobs is 2 pages
  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  // The words under the table:
  // - everything fits on one page: "Showing 6 of 6 opportunities"
  // - more than one page: "Showing 51 to 100 of 1,234 opportunities"
  // - guests (no total, and always newest first): "Showing the 50 newest
  //   opportunities" on page 1, then "Showing opportunities 51 to 100, newest first"
  let countWords;
  if (total === null) {
    countWords =
      page === 1
        ? "Showing the " + onThisPage.toLocaleString() + " newest " + word
        : "Showing " + word + " " + first.toLocaleString() + " to " + last.toLocaleString() + ", newest first";
  } else if (pageCount === 1) {
    countWords = "Showing " + onThisPage.toLocaleString() + " of " + total.toLocaleString() + " " + word;
  } else {
    countWords = "Showing " + first.toLocaleString() + " to " + last.toLocaleString() + " of " + total.toLocaleString() + " " + word;
  }
  // What the table is sorted by, for screen readers
  const sortWords = { newest: "newest first", fit: "best fit first", deadline: "soonest deadline first", company: "by company, A to Z" };

  return (
    // <> </> groups the pieces without adding another box around them
    <>
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
                  // true only for the job a "?job=" link points to (see Discovery below)
                  openOnArrival={opportunity.id === props.openJobId}
                  onOpened={props.onOpened}
                  onHide={props.onHide}
                  isGuest={props.isGuest}
                />
              ))}
            </tbody>
          </table>

          {/* The bottom of the box: the count (or why a page couldn't be
              loaded), and the page buttons if there's more than one page.
              role="status" reads the new words out when they change (WCAG) */}
          <div className="discovery-more-row">
            <p className="discovery-results-count" role="status">
              {props.updating ? "Updating..." : props.pageProblem || countWords}
            </p>
            {(page > 1 || props.results.more) && (
              // <nav> with a name, so screen readers can find the page buttons (WCAG).
              // Both buttons are turned off while new filters load (they'd be
              // for the old list), Previous on the first page, and Next on the last
              <nav className="discovery-pages" aria-label="Pages of opportunities">
                <button
                  type="button"
                  className="discovery-outline-button"
                  onClick={() => props.goToPage(page - 1)}
                  disabled={page === 1 || props.updating}
                >
                  Previous
                </button>
                <span className="discovery-page-number">
                  {pageCount === null ? "Page " + page : "Page " + page + " of " + pageCount}
                </span>
                <button
                  type="button"
                  className="discovery-outline-button"
                  onClick={() => props.goToPage(page + 1)}
                  disabled={!props.results.more || props.updating}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </div>
        </>
      )}
    </>
  );
}

// The filters, under the tabs. props.filters is what's picked ({ level, setting,
// ... }, see noFilters near the top), and props.change(name, value) changes one.
// "For your major" is a separate on/off (props.forMajor, props.setForMajor),
// because it starts on when your profile has a major. props.majorIgnored is
// true when the backend couldn't use that major (see fetchPage).
// props.hidden is the companies you've hidden, and props.unhide shows one again.
// props.isGuest is true when nobody is logged in: then only the filters the
// public list knows show (Who it's for, Where, Paid only), see guestQueryFor
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
            link to add one instead. The same link shows when the backend skipped
            the major filter (props.majorIgnored): a typed-in major like "General
            Studies" has no words to look for, so the list shows every field, and
            picking a major from the list fixes that. Not for guests: it needs a profile */}
        {!props.isGuest && (props.major && !props.majorIgnored ? (
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
          <Link to="/my-info#basics" className="discovery-text-link">
            {props.majorIgnored ? "Pick your major from the list for better matches" : "Add your major to see jobs for it"}
            <ArrowIcon />
          </Link>
        ))}

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
        {/* Posted and Deadline: not for guests, the public list doesn't know them */}
        {!props.isGuest && (
          <>
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
          </>
        )}
        <label className="discovery-check">
          <input type="checkbox" checked={filters.paidOnly} onChange={(e) => props.change("paidOnly", e.target.checked)} />
          Paid only
        </label>
      </div>

      {/* <details> opens and closes by itself, and tells screen readers if it's open.
          Not for guests: the public list can't match words, places, or hidden companies */}
      {!props.isGuest && (
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
      )}

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
      Best fit uses your major, skills, and what you're looking for (from My info), and your resume's
      skills and experience. The more you fill in, the better it gets.{" "}
      <Link to="/my-info" className="discovery-text-link">
        Go to My info
        <ArrowIcon />
      </Link>
    </p>
  );
}

// "Search the web": the box under the search bar, once something is typed. An
// AI (Google's Gemini) looks for more internships, co-ops, research positions,
// and programs on the web (POST /api/web-search, backend/src/web-search.ts).
// Only the words in the search bar are sent, never anything from the profile,
// and the box says so every time (the Data Policy says the same). Every job it
// finds is checked on its hiring site first, and saved for everyone.
// props.search is what's typed, props.onFound reloads the list (new jobs are in
// it now), props.onHide is "Hide jobs from this company", and props.hidden is
// the list of companies hidden so far (their jobs aren't shown here either)
function WebSearch(props) {
  // "searching" while it runs, "" otherwise
  const [searching, setSearching] = useState(false);
  // what it says after (read out by screen readers: role="status")
  const [message, setMessage] = useState("");
  // what it found: { words (what was searched), list } or null before the first search
  const [found, setFound] = useState(null);

  const words = props.search.trim();
  // nothing typed and nothing found yet: no box (it only helps a search)
  if (words.replace(/[^\p{L}\p{N}]/gu, "").length < 2 && !found) return null;

  // The jobs found, minus companies hidden with "Hide jobs from this company"
  // (so hiding one in a pop-up takes it out of this table right away too)
  const hiddenNames = (props.hidden ?? []).map((name) => name.toLowerCase());
  const shown = found ? found.list.filter((opportunity) => !hiddenNames.includes(String(opportunity.organization).toLowerCase())) : [];

  async function searchTheWeb() {
    setSearching(true);
    setMessage("Searching the web. This usually takes 10 to 30 seconds...");
    try {
      const body = await api("/web-search", { method: "POST", body: JSON.stringify({ q: words }) });
      const list = Array.isArray(body.jobs) ? body.jobs.map(toOpportunity) : [];
      setFound({ words, list });
      if (list.length === 0) {
        setMessage("The web search didn't find any open postings it could check. Try other words.");
      } else {
        const added = body.added ?? 0;
        setMessage(
          "Found " + list.length + " open " + (list.length === 1 ? "posting" : "postings") +
          (added > 0 ? ", " + added + " of them new to ScoutSearch (now on the list for everyone)." : ", all already on ScoutSearch.")
        );
        // the new ones are in the main list now too (if they match its filters)
        if (added > 0) props.onFound();
      }
    } catch (error) {
      if (error.status === 401) {
        // the login ran out while the page was open
        setMessage("Your login has run out. Log in again, then search once more.");
      } else if (error.status === 400 || error.status === 429 || error.status === 503) {
        // the backend's own words ("You've used today's 10 web searches...")
        setMessage(error.message || "Web search isn't available right now. Try again later.");
      } else {
        // no answer at all, or the server broke: its words ("Database error") wouldn't help
        setMessage("Something went wrong with the web search. Try again in a minute.");
      }
    }
    setSearching(false);
  }

  return (
    <>
      {/* The box: what it does, what's sent, and the button */}
      <div className="discovery-web">
        <div className="discovery-web-words">
          <p className="discovery-web-title">
            {words ? "Not finding it? Search the web for “" + words + "”" : "Search the web"}
          </p>
          {/* Said every time, so nobody sends words without knowing where they go */}
          <p className="discovery-web-note">
            Only these search words go to Google's Gemini AI, never your profile or resume. Google may use them to
            improve its products, so don't type personal details.
          </p>
        </div>
        <button type="button" className="discovery-outline-button" onClick={searchTheWeb} disabled={searching || !words}>
          {searching ? "Searching..." : "Search the web"}
        </button>
      </div>
      <p className="discovery-web-message" role="status">
        {message}
      </p>

      {/* What it found, in the same table as the main list */}
      {shown.length > 0 && (
        <section className="discovery-web-results" aria-labelledby="discovery-web-results-title">
          <h2 id="discovery-web-results-title" className="discovery-web-results-title">
            Found on the web for {"“" + found.words + "”"}
          </h2>
          <div className="discovery-table-box">
            <table className="discovery-table">
              <caption className="sr-only">Opportunities found on the web</caption>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Type</th>
                  <th scope="col">Location</th>
                  <th scope="col">Pay</th>
                  <th scope="col">Apply by</th>
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
                    openOnArrival={false}
                    onOpened={() => {}}
                    onHide={props.onHide}
                    idPrefix="discovery-web-dialog-title-"
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// Waits this many milliseconds (for checking how Refresh is going)
function wait(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

// Discovery is the whole page. It puts the pieces above together, and it
// remembers the search, the tab, the sort, and the filters, so everything stays in sync.
function Discovery() {
  // Who's logged in, or null for a guest (see "Guests" near the top of this file)
  const isGuest = !useLoggedInId();
  // The extra info at the end of the address. For "/discovery?job=abc",
  // searchParams.get("job") gives "abc". setSearchParams changes it.
  // (Up here because "?level=" is read when the page opens, below)
  const [searchParams, setSearchParams] = useSearchParams();
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

  // "Who it's for" starts at your level: a high school senior starts on what
  // high schoolers can apply to, a college student on college jobs, so nobody
  // starts on a list of jobs they can't get. Your level is what you picked on
  // your profile ("Where are you in school?": the welcome guide, My info,
  // or LevelPrompt above). Before you pick, it's a guess from your school's
  // name. levelChoice is null until you pick a filter yourself; picking
  // "Anyone" shows everything.
  // A link can pick it too: "/discovery?level=high-school" (or "college"), like
  // the About page's "Browse high school opportunities", or one a counselor
  // shares. It's read once, when the page opens, for guests and students alike.
  // Anything else after "level=" is ignored
  const [levelChoice, setLevelChoice] = useState(() => {
    const fromLink = searchParams.get("level");
    return fromLink === "high-school" || fromLink === "college" ? fromLink : null;
  });
  const school = profile.data.school.trim();
  // The guess: only when the name says which it is. "Worcester Academy" or
  // "Boston Latin School" could be either, so those start on "Anyone".
  // (Best fit in backend/src/fit.ts guesses "college" for those instead, since
  // it has to pick one; both use your own pick once you've made it)
  const guessedLevel = /high school|\bhs\b/i.test(school)
    ? "high-school"
    : /universit|college|institute|polytechnic/i.test(school)
      ? "college"
      : "";
  const profileLevel = profile.data.level || guessedLevel;
  // the filters as they show on screen, with that level in them
  const shownFilters = { ...filters, level: levelChoice ?? profileLevel };

  // Everything above, written for the backend, with the list it's for (see
  // fetchPage): yours (queryFor), or the public one for guests (guestQueryFor)
  const query = isGuest
    ? "/jobs?" + guestQueryFor({ search, picked, filters: shownFilters })
    : "/jobs/for-me?" + queryFor({ search, picked, sortBy, filters: shownFilters, forMajor, withRelated, hidden });

  // What the backend sent: { query (which filters it's for), list, total, more,
  // page }. null until the first answer arrives
  const [results, setResults] = useState(null);
  // true if getting the jobs failed, so the list can show "Try again"
  const [loadError, setLoadError] = useState(false);
  // Counts "Try again" and Refresh presses. Changing it makes the useEffect
  // below run again (it's in the [ ] list at the end).
  const [tries, setTries] = useState(0);
  // The page on its way after Previous or Next (2, 3, ...), or 0 when none is
  const [pageLoading, setPageLoading] = useState(0);
  // Why the last Previous or Next didn't work ("" when it did)
  const [pageProblem, setPageProblem] = useState("");
  // What screen readers hear after Previous or Next: "Loading page 2...", then
  // "Page 2 of 14" (or the problem). See ResultsSection
  const [pageNote, setPageNote] = useState("");
  // Counts the requests for the list (a new filter, or Previous / Next). Only
  // the newest one's answer is used: one that arrives late (like page 2 of the
  // old filters, after you changed a filter) is dropped, so it can't replace the
  // newer list. A ref, because changing it doesn't need to redraw the page
  const listRequest = useRef(0);
  // Everything due in the next 2 weeks, for the summary box: { count, first },
  // or { count: null } if it couldn't be loaded
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
      // This request's number (see listRequest above)
      const thisRequest = ++listRequest.current;
      fetchPage(query, 1)
        .then((page) => {
          if (!ignore && listRequest.current === thisRequest) {
            setResults({ query: query, ...page, page: 1 });
            setLoadError(false);
            // a new list starts on page 1, so an old page's loading rows,
            // problem, and note don't apply anymore
            setPageLoading(0);
            setPageProblem("");
            setPageNote("");
          }
        })
        .catch((error) => {
          // The real reason goes to the console (F12); the page shows a simple message
          console.error("Loading jobs failed:", error);
          if (!ignore && listRequest.current === thisRequest) {
            setLoadError(true);
            setPageLoading(0);
          }
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
  // (Not for guests: the box isn't shown to them, and the public list can't
  // pick the jobs due soon)
  const dueSoonQuery = "/jobs/for-me?" + queryFor({ search, picked, sortBy: "deadline", filters: { ...shownFilters, deadline: "soon" }, forMajor, withRelated, hidden });
  useEffect(() => {
    if (isGuest) return;
    let ignore = false;
    // waits 0.3 seconds like the list, so typing a word is one request, not one per letter
    const timer = setTimeout(() => {
      fetchPage(dueSoonQuery, 1)
        .then((page) => {
          if (!ignore) setDueSoon({ count: page.total, first: page.list[0] });
        })
        .catch(() => {
          // The box shows a dash instead of loading forever (see SummaryBoxes)
          if (!ignore) setDueSoon({ count: null });
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [dueSoonQuery, tries, isGuest]);

  // true while the list on screen is for older filters
  const updating = results !== null && results.query !== query;

  // Runs when "Try again" is pressed: back to "Loading...", then ask again
  function retry() {
    setResults(null);
    setLoadError(false);
    setTries(tries + 1);
  }

  // Previous and Next: page n of the same list, 50 fresh jobs in place of the
  // ones showing (the backend sorts and filters every job, so each page carries
  // on where the last one stopped).
  // The button you pressed goes away while the page loads (the loading rows
  // take the table's place), so the keyboard focus moves to the list's heading
  // right away instead of getting lost, and the page scrolls back up to the top
  // of the list, so you start the new page at its first job (WCAG).
  // preventScroll: the scrollIntoView line does the scrolling (to the list, not
  // to the hidden heading)
  async function goToPage(n) {
    // This request's number (see listRequest above): if the filters change, or
    // Previous / Next is pressed again, before this answer arrives, it's dropped
    const thisRequest = ++listRequest.current;
    const forQuery = results.query;
    setPageLoading(n);
    setPageProblem("");
    setPageNote("Loading page " + n + "...");
    // The list's heading, in ResultsSection ("?." skips it if it isn't there)
    const heading = document.getElementById("discovery-results-title");
    heading?.focus({ preventScroll: true });
    heading?.closest("section")?.scrollIntoView({ block: "start" });
    try {
      const page = await fetchPage(forQuery, n);
      if (listRequest.current !== thisRequest) return;
      setResults({ query: forQuery, ...page, page: n });
      // "Page 2 of 14", or just "Page 2" for guests (the public list doesn't say how many)
      setPageNote(page.total === null ? "Page " + n : "Page " + n + " of " + Math.max(1, Math.ceil(page.total / pageSize)));
    } catch (error) {
      // The real reason goes to the console (F12). The page you were on stays,
      // and the words under it say what happened
      console.error("Loading page " + n + " failed:", error);
      if (listRequest.current !== thisRequest) return;
      const problem = "Couldn't load page " + n + ". Check your connection, then try again.";
      setPageProblem(problem);
      setPageNote(problem);
    }
    setPageLoading(0);
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
  // (A major the backend skipped doesn't count: it isn't filtering anything, see FilterBar)
  const filtersInUse = JSON.stringify(shownFilters) !== JSON.stringify(noFilters) || search.trim() !== "" || picked !== "All"
    || (forMajor && results?.majorIgnored !== true);

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
  // seconds, for up to 3 minutes), then loads the list again.
  // info.worked is false when the check ran into a problem (a job site or the
  // database didn't answer). Then it says so, instead of "Up to date", which
  // would make students think they're seeing the newest jobs when they aren't
  async function refresh() {
    setRefreshing(true);
    setRefreshMessage("Checking the job sites for new listings. This can take a minute...");
    try {
      const answer = await api("/jobs/refresh", { method: "POST" });
      let info = answer.refresh;
      // When the next check can start, like "3:45 PM"
      const nextTime = () => new Date(info.next_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      if (answer.started || info.running) {
        for (let i = 0; i < 36 && info.running; i++) {
          await wait(5000);
          info = (await api("/jobs/refresh")).refresh;
        }
        if (info.running) {
          setRefreshMessage("Still checking. New jobs will show up in a few minutes.");
        } else if (info.worked === false) {
          setRefreshMessage("The check for new listings had a problem, so some new jobs may be missing. Try again after " + nextTime() + ".");
        } else {
          setRefreshMessage("Up to date: the job sites were just checked.");
        }
      } else if (info.worked === false) {
        // Someone checked less than 30 minutes ago, and that check had a problem
        setRefreshMessage("The last check for new listings had a problem, so some new jobs may be missing. Try again after " + nextTime() + ".");
      } else {
        // Someone checked less than 30 minutes ago: the list already has what they found
        setRefreshMessage("Up to date: the job sites were checked recently. You can check again after " + nextTime() + ".");
      }
    } catch (error) {
      setRefreshMessage("Couldn't check the job sites: " + error.message);
    }
    setTries((n) => n + 1);
    setRefreshing(false);
  }

  // The job to open right away, or null if the address has no "?job=".
  // Real job ids are long codes (uuids) like "3f2a...", so it stays as text.
  const openJobId = searchParams.get("job");

  // Runs after that job's pop-up opens: removes "?job=..." from the address.
  // replace: true swaps the address instead of adding a new one, so the
  // browser's Back button still goes back to the page you came from.
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
  // (Only on page 1: on the next pages it would be the same job at the top of every page)
  const shownResults =
    results && results.page === 1 && linkedJob && linkedJob.query === results.query && !results.list.some((job) => job.id === linkedJob.job.id)
      ? // extra: 1 says one job was added at the top, so the count under the
        // table ("Showing 1 to 50 of ...") doesn't count it
        { ...results, list: [linkedJob.job, ...results.list], extra: 1 }
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
      {/* Guests get the simple bar with Log in and Sign up (GuestBar);
          logged-in students get the site's NavBar */}
      {isGuest ? <GuestBar /> : <NavBar />}
      {/* One column, like a dashboard: the title and search, the summary
          boxes, the tabs and Sort, the filters, then the table.
          The parts that need an account are left out for guests (see "Guests"
          near the top of this file) */}
      <main className="discovery-page">
        {/* The high school line: from your profile, or for a guest, from
            "Who it's for" (like a counselor's ?level=high-school link) */}
        <DiscoveryHeader
          search={search}
          setSearch={setSearch}
          forHighSchool={(isGuest ? shownFilters.level : profileLevel) === "high-school"}
          isGuest={isGuest}
        />
        {!isGuest && (
          <>
            {/* "Where are you in school?", until you've picked (see LevelPrompt) */}
            <LevelPrompt profile={profile} />
            {/* "Search the web" (only once something is typed in the search bar) */}
            <WebSearch search={search} onFound={() => setTries((count) => count + 1)} onHide={hideCompany} hidden={hidden} />
            {/* (loading only while it's still coming: if it couldn't be loaded,
                the box shows a dash instead, see SummaryBoxes) */}
            <SummaryBoxes total={results?.total ?? null} dueSoon={dueSoon} trackerCount={trackerCount} loading={results === null && !loadError} />
          </>
        )}

        {/* The tabs on the left; Sort and Refresh on the right (not for guests:
            the public list is always newest first, and Refresh has a daily limit) */}
        <div className="discovery-toolbar">
          <TypeTabs picked={picked} setPicked={setPicked} />

          {!isGuest && (
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
          )}
        </div>
        {/* What Refresh found. role="status" reads it out (WCAG) */}
        {!isGuest && (
          <p className="discovery-refresh-message" role="status">
            {refreshMessage}
          </p>
        )}

        <FilterBar
          filters={shownFilters}
          change={changeFilter}
          major={major}
          // true when the backend couldn't use your major (see fetchPage). Read from
          // the last answer, so it's false until the first one arrives
          majorIgnored={results?.majorIgnored === true}
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
          isGuest={isGuest}
        />

        <ResultsSection
          results={shownResults}
          loadError={loadError}
          retry={retry}
          updating={updating}
          // guests' list is always newest first (the table's name says how it's sorted)
          sortBy={isGuest ? "newest" : sortBy}
          showAll={clearFilters}
          onSuggestion={pickSuggestion}
          goToPage={goToPage}
          pageLoading={pageLoading}
          pageProblem={pageProblem}
          pageNote={pageNote}
          openJobId={openJobId}
          onOpened={clearOpenJob}
          onHide={hideCompany}
          isGuest={isGuest}
        />

        {/* The tip is about Best fit and your profile, so it's only for students */}
        {!isGuest && <ProfileTip />}
      </main>
    </>
  );
}

// "export default" lets App.jsx import this page.
export default Discovery;
