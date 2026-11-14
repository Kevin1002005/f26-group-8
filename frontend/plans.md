Phase two build plan (written 2026-10-26, status updated 2026-11-14)
    What to build next and how, task by task, using the way this project already works.
    2026-11-14: F2 and F4 were built under different names (Discovery at /discovery and
    ApplicationTracker at /applications), so their tasks below now say what's left instead.
    Work done outside the plan is listed in "Done outside this plan", above "Order".
    The "why" behind it (stakeholders, the login decision, ScoutCoach) is in the
    Phase Two Plan doc: https://claude.ai/artifact/3eCnALnwEjLgmRKqhZcrbe
    Roles and permissions: https://claude.ai/artifact/NtQNQjcXfnghXhAC1optbw
    Backend tasks already planned (J1, S4, S5, S6) live in backend/plans.md. This file
    does not repeat them; it says which frontend tasks wait on them.

    Like backend/plans.md: each task lists the files it touches, so different people
    (or Claude sessions) can work on different tasks at the same time without editing
    the same file. Don't edit files outside your task. index.css is the exception:
    everyone adds to it, but each task only adds its own page's section.


How to work a task (for teammates and for Claude)
    Before starting
        - Read .claude/skills/scoutsearch-frontend/SKILL.md (the house rules) and the task below.
        - Check the task's "needs". If a needed task isn't done, build with sample data and
          leave a "LATER:" comment where the real call goes (Login.jsx's handleReset is the model).
        - Check the owner. Pages belong to people (Kevin: About, Login, Signup, Network, Messages;
          Roemer: Feed, Profile, EditProfile, Discovery, ApplicationTracker, NavBar styles).
          Shared files (App.jsx, NavBar.jsx, AccountMenu.jsx, src/data/*.js, vite.config.js,
          package.json) get a one-line change and a note in the PR. src/data/ is shared because
          Feed, Discovery, and the tracker all read opportunities.js.
        - Ask the teammate: "Do you want to type it, or should I build it and walk you through it?"
        - New page: run the frontend-design skill (short plan + ASCII sketch, confirm, then build).
          Changing an existing page: impeccable. Motion details: emil-design-eng. The SKILL.md
          rules win over all three.
    Building
        1. CSS first: a new "/* ---------- Page name ---------- */" section in index.css with
           page-prefixed, plain-English class names (apply-job-card, not card). Comment every
           rule and property. Colors only from :root variables. Write the measured contrast ratio
           next to every text color (measure it; don't guess).
        2. Then the JSX, in the page layout from SKILL.md: comment, imports, sample data, pieces,
           whole page, export. New files use 4-space indents and single quotes (like Login,
           Network, Messages). Comment every block in plain words; mark accessibility with (WCAG).
        3. Route in App.jsx with the usual comment. Lowercase paths. Give the page a <title>.
        4. Motion goes inside @media (prefers-reduced-motion: no-preference), and :active presses
           also check :root:not([data-reduce-motion="on"]) (the Settings page's own switch).
        5. No new npm packages without the team agreeing. Everything below is planned to need none.
    Before calling it done
        - cd frontend && npm run lint   -> 0 problems
        - npm run build                 -> "built in ..."
        - npm run check (after F0a)     -> every page loads, no console errors, no sideways scroll
        - Tab through the new page: every stop has an outline, in a sensible order
        - 375px wide: nothing spills off the side
        - The WCAG checklist in SKILL.md
        - Don't commit unless asked. Give a commit message. Run the code-reviewer agent before a PR.


Decisions needed (from the Phase Two Plan doc; tasks that wait on one say so)
    [ ] D1. Email and password boxes: A remove, B Supabase email login (proposed), C keep custom login
    [ ] D2. The permissions table (Access Roles doc + the new rows in the Phase Two doc)
    [ ] D3. Does ScoutCoach's AI fit the $0 budget? (blocks F16 and B10 only)
    [ ] D4. Owners for the new pages (F1-F6). Roemer took F2 and F4; F1, F5, F6 still need one
    [ ] D5. Jake's template: confirm the MIT license in jakegut/resume, keep its copyright notice
    [ ] D6. Top bar: which new pages get a top-bar link vs. a link in the account menu (see F7).
            Half done: Opportunities (/discovery) is in the top bar. The account menu part is open
    [ ] D7. Can guests browse Discovery? PRODUCT.md says guests browse jobs and sign up to apply,
            but /discovery is behind the login guard right now (RequireLogin in App.jsx).
            If yes: move its <Route> out of the RequireLogin group, and give Discovery a guest
            top bar (it uses NavBar, which shows the logged-in circle). Then F7's About link too
    [ ] D8. Tracker columns: the built tracker has 3 (saved, preparing, submitted); the contract's
            Application.status has 5 (saved, applied, interviewing, offer, not-selected).
            Pick one and change the other before B7 builds the applications table


Shared contract (frontend <-> backend), proposed. Change it here first, then in code.
    All routes are under /api (the Vite proxy sends /api to port 3000). Every protected route
    needs  Authorization: Bearer <supabase access_token>. Errors are always { error: "..." }.

    GET    /api/auth/me                      -> { id, email, username, display_name, avatar_url, role }
    GET    /api/jobs?type=&level=&setting=&paid=   (anyone)  -> { jobs: [Job] }
    GET    /api/jobs/:id                     (anyone)            -> { job: Job }
    POST   /api/jobs                         (employer)          -> 201 { job }
    PATCH  /api/jobs/:id                     (owner, staff)      -> { job }
    POST   /api/jobs/:id/close               (owner, staff)      -> { job }
    DELETE /api/jobs/:id                     (admin)             -> 204
    GET    /api/applications                 (student, own)      -> { applications: [Application] }
    POST   /api/applications                 (student)           -> 201 { application }
    PATCH  /api/applications/:id             (student, own)      -> { application }
    DELETE /api/applications/:id             (student, own)      -> 204
    GET    /api/jobs/:id/applications        (owner, staff)      -> { applications: [...] }
    GET    /api/events                       (anyone)            -> { events: [Event] }
    POST   /api/events                       (staff, employer)   -> 201 { event }
    GET    /api/resumes/me   PUT /api/resumes/me   (student)    -> { resume: Resume }
    POST   /api/scoutcoach/suggest           (student, after D3) -> { suggestions: [...] }

    Already called by Messages.jsx (added 2026-11-14; no backend task owns these yet, see B13):
    GET    /api/conversations                (logged in)         -> [Conversation]
    POST   /api/messages                     (logged in)         body { receiverId, text } -> Message
    POST   /api/conversations/:id/read       (logged in)         -> anything (marks it read)
    Until these exist, the Messages page shows "Something went wrong" and retries every 5s.

    Job          { id, title, organization, type: 'internship' | 'co-op' | 'research' | 'program',
                   level: 'high-school' | 'college' | 'both', location, setting: 'remote' | 'hybrid' | 'on-site',
                   paid: boolean, pay_text, deadline (YYYY-MM-DD), description, requirements,
                   apply_url (optional), posted_by, is_posted, created_at }
    Application  { id, student_id, job_id (null for a job found on another site), title, organization,
                   status: 'saved' | 'applied' | 'interviewing' | 'offer' | 'not-selected',
                   deadline, notes, updated_at }
    Event        { id, title, host, starts_at, ends_at, location, online_url, description, created_by }
    Resume       { student_id, data: { contact, education[], experience[], projects[], skills[] }, updated_at }
    Conversation { id (the other person's profile id), name, initials, headline, unread: boolean,
                   messages: [Message] (oldest first) }
    Message      { id, from: 'me' | 'them', text, created_at }
    (Messages.jsx's top comment has the same shapes; change both together.)

    The plan was for sample data to use these exact shapes, so switching a page to the backend
    would only change where the list comes from. What was built is different (2026-11-14):
    - src/data/opportunities.js (5 jobs) uses its own shape: type is "Co-op" / "Internship" /
      "Part-time" (capitalized, and no research or program jobs); "place" instead of location and
      setting; "pay" as text; no level (no high school jobs yet) or paid; extra fields match,
      initials, tags, hours, length, about.
    - src/data/tracker.js saves [{ id, stage }] in localStorage ("scoutsearch-applications"),
      with stage 'saved' | 'preparing' | 'submitted' (see D8).
    Before F10, either the backend sends Discovery's field names, or one small function turns a
    Job into Discovery's shape. Decide it here, in this section, first.


Frontend tasks
    [ ] not started   [~] built, with what's left listed under it   [x] done

    Foundation (do these first; small)

    [ ] F0a - Browser check script in the repo        files: frontend/scripts/check-pages.mjs (new),
                                                              frontend/package.json ("check" script only)
        The headless-Chrome checks used so far live outside the repo. Put one in it.
        - Plain Node (built-in WebSocket and fetch) driving the installed Chrome over the
          DevTools protocol. No new npm package.
        - Starts nothing itself: expects "npm run dev" running; takes the port as an argument.
        - For every route in App.jsx, at 1280px and 375px: console errors and warnings, failed
          requests, sideways scrolling, <h1> count, <title>, inputs without labels.
        - Prints one line per page; exits 1 if anything failed.
        - package.json: add  "check": "node scripts/check-pages.mjs"  (shared file: say so in the PR).
        Done when: npm run check passes on main and fails if you add an unlabeled input.

    [ ] F0b - Update the frontend skill's docs        files: .claude/skills/scoutsearch-frontend/*.md
        They're out of date, so Claude sessions get wrong advice.
        - connect-backend.md: proxy is /api (not /auth); login is moving to Supabase; tokens
          come from supabase.auth.getSession(); point at api.js (F0c) and the contract above.
        - SKILL.md: Network and Messages are built; Login has the Forgot password screens;
          Microsoft is gone; lint has 0 known errors; the top bar has a phone layout; add the
          new pages to the Pages table as they land; mention npm run check.
          Also (2026-11-14): Discovery and ApplicationTracker pages and src/data/; light/dark
          themes (theme.js, ThemeProvider, ThemeToggle, tokens under :root[data-theme]);
          pages lazy-load in App.jsx; RequireLogin guards the logged-in pages.
        - roadmap.md: link this file.

    [~] F0c - Shared helpers                          files: frontend/src/api.js (new),
                                                              frontend/src/sample-data/*.js (new),
                                                              frontend/src/login-status.js
        Done: api.js exists, but it's named api(path, options), and it adds the /api itself:
        api('/conversations') calls /api/conversations. Messages uses it. Use api(), not apiFetch.
        Done another way: shared sample data lives in src/data/ (opportunities.js, tracker.js),
        not sample-data/, and not in the contract's shapes (see the end of the Shared contract).
        Left: getRole()/placeholderRole in login-status.js; sample applications and events.
        Original task:
        - sample-data/jobs.js, applications.js, events.js: labeled made-up examples in the
          contract's shapes (8-10 jobs covering every type, level, and setting, including
          high school ones). Several pages share them, which is why they leave the page files.
        - api.js: one apiFetch(path, options) that adds the Supabase token header, parses JSON,
          and throws an Error with the backend's { error } message. Same idea as supabase.js:
          one shared helper, imported everywhere, never copied into pages.
        - login-status.js: add the role placeholder in one obvious place, as roadmap.md says:
            export const placeholderRole = 'student'; // change to test other views
          plus getRole() that returns it for now. F8 replaces it with the real role.

    Pages with sample data (no backend needed; can run in parallel once F0c is done)

    [ ] F1 - Resume and co-op help guide              files: frontend/src/pages/Guide.jsx (new),
                                                              index.css ("Guide page"), App.jsx (route)
        Route /guide. Read mode: calm, long-form, easy to skim.
        - Sections: what a resume needs; co-op vs. internship vs. research position; when to
          start looking; for high schoolers; links to the tracker and ScoutCoach.
        - Real content written by the team (no lorem ipsum, no invented statistics).
        - On-page contents list with <a href="#..."> jumps (the About page's pattern).
        - Uses the About/Login look (about-site wrapper) if guests read it, or NavBar if only
          logged-in people do. Guests can read it, so: about-site + the about-bar top bar.

    [~] F2 - Opportunity discovery                     files: frontend/src/pages/Discovery.jsx,
                                                              index.css ("Discovery page"), data/opportunities.js
        Built by Roemer as Discovery, route /discovery (not /opportunities). Has: a search box;
        tabs All / Internship / Co-op / Part-time / Full-time; Sort by best match or deadline;
        the result count in a role="status" line; "No opportunities match" + Show all; a pop-up
        for each job, and ?job=<id> in the address opens it (so a job can be shared).
        Left:
        - Filters for level (high school / college), setting, and paid. They need level and
          setting in opportunities.js first (it has neither yet).
        - Filters and the tab in the address (only the open job is, today), so Back works.
        - An "Examples" tag on the title until F10 (the page doesn't say the jobs are made up).
        - More sample jobs: 5 today, none for high schoolers, no research positions.
        Original task (kept for the details):
        Route /opportunities. Operate mode.
        - Search box + filters: type, level (high school / college), setting, paid. Filters are
          real <fieldset> groups with labels; the result count is in a role="status" line
          ("6 opportunities") so screen readers hear it change.
        - Cards: type chip, title, organization, location/setting, pay, deadline, and a
          <Link to={"/opportunities/" + job.id}>. Reuse the About page's listing-card look
          (DESIGN.md "Example Listing Card") with opportunities- classes.
        - Empty result: "No opportunities match these filters" + a Clear filters button.
        - "Examples" tag on the title until F10.
        - Filters live in the address (?type=co-op) with useSearchParams, so Back works and a
          filtered list can be shared (the same idea as Login's #forgot-password).

    [~] F3 - Opportunity details                       files: frontend/src/pages/OpportunityDetails.jsx (new),
                                                              index.css ("Opportunity details page"), App.jsx
        needs: F2 (same sample data)
        Mostly covered by Discovery's pop-up (2026-11-14): full description, facts, Apply by,
        Save (adds it to the tracker), and Apply ("Applying isn't built yet."). ?job=<id> already
        gives each job its own link, and an unknown id just shows the list. So a separate page
        is probably not needed. Team decision; if skipped, move what's left into Discovery.jsx:
        - The main button by role, after F0c's getRole(): guest "Sign up to apply" (Link to
          /signup), student Apply + Save, employer Edit + Close listing, staff Close listing.
        Original task:
        Route /opportunities/:id (useParams). Unknown id -> a "This opportunity isn't
        available" message with a link back, not a blank page.
        - Full description, requirements, who can apply, deadline, how to apply.
        - The main button depends on getRole() (F0c):
            guest: "Sign up to apply" (Link to /signup)   student: Apply + Save
            employer who posted it: Edit + Close listing   staff: Close listing
          Apply and Save only change the screen for now (on/off pattern, aria-pressed).
        - Back link to the filtered list (navigate(-1) when the visitor came from it).

    [~] F4 - Application tracker                       files: frontend/src/pages/ApplicationTracker.jsx,
                                                              frontend/src/data/tracker.js,
                                                              index.css ("Application tracker page")
        Built by Roemer as ApplicationTracker, route /applications, saved by data/tracker.js
        (not tracker-storage.js) in localStorage. Has: 3 columns, Saved / Preparing / Submitted;
        drag and drop, plus a "Move to" <select> on each card for keyboards and phones; an empty
        message per column; Save in Discovery adds a job to Saved.
        Left:
        - D8: 3 columns vs. the contract's 5 statuses.
        - "Add an application" form for jobs found on other sites (title, organization, status,
          deadline, notes). Today only Discovery's jobs can be on it.
        - Notes on a card, and Remove with an "Undo" message.
        - A "Due soon" chip for deadlines in the next 7 days (text, not color alone).
        - Students-only message: waits on F0c's getRole().
        Original task:
        Route /applications. Students only (others see a short "for students" message).
        - Columns or grouped lists by status: Saved, Applied, Interviewing, Offer, Not selected.
          Change status with a real <select> (not drag and drop, which keyboards can't do).
        - "Add an application" form for jobs found anywhere: title, organization, status,
          deadline, notes. Edit and delete (with an "Undo" status message instead of confirm(),
          the same idea as Network's notes).
        - Deadlines in the next 7 days get a "Due soon" chip (text, not color alone).
        - tracker-storage.js saves the list in localStorage (copy settings.js: try/catch,
          a storage key, load/save functions) until F12 switches it to the backend.
        - Empty state: what the tracker is for and a button to add the first one.

    [ ] F5 - Events and calendar                       files: frontend/src/pages/Events.jsx (new),
                                                              frontend/src/calendar-file.js (new),
                                                              index.css ("Events page"), App.jsx
        Route /events. Everyone can view.
        - List view (default) and month view, switched with a two-button toggle (aria-pressed).
          The month view is a CSS grid table with real dates; days with events list their
          titles (no dot-only days: the title is the information).
        - "Add to calendar" makes a standard .ics file in the browser (calendar-file.js builds
          the text, a Blob + <a download> saves it). Works in Google, Outlook, and Apple
          calendars with no account or API. Unit-test the text builder by hand on one sample
          event (start/end in UTC, escaped commas).
        - Past events are hidden by default with a "Show past events" toggle.

    [ ] F6 - ScoutCoach 1: resume builder              files: frontend/src/pages/ScoutCoach.jsx (new),
                                                              frontend/src/resume-storage.js (new),
                                                              index.css ("ScoutCoach page"), App.jsx
        needs: D5. Route /scoutcoach. Students only.
        - Two columns: the form (left) and a live preview (right). Phones: tabs "Edit" / "Preview".
        - Form sections match Resume.data: contact, education, experience, projects, skills.
          Repeating sections (experience, projects) have Add / Remove / Move up / Move down
          buttons, each naming the item ("Remove Research Assistant").
        - Preview recreates Jake's template in HTML/CSS: name centered, small-caps section
          headings with a rule under them, two-column rows (title + dates, place + location),
          bullet points. A credit line in the page footer, per D5.
        - "Download PDF": window.print() with an @media print block in the ScoutCoach section
          that hides everything but the preview and sets the page to Letter with 0.5in margins.
          No PDF library.
        - Autosaves to localStorage (resume-storage.js, settings.js pattern) until F15.
        - A small "Resume help" link to /guide.
        - No AI in this task. Leave a clear spot in the layout for F16's suggestions panel.

    Navigation and roles

    [~] F7 - Links to the new pages                    files: frontend/src/components/NavBar.jsx,
                                                              frontend/src/components/AccountMenu.jsx,
                                                              index.css (Feed: top bar, account menu)
        needs: D6, and a heads-up to Roemer (NavBar styles are in the Feed section).
        Done: the top bar has Opportunities (-> /discovery; phones show "Jobs"). The account
        menu's "Profile picture" (a dead end) is now "Edit profile" (2026-11-14).
        Left: "My applications" in the account menu (today only Discovery links to the tracker);
        the About page's guest link, after D7.
        Proposed: top bar = Home, Opportunities, Network, Messages (+ your circle). Account menu
        gains My applications, ScoutCoach, Events, Resume help. Re-check the 375px two-row top
        bar after adding a link: it must still fit on one row under the name.
        The About page's top bar (guests) gets an Opportunities link too.

    [ ] F8 - Real roles on the website                 files: frontend/src/login-status.js,
                                                              frontend/src/use-current-user.js (new)
        needs: backend S4 (with role) and B3, and J1.
        - use-current-user.js: a small hook that calls api('/auth/me') once and shares
          the answer ({ user, role, loading }). Guests (no Supabase session) get role 'guest'
          without calling the backend.
        - getRole() / placeholderRole from F0c go away; pages read the hook instead.
        - Hiding a button is never the protection; the backend checks too (see Access Roles doc).
        - components/RequireLogin.jsx (the login guard) checks isLoggedIn(). When isLoggedIn()
          starts checking the real Supabase session instead of the "yes" flag, the guard keeps
          working with no change. If it has to wait for the session, it needs a loading state
          so it doesn't send logged-in people to /login for a split second.

    [ ] F9 - Email login through Supabase              files: frontend/src/pages/Login.jsx,
                                                              frontend/src/pages/Signup.jsx
        needs: D1 = B, and B5.
        - Log in form: supabase.auth.signInWithPassword({ email, password }).
        - Sign up: supabase.auth.signUp({ email, password, options: { data: { display_name } } })
          and a "Check your email to confirm" screen (reuse the Forgot password screen's look).
        - Forgot password: replace the pretend wait in handleReset with
          supabase.auth.resetPasswordForEmail (the LATER comment already shows it), and add the
          /reset-password page where the email link lands (two password boxes + Save, like
          Sign up step 2) calling supabase.auth.updateUser({ password }).
        - Errors stay on the page in the role="status" message; never say whether an email has
          an account.

    Connecting to the backend (each waits on its backend task)

    [ ] F10 - Opportunities use /api/jobs              files: Discovery.jsx, data/opportunities.js
        needs: B6, and the shape decision at the end of the Shared contract. Swap
        data/opportunities.js for api('/jobs'). Feed also reads opportunities.js (its top 2
        jobs), so tell Roemer. Add loading ("Loading opportunities...") and error states
        (message + Try again). Remove the Examples tag.

    [ ] F11 - Post a job page (employers)             files: frontend/src/pages/PostJob.jsx (new),
                                                              index.css ("Post a job page"), App.jsx
        needs: B6, F8. Route /post-job, also used for editing (/post-job/:id). Every Job field,
        labels on everything, inline errors next to the field, a preview of the card before
        posting. Non-employers see why they can't post.

    [ ] F12 - Tracker and Apply use the backend       files: ApplicationTracker.jsx, data/tracker.js,
                                                              Discovery.jsx
        needs: B7, F8, D8. Tracker reads/writes /api/applications. On first load, offer to move
        anything saved in localStorage into the account, then clear it. Apply on details
        creates an application with job_id and status 'applied'.

    [ ] F13 - Applicants view (employers)             files: frontend/src/pages/Applicants.jsx (new),
                                                              index.css ("Applicants page"), App.jsx
        needs: B7, F8. Route /opportunities/:id/applicants. The job owner and staff only.

    [ ] F14 - Events use the backend                  files: Events.jsx
        needs: B9, F8. Read /api/events; a "Create event" form for staff and employers.

    [ ] F15 - ScoutCoach saves to the account         files: ScoutCoach.jsx, resume-storage.js
        needs: B8, F8. Same move-from-localStorage offer as F12.

    [ ] F16 - ScoutCoach 2: suggestions               files: ScoutCoach.jsx, index.css (ScoutCoach)
        needs: D3, B10.
        - A Suggestions panel per section: "Suggest better wording" sends only that section's
          text (never contact details) to /api/scoutcoach/suggest.
        - Each suggestion shows the before and after; nothing changes until the student clicks
          Use this. Never adds experience the student didn't write.
        - Before first use, a short note says what gets sent and to whom.


Backend tasks this plan needs (proposed; Anthony and Jayden move the ones they agree to
into backend/plans.md, which stays their file)
    B1 = J1  middleware uses Supabase tokens (Jayden)                      blocks everything role-based
    B2 = S4  GET /api/auth/me, and add role to its answer (Anthony)        blocks F8
    B3       role column + my_role() helper (Access Roles doc, SQL sketch) (Anthony)
    B4       requireRole(...roles) middleware for routes (Jayden)
    B5       if D1 = B: S5 becomes "move password login to Supabase": delete /signup, /login,
             bcrypt, jsonwebtoken; turn on Supabase email login; set the reset-password
             redirect URL to http://localhost:5173/reset-password (Anthony)
    B6       jobs table + RLS + the /api/jobs routes                        blocks F10, F11
    B7       applications table + RLS + routes                              blocks F12, F13
    B8       resumes table + RLS + routes                                   blocks F15
    B9       events table + RLS + routes                                    blocks F14
    B10      /api/scoutcoach/suggest, after D3: key in secrets.env only, send only the section
             text, rate-limit per student                                   blocks F16
    B11      npm audit fix in backend/ (body-parser, high), best done with S5
    B12      before launch: a free email sender for Supabase (its built-in one is for testing)
    B13      conversations + messages tables + RLS + the 3 Messages routes in the Shared
             contract (Messages.jsx already calls them)                    unblocks Messages
    Note: the backend still mounts its routes at /auth (app.ts), but the Vite proxy only sends
    /api to port 3000. Until S4 moves them under /api, every api() call from the site gets a 404.


Done outside this plan (2026-11-14)
    - Light / Dark / System themes (Kevin): theme.js, components/ThemeProvider.jsx,
      components/ThemeToggle.jsx (the sun/moon button in every top bar), a "Light or dark"
      choice in Settings, color tokens under :root[data-theme="light" | "dark"] in index.css,
      and a script in index.html so the page never flashes the wrong theme. New colors go in
      BOTH token blocks. Settings' "Color theme" is now data-palette (Blue / Mint / Lavender).
    - Pages load only when opened (Kevin): App.jsx uses lazy() + Suspense for every page except
      About. New pages: add them as  const Page = lazy(() => import("./pages/Page.jsx"));
    - Login guard (Kevin): components/RequireLogin.jsx. In App.jsx, every page except About,
      Log in, and Sign up sits inside <Route element={<RequireLogin />}>, which sends
      logged-out visitors to /login. New logged-in pages go inside that group. It only hides
      pages; the backend's token check is the real protection (J1). See D7 for Discovery.
    - Unknown addresses (/feeed) go to About, through a path="*" route at the end of App.jsx.
    - Settings -> Account: its "Coming soon" text is replaced by an Edit profile button, and
      a note that email and password changes need the backend.
    - Fewer dead ends: the top bar's search box (it didn't search, and Discovery has a real
      one) and Settings' Preferences tab + its account-menu link ("Coming soon"; Profile's
      "What I'm looking for" card does that job) were removed. The account menu is now
      View profile, Edit profile, Settings, Log out. A top-bar search, if wanted later,
      should send you to Discovery's search rather than be a second box.


Order
    Done:    F2 and F4 (built as Discovery and ApplicationTracker; follow-ups listed in each)
    Now:     F0a, F0b, rest of F0c  ->  F1, F5, F6 in parallel; F2/F4 follow-ups
             | decide D7, D8 (and whether F3 is needed)   |  backend: J1, S4, D1, then B13
    Next:    F7 (after D6), F8 (after J1 + S4 + B3), F9 (after D1 + B5)
    Then:    F10 + F11 (B6)  ->  F12 + F13 (B7)  ->  F14 (B9), F15 (B8)  ->  F16 (D3 + B10)
    Advice for the mentor demo: Discovery + tracker already work with sample data. Next,
    finish the F2/F4 follow-ups (high school jobs, the Examples tag, add-your-own on the
    tracker) and F6, before starting F5.
