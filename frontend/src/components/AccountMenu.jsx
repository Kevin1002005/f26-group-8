// AccountMenu.jsx is your circle in the top bar, and the dropdown that opens
// when you click it. The dropdown has links to your profile, Edit profile,
// Resume builder, Settings, and Log out. (To get to the About page, click the logo.)
// NavBar.jsx uses it, so it shows up on every page that has the top bar.
// The styles are in index.css, under "Top bar: account menu".
//
// How it closes: click the circle again, click anywhere else on the page,
// press Escape, Tab out of it, or pick one of the items.

// useState lets the menu remember if it's open or closed.
// useRef keeps a reference to something on the screen (here: the circle and the menu).
// useEffect runs a bit of code after the page has been redrawn.
import { useEffect, useRef, useState } from "react";
// Link makes a clickable link to another page of our site.
// useNavigate goes to another page from code (Log out uses it, below).
import { Link, useNavigate } from "react-router";
// markLoggedOut forgets that you're logged in (login-status.js)
import { markLoggedOut } from "../login-status.js";
// useCurrentUser says who is logged in: name, initials, email (use-current-user.js)
import { useCurrentUser } from "../use-current-user.js";

// A simple outline of a person, for the circle when we don't know your name or
// email yet (for example, for a moment while Supabase reads the login as the page opens).
// "currentColor" makes it the circle's text color (white).
// aria-hidden: it's decoration, the button's aria-label names it (WCAG)
function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function AccountMenu() {
  // Who is logged in. Before, this was always the made-up "Roemer Mallari"
  const me = useCurrentUser();
  // The name at the top of the dropdown: your name, or your email if Google
  // didn't send a name, or "Your account" if we don't know either
  const shownName = me.name || me.email || "Your account";

  // "open" is true while the dropdown is showing. It starts closed (false)
  const [open, setOpen] = useState(false);

  // The wrapper around the circle and the dropdown, so the code can tell
  // whether a click happened inside the menu or somewhere else
  const menuRef = useRef(null);
  // The circle button, so the code can put the keyboard focus back on it
  const buttonRef = useRef(null);

  // While the menu is open, listen for clicks outside it and for the Escape key.
  // The "return" part stops listening once the menu closes (or the page is left)
  useEffect(() => {
    if (!open) return;

    // A click anywhere that isn't inside the menu closes it
    function handleClickOutside(event) {
      if (!menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    // Escape closes it and puts the keyboard focus back on the circle,
    // so keyboard users don't get lost (WCAG)
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Runs when the keyboard focus leaves something inside the menu.
  // event.relatedTarget is where the focus went. If it went somewhere
  // outside the menu (for example, Tab past the last item), close it
  function handleBlur(event) {
    if (!menuRef.current.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  // Closes the menu. Each item runs this when it's clicked
  function closeMenu() {
    setOpen(false);
  }

  // navigate("/login") opens the Log in page from code
  const navigate = useNavigate();

  // Runs when "Log out" is clicked: closes the menu, forgets the login, and
  // only THEN opens the Log in page.
  // event.preventDefault() stops the link from opening /login right away.
  // Otherwise the Log in page would open while Supabase is still logging out,
  // find the old login, and send you straight back to Opportunities
  // (On a page behind the login guard, the guard notices the log out too and
  // opens Log in first. "replace" stops that from adding a second Log in page
  // to the browser's history, so Back doesn't show Log in twice)
  async function handleLogOut(event) {
    event.preventDefault();
    setOpen(false);
    await markLoggedOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="account-menu" ref={menuRef} onBlur={handleBlur}>
      {/* Your circle. Clicking it opens or closes the dropdown
          ("!open" means "the opposite of open").
          aria-expanded tells screen readers if the dropdown is open, and
          aria-controls says which part of the page it opens (WCAG).
          aria-label gives it a name, because initials like "KL" alone don't say what it does */}
      <button
        type="button"
        ref={buttonRef}
        className="feed-post-avatar account-menu-button"
        aria-expanded={open}
        aria-controls="account-menu-list"
        aria-label="Account menu"
        onClick={() => setOpen(!open)}
      >
        {/* Your initials, or the person outline if we don't know your name */}
        {me.initials || <PersonIcon />}
      </button>

      {/* "open && (...)" means "only draw the dropdown while it's open".
          tabIndex={-1} on it: clicking an empty spot in the dropdown (your name,
          the line, the space between items) moves the focus to the dropdown
          itself instead of to the page, so handleBlur doesn't close it under
          your mouse. -1 means it's never a stop when you press Tab */}
      {open && (
        <div id="account-menu-list" className="account-menu-list" tabIndex={-1}>
          {/* Your name and a link to your profile. (The Profile page itself
              still shows the made-up example person until it's connected) */}
          <div className="account-menu-header">
            <p className="account-menu-name">{shownName}</p>
            <Link to="/profile" className="account-menu-item account-menu-profile-link" onClick={closeMenu}>
              View profile
            </Link>
          </div>

          {/* The items. It's a list (<ul>), so screen readers say how many there are */}
          {/* Edit profile sits first, right under "View profile", since the two
              go together. (A "Preferences" item used to be here too, but its
              Settings tab only said "Coming soon", so both were taken out) */}
          <ul>
            {/* Goes straight to Edit profile. This used to be "Profile picture",
                which opened a Settings tab that only said "Coming soon" */}
            <li>
              <Link to="/editprofile" className="account-menu-item" onClick={closeMenu}>
                Edit profile
              </Link>
            </li>
            {/* The Resume builder (pages/ResumeBuilder.jsx): fill in a form, download a PDF */}
            <li>
              <Link to="/resume" className="account-menu-item" onClick={closeMenu}>
                Resume builder
              </Link>
            </li>
            <li>
              <Link to="/settings" className="account-menu-item" onClick={closeMenu}>
                Settings
              </Link>
            </li>
          </ul>

          {/* The thin line above Log out. It's only decoration */}
          <div className="account-menu-divider" aria-hidden="true"></div>

          {/* Log out forgets the login (see login-status.js) and goes to the Log in page.
              It stays a link to /login, so it still reads as "go to Log in" */}
          <Link to="/login" className="account-menu-item" onClick={handleLogOut}>
            Log out
          </Link>
        </div>
      )}
    </div>
  );
}

// "export default" lets other files import AccountMenu (NavBar.jsx does this).
export default AccountMenu;
