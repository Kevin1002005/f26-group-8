// LegalPage.jsx is the layout the Privacy Policy, Cookie Policy, and Terms of Service
// share: the top bar, the title, when it takes effect, an "On this page" list of
// links, then each section. The pages only pass in their words.
// The styles are in index.css, under "Legal pages".

// useEffect runs code after the page is on the screen (here: jumping to a section).
import { useEffect } from "react";
// Link goes to another page of the site without reloading everything.
// useLocation gives the web address, including the "#..." at the end.
import { Link, useLocation } from "react-router";
// SiteLogo is the binoculars picture and the name (components/SiteLogo.jsx).
import SiteLogo from "./SiteLogo.jsx";
// ThemeToggle is the sun/moon button (components/ThemeToggle.jsx).
import ThemeToggle from "./ThemeToggle.jsx";
// isLoggedIn says whether the logo goes to Opportunities or to About.
import { isLoggedIn } from "../login-status.js";
// The facts the policies are built from (data/legal.js)
import { legal, services } from "../data/legal.js";

// A fact from data/legal.js, or, while it's still null there, a highlighted
// "[To fill in: ...]" so nobody mistakes it for a finished page.
// props.value  the fact (null if not decided yet)
// props.what   what has to be filled in, in plain words
export function Fill(props) {
  if (props.value !== null && props.value !== undefined) return props.value;
  return <mark className="legal-todo">[To fill in: {props.what}]</mark>;
}

// A paragraph that someone who knows the law has to check before it's relied on
export function Review(props) {
  return (
    <p className="legal-review">
      <strong>Needs legal review:</strong> {props.children}
    </p>
  );
}

// The whole page.
// props.title     "Privacy Policy"
// props.intro     the first paragraph (under the title)
// props.sections  [{ id, title, body }]: id is the "#..." that jumps to it
function LegalPage(props) {
  // Logged in: home is Opportunities. Not logged in: the About page
  const homePath = isLoggedIn() ? "/discovery" : "/about";
  // true while any fact in data/legal.js is still missing (a service's region counts too)
  const isDraft = Object.values(legal).some((value) => value === null) || services.some((service) => service.region === null);

  // A link like /cookie-policy#what-we-store (the footer's "Cookie settings"): jump to
  // that section, and put the keyboard focus on its heading so screen readers start
  // there (WCAG). The site opens pages at the top by itself, so it has to be done here.
  // [location.hash] at the end: run again when the "#..." changes
  const location = useLocation();
  useEffect(() => {
    const heading = location.hash && document.getElementById(location.hash.slice(1) + "-title");
    if (!heading) return;
    heading.closest("section").scrollIntoView();
    // tabindex -1 lets code focus a heading, without making it a Tab stop
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [location.hash]);

  return (
    <div className="legal-page">
      {/* <title> is the name on the browser tab (WCAG) */}
      <title>{props.title + " | ScoutSearch"}</title>
      <header className="legal-bar">
        <Link to={homePath} className="legal-logo">
          <SiteLogo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="legal-main">
        {/* The page's one <h1> (WCAG) */}
        <h1 className="legal-title">{props.title}</h1>
        <p className="legal-meta">
          Effective: <Fill value={legal.effectiveDate} what="the date this takes effect" /> · Version {legal.policyVersion}
        </p>
        {isDraft && (
          <p className="legal-draft">
            Draft: the highlighted parts still have to be filled in, and the page checked by someone who
            knows the law, before it can be relied on.
          </p>
        )}
        <p className="legal-intro">{props.intro}</p>

        {/* "On this page": a link to each section. <nav> with a name, so screen
            readers can find it and tell it apart from other links (WCAG) */}
        <nav className="legal-toc" aria-labelledby="legal-toc-title">
          <h2 id="legal-toc-title" className="legal-toc-title">On this page</h2>
          <ol>
            {props.sections.map((section) => (
              <li key={section.id}>
                <a href={"#" + section.id}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Each section, named by its heading (WCAG) */}
        {props.sections.map((section) => (
          <section key={section.id} id={section.id} className="legal-section" aria-labelledby={section.id + "-title"}>
            <h2 id={section.id + "-title"}>{section.title}</h2>
            {section.body}
          </section>
        ))}
      </main>
    </div>
  );
}

export default LegalPage;
