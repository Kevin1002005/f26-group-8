// ErrorBoundary.jsx is a safety net around every page (App.jsx puts it there).
// If something on a page breaks while React is drawing it (a bug, or a page
// that couldn't be downloaded because the internet dropped or the site was
// just updated), React would normally show a blank white page. Instead, this
// shows a friendly "Something went wrong" page with ways to recover.
// The styles are in index.css, under "Error pages".
//
// Why it's a "class" and not a function like every other component here:
// catching errors is the one thing React can only do with the older class
// style. getDerivedStateFromError and componentDidCatch are React's names
// for "an error happened inside me".
//
// App.jsx gives it key={the page's address}. When the address changes (you
// click a link), React makes a fresh ErrorBoundary, so the error page goes
// away and the new page gets a clean try.

import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        // "broken" is true after an error. It starts as false
        this.state = { broken: false };
    }

    // React calls this when something inside breaks. What it returns becomes
    // the new state, so the page redraws as the error page
    static getDerivedStateFromError() {
        return { broken: true };
    }

    // React also calls this, with the error itself. The real reason goes to
    // the browser's console (F12) for the team, never on the page.
    // LATER: this is where an error-reporting service would be told
    componentDidCatch(error, info) {
        console.error('A page broke:', error, info.componentStack);
    }

    render() {
        // Nothing broke: show the page as usual
        if (!this.state.broken) {
            return this.props.children;
        }

        // Something broke: the error page. It uses plain <a href> links (not
        // <Link>) and a full reload on purpose: they start the whole site over,
        // which clears whatever went wrong. (A page that failed to download
        // after a site update needs the reload to get the new files)
        return (
            <div className="error-page">
                <title>Something went wrong | ScoutSearch</title>
                <main className="error-page-main">
                    <div className="error-page-box">
                        <p className="error-page-label">Error</p>
                        {/* role="alert" makes screen readers announce it right away (WCAG) */}
                        <h1 className="error-page-title" role="alert">Something went wrong</h1>
                        <p className="error-page-text">
                            This page had a problem loading. Trying again usually fixes it. If it keeps
                            happening, check your internet connection.
                        </p>
                        <div className="error-page-actions">
                            <button
                                type="button"
                                className="error-page-button error-page-button-main"
                                onClick={() => window.location.reload()}
                            >
                                Try again
                            </button>
                            <a href="/about" className="error-page-button error-page-button-quiet">
                                Go to the home page
                            </a>
                        </div>
                    </div>
                </main>
            </div>
        );
    }
}

// "export default" lets App.jsx import ErrorBoundary.
export default ErrorBoundary;
