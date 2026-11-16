// Profile.jsx is the Profile page (yoursite.com/profile).
// It's a student's profile on a job board: who you are at the top,
// then the facts an employer needs when you apply (what you're looking for,
// education, experience, projects, resume, skills).
// It shows YOUR information, from two places:
//   - your profile (data/profile.js): what you filled in on the welcome guide
//     or Edit profile (name, school, headline, About, what you're looking for, skills)
//   - your resume (resume-storage.js): your education, experience, and
//     projects, so you only type them once, in the Resume builder
// Anything you haven't filled in yet shows a short "add this" note instead.
// The styles for this page are in index.css, under "Profile page".

// The bar across the top of the page. It lives in its own file
// (components/NavBar.jsx) because the Feed page uses it too.
import NavBar from "../components/NavBar.jsx";
// Link moves to another page of our site without reloading it
import { Link } from "react-router";
// useState remembers your resume. useEffect keeps it in step with your account
import { useEffect, useState } from "react";
// Your profile, and "Try again" for when the server can't be reached
import { reloadProfile, useMyProfile } from "../data/profile.js";
// Your resume: this browser's copy right away, then your account's
import { loadResume, watchAccountResume } from "../resume-storage.js";
// Your account's name (a fallback until your profile has one), and the
// letters for the circle
import { initialsFor, useCurrentUser } from "../use-current-user.js";

// true = you're looking at your own profile (shows Edit profile, the Add
// buttons, and the "Ready to apply?" checklist).
// false = someone else's (shows Message and Connect instead).
// For now you can only see your own. It's up here, outside every function,
// so every piece of the page can use it
const isOwnProfile = true;

// ---------- Helpers ----------

// The Resume builder starts every section with one empty entry, so this keeps
// only the entries that have something typed in at least one of "boxes"
function filledIn(list, boxes) {
  return list.filter((entry) => boxes.some((box) => entry[box].trim() !== ""));
}

// The bullet points of a job or project: one per line, without blank lines
function bulletsOf(entry) {
  return entry.bullets
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

// Resume links are often typed without "https://" ("github.com/you"). Without
// it, the browser would treat the link as a page on OUR site
function webAddress(link) {
  return /^https?:\/\//i.test(link) ? link : "https://" + link;
}

// "2030" becomes "Class of 2030". Anything else ("Class of 2028", "Senior")
// is shown the way you typed it
function classYearText(classYear) {
  return /^\d{4}$/.test(classYear) ? "Class of " + classYear : classYear;
}

// The project tiles take turns between the three colors
const tileColors = ["dark", "blue", "navy"];

// ---------- Small icons ----------
// Each icon is a tiny drawing (SVG) on a 24 by 24 grid.
// stroke="currentColor" makes it the same color as the words around it.
// aria-hidden="true" hides it from screen readers, because the words next
// to it already say the same thing (WCAG)

// A + sign: one line down, one line across
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

// A pencil, for "Edit" and "Update"
function PencilIcon(props) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// A sheet of paper with lines on it, for the resume
function FileIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

// An arrow pointing right, for "go see this project"
function ArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// A check mark, for finished steps in the checklist
function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ---------- Pieces of the page ----------
// Each function below is a component: one piece of the page.
// The Profile component at the bottom puts all the pieces together.

// The big box at the top: your picture, name, details, and buttons.
// props.name and props.initials are worked out in Profile (below), and
// props.profile is everything from your profile
function ProfileHeader(props) {
  const profile = props.profile;
  // The facts in the row under your headline. .filter(Boolean) drops the
  // ones you haven't filled in, so there's never an empty " · " between them
  const facts = [
    profile.city,
    profile.school,
    profile.classYear ? classYearText(profile.classYear) : "",
  ].filter(Boolean);

  return (
    // "profile-header" is the box around everything below
    <div className="profile-header">
      {/* 3 columns side by side: blue panel, words, buttons.
          On phones they stack instead (see the bottom of the Profile CSS) */}
      <div className="profile-header-row">
        {/* Column 1: the blue panel with your picture in it */}
        <div className="profile-banner">
          {/* Your initials stand in for a photo. Your name is right next
              to it, so screen readers skip the letters (WCAG) */}
          <div className="profile-avatar" aria-hidden="true">
            {props.initials}
          </div>
        </div>

        {/* Column 2: your name and details */}
        <div className="profile-header-text">
          {/* Your name with your pronouns next to it */}
          <div className="profile-name-row">
            {/* The page's one <h1> (WCAG) */}
            <h1 className="profile-name">{props.name}</h1>
            {profile.pronouns && (
              <span className="profile-pronouns">{profile.pronouns}</span>
            )}
          </div>

          {/* Your headline: one sentence about you */}
          {profile.headline && <p className="profile-bio">{profile.headline}</p>}

          {/* Where you are and where you go to school */}
          {facts.length > 0 && (
            <p className="profile-info">
              {/* Map pin icon (decoration, WCAG) */}
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
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {/* Each piece is kept together with the dot after it, so when the
                  row wraps on a narrow screen, a line ends with a dot instead of
                  starting with one. The dots only separate the words, so screen
                  readers skip them. The last piece has no dot */}
              {facts.map((fact, index) => (
                <span key={index} className="profile-info-item">
                  {fact}
                  {index < facts.length - 1 && <span aria-hidden="true"> ·</span>}
                </span>
              ))}
            </p>
          )}
        </div>

        {/* Column 3: the buttons on the right */}
        <div className="profile-actions">
          {/* Your own profile: an Edit profile button */}
          {isOwnProfile && (
            <Link
              to="/editprofile"
              className="profile-header-button profile-header-button-dark"
            >
              <PencilIcon size="18" />
              Edit profile
            </Link>
          )}

          {/* Someone else's profile: Message and Connect.
              <> </> groups the two buttons without adding an extra box */}
          {!isOwnProfile && (
            <>
              <button className="profile-header-button profile-header-button-dark">
                {/* Envelope icon (decoration, WCAG) */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 5L2 7" />
                </svg>
                Message
              </button>
              <button className="profile-header-button">
                {/* People icon (decoration, WCAG) */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Connect
              </button>
            </>
          )}
        </div>
      </div>

      {/* The row along the bottom of the box: links that jump down to each
          card. <nav> tells screen readers it's a set of links, and
          aria-label names it (WCAG) */}
      <nav className="profile-tabs" aria-label="Profile sections">
        {/* href="#education" jumps to the card with id="education" */}
        <a href="#education" className="profile-tab">
          Education
        </a>
        <a href="#projects" className="profile-tab">
          Projects
        </a>
        <a href="#experience" className="profile-tab">
          Work Experience
        </a>
        <a href="#resume" className="profile-tab">
          Resume
        </a>
      </nav>
    </div>
  );
}

// A reusable card: a box with a title on top, an optional Add or Update
// button next to the title, and whatever you put between its tags underneath.
// "props" holds the info passed in. For example,
// <ProfileSection id="education" title="Education" action="Add" to="/resume">
// makes props.title equal "Education" and props.action equal "Add".
// props.children is a special one: it's everything you put between
// <ProfileSection> and </ProfileSection>. That's how one card can hold
// a paragraph in "About", but a list in "Experience".
function ProfileSection(props) {
  return (
    // <section> + <h2> marks each card as one part of the page, so screen
    // readers can jump between cards by heading (WCAG).
    // id={props.id} is where the jump links in the header land
    <section className="profile-card" id={props.id}>
      {/* The top of the card: the title on the left, the button on the right */}
      <div className="profile-card-top">
        <h2 className="profile-card-title">{props.title}</h2>

        {/* Only on your own profile, and only if this card has an action.
            aria-label says the whole thing ("Add education") so screen
            readers can tell the Add buttons apart. It starts with the
            visible word, so voice control users can still say "Add" (WCAG) */}
        {isOwnProfile && props.action && (
          // props.to is the page where you change this part: Edit profile
          // (like "/editprofile#skills", which opens its Skills card) or
          // the Resume builder
          <Link
            to={props.to}
            className="profile-card-action"
            aria-label={props.action + " " + props.title.toLowerCase()}
          >
            {/* A + for "Add", a pencil for "Update" */}
            {props.action === "Add" ? <PlusIcon /> : <PencilIcon size="16" />}
            {props.action}
          </Link>
        )}
      </div>

      {/* Whatever was put between the tags shows up here */}
      {props.children}
    </section>
  );
}

// "What I'm looking for": the facts an employer checks first.
// <dl> is a "description list": pairs of a name (<dt>) and its answer (<dd>).
// Screen readers read each pair together (WCAG).
// Only the facts you've filled in are shown
function LookingForCard(props) {
  const lookingFor = props.lookingFor;
  const isEmpty =
    lookingFor.kinds.length === 0 && !lookingFor.when && !lookingFor.where && !lookingFor.paidOnly;

  return (
    <ProfileSection
      title="What I'm looking for"
      action={isEmpty ? "Add" : "Update"}
      to="/editprofile#looking-for"
    >
      {isEmpty ? (
        <p className="profile-empty">
          Say what kind of position you want, and when.
        </p>
      ) : (
        <dl className="profile-facts">
          {lookingFor.kinds.length > 0 && (
            <div className="profile-fact">
              <dt className="profile-fact-name">Kind of job</dt>
              <dd>
                {/* One tag for each kind. The word itself is the key */}
                <ul className="profile-tags">
                  {lookingFor.kinds.map((kind) => (
                    <li key={kind} className="profile-tag">
                      {kind}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {lookingFor.when && (
            <div className="profile-fact">
              <dt className="profile-fact-name">When</dt>
              <dd className="profile-fact-answer">{lookingFor.when}</dd>
            </div>
          )}
          {lookingFor.where && (
            <div className="profile-fact">
              <dt className="profile-fact-name">Where</dt>
              <dd className="profile-fact-answer">{lookingFor.where}</dd>
            </div>
          )}
          {lookingFor.paidOnly && (
            <div className="profile-fact">
              <dt className="profile-fact-name">Pay</dt>
              <dd className="profile-fact-answer">Paid positions only</dd>
            </div>
          )}
        </dl>
      )}
    </ProfileSection>
  );
}

// "Ready to apply?": a checklist of what's done and what's left, with one
// button that takes you to the first thing left to do.
// props.steps comes from Profile (below). Only you see this card
function ReadyChecklist(props) {
  const steps = props.steps;
  // .find() gives the first step that isn't done (or undefined if they all are)
  const nextStep = steps.find((step) => !step.done);
  // .filter() keeps only the steps that are done, and .length counts them
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <ProfileSection title="Ready to apply?">
      {/* "5 of 6 done" */}
      <p className="profile-checklist-count">
        {doneCount} of {steps.length} done
      </p>

      <ul className="profile-checklist">
        {steps.map((step) => (
          // Done steps get an extra class, so the CSS can fill in the circle
          <li
            key={step.id}
            className={
              step.done ? "profile-check profile-check-done" : "profile-check"
            }
          >
            {/* The circle: a check mark inside when the step is done */}
            <span className="profile-check-circle">
              {step.done && <CheckIcon />}
            </span>
            {step.label}
            {/* The circle only shows "done" with a picture, so screen
                readers get it in words instead (WCAG) */}
            <span className="sr-only">
              {step.done ? " (done)" : " (to do)"}
            </span>
          </li>
        ))}
      </ul>

      {/* The one next step. If everything is done, say so instead */}
      {nextStep ? (
        <Link to={nextStep.to} className="profile-next-step">
          Finish your profile
        </Link>
      ) : (
        <p className="profile-checklist-ready">
          Your profile is ready to apply with.
        </p>
      )}
    </ProfileSection>
  );
}

// The "About" card: a few sentences in your own words
function AboutCard(props) {
  return (
    <ProfileSection
      title="About"
      action={props.about ? "Update" : "Add"}
      to="/editprofile#about"
    >
      {props.about ? (
        <p className="profile-about-text">{props.about}</p>
      ) : (
        <p className="profile-empty">
          Tell employers a little about yourself: what you study, and what you
          want to do next.
        </p>
      )}
    </ProfileSection>
  );
}

// The Education card: one row per school on your resume, each with the
// school's initials, the school and dates, and the degree in a column with a
// thin line on its left
function EducationCard(props) {
  return (
    <ProfileSection id="education" title="Education" action="Add" to="/resume">
      {props.education.length === 0 ? (
        <p className="profile-empty">
          Add your school in the Resume builder, and it shows up here.
        </p>
      ) : (
        // <ul> because it's a list of schools (WCAG)
        <ul className="profile-rows">
          {props.education.map((school) => (
            <li key={school.id} className="profile-education">
              {/* The square with your school's initials (decoration, WCAG) */}
              <div className="profile-logo" aria-hidden="true">
                {initialsFor(school.school || school.degree)}
              </div>

              {/* Your school and when you go there */}
              <div>
                <h3 className="profile-row-title">{school.school}</h3>
                {school.dates && (
                  <p className="profile-row-date">{school.dates}</p>
                )}
              </div>

              {/* Your degree */}
              {school.degree && (
                <div className="profile-education-detail">
                  <p className="profile-education-label">Degree</p>
                  <p className="profile-education-value">{school.degree}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

// The Experience card: one row for each job on your resume.
// It uses the same row look as Projects and Resume
function ExperienceCard(props) {
  return (
    <ProfileSection
      id="experience"
      title="Work Experience"
      action="Add"
      to="/resume"
    >
      {/* If the list is empty, say so instead of showing a blank card.
          "? :" means "if ... then show this, otherwise show that" */}
      {props.experience.length === 0 ? (
        <p className="profile-empty">
          Add a job, club, team, or volunteer role in the Resume builder. It
          all counts.
        </p>
      ) : (
        /* <ul> because it's a list of jobs (WCAG).
           "profile-experience" adds a line above the first row */
        <ul className="profile-rows profile-experience">
          {props.experience.map((job) => (
            <li key={job.id} className="profile-row">
              {/* The square with the group's initials (decoration, WCAG) */}
              <div className="profile-logo" aria-hidden="true">
                {initialsFor(job.organization || job.role)}
              </div>
              <div>
                {/* <h3> is one level under the card's <h2> (WCAG) */}
                <h3 className="profile-row-title">{job.role || job.organization}</h3>
                {job.role && job.organization && (
                  <p className="profile-row-subtitle">{job.organization}</p>
                )}
                {job.dates && <p className="profile-row-date">{job.dates}</p>}
                {/* What you did, one bullet point per line on your resume */}
                {bulletsOf(job).length > 0 && (
                  <ul className="profile-row-bullets">
                    {/* "place" (0, 1, 2...) is the key: two lines could be the same */}
                    {bulletsOf(job).map((line, place) => (
                      <li key={place}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

// Tilts a project tile a little toward the mouse, so it feels 3D.
// "event" says where the mouse is. event.currentTarget is the tile itself.
// It works out how far the mouse is from the tile's middle (from -0.5 on one
// edge to 0.5 on the other), turns that into an angle of up to 3 degrees,
// and hands the angles to the CSS as --tilt-x and --tilt-y.
// The CSS only uses them with a mouse and with "reduce motion" off
function tiltTowardMouse(event) {
  const tile = event.currentTarget;
  const box = tile.getBoundingClientRect();
  const across = (event.clientX - box.left) / box.width - 0.5;
  const down = (event.clientY - box.top) / box.height - 0.5;
  tile.style.setProperty("--tilt-x", (down * -6).toFixed(2) + "deg");
  tile.style.setProperty("--tilt-y", (across * 6).toFixed(2) + "deg");
}

// When the mouse leaves (or the browser cancels the touch, like when you
// start scrolling on a phone), the tile goes back to flat
function resetTilt(event) {
  event.currentTarget.style.removeProperty("--tilt-x");
  event.currentTarget.style.removeProperty("--tilt-y");
}

// The Projects card: one tile for each project on your resume, side by side.
// Each tile has a colored box on top, then the name, its first bullet point,
// and a row with its dates and (if it has a link) an arrow button that opens it.
// The whole tile is clickable then: the CSS stretches the arrow's link over it
function ProjectsCard(props) {
  return (
    <ProfileSection id="projects" title="Projects" action="Add" to="/resume">
      {/* If the list is empty, say so instead of showing a blank card */}
      {props.projects.length === 0 ? (
        <p className="profile-empty">
          Add something you've built, for class or for fun, in the Resume
          builder.
        </p>
      ) : (
        // <ul> because it's a list of projects (WCAG)
        <ul className="profile-projects">
          {props.projects.map((project, index) => (
            <li
              key={project.id}
              className="profile-project"
              onPointerMove={tiltTowardMouse}
              onPointerLeave={resetTilt}
              onPointerCancel={resetTilt}
            >
              {/* The colored box on top. "profile-project-top-dark" (or -blue,
                  -navy) picks its color. "%" (remainder) goes 0, 1, 2, 0, 1, 2...
                  so the tiles take turns */}
              <div
                className={
                  "profile-project-top profile-project-top-" +
                  tileColors[index % tileColors.length]
                }
              >
                {/* The big letters are decoration; the name below says the
                    same thing, so screen readers skip them (WCAG) */}
                <span className="profile-project-badge" aria-hidden="true">
                  {initialsFor(project.name)}
                </span>
                <span className="profile-project-category">
                  {project.context || "Project"}
                </span>
              </div>

              {/* The words under the colored box */}
              <div className="profile-project-body">
                {/* <h3> is one level under the card's <h2> (WCAG) */}
                <h3 className="profile-project-name">{project.name}</h3>
                {bulletsOf(project).length > 0 && (
                  <p className="profile-project-text">{bulletsOf(project)[0]}</p>
                )}

                {/* The bottom row: the dates on the left, the arrow on the right */}
                <div className="profile-project-footer">
                  <p className="profile-project-stat">{project.dates}</p>
                  {/* The arrow opens the project in a new tab. The CSS stretches
                      it over the whole tile, so clicking anywhere on the tile works.
                      target="_blank" opens a new tab, and rel="noreferrer" is a
                      safety setting for links to other websites.
                      It has no words, so aria-label says what it does,
                      including that it opens a new tab (WCAG) */}
                  {project.link && (
                    <a
                      href={webAddress(project.link)}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-project-link"
                      aria-label={"View " + project.name + " (opens in a new tab)"}
                    >
                      <ArrowIcon />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

// The Resume card: a link to your resume in the Resume builder, where you
// can change it or save it as a PDF
function ResumeCard(props) {
  return (
    <ProfileSection
      id="resume"
      title="Resume"
      action={props.hasResume ? "Update" : "Add"}
      to="/resume"
    >
      {props.hasResume ? (
        <div className="profile-row">
          {/* The square with the file icon (decoration, WCAG) */}
          <div className="profile-logo" aria-hidden="true">
            <FileIcon />
          </div>
          <div>
            <h3 className="profile-row-title">
              <Link to="/resume" className="profile-resume-link">
                {props.title}
                {/* The small arrow after the name (decoration, WCAG) */}
                <ArrowIcon />
              </Link>
            </h3>
            <p className="profile-row-date">
              Change it, or save it as a PDF, in the Resume builder
            </p>
          </div>
        </div>
      ) : (
        <p className="profile-empty">
          Build your resume once, and it fills in your education, experience,
          and projects here too.
        </p>
      )}
    </ProfileSection>
  );
}

// The Skills card: one tag for each skill
function SkillsCard(props) {
  return (
    <ProfileSection
      title="Skills"
      action="Add"
      to="/editprofile#skills"
    >
      {/* If the list is empty, say so instead of showing a blank card */}
      {props.skills.length === 0 ? (
        <p className="profile-empty">No skills listed yet.</p>
      ) : (
        <ul className="profile-tags">
          {props.skills.map((skill) => (
            <li key={skill} className="profile-tag">
              {skill}
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

// Profile is the whole page. It puts all the pieces above together.
function Profile() {
  const profile = useMyProfile();
  const me = useCurrentUser();
  const data = profile.data;

  // Your resume: this browser's copy right away (or null if you haven't
  // made one), then your account's copy if it's different
  const [resume, setResume] = useState(() => loadResume());
  // watchAccountResume gives back its own clean-up, so useEffect can stop it
  useEffect(() => watchAccountResume(setResume), []);

  // Only the parts of the resume that have something typed in
  const education = resume ? filledIn(resume.education, ["school", "degree"]) : [];
  const experience = resume ? filledIn(resume.experience, ["role", "organization"]) : [];
  const projects = resume ? filledIn(resume.projects, ["name"]) : [];
  const hasResume =
    resume !== null &&
    (education.length > 0 ||
      experience.length > 0 ||
      projects.length > 0 ||
      Object.values(resume.contact).some((box) => box.trim() !== ""));

  // Your name: from your profile, or your account until you've saved one
  const realName = data.name || me.name;
  const name = realName || "Your profile";
  const initials = initialsFor(realName || me.email);

  // The "Ready to apply?" checklist. Each step is done (true) or not (false),
  // and "to" is where you go to do it
  const checklist = [
    { id: 1, label: "Say what you're looking for", done: data.lookingFor.kinds.length > 0, to: "/editprofile#looking-for" },
    { id: 2, label: "Write a short About", done: data.about.trim() !== "", to: "/editprofile#about" },
    { id: 3, label: "Add your education", done: education.length > 0, to: "/resume" },
    { id: 4, label: "Add an experience", done: experience.length > 0, to: "/resume" },
    { id: 5, label: "Add a project", done: projects.length > 0, to: "/resume" },
    { id: 6, label: "List 5 or more skills", done: data.skills.length >= 5, to: "/editprofile#skills" },
  ];

  return (
    // <> </> is a "fragment": an invisible wrapper that groups
    // the top bar and the page together
    <>
      {/* The name on the browser tab. React puts <title> in the right place
          for you. It helps people with many tabs open, and screen readers
          read it first (WCAG) */}
      <title>{name + " | ScoutSearch"}</title>

      {/* The top bar (from components/NavBar.jsx) */}
      <NavBar />
      {/* <main> is the main content of the page (screen readers can jump to it).
          "profile-page" splits it into the 2 columns */}
      <main className="profile-page">
        {/* The big box at the top. It stretches across both columns */}
        <ProfileHeader name={name} initials={initials} profile={data} />

        {profile.known ? (
          <>
            {/* Left column (the wide one): your story, top to bottom */}
            <div className="profile-main">
              <AboutCard about={data.about} />
              <EducationCard education={education} />
              <ProjectsCard projects={projects} />
              <ExperienceCard experience={experience} />
              <ResumeCard
                hasResume={hasResume}
                title={realName ? realName + " - Resume" : "Your resume"}
              />
            </div>

            {/* Right column (the thin one): the quick facts for applying.
                <aside> means side content */}
            <aside className="profile-side">
              <LookingForCard lookingFor={data.lookingFor} />
              {/* Only you see your checklist */}
              {isOwnProfile && <ReadyChecklist steps={checklist} />}
              <SkillsCard skills={data.skills} />
            </aside>
          </>
        ) : (
          // The first time on this browser, until the server answers.
          // role="status" lets screen readers hear it (WCAG)
          <div className="profile-main" role="status">
            {profile.state === "offline" ? (
              <>
                <p className="profile-empty">
                  Couldn't load your profile. Check your internet and try again.
                </p>
                <button
                  type="button"
                  className="profile-btn-primary profile-try-again"
                  onClick={reloadProfile}
                >
                  Try again
                </button>
              </>
            ) : (
              <p className="profile-empty">Loading your profile...</p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// "export default" lets other files import Profile (App.jsx does this).
export default Profile;
