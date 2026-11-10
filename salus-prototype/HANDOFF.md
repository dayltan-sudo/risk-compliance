# Salus prototype: audit and handoff

Audit date: 10 November 2026. Audited at commit `3813600` against PRD v0.8
(`insurance-dashboard/1. Planning & Prototyping/Keppel_Salus_PRD_v0_8.docx`).

This file lists what to change so the prototype behaves like a working enterprise system for
its purpose, while staying a synthetic-data simulation. "Simulate" is taken literally: where
the PRD names an integration (Entra ID, ERP, FX service, SharePoint, Teams), the change is a
local stand-in behind an interface, never a call to a real Keppel system.

## 1. Where the prototype stands

Checked on a clean install:

| Check | Result |
| :--- | :--- |
| `npm run typecheck` | clean |
| `npm test` | 527 passed, 1 expected failure, 42 files |
| `npm audit --omit=dev` | 4 high, all through `@vercel/blob`, which no code imports |

The calculation engine (`src/engine/`) is pure, tested and reproducible. The ingestion contract
(`src/ingestion/`) is the strongest part: one admission path for model, rules and questionnaire
captures, confidence routing, page and quote citations, and versioned posts. The assistant's
citation guard is enforced in code. These are worth keeping as they are.

The gap between this and an enterprise system is almost entirely in what sits around those
cores: state, identity, authorisation, history and the missing PRD views.

## 2. Findings that are defects today

These are wrong now, independent of any enterprise ambition. Each was reproduced against the
in-process app unless marked "read".

**D1. An Entity Champion cannot see or post their own upload.**
`server/routes/upload.ts` never reads the session, so `queue.enqueue` stores `entityId: null`.
The record is then group-only: the champion's `GET /api/documents` returns 0 items and
`POST /api/documents/:id/post` on their own upload returns 403. The JSON route
(`documents.ts`) and the questionnaire route tag the owner correctly; upload is the odd one out.

**D2. No write route checks the role.** An Auditor session can upload a document and post it
(201, then 200). The PRD access matrix (section 4.2) gives Auditor and Treasury read only. The
server knows two things about a session, role name and one entity id, and uses the role only
to decide group versus entity scope.

**D3. Anyone can become any role.** `POST /api/session/role` is unauthenticated, and a request
with no cookie at all is treated as Group Insurance with the whole book
(`DEFAULT_SESSION` in `server/routes/session.ts`). That is a reasonable demo affordance, but
it means every scope test proves filtering, not access control.

**D4. Entity scope is not applied to most screens.** The React pages compute from the seed
portfolio bundled into the JavaScript (`src/app/layout/filters.tsx` imports
`src/data/portfolio`). Only Contracts and Audit read the session scope. A champion therefore
sees group figures on Overview, Map, Coverage, Hotspots, Exclusions, Renewals and Report, and
the full book ships to every browser regardless of role. (Read, not driven in a browser.)

**D5. A posted record changes the browser, not the server.** The overlay that makes a post move
the ratios lives in `sessionStorage` (`src/app/layout/posted.tsx`). `/api/summary`, the CSV
exports and the assistant tools still read the seed, so after the headline demo (Hai Phong 25m
to 80m) the dashboard says 91.57% and the API, the export and the assistant say 90.03%. A second
user never sees the change.

**D6. A document can be posted with mandatory fields unconfirmed.** `ValidationQueue.post`
snapshots whatever the draft holds. The probe posted a slip with four mandatory fields missing.
The PRD's validation gate (section 9, FR3.4 and FR3.5) says nothing reaches the live record
until a person validates it.

**D7. Known hole in the citation guard.** `tests/assistant.guard.test.ts:53` is an `it.fails`:
a sentence whose only citation points at a different record passes the guard. The guard checks
that a citation resolves, not that the cited record contains the figure.

**D8. The assistant refuses every scoped session.** Tools read the group portfolio directly
(`src/assistant/tools.ts:13`), so `/api/assistant` returns 403 to a champion. FR8.1 wants the
assistant on every page for every user.

**D9. Uploads accept a caller-chosen `documentId`** with no format check, and `detectKind`
falls back to treating any file without NUL bytes in its first 1 KB as text. Neither is
exploitable in a demo, both are the kind of thing a security review flags first.

**D10. Housekeeping.**
- `README.md` says 385 tests; there are 528. It also refers to `.env.example` and
  `docs/planning/Salus_Prototype_Build_Plan.pdf`, neither of which is in the repo.
- `.gitignore` says "this repo is public". The parent repo is marked confidential and holds the
  PRD. One of those statements is wrong and it matters which. Confirm the repo's visibility.
- `@vercel/blob`, `pg`, `drizzle-orm`, `zustand` (two pages only) and the whole `src/db/` tree
  are declared but not on any request path. Either wire them (section 3) or remove them.
- No CI. Nothing runs the tests on push.

## 3. Changes, in the order I would make them

Each item names the PRD requirement it serves, the files it touches, and a check that proves it.
Work packages A to C are the foundation; D onward can be done in any order once A to C land.

### A. One server-side source of truth

The engine already takes a `Portfolio` value. What is missing is a store that owns it.

1. **Introduce a `PortfolioStore` interface** (`src/data/store.ts`): `current()`, `asOf(date)`,
   `applyPosted(record, actor)`, `history(objectId)`. Give it two implementations: in-memory
   (tests, default) and Postgres through the existing Drizzle schema. Every route gets the
   store by injection instead of importing `portfolio`. Files: all of `server/routes/`,
   `server/index.ts`, `src/assistant/tools.ts`.
2. **Move the overlay to the server.** `applyPostedRecords` runs inside `store.applyPosted`.
   Delete `src/app/layout/posted.tsx` and the `sessionStorage` copy. Fixes D5.
3. **Serve the portfolio from the API.** Add `GET /api/portfolio` returning the scoped book,
   and have `FiltersProvider` fetch it instead of importing the seed. Remove the seed import
   from the client bundle and add a build check that `dist/` does not contain a seed entity
   name. Fixes D4.
4. **Persist the queue and the audit log.** Add `documents`, `document_versions`,
   `extraction_fields` and `users` tables; extend `audit_events` with `entity_id`, `actor_id`
   and `request_id`. Remove the two module-level `Map`s that track ownership beside the data
   (`owners` in `documents.ts`, `recordedOwners` in `audit-scope.ts`): the owner belongs on the
   row. Merge the queue's private event log (`evt-…`) into the one audit store so there is a
   single trail.
5. **Run it locally with `docker compose`** (Postgres plus the API) and add a `db:seed` script
   that loads `src/data/portfolio.ts`. Keep the in-memory store as the test default so
   `npm test` still needs no database.
6. **Money.** Switch the schema's `double precision` to `numeric(18,2)` and keep amounts as
   integer minor units or a decimal type in the engine. The schema comment already names this
   as the production choice.

Check: post the Hai Phong slip as one user; a different browser, the CSV export and the
assistant all report 91.57%; restart the API and they still do.

### B. Identity and authorisation

1. **Simulated SSO.** Replace the role switcher with a login screen backed by a seeded `users`
   table (name, role, assigned entities). Put it behind an `IdentityProvider` interface whose
   demo implementation is a local OIDC-shaped mock, so swapping in Entra ID later is a
   configuration change. A request with no valid session gets 401, not Group Insurance.
   Keep a "switch demo user" control, but make it a login as a named user. Fixes D3.
2. **A capability matrix, enforced in one middleware.** Encode PRD section 4.2 as data:
   `can(role, capability)`, with capabilities `dashboard.read`, `document.upload`,
   `document.validate`, `record.edit`, `config.write`, `audit.read`, `user.admin`,
   `requirement.write`, `exclusion.write`. Add the two missing roles (Treasury, System
   Administrator). Every write route declares the capability it needs. Fixes D2.
   Note the matrix denies the audit trail to Entity Champions; today they can read a scoped
   slice. Decide which is intended and record it.
3. **Fix upload ownership** (D1): read the session in `upload.ts`, pass `entityId`, and let a
   champion choose only among their assigned entities.
4. **Multi-entity assignment.** `Session.entityId` is a single id and the champion default is
   hard-coded to `ent-01`. Carry `entityIds: string[]` from the user record.
   `SessionScope.entityIds` already has the right shape.
5. **Real actors in the audit trail.** `actor` is currently the role name, so two Group
   Insurance users are indistinguishable. Record user id and display name.
6. **Baseline web hardening.** `hono/secure-headers`, CSRF protection on state-changing routes
   (the cookie is `SameSite=Lax` only), a rate limit on upload and assistant routes, structured
   request logging with a request id that also lands in audit rows, and a refusal to start in
   production without `SESSION_SECRET`.

Check: a table-driven test walks every route with every role and asserts the status against
the matrix. An Auditor upload returns 403. A champion uploads, sees, validates and posts their
own document and cannot see another entity's.

### C. History, versioning and lineage

The PRD's section 8.3 is the part an auditor will test first, and it is the least built.

1. **Version every posted field.** Posting today mutates the live coverage row in the overlay
   and keeps versions only on the document. Write a new coverage version (`valid_from`,
   `valid_to`, `version` already exist in the schema) and close the previous one. Never update
   in place. Serves FR3.7.
2. **Point-in-time reads.** `store.asOf(date)` returns the book as it stood. Wire the existing
   `asOf` query parameter on `/api/summary` to it; today `asOf` moves only the renewal windows.
   Add an as-of date control to the filter bar. Serves FR2.6.
3. **KPI snapshots.** A `kpi_snapshots` table written on every post and config change, keyed by
   config version. This also gives the trend charts (FR1.4) real data.
4. **Configuration change control.** A settings page for thresholds and score weights where a
   change is proposed with a rationale, approved by a second user, and takes effect as a new
   dated `config_versions` row. The engine already accepts weights and thresholds as
   parameters, so this is UI, storage and workflow, not maths. Serves FR2.5, FR4.5 and section
   10.3.
5. **Full lineage on every figure.** `Ratio` carries numerator, denominator and formula. Add
   the FX rate row used, the source record ids, the config version and a computed-at
   timestamp, and show them in a lineage drawer opened from any KPI. Then make each posted
   field link through to the page and quote already captured at extraction. Serves FR2.4,
   FR1.6 and FR3.6.
6. **FX by date.** All money is valued at `config.effectiveFrom`. Value at the as-of date, keep
   the original currency visible beside the SGD figure, and put FX behind a `FxRateSource`
   interface with a seeded daily table as the demo feed. Serves FR2.2.
7. **Tamper-evident audit.** Hash-chain audit rows (each row stores the hash of the previous),
   and add a verify endpoint the Audit page can call. Log read access to source documents and
   exports as events, which the NFR table asks for and the store does not record today.

Check: change a limit, then ask for the summary as of yesterday and get the old figure; change
a threshold and confirm last month's snapshot still shows last month's band.

### D. Ingestion to the standard the PRD describes

1. **Keep the source file.** Upload parses the bytes and discards them. Store the original in
   an object store behind a `DocumentStore` interface (local disk in the demo, which is what
   `@vercel/blob` was presumably added for), with a SHA-256, and serve it back through a
   capability-checked route. Serves FR3.6 and stage 1 of the pipeline.
2. **A real validation gate** (D6). Block the post while any mandatory field is unconfirmed, or
   post with those fields marked unconfirmed and excluded from every ratio, which is what
   section 9.1 specifies. Then compute the Data Completeness KPI from it.
3. **Maker and checker.** The person who uploads can also accept every field and post. For
   records above a configurable materiality, require a second user to post. Assign each queue
   item an owner and a reason code so the Document Inbox works as a worklist.
4. **Formats.** Add Excel (schedules of values are usually spreadsheets), bulk upload, and
   scanned PDFs. For scans, an `OcrClient` interface with a fixture-backed demo implementation
   is enough; today a scan is refused with a 422, which is honest but leaves FR3.1 unmet.
5. **Asynchronous extraction.** Extraction runs inside the upload request. Move it to a job
   with states (received, scanning, extracting, needs review, posted, failed), so bulk upload
   and model latency do not block the UI. Add a timeout and one retry to both model clients;
   neither `fetch` call has an abort signal.
6. **Enrichment step.** After validation, map the record to the entity and site master instead
   of matching on policy number alone, and attach carrier rating and country index. Today a
   slip for an unknown policy is skipped with `unknown_policy`, so the system cannot ingest a
   new policy at all, only amend an existing one. That is the largest functional hole in the
   ingestion story.
7. **More than five coverage columns.** The overlay applies sum insured, limits, deductible and
   BI. Premium, dates, carrier and exclusions are extracted, shown and then dropped. Post them
   to their own tables so a renewal slip moves the renewal register and a wording adds rows to
   the exclusions register.
8. **Upload hygiene** (D9): generate ids server-side, allow-list file types by signature, and
   add a virus-scan hook (a no-op implementation in the demo, named so it is visibly a stub).
9. **Reprocessing.** Re-run a stored document through extraction to produce a new version.
   Becomes cheap once D1 exists. Serves FR3.8.

### E. Missing PRD capability

Views named in PRD section 11 that have no route: Policy Explorer, Carrier and Broker, Claims
and Loss, Cost of Risk. Policy Explorer is an MVP item and the drill-down target for FR1.6, so
it comes first.

KPIs in PRD section 7 not yet in `src/engine/`:

| Group | Missing | Needs |
| :--- | :--- | :--- |
| Coverage adequacy | peril sublimit adequacy, mandatory cover compliance, BI indemnity period vs restoration | peril PML, a statutory-requirements table by jurisdiction |
| Retention | deductible ratio, aggregate retained exposure, aggregate erosion | a `claims` table |
| Cost | rate on line, premium rate, premium to revenue, TCOR, year-on-year change | entity revenue, prior-year premiums |
| Claims | loss ratio, frequency, severity, settlement time | a `claims` table |
| Concentration | carrier, broker, geographic and line concentration; carrier credit quality | carrier share per coverage |
| Governance | data completeness, coverage continuity | validation status per field (D2 above) |

Two modelling changes unlock most of that table:

1. **A `Claim` entity** with its own lifecycle. The seed has only a per-site `claimsIndex`.
2. **Carrier line share.** A policy has one `carrierId`. Real programmes are co-insured, and
   the concentration KPIs need a `coverage_carriers` table with share and lead or follow.

Also add **mandatory cover by jurisdiction**. The `mandatory` score driver currently fires when
a site lacks a line implied by a hard-coded asset-class table in `scoring.ts`, which is a
different thing from a statutory requirement.

Other functional items:

- **Alerts and notifications** (PRD 12.1). A rules job that evaluates the trigger table on each
  post and nightly, writes to a `notifications` table, shows an in-app inbox, and sends through
  a `Notifier` interface whose demo implementation writes to a visible outbox page rather than
  to email or Teams.
- **Renewal alert windows** at 90, 60 and 30 days, driven by the same job.
- **Remediation tracking** on action items: owner, due date, status, closing note (FR4.6).
- **Requirement and exclusion editing.** Both registers are read-only seed data. Add create
  and edit forms with the same versioning and audit path (FR7.1, FR9.1).
- **Exports.** CSV only, three registers. Add Excel and a PDF of the review pack, and a
  scheduled-report simulation that drops files into the outbox (PRD 12.2).
- **Assistant.** Pass the session's scoped portfolio into the tools so a champion gets answers
  about their own entity (D8). Tighten the guard so a figure must appear in the cited record
  (D7), then flip the `it.fails` test. Add tools for exclusions, documents in the queue and the
  audit trail, since those pages exist and the assistant cannot answer about them. Persist
  questions and answers to the audit trail as access events.
- **Personal data.** Role-based masking for named individuals in D&O, GPA and workmen's
  compensation documents, and source-document download limited by capability.
- **News and sector intelligence** (FR6) is V2. `news-aggregator/` already exists in this
  repo; a thin adapter that reads its digest output as fixtures would let the `emerging` score
  driver be non-zero without building anything new here.

### F. Operating it like a system

- **CI**: typecheck, test and build on every push; `npm audit` as a non-blocking report.
- **Dependencies**: remove or wire the unused packages. That clears the four audit findings.
- **Health and readiness**: `/api/health` reports `mode: 'seed'` unconditionally. Have it
  report the store in use, database reachability and whether each model client is configured.
- **End-to-end tests**: a Playwright run of the three demo chains (upload to ratio, exclusion
  override, champion scope) against the compose stack. Current tests render pages and call
  routes in isolation, which is why D4 and D5 pass the suite.
- **Seed scale**: add a generated large portfolio (a few thousand policies) behind a flag and
  assert the overview responds within the PRD's 3 second budget. `scoreSite` is called once per
  site per summary with linear scans inside, so this will find real work.
- **Deployment**: the in-memory design is why the Vercel deploy needed a workaround for
  instance swaps (commit `c85512d`). Once A lands, either deploy the API as a long-running
  container or point the serverless function at managed Postgres.
- **Docs**: correct the README (D10), add `.env.example`, and add an `ARCHITECTURE.md` that
  lists each simulated integration and the interface it sits behind.

## 4. Suggested sequence

| Step | Packages | Outcome |
| :--- | :--- | :--- |
| 1 | D1, D2, D6, D9, D10 fixes | The defects in section 2 are closed with small diffs |
| 2 | A | One book, on the server, that survives a restart |
| 3 | B | Named users, enforced capabilities, 401 without a session |
| 4 | C | Versioned records, as-of reads, lineage, config change control |
| 5 | D | Source retention, validation gate, new-policy ingestion, async jobs |
| 6 | E | Policy Explorer first, then claims model, remaining KPIs, alerts |
| 7 | F | CI, end-to-end tests, scale seed, deployment |

Step 1 is safe to do before anything else and does not depend on the architecture changes.
Steps 2 to 4 should not be reordered: authorisation needs a server-side book to authorise
against, and versioning needs persistence.

## 5. Decisions needed before building

1. Is the repository public or private? (`.gitignore` and the root README disagree.)
2. Should Entity Champions see the audit trail for their entity? The PRD matrix says no, the
   prototype says yes.
3. Postgres for the demo, or SQLite to keep the one-command start? The Drizzle schema is
   written for Postgres.
4. Does the demo stay on Vercel? That choice drives how the store and the job queue are built.
5. For the validation gate, block the post or post-with-unconfirmed? The PRD text supports
   both readings; section 9.1 leans to the second.

## 6. What I did not check

- No browser session was driven. D4 comes from reading the import graph, not from watching a
  champion's screen.
- The model-backed paths (extraction and assistant) were not exercised; no key is configured in
  this environment. Their request and guard code was read.
- `vite build` was not run.
- The React pages were reviewed for data flow and scope only, not for accessibility or visual
  quality.
- The planning HTML files and agent specs under `insurance-dashboard/` were not compared
  against the build; only the PRD was.
