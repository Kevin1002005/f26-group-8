// DataPolicy.jsx is the Privacy Policy (yoursite.com/privacy-policy).
// (The file is named so that ad and cookie-banner blockers leave it alone: their lists block
// files named like "PrivacyPolicy.js" or "CookiePolicy.js", which would stop the page loading.)
// Everything it says was checked against what the site really does (2026-11-16):
// no analytics, no ads, no trackers, no cookies. The facts it's built from (who runs
// the site, the contact email, the services we use) are in data/legal.js; anything
// not decided yet shows as a highlighted [To fill in: ...].
// IMPORTANT: if the site starts collecting something new, or uses a new service,
// update this page AND data/legal.js (and bump policyVersion there).
// The layout is components/LegalPage.jsx; the styles are in index.css, "Legal pages".

// Link goes to another page of the site without reloading everything.
import { Link } from "react-router";
// The shared layout, a fact-or-placeholder, and "needs legal review" notes
import LegalPage, { Fill, Review } from "../components/LegalPage.jsx";
// The facts (who we are, contact, services)
import { legal, services } from "../data/legal.js";

// The contact email as a link, or a placeholder while it's not decided
function ContactEmail() {
  return legal.privacyEmail
    ? <a href={"mailto:" + legal.privacyEmail}>{legal.privacyEmail}</a>
    : <Fill value={null} what="the privacy contact email" />;
}

// The sections, in order. id is the "#..." that jumps to each one
const sections = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          ScoutSearch is a website where high school and college students find internships, co-ops,
          research positions, and programs, keep track of their applications, and build a resume. It's run
          by <Fill value={legal.operator} what="who runs ScoutSearch (a person, team, or organization)" />.
        </p>
        <p>Questions about this policy or your information: <ContactEmail />.</p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <h3>What you give us</h3>
        <ul>
          <li><strong>Your account:</strong> your email address and password. Supabase, our login service, stores your password only as a scrambled "hash" that can't be turned back into the password. If you use "Continue with Google", Google also gives us your name and profile picture.</li>
          <li><strong>Your profile:</strong> what you fill in on the welcome guide or on Edit profile: your name, pronouns, school, class year, city, headline, About, what kind of position you're looking for, and your skills.</li>
          <li><strong>Your Application tracker:</strong> the jobs you save, which column each one is in, your notes and details on them (a link, a short status, the date you applied), and any jobs you add from other websites.</li>
          <li><strong>Your resume:</strong> whatever you type into the Resume builder, like your name, contact details, education, experience, projects, and skills. Please don't put very sensitive information (like a Social Security number) in it: a resume never needs it.</li>
        </ul>
        <h3>What's collected automatically</h3>
        <p>
          Like every website, the companies that host ours (see "Who handles your information") receive
          each request your browser sends: your IP address, your browser and device type, the page or
          feature asked for, and the time. They keep this in short-term logs, which help keep the site
          running and safe.
        </p>
        <p>
          We don't use analytics tools, advertising, tracking pixels, or session recording, and we don't
          collect your precise location.
        </p>
        <h3>What's saved in your browser</h3>
        <p>
          The site saves a few things in your own browser so it works (like staying logged in). It sets no
          cookies. The full list is in the <Link to="/cookie-policy">Cookie Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <>
        <ul>
          <li>To run your account and the features you use: logging in, saving your profile, tracker, and resume, and showing them on any device you log in on.</li>
          <li>To send emails you ask for, like a password reset link (Supabase sends these).</li>
          <li>To keep the site secure and working, for example by finding and stopping misuse.</li>
        </ul>
        <p>
          We don't sell your personal information, rent it, or share it for advertising. We don't build
          profiles of you for ads, and the site makes no automatic decisions about you.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI",
    body: (
      <p>
        ScoutSearch doesn't use AI to process your information, and your information isn't used to train AI.
        If we ever add an AI feature (like suggestions for your resume), we'll update this policy first and
        say exactly what's sent and to whom.
      </p>
    ),
  },
  {
    id: "who-handles-it",
    title: "Who handles your information",
    body: (
      <>
        <p>These companies run parts of ScoutSearch for us, and only handle your information to do that:</p>
        <ul>
          {services.map((service) => (
            <li key={service.name}>
              <strong>{service.name}:</strong> {service.what} Servers in: <Fill value={service.region} what={service.name + "'s region"} />.
              {" "}<a href={service.link} target="_blank" rel="noopener noreferrer">{service.name}'s privacy policy (opens in a new tab)</a>
            </li>
          ))}
        </ul>
        <h3>Job listings</h3>
        <p>
          The jobs on Opportunities come from employers' public job boards (Greenhouse, Lever, and JSearch).
          Our server downloads those listings; it doesn't send them anything about you. When you press Apply,
          you go to the employer's own site, and their privacy policy applies there.
        </p>
        <p>
          Employers on ScoutSearch can't see your profile, your tracker, or your resume. We'd only share information if the
          law requires it, for example a valid court order.
        </p>
      </>
    ),
  },
  {
    id: "legal-bases",
    title: "Legal bases (EU and UK)",
    body: (
      <>
        <p>Where the EU or UK GDPR applies, we use your information because:</p>
        <ul>
          <li>it's needed to give you the account and features you signed up for (a contract), or</li>
          <li>it's in our legitimate interest to keep the site secure (the hosting logs).</li>
        </ul>
        <Review>whether the GDPR applies to ScoutSearch at all, and whether these bases are the right ones.</Review>
      </>
    ),
  },
  {
    id: "how-long",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Your account, profile, tracker, and resume: until you delete your account. Deleting it removes your profile, tracker, and resume from our database right away.</li>
        <li>Hosting logs: for as long as each hosting company keeps them (see their privacy policies above).</li>
        <li>What's saved in your browser: until you log out, delete your account, or clear this site's data (the <Link to="/cookie-policy">Cookie Policy</Link> says which is which).</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "How we keep it safe",
    body: (
      <>
        <ul>
          <li>Every connection is encrypted (HTTPS).</li>
          <li>The database is locked: only our own server can change anything in it, nobody can read another person's information, and our server only ever touches the logged-in person's own.</li>
          <li>Our secret keys stay on our server, never in the website.</li>
          <li>Supabase handles passwords and stores them only as hashes.</li>
          <li>The website uses strict security settings that stop other sites' code from running on it.</li>
        </ul>
        <p>No system is perfectly secure, but we work to protect your information and fix problems quickly.</p>
        <Review>whether a written information security program is required under Massachusetts 201 CMR 17.00 for the information we hold, and what it must contain.</Review>
      </>
    ),
  },
  {
    id: "where-its-stored",
    title: "Where it's stored",
    body: (
      <>
        <p>
          Your information is stored on the servers of the companies listed above, in the regions shown there.
          If you use ScoutSearch from another country, your information goes to those servers.
        </p>
        <Review>what's needed for transfers from the EU or UK (for example, Standard Contractual Clauses in each company's data processing terms).</Review>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <>
        <p>
          ScoutSearch is for students {legal.minimumAge} and older. It isn't meant for children under{" "}
          {legal.minimumAge}, and we don't knowingly collect their information. If you think a child under{" "}
          {legal.minimumAge} has made an account, contact us (<ContactEmail />) and we'll delete it.
        </p>
        <Review>COPPA (children under 13), and state laws with extra rules for teenagers' information, since many users are in high school.</Review>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights and privacy requests",
    body: (
      <>
        <p>You can do most of this yourself, right away, on the <Link to="/settings#privacy">Settings page (Privacy &amp; data)</Link>:</p>
        <ul>
          <li><strong>See and take your information:</strong> "Download my data" gives you a file with everything saved with your account.</li>
          <li><strong>Delete it:</strong> "Delete my account" deletes your account, profile, tracker, and resume.</li>
          <li><strong>Correct it:</strong> change your profile, resume, and tracker any time. To change your account's email, contact us.</li>
        </ul>
        <p>
          For anything else (for example, if you can't log in, you object to how we use your information, or
          you have a question), email <ContactEmail />. We'll check it's really you, usually by replying to
          your account's email address, and answer within <Fill value={legal.requestResponseTime} what="how soon requests get an answer" />.
          You won't be treated differently for using any of these rights.
        </p>
      </>
    ),
  },
  {
    id: "california",
    title: "California residents",
    body: (
      <>
        <p>
          The information we collect is described in "What we collect": identifiers (like your email),
          education and work details you put in your resume, and hosting logs. We don't sell or share personal
          information (as the California Consumer Privacy Act defines those words), and we don't use sensitive
          personal information for anything beyond running the site. You have the right to know, delete, and
          correct your information (see "Your rights"), and to not be treated differently for asking.
        </p>
        <Review>whether the CCPA applies to ScoutSearch (it covers businesses above certain size thresholds), and whether CalOPPA requires anything more.</Review>
      </>
    ),
  },
  {
    id: "global-privacy-control",
    title: "Global Privacy Control",
    body: (
      <p>
        Global Privacy Control (GPC) is a browser setting that asks websites not to sell or share your
        information. We already don't, so there's nothing for it to turn off. If that ever changes, we'll treat
        GPC as a request to opt out.
      </p>
    ),
  },
  {
    id: "eu-uk",
    title: "EU and UK residents",
    body: (
      <p>
        If the GDPR or UK GDPR applies to you, you also have the right to restrict or object to how we use your
        information, and to complain to your country's data protection authority. To use these rights, email{" "}
        <ContactEmail />.
      </p>
    ),
  },
  {
    id: "breaches",
    title: "If there's a data breach",
    body: (
      <>
        <p>
          If a security breach affects your personal information, we'll tell you and the authorities as the law
          requires (including Massachusetts General Laws chapter 93H).
        </p>
        <Review>who is responsible for sending notices, and the steps and deadlines to follow.</Review>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        Write to <Fill value={legal.operator} what="who runs ScoutSearch" /> at <ContactEmail />.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When this policy changes, we'll update the version and date at the top. For big changes, we'll also tell
        you on the site before they take effect.
      </p>
    ),
  },
];

function DataPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What ScoutSearch collects, why, who handles it, and how you can see, take, or delete it. Short version: we only keep what the site needs to work for you, and we don't sell it or use it for ads."
      sections={sections}
    />
  );
}

export default DataPolicy;
