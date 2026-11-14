// RequireLogin.jsx stands in front of every page you have to be logged in to see
// (Feed, Profile, Messages, Settings, ...). App.jsx puts those pages inside it.
// - Logged in: it shows the page you asked for.
// - Not logged in: it sends you to the Log in page instead.
//
// IMPORTANT: this only hides pages. Anyone can open the browser's DevTools and
// pretend to be logged in (isLoggedIn() just checks localStorage). The real
// protection is the backend refusing to send data without a valid token
// (authenticateToken in backend/src/middleware.ts). This is the "door";
// the backend is the "safe".

// Navigate sends the visitor to a different address.
// Outlet means "whichever page inside me matched the address".
import { Navigate, Outlet } from 'react-router';
// isLoggedIn is true if someone is logged in (login-status.js). Log in, Sign up,
// and the Google login all call markLoggedIn() first, so this sees all three
import { isLoggedIn } from '../login-status.js';

function RequireLogin() {
    if (!isLoggedIn()) {
        // "replace" swaps the locked page out of the browser's history, so
        // pressing Back from Log in doesn't bounce you into the lock again
        return <Navigate to="/login" replace />;
    }

    // Logged in: show the page that matched (Feed, Messages, ...)
    return <Outlet />;
}

// "export default" lets other files import RequireLogin (App.jsx does this).
export default RequireLogin;
