// App.jsx decides which page to show, based on the web address.
// For example, going to /login shows the Login page.

// Routes: a group of all the pages.
// Route: one page. It matches a web address (path) to a component (element).
// Navigate: sends the visitor to a different address automatically.
import { Routes, Route, Navigate } from "react-router";
// lazy: waits to download a page's code until someone opens that page.
// Suspense: what to show during the split second that download takes.
import { lazy, Suspense } from "react";
// RequireLogin sends logged-out visitors to the Log in page (components/RequireLogin.jsx).
// It's tiny, so it loads right away like About.
import RequireLogin from "./components/RequireLogin.jsx";
// Each page lives in its own file inside the pages folder.
// The About page loads right away, because it's the first page everyone sees.
import About from "./pages/About.jsx";
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

// A "component" is a function that returns what should appear on the screen.
function App() {
  return (
    // While a page is downloading, Suspense shows the "fallback" instead.
    // It's usually too quick to notice. The text is hidden on screen, but
    // role="status" lets screen readers hear that a page is loading (WCAG)
    <Suspense fallback={<p role="status" className="sr-only">Loading page...</p>}>
      <Routes>
        {/* "/" is the homepage. It sends visitors straight to the About page */}
        <Route path="/" element={<Navigate to="/about" />} />
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

        {/* Every page inside here needs you to be logged in. A Route with no
            "path" doesn't change the web address; it just puts RequireLogin in
            front of all the pages inside it. Logged out? It sends you to /login */}
        <Route element={<RequireLogin />}>
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
          {/* yoursite.com/discovery shows the Discovery page */}
          <Route path="/discovery" element={<Discovery />} />
          {/* yoursite.com/applications shows the Application tracker page */}
          <Route path="/applications" element={<ApplicationTracker />} />
          {/* yoursite.com/settings shows the Settings page */}
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* "*" matches any address that isn't listed above (like a typo, /feeed).
            Without it, those addresses showed a blank page. "replace" keeps the
            wrong address out of the Back button's history */}
        <Route path="*" element={<Navigate to="/about" replace />} />
      </Routes>
    </Suspense>
  );
}

// "export default" lets other files import App (main.jsx does this).
export default App;
