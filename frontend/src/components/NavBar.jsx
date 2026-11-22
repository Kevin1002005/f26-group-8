// NavBar.jsx is the bar across the top of every page you see logged in. It
// stays at the top while you scroll. It has the four parts of ScoutSearch:
// Opportunities, My applications, Resume, and My info.
// It started out as part of the Feed page, which is why its class names still
// start with "feed-" (the Feed was taken out in 2026-11). The styles are in
// index.css, under "Top bar (NavBar)". Every page that needs it imports it with:
//   import NavBar from "../components/NavBar.jsx";

// Link makes a clickable link to another page of our site.
// NavLink is a Link that knows when its page is the one you're on: it adds
// aria-current="page", which index.css uses to underline it in blue, and
// which screen readers announce as "current page" (WCAG).
import { Link, NavLink } from "react-router";
// AccountMenu is your circle and the dropdown it opens (components/AccountMenu.jsx).
import AccountMenu from "./AccountMenu.jsx";
// SiteLogo is the binoculars picture and the name (components/SiteLogo.jsx).
import SiteLogo from "./SiteLogo.jsx";
// ThemeToggle is the sun/moon button that switches Light / Dark / System (components/ThemeToggle.jsx).
import ThemeToggle from "./ThemeToggle.jsx";
// The top bar
function NavBar() {
  return (
    // <nav> tells screen readers this is the site's navigation (WCAG).
    // aria-label="Main" names it, so it can be told apart from other
    // sets of links on a page (like "My info parts" on the My info page)
    <nav className="feed-nav" aria-label="Main">
      {/* Left side: the site name. There used to be a search box here too,
          but it didn't search anything, and on Discovery it sat right above
          Discovery's own search box (the one that works), so it was taken out */}
      <div className="feed-nav-left">
        {/* The logo. Clicking it goes back to the About page, the site's front
            page, so you can always get there from inside the app. (Your home
            page, Opportunities, is the first link on the right. On About, the
            Home button brings you back to it) */}
        <Link to="/about" className="feed-nav-logo">
          <SiteLogo />
        </Link>
      </div>
      {/* Right side: links to other pages, the sun/moon button, then your circle.
          (Feed, Network, and Messages used to be here too. They were taken out
          in 2026-11, when ScoutSearch became about opportunities and resumes) */}
      <div className="feed-nav-right">
        {/* The Discovery page: internships, co-ops, and jobs.
            "Opportunities" is too long for the phone top bar, so phones show
            "Jobs" instead (index.css swaps them, hiding the other word with
            display: none). No aria-label: screen readers and voice control then
            use whichever word is showing, so saying "tap Jobs" works (WCAG) */}
        <NavLink to="/discovery">
          <span className="feed-nav-long-word">Opportunities</span>
          <span className="feed-nav-short-word">Jobs</span>
        </NavLink>
        {/* The Application tracker: the jobs you saved or applied to */}
        <NavLink to="/applications">My applications</NavLink>
        {/* The Resume builder: fill in a form, download a PDF. It used to be
            only in the circle's dropdown */}
        <NavLink to="/resume">Resume</NavLink>
        {/* Your details (what used to be "Edit profile"): only you see them,
            and Opportunities uses them to find jobs that fit you */}
        <NavLink to="/my-info">My info</NavLink>
        {/* Switches Light / Dark / System. On phones this row moves under the
            logo, so it's still in the top bar, never hidden */}
        <ThemeToggle />
        {/* Your circle. Clicking it opens a dropdown with Settings and Log out */}
        <AccountMenu />
      </div>
    </nav>
  );
}

// "export default" lets other files import NavBar (every logged-in page does this).
export default NavBar;
