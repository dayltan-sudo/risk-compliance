# KAI Sentinel Host Client — TPA — Product Requirements Document

| | |
|---|---|
| **Owner** | Da'yl Tan, Senior Manager, Risk & Compliance — Keppel |
| **Version** | v10 — 31 August 2026 |
| **Status** | Draft for build. Supersedes v9 (`../2. PRD v2/`). |
| **Audience** | Product / front-end team building the host client |
| **Supersedes** | v9 removed the Dow Jones RCTP API. **v10 removes the R&C reviewer role, the R&C sign-off gate, BU access control, the Custodian agent, and the RCTP-format export.** See §12. |
| **Related** | `RnC_Agentic_Architecture.html` · `3. Agentic Workflows/a. TPA/3. TPA Prompts v3/` (agent prompts) · `4. Properties/a. TPA/TPA Property Mapping v0.2.xlsx` (24-field schema) |

Scope: the **host client** — the chatbot Keppel colleagues use to run third-party onboarding, renewal, and review. Defines what users see and do. Backend access control, storage, and field contracts live in the architecture doc.

---

## 1. What the product is

A standalone web chatbot. It is the **system of record** for TPA: a user uploads documents, the platform extracts a 24-field draft with citations, derives a risk tier and expiry date, screens the required parties against sanctions/watchlists, and the user confirms. Confirmation commits the record. There is no downstream handoff and no export — the record lives here.

**No integration with Dow Jones RCTP.** No API, no export formatted for RCTP, no claim about RCTP-side state. RCTP is not a dependency of this product.

**Goal:** cut the time users spend filling questionnaires by hand and cross-referencing source documents by eye.

## 2. Principles

- **Review-not-create.** The client suggests; the human commits. It never auto-completes work.
- **No fabricated judgment answers.** For any risk-relevant/judgment field (PEP, sanctioned-country exposure, CDD answers), if the source does not *state* the answer, the field is **blank and flagged "needs confirmation"** — never an inferred guess. Factual fields with a clear source (country, UEN, address) may be pre-filled with a citation.
- **Facts and conclusions are separated, not conflated.** Beneficial ownership is both: a register stating "X holds 40%" is a fact and is always populated; concluding who ultimately benefits behind a nominee is a judgment and is left open when the chain breaks. Blanking the evidenced shareholding because the conclusion is unresolved would hide evidence, not protect against fabrication.
- **Never claim an unobserved outcome.** Nothing reads as screened, cleared, or committed until it is.

### 2.1 Confidence — two states

| State | Meaning | Behaviour |
|---|---|---|
| **Confident** | Value is stated in a source with a resolvable citation. | Pre-filled; light-touch review. |
| **Needs checking** | Source is partial, ambiguous, conflicting, or required interpretation. | **Factual** fields: pre-filled, visibly flagged. **Judgment** fields: left blank + "needs confirmation" per §2. |

Confidence is agent-provided; the client displays it and does not compute it.

## 3. Users

**One persona for MVP: Requester.** Everyone who signs in has the same capabilities. There is no reviewer role, no allowlist, and no role-aware menu.

Sign-in is native AD/Entra SSO. No role or Business Unit confirmation prompt — there is no role to confirm and no BU boundary to enforce.

All users see all records. **Business Unit does not appear in this product** — there is no BU permission, no BU field, and no BU column. (Field 19 `TPA Keppel Entity` captures the contracting Keppel entity, which is a contract fact, not an ownership or access concept.)

*(An R&C reviewer role returns in Phase 2 with the review journeys in §11.)*

## 4. Out of scope

- Backend architecture — identity, validation, audit retention (`RnC_Agentic_Architecture.html`).
- **Dow Jones RCTP, entirely.** No integration, no export format, no status tracking.
- KYC functional screens — separate build. This PRD only ensures the shell doesn't need redesigning to add them.

## 5. Experience model

**Three panes, independently resizable** (sizes are not persisted across sessions):

- **Chat** — instructions, upload, confirmations, status and error messages.
- **Canvas** — the structured working surface: the field draft, the screening panel, a record's status card, a renewal delta, the review pack.
- **Roster ("Your third parties")** — recently-worked records plus every third party, so a record reopens without retyping. In-progress drafts appear here, visually marked, and are the entry point for resuming.

**Third Parties page** — a full-page index (topbar icon) of every third party, with inline per-record expansion (§10.6). Replaces the three-pane view while open; the brand mark always returns home.

**Field volume.** 24 extracted fields plus one derived (expiry) per onboarding. Group them by domain and offer quick navigation to blank and needs-checking fields.

**Task selection.** The user states or picks a task; the client routes. The selector is built so a future KYC process slots in without restructuring. A quick-action chip must never act on an assumed company — see §10.2.

**Draft persistence.** Drafts (documents, extracted fields, partial edits) save automatically server-side, keyed to user identity. **No expiry** — resumable from any device, same login, until committed or explicitly discarded. If a draft already exists for an entity when a flow starts, offer **resume** or **discard and start over** — never silently create a second draft.

## 6. The confirmation gate

**One gate. The Requester confirms.** It covers both the extracted fields and the screening recommendations. There is no second gate and no blocking authority above the user.

**Presented in two steps, confirmed as one gate.** Step 1 is the fields; step 2 is the screening panel, which unlocks once the fields are confirmed. **Party identities stay editable in place at step 2** — a wrong director name is corrected where the user notices it, in the screening panel, without reopening step 1. Party data has a single store, so the field table and the screening panel cannot disagree. Both must be confirmed before anything commits, and the result is a single `confirmation_log` entry. The split exists so screening gets a deliberate look instead of being scrolled past under one button — not to create a second approval.

The gate logs, per commit:

| Logged | Detail |
|---|---|
| Field changes | Field, pre-filled value, confirmed value, for every field the human altered |
| Screening decisions | Per party: recommendation, confirmed or overridden, and the override rationale |
| Actor and time | User identity and timestamp |

This log is **surfaced on the record as a history tab** — visible to any user opening the record, not backend-only.

**Editing a scoring field re-tiers the record.** Fields 3 (registered country), 18 (interaction) and 20 (services) are the only inputs to the risk score, and the score sets the screening scope. If the user corrects any of them at the gate, the score and tier recompute; if the tier rises, the parties the wider scope now covers are screened before the record can commit. The three fields are marked at the gate as scoring inputs so the effect isn't a surprise. Without this, an extraction error in one field commits a record at a tier its own confirmed values contradict — with the riskiest parties never screened, and nothing blank or overridden for the open-items flag to catch.

**Editing a screened party re-runs screening.** Screening runs on extracted names, before confirmation, so results are on screen at the gate. If the user corrects a screened party's **name, country, or date of birth**, that party is re-screened automatically before the record can commit — the gate shows the re-screen running and the updated recommendation. Edits to other fields don't trigger it. Without this rule, a name corrected precisely because extraction got it wrong would commit having been screened only under the wrong value.

## 7. Screening

Runs on the platform's own sanctions/watchlist infrastructure (CSL). Automatic during onboard and renew.

**Scope** is set by the risk tier, which the **extraction agent computes** and passes to the screener. The tier comes from R&C's risk-scoring rubric — a deterministic sum of three extracted fields:

`interaction with third parties (highest selected) + services/industry + country risk score`

Bands: **0–7 Low · 8–12 Medium · 13+ High**. Scope by tier: Low = entity + CEO · Medium = + directors + ultimate parent · High = + UBOs (RC003-05 §4.2.2).

The score, its three inputs, and the resulting tier are shown to the user at the confirmation gate so the arithmetic is checkable. If any input is blank or needs checking, the tier is presented as provisional, never settled.

**The tier also sets the record's validity.** Per RC003 §4.6 — Low 5 years, Medium 3 years, High 1 year — the platform derives a **TPA Expiry Date** (field 25) as commit date plus the cadence for the confirmed tier. It is a real field on the record, shown at the gate and on the status card with days remaining, and the user may **override it** like any other field. An override is logged distinctly (derived value, override, reason), because changing a review cycle is a policy decision rather than a data correction; once overridden the date is never silently recomputed. This is what makes the renewal journey (§9.3) reachable — without it nothing in the product would ever indicate a record was due.

**Unresolved ownership blocks a HIGH-tier commit.** Where a nominee, trust, or undisclosed holder breaks the ownership chain, the UBO table still shows every evidenced shareholding, but the beneficial-owner conclusion is left open and the layer that broke is named. At HIGH tier — where UBOs are in screening scope — this **blocks commit**: the user must supply a document that resolves the chain, or state the owner themselves, in which case that name is logged as human-supplied and screened before commit. At Low and Medium it flags only, since UBOs are outside scope there.

**Panel contents**, per screened party: name, which watchlists were checked, a **recommended** classification (`CLEARED` / `PENDING_REVIEW` / `TRUE_MATCH` / `RESOLVED_FALSE_POSITIVE`), and the evidence behind it (e.g. the DOB mismatch that resolved a name collision).

**Recommendations are not settled states.** Each is labelled as a recommendation and carries a **confirm / override** control. The user resolves each one at the §6 gate. Until then the client never presents a party as cleared, resolved, or matched.

## 8. Agents

Three agents. *(Custodian is cut from MVP — its audit report and portfolio sweep were both R&C-only functions. It returns in Phase 2 with §11's remediation forecast.)*

| Agent | Owns |
|---|---|
| **Orchestrator** | Routing and flow control only. No extraction or screening logic. |
| **Extractor** | Parses the uploaded set into the 24-field TPA schema with citations and confidence; resolves ownership structure; computes the risk tier and derived expiry; calculates renewal deltas. **Merged from the former `doc_analyst` + `tpa_doc_reviewer`** — one extractor, one schema, no intermediate handoff contract. |
| **Screener** | Watchlist screening of the parties the tier requires; produces recommendations with evidence. |

## 9. MVP journeys

### 9.1 Find — `tpa_find_third_party`
User names a company, or starts an onboarding. Searches and shows matches (name, reference, status); offers to continue with an existing record rather than duplicate it.

**Multiple near-matches** are presented as a picker that always includes **"none of these"** — choosing it is a confirmed no-match and starts a fresh onboarding. A user is never left in a picker with no correct answer.

**Two match keys only:** exact registration/tax ID, and name similarity with the same country. **Not** shared registered address or shared parent — corporate-secretarial firms register hundreds of unrelated companies to one address, so that key produces false duplicate warnings on routine onboardings and teaches users to click past them.

### 9.2 Onboard — `tpa_onboard_from_documents`
**Name required first.** If started without a company name (e.g. a chip), prompt for it before anything else, offering existing third parties as one-click alternatives. Never proceed against an assumed company.

1. Prompt for documents — multi-file, drag-and-drop or picker.
2. Show progress while documents are read and fields extracted.
3. Populate the canvas: each field, suggested value, confidence, source citation.
4. Screening runs automatically for the tier's required parties (§7).
5. **Confirmation gate (§6)** — user reviews fields and screening recommendations, edits what's wrong, confirms.
6. Record commits. The client states plainly that the record is committed in Sentinel. **No export is produced** — the record is viewable and reviewable in the client (§9.4, §9.5, §9.7).

### 9.3 Renew — `tpa_renew_from_documents`
**Trigger:** a record approaching or past its expiry date (§7), surfaced on the status card and in the Third Parties index. Renewal is the only thing that restarts the validity clock — commit recomputes expiry from the new commit date and the confirmed tier.

Same upload and persistence rules. Canvas shows a **delta view** — only properties that changed versus the current record, new documents attached, and newly screened parties. Same single gate, same commit.

### 9.4 Status — `tpa_record_status`
Read-only card: risk score and tier, record status (`draft` / `screening` / `committed`), screening outcome, last confirmed, expiry date and days remaining (overdue flagged). The only action is **Amend** (§9.6).

**Open-items flag.** A committed record also shows `HAS OPEN ITEMS`, naming them, when it carries a blank mandatory field, a judgment field left `needs confirmation`, or a screening recommendation the human overrode. A record committed with unresolved items must not look identical to a clean one. The same flag appears in the Third Parties index (§9.7).

### 9.5 Review pack — `tpa_review_pack`
Canvas table, one row per field: **Field | Value | Source | Confidence | Source match | Edited?**

- **Source match** — whether the value agrees with the cited passage (`agrees` / `differs` / `no source`). The extraction agent sets this when it first extracts the field, and re-evaluates it against the human's final value at the gate; the Review Pack reads the stored result rather than re-reading documents on every view. The human still owns the decision — this is an indicator, not an approval.
- **Edited?** — whether the human changed the value from the prefill, with timestamp (drawn from the §6 log).

Clicking a source citation opens an **inline snippet preview** with an "open full document" control. Available to all users.

### 9.6 Amend a committed record — `tpa_amend_record`
Corrects what a record should always have said — a typo, a misread value, a wrong citation. **Not a renewal:** no new cycle, no expiry change. If the user has documents for a new period, route to §9.3 instead.

The committed values open editable with their citations. Documents may be attached as evidence; extraction is not re-run across the set unless asked. Then:

- **A scoring-field edit re-tiers the record.** Changing interaction (18), services (20), or registered country (3) recomputes the risk score. If the tier rises, the parties the wider scope newly covers are screened before commit.
- **An identity edit re-screens that party**, as at the original gate.
- **An amendment never silently resets the review clock.** Expiry is editable, but only as an explicit logged override with a reason. If the amendment changes the tier, both the old and newly derived dates are shown for the user to decide — the base date stays the original commit. Only a renewal restarts the clock.
- Confirmation runs through the same gate, and commits a **new version on the same record** — history is appended, never overwritten. The reason for the amendment is captured.

### 9.7 Third Parties index
Full-page list of every third party: name, reference, risk tier, status, expiry date and days remaining, open-items flag, and when time-derived fields were last recomputed. Filterable by tier and by open items, searchable by name/reference.

A row's **Open** control expands **inline beneath the row** to show the record's staged fields and screening panel. A record with nothing staged shows an explicit "nothing cached yet" state — never a blank or fabricated table. A secondary control opens the record in the chat/canvas view.

## 10. Failure states

Each resolves to a plain-language message and a safe next step.

| State | What the user sees |
|---|---|
| **Screening unavailable** | The draft is **parked, not lost**. Every confirmed field is kept, screening retries in the background, and the user is released with "your work is saved — we'll tell you when screening completes." Nothing commits until it does. If failure persists past a threshold, the draft is marked `screening unavailable` and surfaced in the roster with a support path, so it can't sit stuck unnoticed. Never presented as cleared. |
| **Upload rejected** | Per-file error on the chip; other files proceed. Constraints: PDF, DOCX, DOC, XLSX, PNG, JPG, TIFF · 25MB/file · 20 files/upload. |
| **Extraction weak or empty** | Fields blank + "couldn't extract — enter manually". Never a fabricated fill. |
| **Needs-checking judgment field** | Blank, flagged "needs confirmation", citation still linked so the user can check the ambiguous source. |

## 11. Phasing

- **MVP:** Find, Onboard, Renew, Status, Review Pack, Amend, Third Parties index. Standalone web app. One persona.
- **Phase 2:** R&C reviewer role; exception report; due-for-renewal list; Custodian agent and the portfolio remediation forecast.
- **Future:** KYC process on the same shell; Teams embedding; email/Teams push for the forecast.

## 12. What v10 removed and why

| Removed | Reason |
|---|---|
| R&C reviewer role and all role-aware UI | Simplicity. Every MVP user is a Requester. |
| R&C sign-off gate, `BLOCKED` state, `pending R&C sign-off` status | The blocking second gate is gone; one confirmation gate remains (§6). |
| `PROPOSED` screening-action state machine | With one persona, a proposal and a confirmation are the same act. |
| BU access control, user→BU registry, BU/role denial states | BU is now a displayed attribute, not a permission. Removes an unsourced dependency. |
| Custodian agent, portfolio remediation forecast, due-for-renewal list, exception report | All R&C-only. Deferred to Phase 2. |
| The RCTP-format export, and then the export concept entirely | The API is not coming, and the format requirement was blocking a formatter nobody can build. A generic export replaced it, then was cut too — the record is viewable in the client and nothing downstream consumes a file. |
| Owning Business Unit from the UI | Displayed in three views but captured nowhere, and absent from the 24-field schema. Removed rather than given a capture point nobody asked for. |
| `doc_analyst` as a separate agent | Merged into one extractor. Removes a handoff contract and ~1,100 words of prompt. |
| Three-level confidence scale | Reduced to Confident / Needs checking. |
| "Evidence, not verdicts" as a principle | Deliberately dropped — the review pack now carries a source-match indicator (§9.5). |
| Server-side pane-size persistence | Not worth a user-preferences store at MVP. |
| 30–50 field estimate | Corrected to the real schema: **24 fields**. |

## 13. Non-functional

- **Security:** the client is the sole authenticated path to the backend; it never embeds backend service credentials.
- **Plain-language errors:** no internal codes or system jargon surfaced.
- **Traceability:** every populated field traces to a source document; every "done" corresponds to a confirmed backend response.
- **Performance:** document processing shows progress; the client never appears to hang during multi-document extraction.
- **Accessibility — WCAG 2.1 AA:** keyboard navigation of canvas tables and the field list; the citation drawer is a proper modal (focus moved in, trapped, returned, `Esc` closes); chat updates in an `aria-live` region; sortable headers expose `aria-sort`; every state conveyed by colour is also conveyed by text or icon; motion respects `prefers-reduced-motion`.
- **Data handling:** uploaded documents are attached to the record as evidence; not retained beyond what the task needs.

## 14. Dependencies

- **Platform backend & guardrails** — `RnC_Agentic_Architecture.html`.
- **CSL / sanctions screening API** — the platform's own screening infrastructure.
- **AD / Entra SSO** — sign-in.
- **TPA Property Mapping v0.2** — the authoritative 24-field schema.
- **R&C TPA risk-scoring rubric** — interaction / services / country scores and the 0-7-12 bands. Country scores are merged into `TPA Reference - Countries Territories 2025.md`.

## 15. Success metrics

- **Time saved** — time-to-complete per flow, against the manual baseline (not yet captured).
- **Adoption** — proportion of onboardings initiated through the client.
- **Quality** — rate at which pre-filled fields are edited at the gate (drawn directly from the §6 log), and citation accuracy.

**Instrumentation.** Emit timestamped events for: task start/complete with duration; per-field edited-after-prefill; citation opened; blank/needs-checking fields encountered vs confirmed; record committed. Event schema and store are a dependency to agree with the platform owner.

## 16. Open items

1. **Risk-score country term** — resolved as `Entity Registered Country` only (§7). Consequence accepted knowingly: a low-risk-registered entity with a sanctioned-jurisdiction UBO or parent does not score for it.
2. **Sanctioned-jurisdiction band edge** — an Iran/Russia-registered entity (country 11) with the lowest-scoring service (1) and no third-party interaction (0) totals 12 → Medium, so its UBOs are not screened. The rubric produces this; noted as a known band boundary, not a defect.
3. **Disclosure floor set at a flat 25%** ultimate ownership for resolution depth, with no jurisdiction variation. Confirm against RC003 if the policy states one.
4. **Expiry is derived, not policy-owned** — the RC003 §4.6 cadence (5/3/1 years) is applied as written. Confirm that commit date is the right base, rather than contract start or last review date.
5. **UI prototype** (`sentinel-host-client-uiux-prototype.html`) is built against v9 and is now substantially wrong — R&C sign-off, RCTP export, role-gated views. Rebuild or retire.
6. **FM&I KYC sibling PRD** was written against a shell with two personas and a reviewer gate, both removed. Reconcile before that process is built.
