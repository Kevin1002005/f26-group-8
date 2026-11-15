// Separate file for NavBar as they are used in both Feed and Profile
// NavBar.jsx is the bar across the top of the page. It stays at the top while you scroll.
// It used to be a function inside Feed.jsx, but the Profile page needs the
// same bar. So it moved into its own file, and both pages import it with:
//   import NavBar from "../components/NavBar.jsx";
// Now a change here shows up on both pages.
// The styles are in index.css, under "Feed page". The class names still
// start with "feed-" because the bar was first made for the Feed page.

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
    // sets of links on a page (like "Profile sections" on the Profile page)
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
      {/* Right side: links to other pages, the sun/moon button, then your circle */}
      <div className="feed-nav-right">
        {/* The Feed: posts from students, and job listings posted there.
            (It was hidden for a while, but the team needs it: listings will
            be shared as posts on the Feed.) */}
        <NavLink to="/feed">Feed</NavLink>
        {/* The Discovery page: internships, co-ops, and jobs.
            "Opportunities" is too long for the phone top bar, so phones show
            "Jobs" instead (index.css swaps them, hiding the other word with
            display: none). No aria-label: screen readers and voice control then
            use whichever word is showing, so saying "tap Jobs" works (WCAG) */}
        <NavLink to="/discovery">
          <span className="feed-nav-long-word">Opportunities</span>
          <span className="feed-nav-short-word">Jobs</span>
        </NavLink>
        {/* The Application tracker: the jobs you saved or applied to.
            Before, the only way there was a box on the Discovery page */}
        <NavLink to="/applications">My applications</NavLink>
        {/* Network and Messages used to be here. They're hidden for now:
            Network only has made-up people, and Messages can't load until the
            backend has its routes (see frontend/plans.md, B13). The pages still
            exist at /network and /messages. When they work, put these back:
              <Link to="/network">Network</Link>
              <Link to="/messages">Messages</Link> */}
        {/* Switches Light / Dark / System. On phones this row moves under the
            logo, so it's still in the top bar, never hidden */}
        <ThemeToggle />
{/* Your circle. Clicking it opens a dropdown with View profile,
            Edit profile, Settings, and Log out */}
        <AccountMenu />
      </div>
    </nav>
  );
}

// "export default" lets other files import NavBar (Feed.jsx and Profile.jsx do this).
export default NavBar;
