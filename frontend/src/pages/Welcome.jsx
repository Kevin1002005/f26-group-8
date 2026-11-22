// Welcome.jsx is the welcome guide (yoursite.com/welcome).
// New accounts land here first (Sign up sends you here, and RequireLogin sends
// you here from any page until you finish or skip it), so Opportunities can
// start with jobs that fit you, and your resume starts with your details.
// It has 3 short steps, one at a time: Basics, What you're looking for, and
// Skills. Every question is optional except one: "Where are you in
// school?" (high school or college) has to be answered before Next on Basics,
// because Opportunities and Best fit use it. "Skip the guide" still ends it at
// any point (then Opportunities asks it instead, see LevelPrompt there).
// Your answers are saved to your account when you finish (or skip).
// The last screen points you to the Resume builder (your education,
// experience, and projects go there) and to Opportunities.
// The styles for this page are in index.css, under "Welcome guide".

// useState remembers the step and your answers. useRef and useEffect move the
// keyboard focus to each new step's heading (see below)
import { useEffect, useRef, useState } from "react";
// Link goes to another page of our site. useNavigate sends you there from code,
// and Navigate does it as soon as it's drawn
import { Link, Navigate, useNavigate } from "react-router";
// The ScoutSearch logo (components/SiteLogo.jsx)
import SiteLogo from "../components/SiteLogo.jsx";
// The boxes for each step. My info uses the same ones (components/ProfileFields.jsx)
import {
  BasicsFields,
  LookingForFields,
  SkillsField,
} from "../components/ProfileFields.jsx";
// Your profile, and saving it to your account (data/profile.js)
import { saveProfile, skipGuideForNow, useMyProfile } from "../data/profile.js";
// Copies your name, city, school, and skills into your resume too, so the
// Resume builder already has them (data/profile-resume-sync.js)
import { copyProfileToResume } from "../data/profile-resume-sync.js";
// The name on your account, to fill in the Name box for you
import { useCurrentUser } from "../use-current-user.js";

// ---------- The steps ----------
// One item per step. "Fields" is the group of boxes that step shows
const steps = [
  {
    label: "Basics",
    title: "The basics",
    subtitle: "Sets which jobs you see first, and fills in your resume.",
    Fields: BasicsFields,
  },
  // (2026-11-22) The "About you" step (a headline and a few sentences) was
  // taken out: nobody sees a profile anymore and matching doesn't use them,
  // so asking students (many under 18) for them had no reason
  {
    label: "Looking for",
    title: "What you're looking for",
    subtitle: "So Opportunities can put the jobs that fit you first.",
    Fields: LookingForFields,
  },
  {
    label: "Skills",
    title: "Your skills",
    subtitle: "Languages, tools, or anything else you're good at.",
    Fields: SkillsField,
  },
];

// ---------- Pieces of the page ----------

// The row of 3 bars that fill in as you go, each with its step's name.
// <ol> is a numbered list, so screen readers hear "list, 3 items", and
// aria-current="step" marks the step you're on (WCAG)
function StepBars(props) {
  return (
    <ol className="welcome-steps">
      {steps.map((step, index) => {
        // "done" for the steps before this one, "current" for this one
        let className = "welcome-step";
        if (index < props.current) className += " welcome-step-done";
        if (index === props.current) className += " welcome-step-current";
        return (
          <li
            key={step.label}
            className={className}
            aria-current={index === props.current ? "step" : undefined}
          >
            {/* The bar is only a picture of the progress (the words say it too) */}
            <span className="welcome-step-bar" aria-hidden="true" />
            <span className="welcome-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Welcome is the whole page. It puts the pieces above together.
function Welcome() {
  const navigate = useNavigate();
  const profile = useMyProfile();
  const me = useCurrentUser();

  // Which step is showing: 0 to 2 are the steps, 3 (steps.length) is "You're all set"
  const [current, setCurrent] = useState(0);
  // Your answers, once you start typing. Until then (null), the boxes show
  // what's already saved, with your account's name in the Name box
  const [draft, setDraft] = useState(null);
  // true while saving, so the buttons can't be pressed twice
  const [saving, setSaving] = useState(false);
  // What went wrong, if saving didn't work
  const [message, setMessage] = useState("");
  // The message under "Where are you in school?" when Next was pressed
  // without picking ("" when it's fine). See BasicsFields in ProfileFields.jsx
  const [levelError, setLevelError] = useState("");

  // What the boxes show: your answers, or what's saved so far.
  // "||" means "use the first one that isn't empty"
  const shown = draft ?? { ...profile.data, name: profile.data.name || me.name };
  // The boxes call this with the part that changed, like { city: "Boston" }.
  // Picking high school or college takes its error message away
  function change(fields) {
    setDraft({ ...shown, ...fields });
    if (fields.level) setLevelError("");
  }

  // After the step changes, put the keyboard focus on the new step's
  // heading, so screen readers read it and Tab starts from the top of the
  // step (WCAG). shownStep remembers the step that was last focused, so
  // this skips the first time the page shows up (App.jsx already focuses the
  // page's <h1> then)
  const headingRef = useRef(null);
  const shownStep = useRef(current);
  useEffect(() => {
    if (shownStep.current === current) return;
    shownStep.current = current;
    headingRef.current?.focus();
  }, [current]);

  // Someone who finished (or skipped) the guide before can still end up here:
  // an old "confirm your email" link opens Log in with ?next=welcome, which
  // sends you here (see pageAfterLogin in Login.jsx). Once the server says
  // you've done the guide, and you haven't started typing, go on to
  // Opportunities instead. (Not after Finish: "You're all set" is the last step)
  if (profile.state === "ready" && !profile.needsGuide && draft === null && current === 0) {
    return <Navigate to="/discovery" replace />;
  }

  const isDone = current === steps.length;
  const isLastStep = current === steps.length - 1;
  const step = steps[current];

  // "Next", or "Finish" on the last step. Finish saves everything and marks
  // the guide as done (true), then shows "You're all set"
  async function handleNext() {
    // The Basics step can't be left without "Where are you in school?": it's
    // the one question Opportunities needs to start with what you can apply to.
    // The message shows under it, and the focus goes to the first choice, so
    // screen readers read the question and the message together (WCAG)
    if (step.Fields === BasicsFields && !shown.level) {
      setLevelError("Choose high school or college, so Opportunities can show what you can apply to.");
      document.getElementById("profile-level-high-school")?.focus();
      return;
    }
    if (!isLastStep) {
      setCurrent(current + 1);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await saveProfile(shown, true);
      // Then your resume. It waits for this, so the Resume builder already
      // has your answers if you open it right away. (If it doesn't work, your
      // profile is still saved, so the guide carries on)
      await copyProfileToResume(profile.data, shown, me.email).catch(() => {});
      setCurrent(steps.length);
    } catch (error) {
      // Stay on this step, so you can press Finish again
      setMessage("Couldn't save your profile: " + error.message);
    }
    setSaving(false);
  }

  // "Skip the guide": saves what you've typed so far, marks the guide as
  // done, and opens Opportunities. If it can't be saved (no internet), the
  // guide still goes away for this visit, so you're never stuck on it
  async function handleSkip() {
    // Nothing typed yet, and the server hasn't sent your profile (it may still
    // be waking up): the boxes are empty only because nothing has arrived yet.
    // Saving them would write empty boxes over a profile you already have, so
    // just leave the guide for this visit, without saving anything
    if (draft === null && profile.state !== "ready") {
      skipGuideForNow();
      navigate("/discovery", { replace: true });
      return;
    }
    setSaving(true);
    try {
      await saveProfile(shown, true);
      await copyProfileToResume(profile.data, shown, me.email).catch(() => {});
    } catch {
      skipGuideForNow();
    }
    // replace: pressing Back from Opportunities doesn't bring the guide back
    navigate("/discovery", { replace: true });
  }

  // The first word of your name, for "Welcome to ScoutSearch, Jamie"
  const firstName = shown.name.trim().split(/\s+/)[0];

  return (
    <>
      {/* The name on the browser tab (WCAG) */}
      <title>Welcome | ScoutSearch</title>

      {/* The top row: the logo, and "Skip the guide". The logo isn't a link
          here: every page would send you back to the guide until it's done */}
      <header className="welcome-top">
        <SiteLogo />
        {!isDone && (
          <button
            type="button"
            className="welcome-skip-button"
            onClick={handleSkip}
            disabled={saving}
          >
            Skip the guide
          </button>
        )}
      </header>

      <main className="welcome-page">
        <div className="welcome-box">
          {/* The page's one <h1> (WCAG) */}
          <h1 className="welcome-title">
            {firstName ? "Welcome to ScoutSearch, " + firstName : "Welcome to ScoutSearch"}
          </h1>
          <p className="welcome-subtitle">
            Set up your profile in about two minutes. Only "Where are you in school?"
            is required, and you can change your answers any time on My info.
          </p>

          {isDone ? (
            // ----- The last screen: "You're all set" -----
            <section className="welcome-step-box" aria-labelledby="welcome-step-title">
              <h2
                id="welcome-step-title"
                className="welcome-step-title"
                ref={headingRef}
                tabIndex={-1}
              >
                You're all set
              </h2>
              <p className="welcome-done-text">
                Your details are saved. Next, build your resume: your name,
                school, and skills are already on it, and you add your education,
                experience, and projects there. Or start looking for opportunities.
              </p>
              <div className="welcome-done-links">
                <Link to="/resume" className="welcome-main-button">
                  Build your resume
                </Link>
                <Link to="/discovery" className="welcome-other-button">
                  Find opportunities
                </Link>
              </div>
            </section>
          ) : (
            // ----- One step -----
            <section className="welcome-step-box" aria-labelledby="welcome-step-title">
              <StepBars current={current} />
              {/* "Step 2 of 3" in words, so the bars aren't the only way to tell */}
              <p className="welcome-step-count">
                Step {current + 1} of {steps.length}
              </p>
              {/* tabIndex -1 lets the code above focus the heading, without
                  making it a Tab stop */}
              <h2
                id="welcome-step-title"
                className="welcome-step-title"
                ref={headingRef}
                tabIndex={-1}
              >
                {step.title}
              </h2>
              <p className="welcome-step-subtitle">{step.subtitle}</p>

              {/* This step's boxes. step.Fields is one of the groups from
                  ProfileFields.jsx, so <step.Fields /> draws that group */}
              <div className="welcome-fields">
                <step.Fields profile={shown} onChange={change} levelError={levelError} />
              </div>

              {/* role="alert" reads the problem out as soon as it shows up (WCAG) */}
              {message && (
                <p className="welcome-error" role="alert">
                  {message}
                </p>
              )}

              <div className="welcome-buttons">
                {current > 0 && (
                  <button
                    type="button"
                    className="welcome-other-button"
                    onClick={() => setCurrent(current - 1)}
                    disabled={saving}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  className="welcome-main-button welcome-next-button"
                  onClick={handleNext}
                  disabled={saving}
                >
                  {isLastStep ? (saving ? "Saving..." : "Finish") : "Next"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

// "export default" lets other files import Welcome (App.jsx does this).
export default Welcome;
