// NotFound.jsx is the "Page not found" page. App.jsx shows it for any address
// the site doesn't have (like /feeed or an old link), instead of a blank page.
// It works for everyone: logged in or not.
// The styles are in index.css, under "Error pages" (shared with the
// "Something went wrong" page, components/ErrorBoundary.jsx).

// Link goes to another page of the site; useNavigate lets "Go back" use the
// browser's history.
import { Link, useNavigate } from 'react-router';
// SiteLogo is the binoculars picture and the name (components/SiteLogo.jsx).
import SiteLogo from '../components/SiteLogo.jsx';
// ThemeToggle is the sun/moon button (components/ThemeToggle.jsx).
import ThemeToggle from '../components/ThemeToggle.jsx';
// isLoggedIn says whether to send "Go home" to Opportunities or to About.
import { isLoggedIn } from '../login-status.js';

function NotFound() {
    const navigate = useNavigate();

    // Logged in: your home page is Opportunities. Not logged in: the About page.
    const homePath = isLoggedIn() ? '/discovery' : '/about';

    // window.history.length is how many pages are in this tab's history. If
    // this is the first page in the tab (someone opened a broken link), there's
    // nothing to go back to, so "Go back" goes home instead
    function goBack() {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate(homePath);
        }
    }

    return (
        <div className="error-page">
            {/* <title> is the name on the browser tab (WCAG) */}
            <title>Page not found | ScoutSearch</title>

            {/* The logo (back to the About page) and the sun/moon button */}
            <header className="error-page-bar">
                <Link to="/about" className="error-page-logo">
                    <SiteLogo />
                </Link>
                <ThemeToggle />
            </header>

            <main className="error-page-main">
                <div className="error-page-box">
                    {/* "404" is the number web servers use for "not found" */}
                    <p className="error-page-label">404</p>
                    {/* The page's one <h1> (WCAG) */}
                    <h1 className="error-page-title">We couldn't find that page</h1>
                    <p className="error-page-text">
                        The address might have a typo, or the page might have moved.
                    </p>
                    <div className="error-page-actions">
                        <Link to={homePath} className="error-page-button error-page-button-main">
                            Go to the home page
                        </Link>
                        <button type="button" className="error-page-button error-page-button-quiet" onClick={goBack}>
                            Go back
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Lets App.jsx import this page.
export default NotFound;
