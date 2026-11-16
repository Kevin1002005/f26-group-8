// SiteFooter.jsx is the row of links at the bottom of every page (App.jsx puts it
// there), so the legal pages can always be found. The About page has its own bigger
// footer with the same links instead.
// The styles are in index.css, under "Site footer".
//
// "Cookie settings" goes to the Cookie Policy's list of what's saved in your browser:
// ScoutSearch has no optional cookies or trackers, so there's nothing to switch on or
// off. If the site ever adds analytics or ads, that's where a real on/off choice goes.

// Link goes to another page of the site without reloading everything.
import { Link } from "react-router";

function SiteFooter() {
  return (
    <footer className="site-footer">
      {/* aria-label names this group of links for screen readers, so it isn't
          confused with the top bar's links (WCAG) */}
      <nav aria-label="Legal">
        <ul className="site-footer-links">
          <li><Link to="/privacy-policy">Privacy Policy</Link></li>
          <li><Link to="/cookie-policy">Cookie Policy</Link></li>
          <li><Link to="/terms-of-service">Terms of Service</Link></li>
          <li><Link to="/privacy-policy#your-rights">Privacy requests</Link></li>
          <li><Link to="/cookie-policy#what-we-store">Cookie settings</Link></li>
        </ul>
      </nav>
    </footer>
  );
}

export default SiteFooter;
