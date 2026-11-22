// profile-resume-sync.js keeps the parts your profile and your resume share in
// step, so you only type them once:
//
//   your profile (welcome guide, My info)         your resume (Resume builder)
//   name                                    <->   your name at the top
//   city                                    <->   your location at the top
//   school                                  <->   the first school under Education
//   skills                                  <->   the Skills lines
//   class year                               ->   that school's dates, if they're empty
//   (your account's email)                   ->   the email box, if it's empty
//
// Change one of these in either place and the other place changes too.
// Two rules keep it from surprising you:
//   - Only what you CHANGED is copied (plus, from your profile, into resume boxes
//     that are still empty). Changing your city doesn't touch your name, so a
//     name you wrote differently on your resume on purpose stays that way.
//   - Emptying a box doesn't empty the other side. Clearing your name to retype
//     it, or "Start from scratch" in the Resume builder, never wipes your profile.
//     (A skill you remove IS removed from the other side: that's always on purpose.)
//
// Who calls what:
//   copyProfileToResume   the welcome guide and My info, after saving your profile
//   copyResumeToProfile   the Resume builder, on every change you make

// Saving your profile, and reading the newest one (data/profile.js)
import { emptyProfile, latestProfile, most, saveProfile } from './profile.js';
// The empty resume to start from, and changing the saved one (resume-storage.js)
import { blankResume, updateResume } from '../resume-storage.js';
// Which account is logged in (so a change is never saved to someone else's)
import { loggedInId } from '../login-status.js';

// ---------- Skills ----------
// The profile keeps skills as a list (["Python", "SQL"]). The resume keeps
// lines with a label ({ label: "Languages", items: "Python, SQL" }).

// "Python, SQL" -> ["Python", "SQL"]
function splitItems(items) {
  return items
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill !== "");
}

// The skills in "list" that aren't in "other", ignoring capital letters
function notIn(list, other) {
  return list.filter((skill) => !other.some((o) => o.toLowerCase() === skill.toLowerCase()));
}

// Every skill on a resume, each once, in the order they appear
function resumeSkills(resume) {
  const all = [];
  for (const line of resume.skills) {
    for (const skill of splitItems(line.items)) {
      if (notIn([skill], all).length > 0) all.push(skill);
    }
  }
  return all;
}

// "2030" -> "Class of 2030", for the resume's dates box (anything else as typed)
function classYearText(classYear) {
  const year = classYear.trim();
  return /^\d{4}$/.test(year) ? "Class of " + year : year;
}

// The most letters one Skills line can hold (backend/src/resumes.ts)
const mostLineLetters = 1000;

// ---------- Profile -> resume ----------

// before: your profile as it was saved before; after: what you just saved.
// email: your account's email. Gives back a promise that's done when the
// resume is updated (in this browser right away, your account a moment later).
// Besides what you changed, it also fills in any of these boxes that are
// still EMPTY on your resume, and starts your resume if you don't have one.
// So an account whose profile was filled in before this file existed gets
// its resume filled in the next time it saves (it never overwrites a box
// that has something in it, unless you changed that part of your profile)
export function copyProfileToResume(before, after, email) {
  return updateResume((current) => {
    // No resume yet: compare with an empty profile, so everything you've
    // filled in counts as new. If there's nothing to put in it, don't make one
    // (the Resume builder then shows its example, like for a first visit)
    const from = current === null ? emptyProfile : before;
    const hasAny = ["name", "city", "school"].some((key) => after[key].trim() !== "") || after.skills.length > 0;
    if (current === null && !hasAny) return null;

    // true if you filled this in, and it's different from before
    const changed = (key) => after[key].trim() !== "" && after[key].trim() !== from[key].trim();
    // true if it should be copied into this resume box: you changed it, or
    // the box is empty and you have something to put in it
    const copies = (key, box) => changed(key) || (box.trim() === "" && after[key].trim() !== "");

    // A full copy to change (structuredClone), so the saved one never changes
    // by accident. A new resume starts empty, with no Skills lines yet
    const resume = structuredClone(current ?? { ...blankResume, skills: [] });

    if (copies("name", resume.contact.name)) resume.contact.name = after.name.trim();
    if (copies("city", resume.contact.location)) resume.contact.location = after.city.trim();
    if (resume.contact.email === "" && email) resume.contact.email = email;

    if (after.school.trim() !== "" || after.classYear.trim() !== "") {
      // No school on the resume yet: add one (only if there's a school to put in it)
      if (resume.education.length === 0 && after.school.trim() !== "") {
        resume.education.push({ ...blankResume.education[0], id: 1 });
      }
      const school = resume.education[0];
      if (school) {
        if (copies("school", school.school)) school.school = after.school.trim();
        // The class year only goes into an empty dates box, or one it filled
        // in before, so dates you typed yourself ("Sep 2026 - Present") stay
        const filledBefore = from.classYear.trim() !== "" && school.dates === classYearText(from.classYear);
        if (after.classYear.trim() !== "" && (school.dates === "" || (changed("classYear") && filledBefore))) {
          school.dates = classYearText(after.classYear);
        }
      }
    }

    // Skills you removed: out of every line
    const removed = notIn(from.skills, after.skills);
    if (removed.length > 0) {
      resume.skills = resume.skills.map((line) => ({
        ...line,
        items: notIn(splitItems(line.items), removed).join(", "),
      }));
    }
    // Skills you added, or all of them if the resume has none yet (only the
    // ones that aren't on it already): onto the line called "Skills", or a new
    // one at the end
    const onResume = resumeSkills(resume);
    const added = onResume.length === 0 ? after.skills : notIn(after.skills, from.skills);
    const toAdd = notIn(added, onResume);
    if (toAdd.length > 0) {
      let line = resume.skills.find((l) => l.label.trim().toLowerCase() === "skills");
      if (!line) {
        // The next id: one more than the biggest one there
        const id = Math.max(0, ...resume.skills.map((l) => l.id)) + 1;
        line = { id: id, label: "Skills", items: "" };
        resume.skills.push(line);
      }
      const items = splitItems(line.items);
      for (const skill of toAdd) {
        // Stop before the line gets longer than the server allows
        if ([...items, skill].join(", ").length > mostLineLetters) break;
        items.push(skill);
      }
      line.items = items.join(", ");
    }

    // Nothing different: don't save (null means "no change")
    return JSON.stringify(resume) === JSON.stringify(current) ? null : resume;
  });
}

// ---------- Resume -> profile ----------
// The Resume builder saves as you type, so this waits until you stop typing
// for 1.5 seconds and sends everything you changed in that time at once.

// The resume before the first change that hasn't reached your profile yet,
// the newest one, and whose they are
let pendingBefore = null;
let pendingAfter = null;
let pendingAccount = null;
let typingTimer = null;

// before: the resume before this change; after: the resume after it
export function copyResumeToProfile(before, after) {
  const account = loggedInId();
  if (pendingAccount !== account) pendingBefore = null;
  if (pendingBefore === null) pendingBefore = before;
  pendingAfter = after;
  pendingAccount = account;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(sendResumeChanges, 1500);
}

// The first school's name on a resume ("" if there's none)
const firstSchool = (resume) => resume.education[0]?.school.trim() ?? "";

async function sendResumeChanges() {
  const before = pendingBefore;
  const after = pendingAfter;
  // Nothing waiting, or someone else is logged in now: drop it
  if (before === null || after === null || loggedInId() !== pendingAccount) {
    pendingBefore = null;
    return;
  }

  // What changed (filled in, and different from before)
  const name = after.contact.name.trim();
  const city = after.contact.location.trim();
  const school = firstSchool(after);
  const nameChanged = name !== "" && name !== before.contact.name.trim();
  const cityChanged = city !== "" && city !== before.contact.location.trim();
  const schoolChanged = school !== "" && school !== firstSchool(before);
  const added = notIn(resumeSkills(after), resumeSkills(before));
  const removed = notIn(resumeSkills(before), resumeSkills(after));
  if (!nameChanged && !cityChanged && !schoolChanged && added.length === 0 && removed.length === 0) {
    pendingBefore = null;
    return;
  }

  // Your profile as it is now, with just those changes made.
  // .slice() cuts anything longer than the profile's boxes allow
  const profile = await latestProfile();
  if (profile === null) return; // not known (no internet): try again later
  const next = { ...profile };
  if (nameChanged) next.name = name.slice(0, most.name);
  if (cityChanged) next.city = city.slice(0, most.city);
  if (schoolChanged) next.school = school.slice(0, most.school);
  const skills = notIn(profile.skills, removed);
  for (const skill of notIn(added, skills)) {
    if (skills.length < most.skills && skill.length <= most.skill) skills.push(skill);
  }
  next.skills = skills;

  try {
    await saveProfile(next);
    // Sent. If you typed more while it was on its way, the next send starts
    // from what this one sent
    pendingBefore = pendingAfter === after ? null : after;
  } catch {
    // Couldn't save (no internet): keep it, and try again when you're back
    // online or change something else
  }
}

// Back online: send what's waiting
window.addEventListener("online", () => {
  if (pendingBefore !== null) sendResumeChanges();
});
