// StoragePolicy.jsx is the Cookie Policy (yoursite.com/cookie-policy).
// (The file is named so that ad and cookie-banner blockers leave it alone: their lists block
// files named like "PrivacyPolicy.js" or "CookiePolicy.js", which would stop the page loading.)
// ScoutSearch sets no cookies and has no trackers (checked 2026-11-16), so this page
// mostly lists what IS saved in your browser instead (data/legal.js, browserStorage),
// each with why and for how long. The footer's "Cookie settings" opens that list
// (#what-we-store): there's nothing optional to switch on or off.
// IF THE SITE EVER ADDS analytics, ads, or anything else optional: it must ask first
// (with "Reject" as easy as "Accept"), and this page and data/legal.js must change.
// The layout is components/LegalPage.jsx; the styles are in index.css, "Legal pages".

// Link goes to another page of the site without reloading everything.
import { Link } from "react-router";
// The shared layout, a fact-or-placeholder, and "needs legal review" notes
import LegalPage, { Fill, Review } from "../components/LegalPage.jsx";
// The facts: the contact email, and everything saved in the browser
import { browserStorage, legal } from "../data/legal.js";

const sections = [
  {
    id: "what-cookies-are",
    title: "What cookies are",
    body: (
      <p>
        Cookies are small files a website saves in your browser, which your browser sends back to that website
        with every visit. Websites can also save things in your browser's storage ("localStorage" and
        "sessionStorage"). Unlike cookies, storage stays in your browser: it isn't sent along with each visit,
        and only that website can read it.
      </p>
    ),
  },
  {
    id: "our-cookies",
    title: "ScoutSearch uses no cookies",
    body: (
      <>
        <p>ScoutSearch sets no cookies, and no other company's cookies are set on our pages. By kind:</p>
        <ul>
          <li><strong>Strictly necessary:</strong> no cookies. A few items in your browser's storage keep you logged in (listed below).</li>
          <li><strong>Functional:</strong> no cookies. Storage items remember your settings and keep copies of your profile, tracker, and resume (listed below).</li>
          <li><strong>Analytics:</strong> none. We don't measure visitors.</li>
          <li><strong>Advertising and marketing:</strong> none. There are no ads, tracking pixels, or retargeting.</li>
        </ul>
      </>
    ),
  },
  {
    id: "what-we-store",
    title: "What's saved in your browser",
    body: (
      <>
        <p>
          This is everything, kept in your browser's storage. Each one is needed for something you asked the
          site to do, so there's no cookie banner and nothing optional to switch off.
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <caption className="sr-only">Everything ScoutSearch saves in your browser</caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Kind</th>
                <th scope="col">What it's for</th>
                <th scope="col">How long it stays</th>
              </tr>
            </thead>
            <tbody>
              {browserStorage.map((item) => (
                <tr key={item.name}>
                  {/* scope="row": the first cell names the row, for screen readers (WCAG) */}
                  <th scope="row">{item.name}</th>
                  <td>{item.category}</td>
                  <td>{item.purpose}</td>
                  <td>{item.lasts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Review>that these items count as strictly necessary, or as features the user asked for, under the EU and UK rules for storing things on people's devices (so no consent is needed).</Review>
      </>
    ),
  },
  {
    id: "other-companies",
    title: "Other companies' cookies",
    body: (
      <p>
        If you choose "Continue with Google", you go to Google's own sign-in page, which uses Google's cookies
        under Google's policies. When you press Apply on a job, you go to the employer's site, which may use its
        own cookies. ScoutSearch doesn't control either.
      </p>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices",
    body: (
      <>
        <ul>
          <li><strong>Log out</strong> (the menu under your circle) to remove the login items.</li>
          <li><strong>Delete your account</strong> on the <Link to="/settings#privacy">Settings page</Link> to remove your information and this browser's copies of it.</li>
          <li><strong>Clear this site's data</strong> in your browser's settings (usually under Privacy, "Cookies and site data") to remove everything above. You'll be logged out, and this browser's copies of your profile, tracker, and resume will be gone (your account still has them).</li>
        </ul>
        <p>
          Nothing here relies on your consent, so there's no consent to withdraw. If we ever add something
          optional, like analytics, we'll ask first, make "Reject" as easy as "Accept", and add a way to change
          your mind on this page.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        Questions about this policy:{" "}
        {legal.privacyEmail
          ? <a href={"mailto:" + legal.privacyEmail}>{legal.privacyEmail}</a>
          : <Fill value={null} what="the privacy contact email" />}
        . See also the <Link to="/privacy-policy">Privacy Policy</Link>.
      </p>
    ),
  },
];

function StoragePolicy() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="ScoutSearch doesn't use cookies, analytics, or ads. This page lists the few things it saves in your browser so it works, and how to remove them."
      sections={sections}
    />
  );
}

export default StoragePolicy;
