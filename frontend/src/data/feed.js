// feed.js is how the Feed page (pages/Feed.jsx) talks to the backend's Feed
// (backend/src/feed.ts): loading posts, posting, liking, commenting, deleting
// your own, and following people. Everything is saved with the account, so
// every logged-in student sees the same posts.
//
// Each function gives back a promise. If something goes wrong, it throws an
// Error whose message can be shown on the page (from api.js).
//
// A post looks like this:
//   { id, text, created_at, edited_at (when it was last edited, or null), mine (true if you wrote it),
//     author: { id, name, headline, following (true if you follow them) },
//     likes (how many), liked (true if YOU liked it),
//     comments: [{ id, text, created_at, edited_at, mine, author: { id, name, headline } }] }

// api() talks to our backend and sends your login (api.js)
import { api } from '../api.js';

// The newest posts. tab: "all" (everyone) or "following" (people you follow).
// before: a post's created_at, to get the ones older than it ("Show older posts").
// Gives back { posts, more (true if there are older ones), followingCount }
export async function loadPosts(tab, before) {
    // URLSearchParams writes "?tab=all&before=..." safely (it escapes the time's ":" and "+")
    const query = new URLSearchParams({ tab: tab });
    if (before) query.set('before', before);
    const answer = await api('/feed/posts?' + query.toString());
    // Our backend always sends a list. Anything else didn't come from it
    if (!Array.isArray(answer.posts)) {
        throw new Error("Couldn't reach the server. Try again in a minute.");
    }
    return { posts: answer.posts, more: answer.more === true, followingCount: answer.following_count ?? 0 };
}

// Shares a post. Gives back the new post, ready to show at the top of the Feed
export async function sharePost(text) {
    const answer = await api('/feed/posts', { method: 'POST', body: JSON.stringify({ text: text }) });
    return answer.post;
}

// Edits one of YOUR posts. Gives back { id, text, edited_at }
export async function editPost(postId, text) {
    const answer = await api('/feed/posts/' + postId, { method: 'PATCH', body: JSON.stringify({ text: text }) });
    return answer.post;
}

// Edits one of YOUR comments. Gives back { id, text, edited_at }
export async function editComment(commentId, text) {
    const answer = await api('/feed/comments/' + commentId, { method: 'PATCH', body: JSON.stringify({ text: text }) });
    return answer.comment;
}

// Deletes one of YOUR posts (and its comments and likes)
export function deletePost(postId) {
    return api('/feed/posts/' + postId, { method: 'DELETE' });
}

// Likes (on: true) or unlikes a post. Gives back { likes, liked }
export function setLike(postId, on) {
    return api('/feed/posts/' + postId + '/like', { method: on ? 'PUT' : 'DELETE' });
}

// Comments on a post. Gives back the new comment
export async function addComment(postId, text) {
    const answer = await api('/feed/posts/' + postId + '/comments', { method: 'POST', body: JSON.stringify({ text: text }) });
    return answer.comment;
}

// Deletes one of YOUR comments
export function deleteComment(commentId) {
    return api('/feed/comments/' + commentId, { method: 'DELETE' });
}

// Follows (on: true) or stops following someone. Gives back { following }
export function setFollow(studentId, on) {
    return api('/feed/follows/' + studentId, { method: on ? 'PUT' : 'DELETE' });
}

// How long ago something was posted, short: "Just now", "5 min", "3h", "2d",
// or the date ("Nov 3") once it's a week old (with the year if it isn't this year)
export function timeAgo(time) {
    const then = new Date(time);
    const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min';
    if (minutes < 24 * 60) return Math.floor(minutes / 60) + 'h';
    if (minutes < 7 * 24 * 60) return Math.floor(minutes / (24 * 60)) + 'd';
    const sameYear = then.getFullYear() === new Date().getFullYear();
    return then.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
