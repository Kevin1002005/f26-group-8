// EditProfile.jsx is the My info page (yoursite.com/my-info). It used to be
// "Edit profile", next to a public Profile page. That page was taken out in
// 2026-11 (ScoutSearch is about opportunities and resumes now), so this is the
// one place for your details. They're private: only you see them. Opportunities
// uses them for "Who it's for", "For your major", and Best fit, and your resume
// shares your name, city, school, and skills. The old addresses /editprofile
// and /profile send you here (App.jsx). The file keeps its old name, so the
// rest of the code (and the styles, which start with "edit-") didn't change.
// It has 2 columns: a list of the parts on the left (you can click one to jump
// to it), and a card with a form for each part on the right.
// "Save all changes" saves your details to your account (data/profile.js), and
// you stay on the page, with "Saved." under the button.
// The boxes are the same ones the welcome guide uses (components/ProfileFields.jsx).
// Your education, experience, and projects aren't typed here: they come from
// your resume, so the last card links to the Resume builder.
// The styles for this page are in index.css, under "EditProfile Page".

// The bar across the top of the page (components/NavBar.jsx)
import NavBar from "../components/NavBar";
// useState remembers what you type. useEffect runs code after the page shows up
import { useEffect, useState } from "react";
// Link goes to another page of our site. useLocation tells us the page's
// address, including the "#skills" part at the end
import { Link, useLocation } from "react-router";
// The boxes for each part of your profile
import {
  BasicsFields,
  LookingForFields,
  SkillsField,
} from "../components/ProfileFields.jsx";
// Your profile, saving it, and "Try again" if the server can't be reached
import { reloadProfile, saveProfile, useMyProfile } from "../data/profile.js";
// Copies what you changed (name, city, school, skills) into your resume too
// (data/profile-resume-sync.js)
import { copyProfileToResume } from "../data/profile-resume-sync.js";
// The name on your account, to fill in the Name box if your profile has none yet
import { useCurrentUser } from "../use-current-user.js";

// ---------- The parts of the profile ----------
// One item for each card on this page. "id" matches the card's id below,
// so the list on the left can jump to it (href="#skills" finds id="skills")
const sections = [
  { id: "basics", label: "Basics" },
  { id: "looking-for", label: "Looking for" },
  { id: "skills", label: "Skills" },
  { id: "resume", label: "Education & more" },
];

// ---------- Pieces of the page ----------

// The list of parts on the left. Each one is a link that jumps to its card.
// <ol> is a numbered list, so screen readers say "list, 5 items" (WCAG)
function EditTracker() {
  return (
    // The box on the left. The title sits in the box but outside the <nav>,
    // so screen readers hear "My info" as the page's title, not as
    // part of the list of links (WCAG)
    <div className="edit-tracker-card">
      {/* The page's one <h1> (WCAG) */}
      <h1 className="edit-tracker-header">My info</h1>
      <p className="edit-tracker-subtitle">Only you see this. Opportunities uses it to find jobs that fit you.</p>
      {/* <nav> is just the list of links. aria-label names it */}
      <nav aria-label="My info parts">
        <ol className="edit-tracker-list">
          {/* .map() makes one step for each part. "index" counts from 0,
            so index + 1 gives the step numbers 1 to 5 */}
          {sections.map((section, index) => (
            <li key={section.id}>
              <a href={"#" + section.id} className="edit-tracker-steps">
                {/* The number in the circle. The list already numbers the
                  steps for screen readers, so they skip this (WCAG) */}
                <span className="edit-tracker-id" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="edit-tracker-label">{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

// One card: a title, the line under it, and whatever is put between its
// tags (props.children, here a group of boxes from ProfileFields.jsx).
// props.id is where the list on the left jumps to
function EditCard(props) {
  return (
    <section className="edit-card" id={props.id}>
      <h2 className="edit-card-title">{props.title}</h2>
      <p className="edit-card-subtitle">{props.subtitle}</p>
      {props.children}
    </section>
  );
}

// The last card: education, experience, and projects live in your resume,
// so this sends you there instead of asking for them twice
function ResumeInfo() {
  return (
    <EditCard
      id="resume"
      title="Education, experience, and projects"
      subtitle="These come from your resume, so you only type them once."
    >
      <p className="edit-resume-text">
        They're kept on your resume, so add or change them in the Resume
        builder. Best fit reads them from there too.
      </p>
      <Link to="/resume" className="edit-resume-link">
        Open the Resume builder
      </Link>
    </EditCard>
  );
}

// EditProfile is the whole page. It puts the pieces above together.
function EditProfile() {
  // The page's web address. If you came from a link like "Add your major" on
  // Opportunities, it ends with something like "#basics"
  const address = useLocation();

  // Your saved profile, and your account's name
  const profile = useMyProfile();
  const me = useCurrentUser();

  // ---------- What you've typed ----------
  // All the cards share one copy of your profile, kept here (not inside each
  // card), so the one Save button at the bottom can see all of it. Moving it
  // up from the cards to the page is called "lifting state up".
  // It's null until you change something: until then, the boxes show what's
  // saved (with your account's name in the Name box if you haven't saved one)
  const [draft, setDraft] = useState(null);
  const shown = draft ?? { ...profile.data, name: profile.data.name || me.name };
  // The boxes call this with the part that changed, like { city: "Boston" }.
  // Picking high school or college takes its error message away, and any
  // change takes away the old "Saved." (the new change isn't saved yet)
  function change(fields) {
    setDraft({ ...shown, ...fields });
    if (fields.level) setLevelError("");
    setSavedMessage("");
  }

  // true while saving (so Save can't be pressed twice), and what went wrong
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // "Saved." once Save worked ("" until then). You stay on this page after
  // saving, so this is how you know it worked
  const [savedMessage, setSavedMessage] = useState("");
  // The message under "Where are you in school?" when Save was pressed
  // without picking ("" when it's fine). See BasicsFields in ProfileFields.jsx
  const [levelError, setLevelError] = useState("");

  // The one Save button for the whole page. It saves your details to your
  // account (and the parts your resume shares), and says "Saved." under the
  // button. If it can't, it says why, so nothing you typed is lost.
  // (It used to take you to the Profile page, which is gone now)
  async function handleSaveAll() {
    // Already saving: ignore a second click (see aria-disabled on the button)
    if (saving) return;
    // "Where are you in school?" has to be answered (Opportunities and Best fit
    // use it). The message shows under it, and the focus jumps up to the first
    // choice, so screen readers read the question and the message (WCAG)
    if (!shown.level) {
      setLevelError("Choose high school or college, so Opportunities can show what you can apply to.");
      document.getElementById("profile-level-high-school")?.focus();
      return;
    }
    setSaving(true);
    setMessage("");
    setSavedMessage("");
    try {
      await saveProfile(shown);
      // Then the same changes on your resume (if that doesn't work, your
      // details are still saved)
      await copyProfileToResume(profile.data, shown, me.email).catch(() => {});
      setSavedMessage("Saved.");
    } catch (error) {
      setMessage("Couldn't save your changes: " + error.message);
    }
    setSaving(false);
  }

  // After the page shows up, jump to the card named after the "#", and put
  // the cursor in its first box, so you can start typing right away.
  // It runs again if the # part changes, or once the cards show up
  // (they wait for your profile to load the first time)
  useEffect(() => {
    if (address.hash === "" || !profile.known) return;
    // .slice(1) drops the "#", so "#skills" becomes "skills"
    const card = document.getElementById(address.hash.slice(1));
    if (card === null) return;
    card.scrollIntoView({ block: "start" });
    const firstBox = card.querySelector("input, textarea");
    if (firstBox !== null) {
      // preventScroll stops the page from jumping again for the cursor
      firstBox.focus({ preventScroll: true });
    }
  }, [address.hash, profile.known]);

  return (
    <>
      {/* The name on the browser tab (WCAG) */}
      <title>My info | ScoutSearch</title>
      <NavBar />
      <main className="edit-page">
        {/* The left column. It stays on screen while you scroll the cards,
            so the parts list is always reachable. (A "Back to profile" link
            sat above it, until the Profile page was taken out) */}
        <aside className="edit-profile-tracker">
          <EditTracker />
        </aside>

        {profile.known ? (
          <div className="edit-section">
            {/* The cards' lines don't say "the world" or "employers" anymore:
                nobody else sees these details now */}
            <EditCard id="basics" title="Basic Information" subtitle="Sets which jobs you see first (high school or college, major, city), and fills in your resume.">
              <BasicsFields profile={shown} onChange={change} levelError={levelError} />
            </EditCard>
            <EditCard id="looking-for" title="What I'm looking for" subtitle="Best fit on Opportunities puts jobs like these first.">
              <LookingForFields profile={shown} onChange={change} />
            </EditCard>
            <EditCard id="skills" title="Skills" subtitle="Best fit matches these to job requirements, and they go on your resume.">
              <SkillsField profile={shown} onChange={change} />
            </EditCard>
            <ResumeInfo />

            {/* role="alert" reads the problem out as soon as it shows up (WCAG) */}
            {message && (
              <p className="edit-save-error" role="alert">
                {message}
              </p>
            )}
            {/* The one Save button for the whole page. aria-disabled (not
                "disabled") while saving keeps the keyboard focus on it, since
                you stay on this page now; handleSaveAll ignores clicks meanwhile */}
            <button
              type="button"
              className="profile-btn-primary edit-save-all"
              onClick={handleSaveAll}
              aria-disabled={saving}
            >
              {saving ? "Saving..." : "Save all changes"}
            </button>
            {/* "Saved." once it worked. Always on the page, so role="status"
                makes screen readers read it when the word appears (WCAG) */}
            <p className="edit-save-message" role="status">
              {savedMessage}
            </p>
          </div>
        ) : (
          // The first time on this browser, until the server answers.
          // The form waits, so it never saves over your profile with empty boxes.
          // role="status" lets screen readers hear it (WCAG)
          <div className="edit-section" role="status">
            {profile.state === "offline" ? (
              <section className="edit-card">
                <p className="edit-resume-text">
                  Couldn't load your profile. Check your internet and try again.
                </p>
                <button
                  type="button"
                  className="profile-btn-primary edit-try-again"
                  onClick={reloadProfile}
                >
                  Try again
                </button>
              </section>
            ) : (
              <p className="edit-resume-text">Loading your profile...</p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// "export default" lets other files import EditProfile (App.jsx does this).
export default EditProfile;
