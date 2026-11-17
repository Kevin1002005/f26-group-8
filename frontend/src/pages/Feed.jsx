// Feed.jsx is the Feed page (yoursite.com/feed): posts from students, and
// new job listings that organizations share as posts.
// At the top: the title and three tabs (For you, Following, Listings).
// Under that, 2 columns: the post box and the posts on the left, and
// what's due soon and opportunities on the right.
// (The 2026-11 revamp: a calm title instead of the big animated one, small
// colored tags instead of the colored strips on posts, and listing posts.)
// The posts are real: they're saved with the account (data/feed.js talks to
// backend/src/feed.ts), and every logged-in student sees them, with their
// comments and likes. You can delete your own posts and comments, and follow
// people: the Following tab shows only their posts.
// The listing posts and "Opportunities for you" are still made-up examples,
// and say so.
// The styles for this page are in index.css, under "Feed page".

// useState lets the page remember a value and redraw itself when it changes.
// useRef keeps a reference to something on the screen (here: the typing box),
// or a value that doesn't redraw the page when it changes.
// useEffect runs code after the page is drawn (here: getting the posts)
import { useEffect, useRef, useState } from "react";
import NavBar from "../components/NavBar.jsx";
// Link makes a clickable link to another page of our site.
import { Link } from "react-router";
// The jobs, for the listing posts and the right column. They're the same list
// as the Discovery page uses (src/data/opportunities.js), so clicking one can
// open that exact job there. isPastDeadline says if a job's deadline has gone by.
import { isDueWithin, isPastDeadline, opportunities } from "../data/opportunities.js";
// The Application tracker's list (src/data/tracker.js): Save on a listing post
// adds the job to it, and "Due soon" reads it (trackerJob finds each item's job,
// real or example)
// useTrackerItems gives the list and redraws when it changes (a Save, or your
// account's list arriving); useTrackerSync syncs with your account when the page opens
import { addToTracker, removeFromTracker, trackerJob, useTrackerItems, useTrackerSync } from "../data/tracker.js";
// Who is logged in (src/use-current-user.js), for your circle in the post box.
// initialsFor turns a name into the letters in a circle ("Ana Example" -> "AE")
import { initialsFor, useCurrentUser } from "../use-current-user.js";
// Talking to the backend's Feed: loading, posting, liking, commenting,
// deleting, and following (data/feed.js). timeAgo writes "5 min", "3h", ...
import {
  addComment,
  deleteComment,
  deletePost,
  editComment,
  editPost,
  loadPosts,
  setFollow,
  setLike,
  sharePost,
  timeAgo,
} from "../data/feed.js";

// ---------- Tabs and example listings ----------

// The tabs under the title. "For you" shows everyone's posts, "Following"
// shows only posts from people you follow, and "Listings" shows the example
// job listings
const tabs = ["For you", "Following", "Listings"];

// The most letters a post and a comment can have (the backend checks the same numbers)
const mostPostLetters = 2000;
const mostCommentLetters = 500;

// The listing posts: an organization sharing one of its jobs on the Feed.
// jobId points at a job in src/data/opportunities.js, so the post shows that
// job's details and "View listing" opens it on the Discovery page.
// (Later, the backend sends these when an organization posts a job.)
const listingPosts = [
  {
    id: "listing-5",
    jobId: 5,
    time: "2h",
    following: true,
    text: "We need a student to help keep our website up to date and build a sign-up page for spring classes. It fits around your class schedule.",
  },
  {
    id: "listing-1",
    jobId: 1,
    time: "5h",
    following: false,
    text: "Our spring co-op is open. You'll build screens for a homework app used by middle and high school students.",
  },
];

// Turns a number into easy-to-read words for the post counts.
// For example, countWords(1000000, "like") gives "1,000,000 likes",
// and countWords(1, "comment") gives "1 comment" (no "s" when there's only one).
// toLocaleString() adds the commas.
function countWords(number, word) {
  if (number === 1) {
    return "1 " + word;
  }
  return number.toLocaleString() + " " + word + "s";
}

// ---------- Small icons ----------
// Each icon is a tiny drawing (SVG) on a 24 by 24 grid.
// stroke="currentColor" makes it the same color as the words around it.
// aria-hidden="true" hides it from screen readers, because the words next
// to it already say the same thing (WCAG)

// A calendar: a box with two rings on top and a line across
function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

// ---------- Pieces of the page ----------
// Each function below is a component: one piece of the page.
// The Feed component at the bottom puts all the pieces together.

// The title at the top of the page. Since the 2026-11 revamp it's a calm
// heading like the Opportunities page's, instead of the big animated one
function FeedHeader() {
  return (
    <header className="feed-head">
      {/* The page's one <h1> (WCAG) */}
      <h1 className="feed-head-title">Feed</h1>
      <p className="feed-head-text">
        Updates from students, and new listings from organizations.
      </p>
    </header>
  );
}

// The row of tabs (For you, Following, and Listings): one gray strip with
// the picked tab as a white pill, the same as the Opportunities page.
// "props.picked" is the tab that's on right now, and "props.setPicked"
// changes it. They live in Feed (below), because Feed needs to know
// the picked tab to choose which posts to show
function FeedTabs(props) {
  return (
    // role="group" + aria-label tells screen readers these buttons belong
    // together and what they're for (WCAG)
    <div className="feed-tabs" role="group" aria-label="Show posts from">
      {/* Makes one button for each tab in the tabs list */}
      {tabs.map((tab) => (
        <button
          key={tab}
          // While this tab is the picked one, it also gets the
          // "feed-tab-picked" class, which makes it the white pill
          className={
            tab === props.picked ? "feed-tab feed-tab-picked" : "feed-tab"
          }
          // aria-pressed tells screen readers which tab is on (WCAG)
          aria-pressed={tab === props.picked}
          // Clicking a tab makes it the picked one
          onClick={() => props.setPicked(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

// The "Share something you're working on" box at the top of the posts.
// Type something and press "Post update": it's saved, and shows up at the
// top of everyone's Feed. (Ctrl+Enter posts too.)
// props.onPost is a function from Feed (below): the box calls it with the new post.
function PostComposer(props) {
  // Who is logged in, for your circle next to the box
  const me = useCurrentUser();
  const myInitials = me.initials || "You";
  // What's typed in the box. Starts empty.
  const [text, setText] = useState("");
  // true while the post is being sent, so it can't be sent twice
  const [sending, setSending] = useState(false);
  // A short message under the buttons, like "Posted."
  const [message, setMessage] = useState("");
  // A reference to the typing box, so we can put the cursor back in it
  const textRef = useRef(null);

  // Runs when you press "Post update" (or Ctrl+Enter in the typing box)
  async function handlePost(event) {
    // A form normally reloads the whole page when it's sent. This stops that.
    event.preventDefault();
    // trim() removes spaces at the start and end, so "   " counts as empty
    const words = text.trim();
    // Nothing to post: say so, and put the cursor in the box
    if (words === "") {
      setMessage("Write something first.");
      textRef.current.focus();
      return;
    }
    setSending(true);
    setMessage("Posting...");
    try {
      // The backend saves it and sends it back with your name and headline
      const post = await sharePost(words);
      // Hand it to Feed (below), which puts it at the top of the list
      props.onPost(post);
      setText("");
      setMessage("Posted. Everyone on ScoutSearch can see it.");
    } catch (error) {
      // What you typed stays in the box, so you can try again
      setMessage("Couldn't post: " + error.message);
    }
    setSending(false);
  }

  // Ctrl+Enter (or Cmd+Enter on a Mac) posts, like in most chat apps.
  // A plain Enter starts a new line
  function handleKeyDown(event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.currentTarget.form.requestSubmit();
    }
  }

  return (
    <form className="feed-composer" onSubmit={handlePost}>
      {/* Top row: your circle next to the typing box */}
      <div className="feed-composer-top">
        <div className="feed-post-avatar" aria-hidden="true">
          {myInitials}
        </div>
        {/* The label tells screen readers what this box is for (WCAG).
            "sr-only" (screen reader only) hides it on the screen, but screen
            readers still read it. The placeholder alone isn't enough,
            because it disappears once you start typing */}
        <label htmlFor="feed-composer" className="sr-only">
          Share something you're working on
        </label>
        {/* A <textarea>, so a post can have more than one line.
            maxLength stops typing at the same limit the server checks */}
        <textarea
          id="feed-composer"
          ref={textRef}
          className="feed-composer-input"
          placeholder="What are you working on?"
          rows={2}
          maxLength={mostPostLetters}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* The button under the typing box. type="submit" sends the form,
          which runs handlePost */}
      <div className="feed-composer-buttons">
        <button type="submit" className="feed-composer-button feed-composer-post" disabled={sending}>
          {sending ? "Posting..." : "Post update"}
        </button>
      </div>

      {/* Always on the page, empty until there's something to say.
          role="status" makes screen readers read it out (WCAG) */}
      <p className="feed-composer-message" role="status">
        {message}
      </p>
    </form>
  );
}

// One comment under a post: the writer's circle, their name, how long ago,
// what they wrote, and Edit and Delete if it's yours.
// props.comment is the comment, props.onDelete deletes it, and
// props.onEdit(text) saves new words (it gives back a promise, and throws if it can't)
function Comment(props) {
  const comment = props.comment;
  // true while you're changing it, and what's in the box meanwhile
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // The Edit button, so the keyboard focus can go back to it afterwards (WCAG)
  const editButton = useRef(null);

  function startEditing() {
    setDraft(comment.text);
    setEditing(true);
  }
  function stopEditing() {
    setEditing(false);
    // after the page redraws, the Edit button is there again
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function saveEdit(event) {
    event.preventDefault();
    const words = draft.trim();
    if (words === "" || saving) return;
    if (words === comment.text) return stopEditing(); // nothing changed
    setSaving(true);
    try {
      await props.onEdit(words);
      stopEditing();
    } catch {
      // props.onEdit already said what went wrong; the box stays open with your words
    }
    setSaving(false);
  }

  return (
    <li className="feed-comment">
      <div className="feed-comment-avatar" aria-hidden="true">
        {initialsFor(comment.author.name)}
      </div>
      <div className="feed-comment-bubble">
        <p className="feed-comment-author">
          {comment.author.name}
          <span className="feed-comment-time">
            {" · "}
            <time dateTime={comment.created_at}>{timeAgo(comment.created_at)}</time>
            {/* "Edited" if its writer changed it after posting */}
            {comment.edited_at && " · Edited"}
          </span>
          {/* Only on your own comments (Edit hides while you're editing it) */}
          {comment.mine && !editing && (
            <button type="button" ref={editButton} className="feed-comment-delete" onClick={startEditing} aria-label="Edit your comment">
              Edit
            </button>
          )}
          {comment.mine && (
            <button type="button" className="feed-comment-delete" onClick={props.onDelete} aria-label="Delete your comment">
              Delete
            </button>
          )}
        </p>
        {editing ? (
          // The box to change it. Enter saves, Esc cancels
          <form className="feed-comment-edit" onSubmit={saveEdit}>
            <label htmlFor={"feed-comment-edit-" + comment.id} className="sr-only">
              Edit your comment
            </label>
            <input
              id={"feed-comment-edit-" + comment.id}
              className="feed-comment-input"
              maxLength={mostCommentLetters}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && stopEditing()}
              autoFocus
            />
            <button type="submit" className="feed-edit-save" disabled={saving}>
              Save
            </button>
            <button type="button" className="feed-edit-cancel" onClick={stopEditing}>
              Cancel
            </button>
          </form>
        ) : (
          <p className="feed-comment-text">{comment.text}</p>
        )}
      </div>
    </li>
  );
}

// One post. props.post is the post from the backend (see data/feed.js).
// The Feed (below) keeps the list of posts, so this asks it to change them:
//   props.onChange(change)   changes this post. change is a function that gets
//                            the post as it is now and gives back what changed,
//                            like (post) => ({ likes: post.likes + 1 })
//   props.onRemove()         takes this post out (after you delete it)
//   props.onFollow(id, on)   changes the Follow button on every post by that person
function Post(props) {
  const post = props.post;
  const author = post.author;

  // "change" remembers which way the like count just moved, so the CSS knows
  // which way to roll the number: "up" (you liked it) or "down" (you unliked it).
  // It starts as null ("nothing yet"), so the counts don't roll when the page first loads
  const [change, setChange] = useState(null);
  // "showComments" remembers whether the comment area under the post is open.
  // It starts closed (false). The Comment button opens and closes it.
  const [showComments, setShowComments] = useState(false);
  // What's typed in the comment box right now. Starts empty.
  const [commentText, setCommentText] = useState("");
  // true while your comment is being sent
  const [sending, setSending] = useState(false);
  // A message under the buttons, like "Link copied." or what went wrong
  const [message, setMessage] = useState("");
  // Editing your post: true while the box is open, and what's in it
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // The Edit button, so the keyboard focus can go back to it afterwards (WCAG)
  const editButton = useRef(null);

  // An id for the comment area, so the Comment button can say it controls it (WCAG)
  const commentsId = "feed-comments-" + post.id;

  // Like / unlike. It shows the change right away, then asks the server,
  // and uses the server's count (others may have liked it too). If the server
  // can't be reached, it goes back to how it was and says so
  async function toggleLike() {
    const on = !post.liked;
    setChange(on ? "up" : "down");
    props.onChange((now) => ({ liked: on, likes: now.likes + (on ? 1 : -1) }));
    try {
      const answer = await setLike(post.id, on);
      props.onChange(() => ({ liked: answer.liked, likes: answer.likes }));
      setMessage("");
    } catch (error) {
      props.onChange((now) => ({ liked: !on, likes: now.likes + (on ? -1 : 1) }));
      setMessage("Couldn't save your like: " + error.message);
    }
  }

  // Follow / stop following the person who wrote this. Every post of theirs
  // changes at once (props.onFollow), and goes back if the server says no
  async function toggleFollow() {
    const on = !author.following;
    props.onFollow(author.id, on);
    try {
      await setFollow(author.id, on);
      setMessage(on ? "Following " + author.name + ". Their posts show on the Following tab." : "");
    } catch (error) {
      props.onFollow(author.id, !on);
      setMessage("Couldn't change that: " + error.message);
    }
  }

  // Edit your own post: the box opens with what it says now
  function startEditing() {
    setDraft(post.text);
    setEditing(true);
    setMessage("");
  }
  function stopEditing() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function saveEdit(event) {
    event.preventDefault();
    const words = draft.trim();
    if (words === "") {
      setMessage("Write something first, or press Cancel.");
      return;
    }
    if (words === post.text) return stopEditing(); // nothing changed
    setSavingEdit(true);
    try {
      const changed = await editPost(post.id, words);
      props.onChange(() => ({ text: changed.text, edited_at: changed.edited_at }));
      stopEditing();
      setMessage("Post updated.");
    } catch (error) {
      // the box stays open with your words, so you can try again
      setMessage("Couldn't save your edit: " + error.message);
    }
    setSavingEdit(false);
  }

  // Saves new words for one of your comments (Comment's props.onEdit). It
  // throws if it can't, so the comment's box stays open
  async function saveComment(comment, words) {
    try {
      const changed = await editComment(comment.id, words);
      props.onChange((now) => ({
        comments: now.comments.map((c) => (c.id === comment.id ? { ...c, text: changed.text, edited_at: changed.edited_at } : c)),
      }));
      setMessage("Comment updated.");
    } catch (error) {
      setMessage("Couldn't save your edit: " + error.message);
      throw error;
    }
  }

  // Delete your own post (after checking, since it can't be undone)
  async function removePost() {
    if (!window.confirm("Delete this post? Its comments and likes go too. This can't be undone.")) return;
    try {
      await deletePost(post.id);
      props.onRemove();
    } catch (error) {
      setMessage("Couldn't delete this post: " + error.message);
    }
  }

  // Runs when you press Post in the comment box
  async function sendComment(event) {
    // A form normally reloads the whole page when it's sent. This stops that.
    event.preventDefault();
    // trim() removes spaces at the start and end, so "   " counts as empty
    const words = commentText.trim();
    if (words === "" || sending) return; // nothing typed (or already sending)
    setSending(true);
    try {
      const comment = await addComment(post.id, words);
      // [...comments, comment] makes a new list: the old comments, plus the new one at the end
      props.onChange((now) => ({ comments: [...now.comments, comment] }));
      setCommentText("");
      setMessage("");
    } catch (error) {
      setMessage("Couldn't post your comment: " + error.message);
    }
    setSending(false);
  }

  // Delete one of your comments. .filter() keeps every comment except that one
  async function removeComment(comment) {
    if (!window.confirm("Delete your comment? This can't be undone.")) return;
    try {
      await deleteComment(comment.id);
      props.onChange((now) => ({ comments: now.comments.filter((c) => c.id !== comment.id) }));
      setMessage("Comment deleted.");
    } catch (error) {
      setMessage("Couldn't delete your comment: " + error.message);
    }
  }

  // Runs when you press Share. "async" lets it wait for the browser to finish
  // sharing or copying before it shows the message ("await" is the waiting part).
  async function sharePostLink() {
    // The link to this post: the site's address + /feed + #post-<its id>.
    // window.location.origin is the start of the address, like "http://localhost:5173"
    const link = window.location.origin + "/feed#post-" + post.id;
    // try/catch: sharing can fail (for example if you close the share menu),
    // and then "catch" runs instead of the page breaking
    try {
      if (navigator.share) {
        // Phones (and some computers) have a built-in share menu: use it
        await navigator.share({ title: author.name + "'s post on ScoutSearch", url: link });
        setMessage("");
      } else {
        // Otherwise, copy the link so you can paste it anywhere
        await navigator.clipboard.writeText(link);
        setMessage("Link copied.");
      }
    } catch (error) {
      // Closing the phone's share menu without picking anything counts as an
      // "AbortError". That's you changing your mind, not a failure, so say nothing
      if (error.name === "AbortError") return;
      setMessage("Couldn't share this post. Try again.");
    }
  }

  return (
    // <article> means "one post that makes sense on its own" (screen readers
    // can jump from post to post). id="post-..." lets a shared link jump straight to it
    <article className="feed-post" id={"post-" + post.id}>
      {/* Everything in the post */}
      <div className="feed-post-body">
        {/* Who posted it: the circle, then the name with their headline and
            how long ago under it, then Follow (or Delete, on your own) */}
        <div className="feed-post-header">
          {/* Hidden from screen readers, because the name is right next to it */}
          <div className="feed-post-avatar" aria-hidden="true">
            {initialsFor(author.name)}
          </div>
          <div className="feed-post-who">
            {/* An <h2>, so screen readers can jump from post to post by heading (WCAG) */}
            <h2 className="feed-post-author">
              {author.name}
              {post.mine && <span className="sr-only"> (you)</span>}
            </h2>
            <p className="feed-post-headline">
              {author.headline}
              {/* The dot is decoration, so screen readers skip it */}
              <span aria-hidden="true"> · </span>
              {/* <time> holds the exact time for computers */}
              <time dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
              {/* "Edited" if its writer changed it after posting */}
              {post.edited_at && " · Edited"}
            </p>
          </div>
          <span className="feed-post-tools">
            {post.mine ? (
              // Only on your own posts. <> </> groups the two buttons.
              // Edit hides while the edit box is open (Save and Cancel are there instead)
              <>
                {!editing && (
                  <button type="button" ref={editButton} className="feed-post-delete" onClick={startEditing} aria-label="Edit your post">
                    Edit
                  </button>
                )}
                <button type="button" className="feed-post-delete" onClick={removePost} aria-label="Delete your post">
                  Delete
                </button>
              </>
            ) : (
              // Follow: an on/off button. aria-pressed tells screen readers if
              // it's on, and aria-label says WHO, starting with the visible word (WCAG)
              <button
                type="button"
                className="feed-post-follow"
                aria-pressed={author.following}
                aria-label={(author.following ? "Following " : "Follow ") + author.name}
                onClick={toggleFollow}
              >
                {author.following ? "Following" : "Follow"}
              </button>
            )}
          </span>
        </div>

        {/* What the post says (it keeps its line breaks, see index.css), or the
            box to change it while you're editing. Esc cancels */}
        {editing ? (
          <form className="feed-post-edit" onSubmit={saveEdit}>
            <label htmlFor={"feed-post-edit-" + post.id} className="sr-only">
              Edit your post
            </label>
            <textarea
              id={"feed-post-edit-" + post.id}
              className="feed-composer-input"
              rows={3}
              maxLength={mostPostLetters}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && stopEditing()}
              autoFocus
            />
            <div className="feed-edit-actions">
              <button type="button" className="feed-edit-cancel" onClick={stopEditing}>
                Cancel
              </button>
              <button type="submit" className="feed-edit-save" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <p className="feed-post-text">{post.text}</p>
        )}

        <div className="feed-post-counts">
          {/* The like count. While liked, it gets the "feed-like-count-on" class,
              which turns it blue (see index.css). countWords (near the top of
              this file) adds commas and the right ending, like "1 like" */}
          <span className={post.liked ? "feed-like-count feed-like-count-on" : "feed-like-count"}>
            {/* key={...} gives this <span> a new name every time "liked" flips.
                A new name makes React swap in a brand new <span>, and a brand new
                one plays its roll-in animation (see index.css). The class adds
                "-up" or "-down" so it rolls the right way */}
            <span
              key={post.liked ? "liked" : "not-liked"}
              className={change ? "feed-like-number feed-like-number-" + change : "feed-like-number"}
            >
              {countWords(post.likes, "like")}
            </span>
          </span>
          <span>{countWords(post.comments.length, "comment")}</span>
        </div>
        <div className="feed-post-actions">
          {/* Like: an on/off button. While liked, it gets the "feed-liked" class
              (blue and bold). aria-pressed says whether it's on (WCAG).
              Every post has a Like button, so aria-label says WHOSE post,
              starting with "Like" so voice control still works (WCAG) */}
          <button
            type="button"
            onClick={toggleLike}
            className={post.liked ? "feed-liked" : ""}
            aria-pressed={post.liked}
            aria-label={"Like " + author.name + "'s post"}
          >
            {post.liked ? "Liked" : "Like"}
          </button>
          {/* Opens and closes the comments under the post.
              aria-expanded tells screen readers if it's open, and aria-controls
              says which part of the page it opens (WCAG) */}
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className={showComments ? "feed-liked" : ""}
            aria-expanded={showComments}
            aria-controls={commentsId}
            aria-label={"Comment on " + author.name + "'s post"}
          >
            Comment
          </button>
          {/* Shares a link to this post (see sharePostLink above) */}
          <button type="button" onClick={sharePostLink} aria-label={"Share " + author.name + "'s post"}>
            Share
          </button>
        </div>

        {/* "Link copied.", or what went wrong. role="status" reads it out (WCAG) */}
        <p className="feed-post-message" role="status">
          {message}
        </p>

        {/* The comments, only while they're open ("&&" means "only if") */}
        {showComments && (
          <div className="feed-comments" id={commentsId}>
            {post.comments.length > 0 && (
              <ul className="feed-comment-list">
                {post.comments.map((comment) => (
                  <Comment
                    key={comment.id}
                    comment={comment}
                    onDelete={() => removeComment(comment)}
                    onEdit={(words) => saveComment(comment, words)}
                  />
                ))}
              </ul>
            )}

            {/* The box to write a comment. A <form>, so pressing Enter posts it */}
            <form className="feed-comment-form" onSubmit={sendComment}>
              {/* A real label for screen readers (sr-only hides it on screen, WCAG) */}
              <label htmlFor={"feed-comment-input-" + post.id} className="sr-only">
                {"Write a comment on " + author.name + "'s post"}
              </label>
              {/* autoFocus puts the cursor in the box as soon as it opens */}
              <input
                id={"feed-comment-input-" + post.id}
                className="feed-comment-input"
                placeholder="Write a comment..."
                maxLength={mostCommentLetters}
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                autoFocus
              />
              <button type="submit" className="feed-comment-post" disabled={sending}>
                Post
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

// Turns a date like "2026-11-20" into "Nov 20".
// ("T00:00" = midnight, so the date doesn't slip back a day in some time zones)
function shortDate(date) {
  return new Date(date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The colored tag for each kind of job (the same colors as the Opportunities page)
const jobTagClass = {
  Internship: "feed-kind-tag feed-kind-tag-purple",
  "Co-op": "feed-kind-tag feed-kind-tag-blue",
  "Part-time": "feed-kind-tag feed-kind-tag-green",
  "Full-time": "feed-kind-tag feed-kind-tag-amber",
};

// One listing post: an organization sharing one of its jobs.
// props.post is one { } from the listingPosts list above.
function ListingPost(props) {
  // The job this post is about, found by its id in the opportunities list.
  // .find() gives back the first job whose id matches
  const job = opportunities.find((item) => item.id === props.post.jobId);

  // Save, the same on/off as the Opportunities page: it adds the job to (or
  // takes it off) the Application tracker. It's "on" while the job is there,
  // read from the tracker's list, so it's right on any device
  const trackerItems = useTrackerItems();
  const saved = trackerItems.some((item) => item.id === job.id);
  // What screen readers hear after Save is pressed (see the end of the post)
  const [announcement, setAnnouncement] = useState("");

  // The list changes, so this button and the "Due soon" box redraw by themselves
  function toggleSave() {
    if (saved) {
      removeFromTracker(job.id);
      setAnnouncement("");
    } else {
      addToTracker(job.id);
      setAnnouncement("Saved to My applications.");
    }
  }

  return (
    // <article>: one post. id lets a link jump straight to it
    <article className="feed-post" id={"post-" + props.post.id}>
      <div className="feed-post-body">
        {/* Who posted it: the organization's square, its name, and when */}
        <div className="feed-post-header">
          {/* A square (not a circle), so organizations look different from
              people. Hidden from screen readers: the name is right next to it */}
          <div className="feed-listing-logo" aria-hidden="true">
            {job.initials}
          </div>
          <div className="feed-post-who">
            <p className="feed-post-author">{job.organization}</p>
            <p className="feed-post-headline">
              Posted a listing
              <span aria-hidden="true"> · </span>
              {props.post.time}
            </p>
          </div>
          {/* "Example": these listings are made up, so the tag says so (the team's rule) */}
          <span className="feed-post-tools">
            <span className="feed-examples-tag">Example</span>
            <span className="feed-kind-tag feed-kind-tag-amber">New listing</span>
          </span>
        </div>

        {/* What the organization wrote */}
        <p className="feed-post-text">{props.post.text}</p>

        {/* The job itself, in a light box inside the post */}
        <div className="feed-listing-job">
          <div className="feed-listing-top">
            {/* An <h2>, like the other posts' titles */}
            <h2 className="feed-listing-title">{job.title}</h2>
            <span className="feed-listing-match">{job.match}% match</span>
          </div>
          {/* The job's facts as small tags */}
          <ul className="feed-listing-facts" aria-label="Details">
            <li className={jobTagClass[job.type]}>{job.type}</li>
            <li className="feed-fact-tag">{job.place}</li>
            <li className="feed-fact-tag">{job.pay}</li>
            <li className="feed-fact-tag">Apply by {shortDate(job.deadline)}</li>
            {/* "Due soon" when the deadline is within a week, and "Closed" once it
                has gone by (written out, not only a color) */}
            {isDueWithin(job.deadline, 7) && <li className="feed-kind-tag feed-kind-tag-amber">Due soon</li>}
            {isPastDeadline(job.deadline) && <li className="feed-kind-tag feed-kind-tag-closed">Closed</li>}
          </ul>
          <div className="feed-listing-actions">
            {/* Save: on/off. aria-pressed tells screen readers if it's on, and
                aria-label says which job (every listing has a Save) (WCAG).
                It starts with the word you see ("Save" or "Saved"), so voice
                control users can say what's on the button (WCAG) */}
            <button
              type="button"
              className="feed-listing-save"
              aria-pressed={saved}
              aria-label={(saved ? "Saved " : "Save ") + job.title}
              onClick={toggleSave}
            >
              {saved ? "Saved" : "Save"}
            </button>
            {/* Opens the job's pop-up on the Opportunities page ("?job=1") */}
            <Link to={"/discovery?job=" + job.id} className="feed-listing-view">
              View listing
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
          {/* Hidden on screen. Screen readers hear it when Save is pressed (WCAG).
              Only then: not when "saved" changes because your account's list arrived */}
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </div>
      </div>
    </article>
  );
}

// The "Due soon" box (top of the right column): the jobs on YOUR tracker
// whose deadline is in the next 2 weeks, soonest first.
// (It used to be a box with today's date, which was only for looks.)
// props.tracker is the tracker's list, kept by the Feed page (see Feed below)
function DueSoonCard(props) {
  // The tracker's list is [{ id, stage }, ...]. For each one, find its job
  // (a real job saved on Opportunities, or an example), keep the ones due in
  // the next 14 days, and sort them soonest first. A job with no deadline is never "due"
  const due = props.tracker
    // Leave out what's already in Submitted: it's sent, so it isn't "due" anymore
    .filter((item) => item.stage !== "submitted")
    .map((item) => trackerJob(item))
    .filter((job) => job && job.deadline && isDueWithin(job.deadline, 14))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <section className="feed-side-card" aria-labelledby="feed-due-title">
      <h2 id="feed-due-title" className="feed-side-title">
        Due soon
      </h2>
      {/* "A ? B : C": the list if anything is due, otherwise a short note */}
      {due.length > 0 ? (
        <ul className="feed-due-list">
          {due.map((job) => (
            <li key={job.id} className="feed-due-item">
              <Link to={"/discovery?job=" + job.id} className="feed-due-link">
                {job.title}
              </Link>
              <span className="feed-due-when">
                {job.organization} · Apply by {shortDate(job.deadline)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="feed-due-empty">Nothing on your tracker is due in the next 2 weeks.</p>
      )}
      <Link to="/applications" className="feed-side-more">
        My applications
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

// The "Opportunities for you" box: jobs and programs that fit you (right column)
function OpportunityRadar() {
  // Your 2 best matches: copy the list ([...opportunities]), sort it highest
  // match first (b.match - a.match), and keep the first 2 (.slice(0, 2)).
  const topJobs = [...opportunities].sort((a, b) => b.match - a.match).slice(0, 2);

  return (
    <section className="feed-side-card">
      {/* The box's title. The small "Examples" tag says these jobs are
          made up for now, so nobody thinks they're real listings */}
      <h2 className="feed-side-title">
        Opportunities for you{" "}
        <span className="feed-side-note">Examples</span>
      </h2>
      <ul className="feed-side-list">
        {/* Makes one row for each of the 2 jobs */}
        {topJobs.map((job) => (
          <li key={job.id} className="feed-opportunity">
            {/* The square with the company's initials.
                Hidden from screen readers, because the company name is in the words */}
            <div className="feed-opportunity-logo feed-opportunity-logo-blue" aria-hidden="true">
              {job.initials}
            </div>
            <div className="feed-opportunity-info">
              {/* What kind of opportunity it is, like "Co-op" */}
              <p className="feed-opportunity-type">{job.type}</p>
              {/* The job's name, as a link. "/discovery?job=1" opens the Discovery
                  page with job 1's pop-up open ("?job=1" is extra info added to the
                  end of the address). The CSS stretches the link over the whole row,
                  so you can click anywhere on it. An <h3>, because it's inside the
                  box's <h2> */}
              <h3 className="feed-opportunity-title">
                <Link to={"/discovery?job=" + job.id} className="feed-opportunity-link">
                  {job.title}
                </Link>
              </h3>
              <p className="feed-opportunity-place">
                {job.organization} · {job.place}
              </p>
              {/* The deadline, with a little calendar next to it. The date is
                  written "2026-11-20" in the data, and toLocaleDateString turns
                  it into "Nov 20" ("T00:00" = midnight, so it doesn't slip a day) */}
              <p className="feed-opportunity-when">
                <CalendarIcon />
                {"Apply by " +
                  new Date(job.deadline + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {/* Goes to the Discovery page, to see every opportunity */}
      <Link to="/discovery" className="feed-side-more">
        See all opportunities
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

// Feed is the whole page. It puts all the pieces above together.
function Feed() {
  // "picked" remembers which tab is on. It starts on "For you".
  const [picked, setPicked] = useState("For you");
  // Which posts the backend should send: everyone's, or only from people you follow
  const tab = picked === "Following" ? "following" : "all";
  // The posts the backend sent, and for which tab:
  //   { tab, posts, more (true if there are older ones), followingCount, error }
  // null until the first answer arrives
  const [feed, setFeed] = useState(null);
  // "Try again" adds 1 to this, which makes the posts load again (see the useEffect)
  const [reload, setReload] = useState(0);
  // true while "Show older posts" is loading
  const [loadingMore, setLoadingMore] = useState(false);
  // What screen readers hear after something changes the list ("Post deleted.")
  const [announcement, setAnnouncement] = useState("");
  // true once you've pressed "Show older posts" (a ref: changing it doesn't
  // redraw the page). The every-minute refresh only gets the newest 20, so it
  // stops after that, or it would take away the older ones you loaded
  const loadedMore = useRef(false);
  // The Application tracker's list, for the "Due soon" box. The box redraws
  // whenever it changes (a listing's Save, or your account's list arriving).
  // useTrackerSync syncs it with your account when the page opens
  const tracker = useTrackerItems();
  useTrackerSync();

  // Gets the posts when the page opens and whenever you switch tabs. While
  // you're looking at the page, it gets the newest ones again every minute
  // (and when you come back to the tab), so you see what others share without
  // reloading. "stopped" makes an answer that arrives after you switched tabs
  // (or left the page) get ignored
  useEffect(() => {
    if (picked === "Listings") return;
    let stopped = false;
    loadedMore.current = false;
    // quiet: an every-minute refresh that fails keeps showing what's there
    function load(quiet) {
      loadPosts(tab)
        .then((answer) => {
          if (!stopped) setFeed({ tab: tab, ...answer, error: "" });
        })
        .catch((error) => {
          if (!stopped && !quiet) setFeed({ tab: tab, posts: [], more: false, followingCount: 0, error: error.message });
        });
    }
    load(false);
    function refreshIfLooking() {
      if (document.visibilityState === "visible" && !loadedMore.current) load(true);
    }
    const timer = setInterval(refreshIfLooking, 60000);
    document.addEventListener("visibilitychange", refreshIfLooking);
    // "Clean up" when the tab changes or you leave the page
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfLooking);
    };
  }, [picked, tab, reload]);

  // What to show: the posts, if they're for the tab that's on (null = still loading)
  const shown = feed && feed.tab === tab ? feed : null;

  // Changes one post in the list (see Post's props.onChange).
  // "...post, ...change(post)" copies the post and puts the changes on top
  function updatePost(postId, change) {
    setFeed((now) => now && { ...now, posts: now.posts.map((post) => (post.id === postId ? { ...post, ...change(post) } : post)) });
  }

  // After you delete a post: take it out, tell screen readers, and put the
  // keyboard focus in the post box (the post you were on is gone) (WCAG)
  function removePost(postId) {
    setFeed((now) => now && { ...now, posts: now.posts.filter((post) => post.id !== postId) });
    setAnnouncement("Post deleted.");
    document.getElementById("feed-composer")?.focus();
  }

  // After Follow (or unfollow): every post by that person changes its button
  function followChanged(authorId, on) {
    setFeed((now) => now && {
      ...now,
      followingCount: Math.max(0, now.followingCount + (on ? 1 : -1)),
      posts: now.posts.map((post) => (post.author.id === authorId ? { ...post, author: { ...post.author, following: on } } : post)),
    });
  }

  // Runs when the post box sends a new post: puts it at the top of the list.
  // On another tab, switch to "For you", which loads it with everything else
  function addPost(newPost) {
    if (tab === "all" && picked !== "Listings") {
      setFeed((now) => now && { ...now, posts: [newPost, ...now.posts] });
    } else {
      setPicked("For you");
    }
  }

  // "Show older posts": the 20 before the last one showing, added at the end
  async function showOlder() {
    const last = shown.posts[shown.posts.length - 1];
    setLoadingMore(true);
    loadedMore.current = true;
    try {
      const answer = await loadPosts(tab, last.created_at);
      setFeed((now) => now && {
        ...now,
        // .some() leaves out any post that's already showing, so none shows twice
        posts: [...now.posts, ...answer.posts.filter((post) => !now.posts.some((p) => p.id === post.id))],
        more: answer.more,
      });
      setAnnouncement(answer.posts.length + " older posts loaded.");
    } catch (error) {
      setAnnouncement("Couldn't load older posts: " + error.message);
    }
    setLoadingMore(false);
  }

  // "Try again" after the posts couldn't load
  function tryAgain() {
    setFeed(null);
    setReload(reload + 1);
  }

  // What an empty tab says
  let emptyText = "No posts yet. Be the first to share something!";
  if (tab === "following") {
    emptyText = shown && shown.followingCount === 0
      ? "You're not following anyone yet. Press Follow on someone's post, and their posts show up here."
      : "No posts from the people you follow yet.";
  }

  // The posts column, under the post box
  let posts;
  if (picked === "Listings") {
    // The example listing posts (made up, and labeled "Example")
    posts = listingPosts.map((post) => <ListingPost key={post.id} post={post} />);
  } else if (shown === null) {
    posts = <p className="feed-empty" role="status">Loading posts...</p>;
  } else if (shown.error) {
    posts = (
      <div className="feed-empty" role="status">
        <p>Couldn't load the posts: {shown.error}</p>
        <button type="button" className="feed-try-again" onClick={tryAgain}>
          Try again
        </button>
      </div>
    );
  } else if (shown.posts.length === 0) {
    posts = <p className="feed-empty">{emptyText}</p>;
  } else {
    posts = (
      <>
        {/* One <Post> for each post. key={post.id} lets React keep each post's
            own open comments and typing when the list changes */}
        {shown.posts.map((post) => (
          <Post
            key={post.id}
            post={post}
            onChange={(change) => updatePost(post.id, change)}
            onRemove={() => removePost(post.id)}
            onFollow={followChanged}
          />
        ))}
        {/* Only if there are older ones */}
        {shown.more && (
          <button type="button" className="feed-more-button" onClick={showOlder} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Show older posts"}
          </button>
        )}
      </>
    );
  }

  return (
    // <> </> is a "fragment": an invisible wrapper. A component can only
    // return one thing, so this groups the top bar and the page together
    <>
      {/* The words on the browser tab (WCAG). React puts this in the right place for us */}
      <title>Feed | ScoutSearch</title>
      {/* The top bar */}
      <NavBar />
      {/* <main> is the main content of the page (screen readers can jump to it) */}
      <main className="feed-page">
        {/* The big title, then the tabs. Both stretch across the whole page */}
        <FeedHeader />
        <FeedTabs picked={picked} setPicked={setPicked} />

        {/* Left column: the post box, then the posts */}
        <section className="feed-middle" aria-label="Posts">
          {/* The post box. onPost is how it hands a new post back up to Feed */}
          <PostComposer onPost={addPost} />
          {posts}
          {/* Hidden on screen. Screen readers hear changes to the list (WCAG) */}
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </section>

        {/* Right column: what's due soon, then suggestions */}
        <aside className="feed-right">
          <DueSoonCard tracker={tracker} />
          <OpportunityRadar />
        </aside>
      </main>
    </>
  );
}

// "export default" lets other files import Feed (App.jsx does this).
export default Feed;
