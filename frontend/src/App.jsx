// App.jsx decides which page to show, based on the web address.
// For example, going to /login shows the Login page.

// Routes: a group of all the pages.
// Route: one page. It matches a web address (path) to a component (element).
// Navigate: sends the visitor to a different address automatically.
// useLocation: the current address (used to reset the error page, below).
// useNavigationType: how you got to this page: "POP" for Back or Forward
import { Routes, Route, Navigate, useLocation, useNavigationType } from "react-router";
// lazy: waits to download a page's code until someone opens that page.
// Suspense: what to show during the split second that download takes.
// useEffect runs code after the page is on the screen (see PageChange)
import { lazy, Suspense, useEffect } from "react";
// RequireLogin sends logged-out visitors to the Log in page (components/RequireLogin.jsx).
// It's tiny, so it loads right away like About.
import RequireLogin from "./components/RequireLogin.jsx";
// ErrorBoundary shows a "Something went wrong" page instead of a blank one if
// a page breaks (components/ErrorBoundary.jsx). It loads right away on
// purpose: it has to work even when a page's file can't be downloaded.
import ErrorBoundary from "./components/ErrorBoundary.jsx";
// Each page lives in its own file inside the pages folder.
// The About page loads right away, because it's the first page everyone sees.
import About from "./pages/About.jsx";
// SiteFooter is the row of legal links at the bottom of every page (components/SiteFooter.jsx)
import SiteFooter from "./components/SiteFooter.jsx";
// Every other page only downloads when someone opens it. Without lazy(),
// opening the About page downloaded the code for all 11 pages at once.
// import("...") with parentheses means "fetch this file later, when asked".
// (lazy() needs the page file to use "export default", which all of ours do.)
const Login = lazy(() => import("./pages/Login.jsx"));
const Signup = lazy(() => import("./pages/Signup.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const Feed = lazy(() => import("./pages/Feed.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const EditProfile = lazy(() => import("./pages/EditProfile.jsx"));
const Network = lazy(() => import("./pages/Network.jsx"));
const Messages = lazy(() => import("./pages/Messages.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Discovery = lazy(() => import("./pages/Discovery.jsx"));
const ApplicationTracker = lazy(() => import("./pages/ApplicationTracker.jsx"));
const ResumeBuilder = lazy(() => import("./pages/ResumeBuilder.jsx"));
const Welcome = lazy(() => import("./pages/Welcome.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
// The Privacy Policy and Cookie Policy files are named DataPolicy and StoragePolicy on purpose:
// ad blockers block files named like "PrivacyPolicy.js" or "CookiePolicy.js"
const DataPolicy = lazy(() => import("./pages/DataPolicy.jsx"));
const StoragePolicy = lazy(() => import("./pages/StoragePolicy.jsx"));
const TermsOfService = lazy(() => import("./pages/TermsOfService.jsx"));

// The path of the page PageChange last handled, like "/discovery". null until
// the first page opens. Only the path counts: jumping to a section of the
// same page (#features) or changing "?job=1" isn't a new page
let handledPage = null;
// How many pages PageChange has handled during this visit
let pagesSeen = 0;

// PageChange does what a full page load would do, each time a new page opens.
// This site swaps pages without reloading, so on its own the browser:
//  - stays scrolled down, so a link near the bottom of a long page opens the
//    next page partway down
//  - drops the keyboard focus, and screen readers don't say which page opened
// So, after each new page is on the screen, it scrolls to the top (except for
// Back and Forward, where the browser puts you back where you were) and puts
// the keyboard focus on the page's heading (<h1>), so screen readers read it
// and Tab continues from the top of the new page (WCAG).
// The first page of a visit is left alone: the browser already handled it.
// So is a page you're sent to straight from the first one ("/" opens About, a
// locked page opens Log in, both with "replace"): that's still the page you
// opened, and its first Tab stop should still be "Skip to main content".
// It sits inside the ErrorBoundary, which starts over on every page, so this
// runs once per page, after the page's file has downloaded.
function PageChange() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    // Still the same page (a section link, "?job=", or React running effects
    // twice while developing): nothing to do
    if (handledPage === location.pathname) return;
    handledPage = location.pathname;
    pagesSeen += 1;
    const isFirstPage = pagesSeen === 1 || (pagesSeen === 2 && navigationType === "REPLACE");
    if (isFirstPage) return;
    if (navigationType !== "POP") window.scrollTo(0, 0);
    const heading = document.querySelector("h1");
    if (heading) {
      // tabindex -1 lets code focus a heading, without making it a Tab stop.
      // preventScroll: the focus mustn't undo the scrolling above
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [location.pathname, navigationType]);
  // It doesn't draw anything
  return null;
}

// A "component" is a function that returns what should appear on the screen.
function App() {
  // The current address. key={location.pathname} gives the ErrorBoundary a
  // new name on every page, so after an error, clicking a link to another
  // page clears the error page and tries again
  const location = useLocation();

  return (
    // The safety net around every page (see ErrorBoundary.jsx)
    <ErrorBoundary key={location.pathname}>
      {/* While a page is downloading, Suspense shows the "fallback" instead.
          It's usually too quick to notice. The text is hidden on screen, but
          role="status" lets screen readers hear that a page is loading (WCAG) */}
      <Suspense fallback={<p role="status" className="sr-only">Loading page...</p>}>
        {/* Scrolls to the top and focuses the new page's heading (see above) */}
        <PageChange />
        <Routes>
          {/* "/" is the homepage. It sends visitors straight to the About page.
              "replace" swaps "/" for "/about" in the browser's history instead of
              adding a new step. Without it, pressing Back on About went to "/",
              which sent you right back to About, so you could never leave */}
          <Route path="/" element={<Navigate to="/about" replace />} />
          {/* yoursite.com/about shows the About page */}
          <Route path="/about" element={<About />} />
          {/* yoursite.com/login shows the Login page */}
          <Route path="/login" element={<Login />} />
          {/* yoursite.com/signup shows the Signup page */}
          <Route path="/signup" element={<Signup />} />
          {/* yoursite.com/reset-password is where the "reset your password" email
              link lands. It's out here (not inside RequireLogin) because people
              who forgot their password aren't logged in */}
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* The legal pages: open to everyone, since people should be able to
              read them before signing up */}
          <Route path="/privacy-policy" element={<DataPolicy />} />
          <Route path="/cookie-policy" element={<StoragePolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />

          {/* yoursite.com/discovery shows the Discovery page (Opportunities).
              Anyone can see it, even without an account, so a counselor can
              share a link like /discovery?level=high-school. Guests get the
              public job list without the parts that need an account (see
              Discovery.jsx). allowGuests lets them in; logged-in students
              still go through the welcome guide first, like everywhere else */}
          <Route element={<RequireLogin allowGuests />}>
            <Route path="/discovery" element={<Discovery />} />
          </Route>

          {/* Every page inside here needs you to be logged in. A Route with no
              "path" doesn't change the web address; it just puts RequireLogin in
              front of all the pages inside it. Logged out? It sends you to /login */}
          <Route element={<RequireLogin />}>
            {/* yoursite.com/welcome shows the welcome guide. New accounts are
                sent here first (see RequireLogin.jsx) */}
            <Route path="/welcome" element={<Welcome />} />
            {/* yoursite.com/feed shows the Feed page */}
            <Route path="/feed" element={<Feed />} />
            {/* yoursite.com/profile shows the Profile page */}
            <Route path="/profile" element={<Profile />} />
            {/* yoursite.com/editprofile shows the EditProfile page */}
            <Route path="/editprofile" element={<EditProfile />} />
            {/* yoursite.com/network shows the Network page */}
            <Route path="/network" element={<Network />} />
            {/* yoursite.com/messages shows the Messages page */}
            <Route path="/messages" element={<Messages />} />
            {/* yoursite.com/applications shows the Application tracker page */}
            <Route path="/applications" element={<ApplicationTracker />} />
            {/* yoursite.com/settings shows the Settings page */}
            <Route path="/settings" element={<Settings />} />
            {/* yoursite.com/resume shows the Resume builder */}
            <Route path="/resume" element={<ResumeBuilder />} />
          </Route>

          {/* "*" matches any address that isn't listed above (like a typo, /feeed).
              It shows the "Page not found" page (pages/NotFound.jsx) with a way
              home, instead of a blank page */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        {/* The legal links at the bottom of every page. Inside Suspense, so it
            doesn't flash at the top while a page is still downloading. The About
            page has its own footer with the same links */}
        {location.pathname !== "/about" && <SiteFooter />}
      </Suspense>
    </ErrorBoundary>
  );
}

// "export default" lets other files import App (main.jsx does this).
export default App;
