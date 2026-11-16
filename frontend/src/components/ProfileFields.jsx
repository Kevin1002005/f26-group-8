// ProfileFields.jsx has the boxes for filling in your profile, in 4 groups:
// Basics, About you, What I'm looking for, and Skills.
// Two pages use them: the welcome guide (pages/Welcome.jsx) shows one group
// per step, and Edit profile (pages/EditProfile.jsx) shows each group in a
// card. Keeping them in one file means the two pages always ask the same
// questions, with the same limits.
//
// Every group takes the same two props:
//   profile    what's filled in so far (see emptyProfile in data/profile.js)
//   onChange   called with just the part that changed, like { city: "Boston" }.
//              The page merges it into its copy of the profile
// The styles are the Edit Profile page's form styles in index.css
// ("EditProfile Page"), so both pages look the same.

// useState remembers the skill you're typing, before you press Add
import { useState } from "react";
// The kinds of positions, and the most letters each box can hold
import { most, positionKinds } from "../data/profile.js";

// Every box has a <label htmlFor="x"> that matches its id="x", so clicking the
// label puts the cursor in the box, and screen readers say the label (WCAG).
// maxLength stops typing at the same limit the server checks, so you never
// get an error for typing too much.

// Basics: name, pronouns, school, class year, and city
export function BasicsFields(props) {
  const profile = props.profile;
  return (
    <>
      <div className="edit-row">
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-name">
            Name
          </label>
          {/* autoComplete="name" lets the browser offer to fill it in */}
          <input
            id="profile-name"
            className="edit-input"
            type="text"
            autoComplete="name"
            maxLength={most.name}
            placeholder="e.g. Jamie Rivera"
            value={profile.name}
            onChange={(e) => props.onChange({ name: e.target.value })}
          />
        </div>
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-pronouns">
            Pronouns
          </label>
          {/* list="..." offers the common answers as you type, but you can
              write anything (the <datalist> below holds the suggestions) */}
          <input
            id="profile-pronouns"
            className="edit-input"
            type="text"
            list="profile-pronoun-ideas"
            maxLength={most.pronouns}
            placeholder="e.g. she / her"
            value={profile.pronouns}
            onChange={(e) => props.onChange({ pronouns: e.target.value })}
          />
          <datalist id="profile-pronoun-ideas">
            <option value="she / her" />
            <option value="he / him" />
            <option value="they / them" />
          </datalist>
        </div>
      </div>

      <div className="edit-row">
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-school">
            School
          </label>
          <input
            id="profile-school"
            className="edit-input"
            type="text"
            maxLength={most.school}
            placeholder="e.g. Northeastern University"
            value={profile.school}
            onChange={(e) => props.onChange({ school: e.target.value })}
          />
        </div>
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-class-year">
            Class year
          </label>
          {/* inputMode="numeric" shows a number keyboard on phones */}
          <input
            id="profile-class-year"
            className="edit-input"
            type="text"
            inputMode="numeric"
            maxLength={most.classYear}
            placeholder="e.g. 2030"
            value={profile.classYear}
            onChange={(e) => props.onChange({ classYear: e.target.value })}
          />
        </div>
      </div>

      <label className="edit-label" htmlFor="profile-city">
        City
      </label>
      {/* "address-level2" means a city, so the browser can offer yours */}
      <input
        id="profile-city"
        className="edit-input"
        type="text"
        autoComplete="address-level2"
        maxLength={most.city}
        placeholder="e.g. Boston, MA"
        value={profile.city}
        onChange={(e) => props.onChange({ city: e.target.value })}
      />
    </>
  );
}

// About you: a one-line headline, and a few sentences
export function AboutFields(props) {
  const profile = props.profile;
  return (
    <>
      <label className="edit-label" htmlFor="profile-headline">
        Headline
      </label>
      {/* aria-describedby reads the hint under the box along with its label (WCAG) */}
      <input
        id="profile-headline"
        className="edit-input"
        type="text"
        maxLength={most.headline}
        aria-describedby="profile-headline-hint"
        placeholder="e.g. Computer science student who loves building accessible apps"
        value={profile.headline}
        onChange={(e) => props.onChange({ headline: e.target.value })}
      />
      <p className="edit-hint" id="profile-headline-hint">
        One line, shown under your name.
      </p>

      <label className="edit-label" htmlFor="profile-about">
        About you
      </label>
      <textarea
        id="profile-about"
        className="edit-input edit-textarea"
        maxLength={most.about}
        placeholder="e.g. What you're studying, what you like to work on, and what you want to learn next."
        value={profile.about}
        onChange={(e) => props.onChange({ about: e.target.value })}
      />
    </>
  );
}

// What I'm looking for: kinds of positions, when, where, and pay
export function LookingForFields(props) {
  const lookingFor = props.profile.lookingFor;

  // Changes one part of lookingFor, keeping the rest
  function change(fields) {
    props.onChange({ lookingFor: { ...lookingFor, ...fields } });
  }

  // Ticks or unticks one kind. .filter() keeps every kind except this one
  function toggleKind(kind, ticked) {
    const others = lookingFor.kinds.filter((k) => k !== kind);
    change({ kinds: ticked ? [...others, kind] : others });
  }

  return (
    <>
      {/* <fieldset> + <legend> group the checkboxes under one question, so
          screen readers say "Kinds of positions" before each one (WCAG) */}
      <fieldset className="edit-choices">
        <legend className="edit-label">Kinds of positions</legend>
        <div className="edit-choice-list">
          {positionKinds.map((kind) => (
            // The <label> wraps its checkbox, so clicking the word ticks it
            <label key={kind} className="edit-choice">
              <input
                type="checkbox"
                checked={lookingFor.kinds.includes(kind)}
                onChange={(e) => toggleKind(kind, e.target.checked)}
              />
              {kind}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="edit-row">
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-when">
            When
          </label>
          <input
            id="profile-when"
            className="edit-input"
            type="text"
            maxLength={most.when}
            placeholder="e.g. Summer 2027"
            value={lookingFor.when}
            onChange={(e) => change({ when: e.target.value })}
          />
        </div>
        <div className="edit-field">
          <label className="edit-label" htmlFor="profile-where">
            Where
          </label>
          <input
            id="profile-where"
            className="edit-input"
            type="text"
            maxLength={most.where}
            placeholder="e.g. Boston, MA or remote"
            value={lookingFor.where}
            onChange={(e) => change({ where: e.target.value })}
          />
        </div>
      </div>

      <label className="edit-choice edit-choice-alone">
        <input
          type="checkbox"
          checked={lookingFor.paidOnly}
          onChange={(e) => change({ paidOnly: e.target.checked })}
        />
        Paid positions only
      </label>
    </>
  );
}

// Skills: type one, press Enter (or Add), and it becomes a tag with an ×.
// What you're typing stays here; only the finished list goes to the page
export function SkillsField(props) {
  const skills = props.profile.skills;
  const [skill, setSkill] = useState(""); // what's being typed right now
  const isFull = skills.length >= most.skills;

  // Runs when you click Add or press Enter in the box.
  // preventDefault() stops the browser from reloading the page, which is
  // what a form normally does when you press Enter
  function handleAdd(event) {
    event.preventDefault();
    // .trim() removes spaces at the start and end, so "  React " becomes "React"
    const newSkill = skill.trim();
    if (newSkill === "" || isFull) return;
    // .some() checks if it's already there (ignoring capital letters), so
    // "react" isn't added next to "React"
    const alreadyAdded = skills.some((s) => s.toLowerCase() === newSkill.toLowerCase());
    if (!alreadyAdded) props.onChange({ skills: [...skills, newSkill] });
    setSkill(""); // empty the box for the next skill
  }

  return (
    <>
      {/* A <form> lets you press Enter to add a skill, not just click Add */}
      <form className="edit-row edit-skill-form" onSubmit={handleAdd}>
        <label className="sr-only" htmlFor="profile-skill-new">
          New skill
        </label>
        <input
          id="profile-skill-new"
          className="edit-input edit-skill-input"
          type="text"
          maxLength={most.skill}
          aria-describedby="profile-skill-hint"
          placeholder="e.g. Python"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        />
        <button type="submit" className="profile-btn-primary" disabled={isFull}>
          Add
        </button>
      </form>
      <p className="edit-hint" id="profile-skill-hint">
        {isFull
          ? "That's the most you can list (" + most.skills + "). Remove one to add another."
          : "Add one at a time. Five or more helps employers find you."}
      </p>

      {/* One tag for each skill, with an × button to take it out */}
      {skills.length > 0 && (
        <ul className="edit-skills">
          {skills.map((s) => (
            <li key={s} className="edit-skill-pill">
              {s}
              {/* aria-label says which skill the × removes (WCAG) */}
              <button
                type="button"
                className="edit-skill-remove"
                aria-label={"Remove " + s}
                onClick={() => props.onChange({ skills: skills.filter((x) => x !== s) })}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
