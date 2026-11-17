// legal.js holds the facts the Privacy Policy, Cookie Policy, and Terms of Service are
// built from (pages/DataPolicy.jsx, StoragePolicy.jsx, TermsOfService.jsx), in one place,
// so changing a fact here changes it on every page.
//
// Everything here was checked against the code on 2026-11-16. If the site starts using a
// new service or saves something new in the browser, add it here (and bump policyVersion).
//
// null means "not decided yet": the pages show it as a highlighted [To fill in: ...]
// placeholder. Fill these in, and have the pages checked by someone who knows the law,
// before relying on them.

export const legal = {
  // Bump this (to today's date) whenever a policy really changes
  policyVersion: "2026-11-16",
  // The day the policies take effect, like "November 20, 2026"
  effectiveDate: "November 16, 2026",
  // Who runs ScoutSearch and is responsible for the data: a person, a student team, or an
  // organization (for example, whether it's Oasis @ Northeastern or the team members)
  operator: "the ScoutSearch team, a student team formed in Oasis at Northeastern University",
  // Where to send privacy questions and requests (an inbox someone actually reads)
  privacyEmail: "liu.kevin1205@gmail.com",
  // Which place's laws the Terms follow, like "the Commonwealth of Massachusetts"
  governingLaw: "the Commonwealth of Massachusetts",
  // How soon privacy requests get an answer, like "30 days" (some laws set a deadline)
  requestResponseTime: "30 days",
  // The youngest age allowed to make an account (COPPA covers children under 13)
  minimumAge: 13,
};

// The outside services that handle people's data, and what each one gets.
// "region" is where their servers keep the data: check each dashboard
export const services = [
  {
    name: "Supabase",
    what: "Accounts and logins (email, a scrambled \"hash\" of your password, and your name and picture if you use Google), and the database with your Application tracker, resume, profile, and Feed posts.",
    region: "the United States (US East, North Virginia)", // Supabase -> Project Settings -> General -> Region
    link: "https://supabase.com/privacy",
  },
  {
    name: "Vercel",
    what: "Hosts the website. Like every web host, it receives each page request (your IP address, browser, and the page) and keeps short-term logs.",
    region: "the United States, with pages delivered from Vercel's servers around the world",
    link: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Render",
    what: "Hosts our backend (the server the website talks to). It receives each request the site makes for you (your IP address and browser) and keeps short-term logs.",
    region: "the United States (US West, Oregon)", // Render -> the service -> Settings -> Region
    link: "https://render.com/privacy",
  },
  {
    name: "Google",
    what: "Only if you choose \"Continue with Google\": Google confirms who you are and tells Supabase your name, email, and profile picture.",
    region: "Google's servers worldwide",
    link: "https://policies.google.com/privacy",
  },
];

// Everything the site saves in your browser, described by what it does (the public Cookie
// Policy doesn't list the internal names: it doesn't need them). ScoutSearch sets NO cookies:
// these are kept in the browser's storage, which only this site can read, and which is never
// sent anywhere by itself. Each is needed for something you asked the site to do.
// For the team, the real items behind each row (checked 2026-11-16):
//   login            Supabase's session and its one-time login code; scoutsearch-logged-in
//   profile, tracker, resume  scoutsearch-profile:<id>, scoutsearch-applications(-outbox, -server-ids):<id>,
//                    scoutsearch-resume(-unsent, -base):<id>
//   settings         scoutsearch-settings, scoutsearch-theme, scoutsearch-hidden-companies:<id>
//   logo             logo-intro-played (sessionStorage)
// If the site starts saving something new, add it to a row here (or a new row).
//   category   "Strictly necessary" (logging in) or "Functional" (a feature you use)
export const browserStorage = [
  {
    name: "Your login",
    category: "Strictly necessary",
    purpose: "Keeps you logged in, and remembers which account that is. Supabase, our login service, manages it.",
    lasts: "Until you log out.",
  },
  {
    name: "A one-time login code",
    category: "Strictly necessary",
    purpose: "Makes logging in with Google or with an email link safe.",
    lasts: "Until that login finishes.",
  },
  {
    name: "Copies of your profile, tracker, and resume",
    category: "Functional",
    purpose: "So they open right away and keep working offline, plus any changes not sent to your account yet. Kept separately for each account, so on a shared computer the next person can't see yours.",
    lasts: "Until you log out, delete your account, or clear this site's data. Your account keeps them, so they come back when you log in again. (Changes made offline that haven't reached your account yet stay until they're sent, the next time you log in here.)",
  },
  {
    name: "Your settings",
    category: "Functional",
    purpose: "Your choices on the Settings page (colors, light or dark, text size, accessibility, profile privacy), and the companies you hide on Opportunities.",
    lasts: "Until you change them or clear this site's data.",
  },
  {
    name: "The logo animation",
    category: "Functional",
    purpose: "Plays the logo animation only once per visit.",
    lasts: "Until you close the tab.",
  },
];
