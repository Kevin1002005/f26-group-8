// TermsOfService.jsx is the Terms of Service (yoursite.com/terms-of-service): the rules
// for using ScoutSearch. It's a structured draft: the facts it needs (who runs the site,
// which laws apply) are in data/legal.js, and the parts marked "Needs legal review"
// must be checked by someone who knows the law before anyone relies on them.
// The layout is components/LegalPage.jsx; the styles are in index.css, "Legal pages".

// Link goes to another page of the site without reloading everything.
import { Link } from "react-router";
// The shared layout, a fact-or-placeholder, and "needs legal review" notes
import LegalPage, { Fill, Review } from "../components/LegalPage.jsx";
// The facts (who runs the site, the contact email, which laws apply, the youngest age)
import { legal } from "../data/legal.js";

const sections = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <p>
        These terms are an agreement between you and <Fill value={legal.operator} what="who runs ScoutSearch" />,
        which runs ScoutSearch. By making an account or using the site, you agree to them. Our{" "}
        <Link to="/privacy-policy">Privacy Policy</Link> explains how we handle your information.
      </p>
    ),
  },
  {
    id: "who-can-use-it",
    title: "Who can use ScoutSearch",
    body: (
      <>
        <p>You must be at least {legal.minimumAge} years old to make an account.</p>
        <Review>whether users under 18 need a parent's or guardian's permission, and how to ask for it.</Review>
      </>
    ),
  },
  {
    id: "your-account",
    title: "Your account",
    body: (
      <ul>
        <li>Give accurate information, and keep your password to yourself.</li>
        <li>One person per account. You're responsible for what happens on yours.</li>
        <li>If you think someone else got into your account, change your password and tell us.</li>
      </ul>
    ),
  },
  {
    id: "using-the-site",
    title: "Using the site",
    body: (
      <>
        <p>Please don't:</p>
        <ul>
          <li>post false or misleading information, or pretend to be someone else;</li>
          <li>share other people's private information (like a phone number or address) on the Feed;</li>
          <li>harass, threaten, or harm other people;</li>
          <li>try to get into other people's accounts or information, or around the site's security;</li>
          <li>overload, break, or copy the site in bulk (for example with automated scraping);</li>
          <li>use the site for anything illegal.</li>
        </ul>
      </>
    ),
  },
  {
    id: "job-listings",
    title: "Job listings",
    body: (
      <>
        <p>
          The jobs on ScoutSearch come from employers' public job boards and examples we made up to show how the
          site works. We don't employ you, we can't check every listing, and we can't promise a listing is
          accurate or still open. You apply on the employer's own site, under their terms.
        </p>
        <p>Be careful: a real employer will never ask you to pay to apply.</p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <p>
        Your profile, resume, notes, tracker, and Feed posts are yours. You let us store them and show them to
        you so the site can work, and you let us show your Feed posts and comments to everyone logged in to
        ScoutSearch, and nothing more. You're responsible for what you put in them, and we may remove posts that
        break these terms. You can delete your posts and comments on the Feed, and download or delete everything
        else any time on the <Link to="/settings#privacy">Settings page</Link>.
      </p>
    ),
  },
  {
    id: "our-content",
    title: "Our content",
    body: (
      <p>
        The ScoutSearch name, logo, design, and code belong to <Fill value={legal.operator} what="who runs ScoutSearch" />.
        Parts of the site use free, open-source work under their own licenses, like the resume layout (based
        on Jake's Resume, MIT License), the fonts (SIL Open Font License), and the code libraries listed
        in the <a href="/third-party-licenses.txt">open-source licenses</a>.
      </p>
    ),
  },
  {
    id: "ending-your-account",
    title: "Ending your account",
    body: (
      <>
        <p>
          You can delete your account any time on the Settings page. We may suspend or close accounts that
          break these terms.
        </p>
        <Review>when and how accounts may be suspended, and whether users get notice first.</Review>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "No guarantees",
    body: (
      <>
        <p>
          ScoutSearch is provided "as is". It may sometimes be unavailable, and it may have mistakes. Keep your own
          copy of anything important (the Resume builder downloads a PDF, and Settings downloads all your data).
        </p>
        <Review>the exact wording of this disclaimer.</Review>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limits on liability",
    body: (
      <Review>
        whether and how far liability is limited, and the exact wording. Nothing should be written here until
        that's decided.
      </Review>
    ),
  },
  {
    id: "disputes",
    title: "Disputes and which laws apply",
    body: (
      <>
        <p>
          These terms follow the laws of <Fill value={legal.governingLaw} what="which place's laws apply" />. If
          there's a problem, please contact us first so we can try to sort it out.
        </p>
        <Review>the governing law, and how disputes are resolved (and where).</Review>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        When these terms change, we'll update the version and date at the top, and tell you on the site before
        big changes take effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        Questions about these terms:{" "}
        {legal.privacyEmail
          ? <a href={"mailto:" + legal.privacyEmail}>{legal.privacyEmail}</a>
          : <Fill value={null} what="the contact email" />}
        .
      </p>
    ),
  },
];

function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using ScoutSearch: who can use it, what's expected of you, and what we can and can't promise."
      sections={sections}
    />
  );
}

export default TermsOfService;
