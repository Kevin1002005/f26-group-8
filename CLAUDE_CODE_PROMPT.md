# Claude Code Prompt: Build ComplyAI in This Repository

Act as a senior full-stack engineer, product designer, and security-minded SaaS architect. Build a working MVP for **ComplyAI**, a privacy and legal compliance tracking product for startup founders, developers, and small businesses.

This is an intentional product pivot from the repository's current ScoutSearch app. Adapt the existing project and its conventions; do not start a separate project or replace the current stack.

## Start by inspecting the repository

Before changing files:

1. Read `AGENTS.md`, `CLAUDE.md`, `README.md`, `PRODUCT.md`, `frontend/plans.md`, and `backend/plans.md` if present.
2. Inspect both npm projects, their routes, shared components, Supabase setup, auth flow, database SQL, and existing tests/scripts.
3. Report a short implementation plan and identify dependencies or conflicts with the existing team-owned authentication/database work.
4. Treat the current code as the source of truth. Do not assume auth or persistence works because a UI suggests it does. In particular, verify whether the current `login-status.js` is real auth or only a localStorage placeholder, and verify that frontend Supabase tokens match the backend's token-verification method before protecting routes or APIs.

Do not read, print, copy, or commit `backend/secrets.env` or any other secret. Never put a Supabase service-role key, AI key, or other private credential in frontend code or a `VITE_` variable.

## Existing project constraints

- Frontend: React 19 + Vite + Tailwind 4, `react-router`, and CSS in `frontend/src/index.css`.
- Backend: Express 5 + TypeScript using `tsx`; Supabase/Postgres is the database.
- Keep the existing stack. Do not migrate to Next.js, install a second UI framework, or replace the router.
- Match the repo's plain-language comments that explain why code exists. Keep backend relative imports using `.js` extensions.
- Follow `AGENTS.md`: stay within this task; respect team ownership of auth/JWT/database contracts; use the shared backend client; check Supabase `{ data, error }` results and return generic client errors.
- Do not commit, push, deploy, or change hosted Supabase settings. Do not delete existing features or data without a documented migration plan.
- Prefer small, understandable components and established project patterns. Validate forms on both client and server.

## Product and safety requirements

Build a polished, responsive ComplyAI MVP with a calm, professional interface. Use the existing theme system and tokens if they are present. Keep Light/Dark/System appearance working. Do not introduce hardcoded colors when a token exists.

This product organizes work and provides educational guidance; it does **not** certify compliance or provide legal advice. Clearly label legal documents and AI-generated suggestions as drafts that require qualified professional review. Never tell a customer that completing all checklist items guarantees compliance.

## MVP features

### 1. Authenticated workspace and dashboard

- Public routes: landing/About, sign up, and log in.
- Private routes: dashboard, checklist, website audits, reports, and workspace settings.
- Use the repository's real authentication provider and verified backend token contract. Do not use a localStorage flag as proof of identity. If auth contracts conflict, document the issue and coordinate/update the shared contract instead of creating a parallel insecure auth flow.
- Protect private frontend routes for user experience, and independently protect every private backend API. Derive the user/workspace identity from the verified server-side session/token, never from a client-supplied user ID.
- Each user must only read or change their own workspace data. Enforce this in backend queries and Supabase RLS/policies as appropriate.
- Dashboard: overall progress, completed and incomplete counts, critical/high-priority open items, category progress, and a clear score explanation. Make the score descriptive, not a legal certification.

### 2. Compliance checklist

Seed and display these requirements, grouped by category:

**Privacy and data protection:** Privacy Policy; user data export; user data deletion; disclose whether user data trains AI models; obtain suitable consent before AI training; do not activate tracking before required consent.

**Terms of Service:** Terms of Service; limitation of liability; explicit user agreement; acceptable-use explanation.

**Cookie compliance:** functional consent banner; reject nonessential cookies; customize preferences; store and respect consent choices.

**Business and enterprise:** DPA; public subprocessor list; third-party data-sharing explanation; data-processing and security disclosures.

Each requirement needs a completion state, plain-language explanation, recommended steps, priority (Low/Medium/High/Critical), and useful resource links. Clearly distinguish a technical implementation task from a legal-review task. Let users update status and notes, assign a teammate where the existing user model supports it, and record completion dates. Avoid allowing untrusted HTML in notes.

### 3. Website audit

- Let users submit a public website URL and show audit status, findings, evidence, severity, and recommended next steps.
- Check only public pages for policy/terms links, cookie-consent UI, publicly described export/deletion, and subprocessor disclosures. A public scan cannot prove server-side deletion/export, actual consent enforcement, or backend security. State that limitation next to results.
- Build the fetch/crawl in the backend, with strict defensive controls: allow only `http` and `https`; block localhost, private, link-local, multicast, and reserved IP ranges for IPv4 and IPv6; resolve DNS and validate every resolved address; revalidate every redirect; cap redirects, response bytes, pages, and time; reject unsupported content types; and never execute website JavaScript. Protect against DNS rebinding and SSRF. Do not fetch arbitrary internal URLs, cloud metadata endpoints, or user-provided redirect targets.
- Add request rate limits and validate URL input. Do not save or display secrets found in page content. Store only the minimum evidence needed, such as public URL, finding text/snippet, and scan time.
- If the repository cannot support a safe audit implementation within scope, build the workflow and API contract but mark it unavailable; do not pretend a scan happened or make an unsafe generic `fetch(url)` endpoint.

### 4. AI-assisted guidance

- Add an AI service only through a backend adapter with a server-only key and a documented environment variable name. Never expose the key to Vite/client code.
- Provide plain-language explanations and practical, contextual suggestions. If AI credentials are absent, the rest of the product must still work and use clearly labeled deterministic guidance or show a helpful unavailable state.
- Policy and Terms generation must create drafts with clear placeholders for business-specific facts and a persistent legal-review warning. Do not invent jurisdiction, business practices, data flows, or legal guarantees. Require the user to review inputs before generating a draft.
- Validate and limit inputs and outputs. Do not send audit page contents, personal data, or workspace notes to an AI provider unless the user explicitly chooses that action and the UI explains what is sent.

### 5. Progress and reports

- Persist checklist state and notes in the database, scoped to the authenticated workspace.
- Allow a user to export a concise compliance progress report as PDF, including its generation date and a clear disclaimer that it is a progress snapshot, not proof of legal compliance. If PDF support requires a dependency, use a maintained library only if it fits the current stack; otherwise provide a print-friendly report and explain the choice.

## Architecture and implementation order

1. Inspect current code and identify the safest minimal migration from ScoutSearch to ComplyAI. Keep useful shared infrastructure such as routing, the theme system, accessible components, Supabase client, and API helper where they fit.
2. Write a short data model and API contract before implementing persistence. Include ownership, RLS, indexes, and deletion behavior. Add versioned SQL migrations under the backend's existing SQL convention; never rely on undocumented manual database edits.
3. Implement the authenticated shell, routes, dashboard, and checklist with real loading, empty, success, and error states.
4. Implement server-side persistence and enforce authorization on every endpoint. Keep response shapes consistent and generic errors safe for clients; log useful details server-side without logging tokens, passwords, or sensitive content.
5. Implement the safe website-audit workflow with limits and truthful findings.
6. Implement the backend AI adapter and report export only after the core application works. Optional integrations must degrade gracefully.
7. Update user-facing copy, navigation, page titles, and README setup instructions for ComplyAI. Remove ScoutSearch-specific routes/content only as part of this intentional pivot, and preserve unrelated infrastructure.

Work in reviewable phases, but continue through the MVP rather than stopping after a mockup. Do not ask for approval for routine implementation choices. If a team-owned auth contract or missing external credential blocks a secure feature, continue other independent work, document the exact blocker, and do not substitute fake security or fake results.

## Quality and acceptance criteria

- The app starts using the existing frontend/backend commands and builds/lints cleanly.
- Every private route redirects unauthenticated users to login; every private API rejects missing, invalid, or expired auth independently.
- Data is persisted and isolated by authenticated user/workspace; a user cannot change another workspace's records by editing request IDs.
- Checklist status and notes survive reloads.
- Dashboard counts and category progress are calculated from saved records, not hard-coded demo values.
- Website audits show evidence and limitations, enforce SSRF/fetch limits, and never claim to verify backend behavior from a public scan.
- AI failures or missing keys do not break the app; generated legal text is marked as an unreviewed draft.
- Keyboard navigation, visible focus, labels, responsive layouts, and the existing theme control work.
- No secrets are exposed, no unsafe HTML is rendered, and no fake authentication or fabricated audit results are used.
- Run the relevant lint/build/tests available in the repository and fix failures introduced by this work. Do not claim checks were run if they were not.

## Final response

Summarize the product changes and important architectural decisions. List database migrations and any environment variables by name only (never values). Give exact local run commands, setup steps for required external services, checks actually run, and any blocked/deferred features. Call out the legal-review and public-scan limitations. Do not claim production readiness or legal compliance without evidence.
