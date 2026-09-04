# Onboarding Host Client — Product Requirements Document

| | |
|---|---|
| **Owner** | Da'yl Tan, Senior Manager, Risk & Compliance — Keppel |
| **Date** | 25 June 2026 (v1) · 6 July 2026 (v2) · 13 July 2026 (v3) · 15 July 2026 (v4) · 17 July 2026 (v5 · v6) · 17 August 2026 (v7 · v8 · v9) |
| **Status** | Draft v9 — for review; every §10/§14 open item is resolved or defaulted; the R&C sign-off gate (§7.2 step 6) is a confirmed blocking gate, not yet reconciled into the UI prototype |
| **Audience** | Product / front-end team building the host client (chatbot) |
| **Sibling document** | [`Onboarding Host Client - FM&I KYC - Product Requirements Document.md`](../b.%20FM%26I%20KYC/Onboarding%20Host%20Client%20-%20FM%26I%20KYC%20-%20Product%20Requirements%20Document.md) — the second process on this same shell (FM&I / MAS-regulated KYC), in the sibling `b. FM&I KYC` folder. This PRD defines the shell it plugs into (§5, §8); read both together. **Not yet reconciled against this v7 pivot** — it may still assume the live-RCTP-API model. |
| **Related documents** | `RnC_Agentic_Architecture.html` (platform architecture — unified data store, agent topology) · `TPA Agentic Workflow - Implementation Plan and Fix List.md` · `KYC Agentic Workflows - MAS and non-MAS - Plan and Fix List.md` · `Onboarding Host Client - FM&I KYC - Product Requirements Document.md` (sibling PRD, second process on this shell) |

> **What this document is.** A product requirements document for the **host client** — the custom, in-house chatbot application that Keppel colleagues use to run third-party onboarding, renewal, and review. It describes **what users see and do**. It deliberately does **not** re-specify the platform backend's internal guardrails, storage, or field contracts — those live in the platform architecture doc; this document treats them as a dependency the client trusts.

## Changelog

| Version | Date | Changes |
|---|---|---|
| **v9** | 17 Aug 2026 | **The R&C sign-off gate now formally blocks the handoff, closing a gap found during an agent-file consistency review.** Custodian's audit report (screening recommendations + risk tier + overall decision) was already described as "the human confirmation gate for screening," but nothing in the agent files or this PRD actually gated the field export on it — the export was written as if it followed screening automatically. Decision: it's a second, separate blocking gate from the field-confirmation gate (§7.2 step 3) — R&C must confirm or override Custodian's report before the field export (§7.2 step 7, renumbered) is generated at all. Two outcomes: **Confirmed** (Approved/Conditional Approval) → export proceeds as before; **Blocked** (Escalation Required) → record is saved and visible (§7.4, marked `BLOCKED`) but **no field export is generated** — nothing to take to RCTP until the block clears. Updated §7.2 (new step 6, renumbered handoff to step 7), §7.4 (added `pending R&C sign-off` / `blocked` record states), §7.10 (new failure/denial row for the blocked outcome). Applied in parallel to `census_orchestrator.md` (new `custodian_signoff_status` state key, explicit BLOCK step in the Flow B diagram, a "Post-Signoff Routing" section) and `custodian.md`. **Not yet reflected in `census-host-client-uiux-prototype.html`** — that mockup still shows the field export appearing right after screening; flag for a follow-up pass if the prototype gets revisited. |
| **v8** | 17 Aug 2026 | **Closed out most remaining §10/§14 open items in one pass.** Resolved by explicit decision: (9) screening-action visibility/authority — see v7 note (6). Resolved by reasonable default (no product-owner input available; flagged for override): (10) **file constraints** — PDF/DOCX/DOC/XLSX/PNG/JPG/TIFF, 25MB/file, 20 files/upload; (11) **platform surface** — standalone web app for MVP, Teams embedding moved to §13 Future; (12) **remediation-forecast channel** — in-client only for MVP, email/Teams push moved to §13 Future; (13) **roster pane cross-process split** — follows the same per-process split as the full-page index (§8), by the same reasoning already confirmed there; (14) **citation resolution** (moved from §14) — inline snippet preview with an "open full document" control. Resolved by pointing to existing spec text, no new decision needed: (15) **BU/role confirmation frequency** (moved from §14) — §6 already says once per session. **Left genuinely open, no default proposed:** the RCTP manual-entry export format (§14 — wrong guess here means rebuilding the formatter). §13 updated to place the two deferred items in Future. **Branding/visual design ownership, resolved in a same-day follow-up:** R&C owns it; "KAI Census" confirmed as the standing name (not just a working name) for the combined multi-process application (§8, §10, §14). **RCTP manual-entry format, also resolved same-day:** the export mirrors RCTP's own questionnaire field order/labels (§7.2 step 6, §14) — this creates a new, not-yet-satisfied dependency (§12): someone needs to pull RCTP's actual field layout as a build input before the export formatter can be built. |
| **v7** | 17 Aug 2026 | **Architecture pivot: the client is now standalone, with no live API to Dow Jones RCTP.** Previously (v1–v6) the client wrote directly to RCTP via an MCP server and treated RCTP as the system of record. That MCP server does not exist and is not being built. The platform now runs against its **own** record store (`app:portfolio_registry`, per the architecture doc), and every "write" described in earlier versions is now a **local commit**, not an external call. Consequences threaded through this version: (1) §7.2/§7.3 step 6's handoff message is now a **manual-entry field export**, not a "staged in RCTP" confirmation — the human keys the record into RCTP themselves; (2) §7.9 screening is now backed by the platform's **own** sanctions/watchlist screening (CSL API), not a Dow Jones read-back — the "no API" blocker that gated the richer screening panel in v2–v6 is gone. A follow-up decision (also 17 Aug 2026) resolved the screening agent's remaining evidence-vs-verdict KIV: it recommends, a human confirms at R&C sign-off — see §7.9; (3) §12 dependencies drop the MCP server and DJ entitlements export; (4) §14.5's open question about a DJ screening read-back API is now moot and removed; (5) §4/§9 reworded — the client is the sole path to the platform's own backend, not to an RCTP-fronting MCP server. Prompted by a direction change: the org will not pursue RCTP API access, and the platform's own CSL-based screening became the plan for KYC/sanctions checks instead of relying on RCTP for it. See `RnC_Agentic_Architecture.html` for the full backend picture. **Two further decisions resolved in the same pass (17 Aug 2026):** (6) screening-panel remediation controls are shown to **both** Requester and R&C, and both may act on them, but any action is recorded as a `PROPOSED` action — only R&C's sign-off (Custodian's report) confirms a hit, never a click by itself, from either persona (§7.9, §10); (7) **§10 session persistence** — resolved as server-side/user-identity-keyed, no automatic expiry, resumable from any device up through the confirmation gate including partial edits (§5, §7.2, §7.3); (8) **§10 panel-size persistence** — resolved, same server-side/per-user pattern as (7), stored once per user across the shared shell rather than per process (§5). |
| **v6** | 17 Jul 2026 | Folder reorganisation: this PRD now lives in `1. Planning & Prototyping/a. TPA/`, sibling to the FM&I KYC PRD in `1. Planning & Prototyping/b. FM&I KYC/` — sibling-document link path updated accordingly. **Confirmed the cached-index question §5 raised**: the full-page index stays **per-process** ("Third Parties" for TPA, "KYC Cases" for FM&I KYC), not unified — §8, §10 updated; the roster-pane sidebar wasn't part of this decision and stays an open inference. |
| **v5** | 17 Jul 2026 | Added a **sibling-document link** to the new `Onboarding Host Client - FM&I KYC - Product Requirements Document.md` (v1) — the first process built on the multi-process platform §8 anticipated. Expanded §8 into **"Multi-process platform & KYC-readiness"**, naming the combined application **KAI Census** (working name, ownership open — see §10) and adding the **process-switcher** as an explicit requirement rather than an implied consequence of the parameterised task-selector. No other section changed. Prompted by starting the FM&I KYC sibling PRD and wanting the two documents to read coherently together when uploaded separately in a future session. |
| **v4** | 15 Jul 2026 | Reconciled the PRD against the four agent files (`3. Agentic Workflows/`). Added §7.12 **Portfolio remediation & renewal forecast** — a home for the Custodian agent's scheduled risk-tiered remediation output, which previously had no PRD surface. **Removed §7.8 Risk-change alert and its deferred Dow Jones webhook from scope** (origin unclear, no confirmed need); `tpa_handle_risk_change` is now orphaned in the tool register. §7.8's number is kept as a tombstone so existing references to §7.9–§7.11 stay valid. Noted BU-scoping on §7.7 (due-for-renewal is filtered by the viewer's permitted Business Units, backed by a user→BU registry — agent Flow G). Mandatory-review field tagging is now defined in the agent field contract (DocReviewer §6 `Mandatory` column, migrating to CSV). Prompted by the agent-file gap review. |
| **v3** | 13 Jul 2026 | Reworked §5 to describe the actual **three-pane layout** (chat / canvas / roster), each pane and the workspace↔screening split **independently resizable**. Added §7.11 **View all third parties** — a topbar-accessible, full-page cached index of every third party in the viewer's scope, with inline per-record detail (cached workspace + screening fields, §5's roster/pane pattern applied full-page) and a persistent way back to the chat/canvas home view via the brand mark. Added a requirement to §7.2/§7.3 that Onboard/Renew must **prompt for the third party by name** rather than silently acting on a previously-viewed or default company. **Reversed a v2 decision in §7.9:** the proposed screening panel is no longer R&C-gated — it is now shown to both personas and is a **permanent fixture** (present with an empty state before any screening runs, persists across navigation) rather than appearing only during a live draft; flagged in §10 for reconfirmation with R&C given the prior Requester-exclusion stance. Prompted by a further round of prototype iteration. |
| **v2** | 6 Jul 2026 | Added §2.1 Product principles (review-not-create; **no-fabrication rule** for judgment fields; honest handoff; evidence-not-verdicts) and §2.2 Confidence-indicator definition (fixed High/Med/Low scale + reviewer behaviour per level). Added §5 field-volume design guidance (30–50 fields ⇒ grouping + mandatory-only filter). Added §7.9 Screening visibility (MVP is confirmation-only; richer reviewer panel reframed as an explicitly-proposed, R&C-gated concept pending an API dependency). Added §7.10 Failure & denial states. Elevated §10 session persistence from assumption to a resumability requirement. Specified §9 accessibility to WCAG 2.1 AA specifics. Added §11 instrumentation (so success metrics are measurable). Added §14 open question on the screening read-back API. Prompted by a review against the first-cut UI prototype, which had drifted from §4/§7.2 on screening visibility. |
| **v1** | 25 Jun 2026 | Initial draft. |

---

## 1. Purpose & scope

The host client is the **single chatbot surface** through which Requesters and R&C reviewers interact with the TPA onboarding automation (and, later, KYC). It is the **only path** to the platform's own backend (a prior architecture decision) — no other application or user calls that backend directly. **The platform is standalone: it has no live API into Dow Jones RCTP.** Onboarding, renewal, review, and screening all run entirely within the platform's own store and its own screening infrastructure; RCTP is a destination the human keys data into afterward, not a system the client integrates with.

**In scope for this PRD:** the chat experience, document upload, the structured side-panel views, role-aware UI, the platform's own compliance screening, and the manual-entry handoff to Dow Jones RCTP.

**Out of scope for this PRD** (see §4): the platform backend's access-control mechanics, field validation, audit design, and data contracts (architecture doc); and the Dow Jones RCTP native application itself (approval, activation, and the actual questionnaire submission happen there, entered by a human, not by this client).

---

## 2. Background & goals

Per the agentic-workflow plans, the objective is to **cut the time of both Requesters** (filling in onboarding/renewal questionnaires) **and R&C reviewers** (checking source documents against what was entered). The host client is the delivery vehicle for that: it lets a Requester upload documents and get a pre-filled draft instead of typing everything by hand, and gives an R&C reviewer a citation-backed report instead of cross-referencing document and questionnaire by eye.

The host client does not change *what* gets validated or *who* is allowed to write what — that is enforced backend-side (see `RnC_Agentic_Architecture.html`). Its job is to present the right actions to the right person, clearly, and to hand off honestly — to a manual RCTP entry step, not a submission — at the point where the client's job ends.

### 2.1 Product principles (the non-negotiables the UI must uphold)

These derive from the workflow plans' governance spine (verifiable draft → accountable human maker → native maker-checker) and constrain every screen below:

- **Review-not-create.** The client's value is helping a human *verify* a pre-filled draft, not auto-completing work. It suggests; the human commits.
- **The agent surfaces gaps — it does not fabricate judgment answers.** For any risk-relevant / judgment field (PEP, sanctioned-country exposure, beneficial ownership, CDD answers), if the source does not *state* the answer, the field is left **blank and flagged "needs confirmation"** — never populated with an inferred guess. Inference dressed as a tidy answer is the automation-bias failure the whole model is built to avoid. Factual fields with a clear source (country, UEN, address) may be pre-filled with a citation.
- **Honest handoff.** The client never implies a task is approved, activated, submitted, or a screening hit cleared. Those are Dow Jones RCTP actions; the client says so plainly at the boundary.
- **Evidence, not verdicts.** Review artifacts show the source and let the human decide; they carry no "matches ✓" / pass-fail column.

### 2.2 Confidence indicator — definition

The client displays a per-field confidence level on every pre-filled value. The scale is fixed and drives reviewer behaviour, not just colour:

| Level | Meaning | Client behaviour |
|---|---|---|
| **High** | Value is stated verbatim in a source with an unambiguous citation (e.g. UEN on the ACRA Bizfile). | Pre-filled; light-touch review. |
| **Medium** | Value is present but required interpretation, aggregation across passages, or a lower-quality source. | Pre-filled; drawn to the reviewer's attention. |
| **Low** | Source is partial, ambiguous, or conflicting. | For **factual** fields: pre-filled but visibly flagged. For **judgment** fields: **left blank + "needs confirmation"** per §2.1 — not guessed. |

Confidence is a UI reflection of a server/agent-provided score; the client does not compute it. Mandatory-review (R&C-tagged) fields are reviewed regardless of confidence.

---

## 3. Personas

| Persona | Who | What they do in this client |
|---|---|---|
| **Requester** | Everyone (default role) — first line, initiates onboarding/renewal | Find/dedup a third party, upload documents, review a pre-filled draft, check status |
| **R&C reviewer** | Small curated allowlist — second line, owns due diligence and risk | Everything a Requester can do, plus: review pack, exception report, due-for-renewal portfolio, remediation forecast |

Role is resolved backend-side (see `RnC_Agentic_Architecture.html`) from the user's AD/Entra sign-in; the client **reflects** that role in what it shows — it does not decide it.

---

## 4. Explicitly out of scope

- **Platform backend architecture** — identity reconciliation, BU scoping, field-level validation, audit retention. See `RnC_Agentic_Architecture.html`.
- **Approval, activation, and questionnaire submission** — these happen in the **Dow Jones RCTP native application**, entered by a human from the field list the client produces. The host client never claims to approve, activate, or submit on RCTP's behalf, and it has no way to confirm that the human has actually done so. *(What the client shows about screening is specified in §7.9 — screening itself runs on the platform's own infrastructure, not RCTP's.)*
- **RCTP data entry** — the client produces a **manual-entry field export**; a human keys the record into RCTP themselves. The client is a pre-filling and screening aid, not an integration with the RCTP UI.
- **KYC functional screens** — document-chase emails, CTC triage, etc. are a separate, later build (KYC plan). This PRD only ensures the client's *shell* doesn't need a redesign to add them.

---

## 5. Core experience model

**Three-pane layout**, consistent across every task, with every pane **independently resizable** (drag handles between panes; the workspace↔compliance-screening split within the canvas pane is also user-adjustable, and pane sizes **persist server-side per user** — same pattern as session persistence, §7.2 — so the layout follows them to any device, not just the one they resized it on):

- **Chat pane** — the conversation: instructions, document upload, confirmations, plain-language status and error messages, and the handoff message at the end of a task.
- **Canvas pane** — persistent, structured views for anything tabular: the review pack, the exception report, the due-for-renewal list, a record's status card, a renewal's "what changed" delta, and the compliance-screening panel (§7.9), which occupies a fixed sub-region of this pane. This is where a reviewer actually *works*, not just reads.
- **Roster pane ("Your third parties")** — a persistent list of records the current viewer has recently worked on plus every third party in their access scope (§6 BU-scoping), so a record can be reopened without re-typing its name. Opening a roster entry runs the same dedup-check as §7.1. **In-progress drafts appear here too** (visually marked "in progress," distinct from committed records) — this is the entry point for resuming an unfinished onboarding/renewal (§7.2/§7.3, session persistence).

**Third Parties page** — a full-page alternate view, opened via an icon in the topbar, that lists *every* third party in the viewer's access scope with key cached fields and supports inline per-record detail (§7.11). It replaces the three-pane view while open; the brand mark in the topbar is always a way back to the chat/canvas home view, from here or any other screen.

**Task selection** — a user states or picks what they want to do (find a third party, onboard, renew, check status, review, etc.); the client routes to the matching flow. The menu of available tasks is **role-aware** (§6) and **workflow-aware** — built so a future "process a KYC document set" option slots into the same selector without restructuring the client (§8). Quick-action selection (chips) must never silently act on an assumed company — see the §7.2/§7.3 name-prompt requirement.

**Designing for field volume.** A draft is **~30–50 fields per onboarding** (per the workflow plans), not the handful a mockup might show. The canvas must stay navigable at that scale: fields **grouped** (mandatory-review vs administrative, and by domain), a **"mandatory-review only" filter** so the reviewer can collapse to the risk-relevant subset, and quick navigation to blank/low-confidence fields. A flat, ungrouped list is a non-goal — it does not survive 50 rows.

---

## 6. Identity & role in the UI

- **Sign-in is native SSO** via the user's existing AD/Entra credentials — no separate login screen or credential entry in the chatbot.
- On first write action in a session, the client shows the user their **resolved role and Business Unit(s)** and asks them to confirm. If they flag "this isn't my BU," the client escalates to their R&C representative. *(This is a UX safety net for honest mistakes — the actual access boundary is enforced server-side; the client is not the security control.)*
- The available task menu reflects role: **Requesters** see Find / Onboard / Renew / Status; **R&C reviewers** additionally see Review Pack / Exception Report / Due-for-Renewal / Remediation Forecast.
- The **roster pane** and the **Third Parties page** (§5, §7.11) apply the same BU-scoping rule: a Requester sees only their own Business Unit's third parties; an R&C reviewer sees all Business Units, grouped.
- Every action the client takes is a call to the platform's own backend, which is the actual enforcement point — the client displays what the backend allows and denies, it does not make that decision itself.

---

## 7. User journeys

Each journey below states the trigger, what the user sees/does, and the underlying task tool it calls (full detail on tool composition is in the register — not repeated here).

### 7.1 Find an existing third party — `tpa_find_third_party`
**Trigger:** user names a company, or starts an onboarding.
**Behaviour:** client searches and shows any match (name, reference, status) in the chat; if a match exists, offers to continue with that record instead of creating a duplicate.

### 7.2 Onboard a new third party — `tpa_onboard_from_documents`
**Trigger:** "Onboard [company]" / no existing match found.
**Name required before proceeding:** if the flow is started without a company name already in hand (e.g. a quick-action chip rather than a typed instruction), the client **prompts for the third party's name** before doing anything else — it must never silently proceed against a default, previously-viewed, or assumed company. The prompt also offers the viewer's existing third parties (§5 roster pane) as one-click alternatives, in case they meant to continue an existing record via §7.1 rather than start a new one.
**Session persistence — resolved.** A draft (uploaded documents, extracted fields, and any partial edits) is saved automatically as the user goes and **never expires on its own** — it stays resumable indefinitely from **any device**, under the same login, until the user either finishes it (commits, step 6) or explicitly discards it. If a draft for this entity already exists when the flow starts, the client offers **resume** (returns to the exact state left off, not a fresh draft) or **discard and start over**, rather than silently creating a second in-progress draft for the same company.
**Steps:**
1. Client prompts for documents (contract, ACRA Bizfile / registry equivalent, registers of directors & shareholders, DDQ, etc.) — **multi-file upload**, drag-and-drop or file picker.
2. Shows a processing/progress indicator while documents are read and fields extracted.
3. Populates the canvas with the draft: each field, its suggested value, a **confidence indicator**, and a **source citation** (e.g. "p.5, Contract X") the reviewer/requester can open.
4. Fields tagged **mandatory-review** by R&C are visually distinguished from administrative ones.
5. Screening runs automatically for the required parties (entity/CEO/directors/parent/UBOs, per the RC003 risk tier), using the **platform's own screening infrastructure** — not a Dow Jones submission. See §7.9 for exactly what's shown.
6. **R&C sign-off gate (resolved — blocking, new in this version):** the field export in step 7 does **not** appear right after screening. It waits on an R&C reviewer confirming (or overriding) the Custodian audit report — risk tier, screening recommendations, any proposed actions (§7.9) — and reaching a decision. This is a second, separate gate from step 3's field confirmation; the Requester's job (confirming fields) and R&C's job (confirming screening/risk) are different steps, and the second one blocks the handoff. Two outcomes:
   - **Confirmed (Approved / Conditional Approval):** proceeds to step 7 — the field export is generated and handed over.
   - **Blocked (Escalation Required):** the record is saved (visible via §7.4/§7.11, marked `BLOCKED`) but **no field export is generated** — there is nothing to take to RCTP until the block is resolved. The client states this plainly and names the escalation path, never a partial or implied handoff.
7. **Explicit handoff message** *(only reached after step 6 confirms):* *"Your onboarding draft is ready. Below is the full field list, formatted for RCTP — copy these into RCTP to complete the questionnaire yourself. The platform has not entered or submitted anything on your behalf."* The message is paired with the field export from step 3 (values, confidence, citations). **The export mirrors RCTP's own questionnaire layout — field order and labels match what the reviewer sees when they open RCTP** (resolved, §14), so entry is top-to-bottom copy rather than hunting for the matching field. The client never implies onboarding is complete or that RCTP has been touched.

### 7.3 Renew an existing third party — `tpa_renew_from_documents`
**Trigger:** "Renew [company]" / prompted from the due-for-renewal list (§7.7).
**Name required before proceeding:** as with §7.2, invoking Renew without a company already specified (e.g. via the quick-action chip) prompts the user to choose one — typed, or picked from their existing third parties (§5 roster pane) — rather than assuming which record they meant.
**Steps:** same upload flow, same session-persistence rule (§7.2), but the canvas shows a **delta / "what changed"** view — only the properties that changed versus the current record, new documents attached, and any newly screened parties. Same manual-entry handoff pattern, with an added note when a changed field is on the high-risk-to-edit list (extra visual emphasis, not a different mechanism).

### 7.4 Check a record's status — `tpa_record_status`
**Trigger:** "Where is [company]?" or from within any other flow.
**Behaviour:** read-only card: risk band, the platform's own record status (drafted / confirmed / pending R&C sign-off / committed / **blocked — escalation required** / manual-entry export produced), and screening outcome. **The client cannot show RCTP-side approval or activation state** — it has no visibility into RCTP at all; those events happen entirely outside the platform, after the human keys the record in. No action buttons — this is informational only.

### 7.5 Review pack — `tpa_review_pack` *(R&C)*
**Trigger:** R&C opens a record for review.
**Behaviour:** canvas table — **Field | Value | Source reference | Confidence | Mandatory?** — one row per property, scoped to the mandatory-review set. **No verdict column and no "matches ✓" indicator** — the report shows evidence, the human makes the call. Clicking a source reference jumps to (or shows) the cited passage.

### 7.6 Exception report — `tpa_exception_report` *(R&C)*
**Trigger:** R&C preparing to sign off.
**Behaviour:** a list of blank required fields, red-flag fields with their values, and any unconfirmed items — a pre-sign-off checklist, not a pass/fail verdict.

### 7.7 Due-for-renewal list — `tpa_list_due_for_renewal` *(R&C)*
**Trigger:** R&C planning the renewal pipeline.
**Behaviour:** canvas table of TPAs approaching expiry, sortable/filterable by risk tier and days remaining; each row can launch §7.3 directly.
**BU-scoped (per §6):** the list is filtered to the third parties whose owning Business Unit is in the viewer's permitted set — a Requester sees only their own BU, an R&C reviewer sees all/assigned BUs grouped. This is an **on-demand, user-triggered** view served from the platform's own store (agent Flow G), distinct from the background job that keeps its time-derived fields current and from the scheduled remediation forecast in §7.12. Scoping requires two data sides: each third-party record carries its owning BU, and a user→BU registry records each viewer's permitted BUs (source — a maintained list or Active Directory / Entra group membership — is still to be decided).

### 7.8 Risk-change alert — *(removed from scope, v4)*
The risk-change alert journey and its (deferred) Dow Jones webhook have been **removed from scope** as of v4 — its origin was unclear and there is no confirmed need for it. `tpa_handle_risk_change` is orphaned. The section number is retained as a tombstone so existing references to §7.9–§7.11 remain valid.

### 7.9 Screening visibility
**v7 change: screening is now the platform's own, not a Dow Jones submission.** Versions 1–6 assumed screening was submitted *to* RCTP and blocked richer visibility on "no API to read hit data back from Dow Jones." That blocker is gone — screening runs entirely on the platform's own infrastructure (a sanctions/watchlist screening agent, per `RnC_Agentic_Architecture.html`'s Census/CSL pipeline), so the client already has the results locally; there's nothing to "read back."

**Current MVP:** after an onboard/renew, the client shows, for every screened party (entity/CEO/directors/parent/UBOs per the RC003 tier): the party name, which watchlists/sources were checked, and a per-party **recommended classification** (`CLEARED` / `PENDING_REVIEW` / `TRUE_MATCH` / `RESOLVED FALSE POSITIVE`) with the evidence rationale behind it (e.g. a DOB or nationality mismatch that resolved a name collision). This is real screening output, not a "submitted, results pending" placeholder.

**Recommendation, not verdict — decided.** The screening agent never makes a confirmed determination on a hit; every classification is a **recommendation**, clearly labelled as such in the UI (e.g. "Recommended: Resolved False Positive — pending your confirmation"), never a settled state. A human explicitly confirms or overrides each recommendation at the R&C sign-off step (Custodian's report, §7.2 step 6 — the same gate that produces the APPROVED/CONDITIONAL/BLOCKED decision). Until that confirmation happens, the client must never present a party as cleared, resolved, or matched. This resolves the v7 open question — the UI needs an explicit **confirm/override control** per recommendation at that sign-off step, which is a net-new interaction requirement versus v1–v6 (which had no such control because screening was assumed to be RCTP's job entirely).

**Remediation-recommendation controls — resolved (v7).** Confirm hit / Clear — false positive / Escalate are shown to **both personas**, and both may act on them. But a Requester's action is a **proposal**, not a confirmation: whichever persona clicks a control, the result is recorded as `PROPOSED` (with who proposed it and their stated rationale) alongside Screener's own recommendation — it never advances a party's status straight to confirmed. **R&C review is still required in every case**, at the same sign-off gate that already confirms Screener's recommendations (§7.9 above, Custodian's report). Concretely:
- A Requester sees the same screening panel and controls as R&C, and can act on them.
- Acting produces a proposal, not a resolution — a Requester cannot single-handedly clear a hit, resolve a false positive, or close an escalation.
- R&C's sign-off report (Custodian, §7.2 step 6) surfaces Screener's recommendation **and** any Requester-proposed action side by side, and R&C makes the actual call — confirming, overriding, or escalating further.
- This means "Requester-visible remediation controls" and "R&C-only final confirmation" are both true at once: visibility and the ability to propose are shared; the authority to confirm is not.

### 7.10 Failure & denial states (unhappy paths — must be designed, not just the happy path)

Every state below resolves to a **plain-language message** (§9) and, where relevant, a safe next step. These mirror the platform's own fail-closed behaviour — the client reflects the denial, it does not soften or bypass it.

| State | Trigger | What the user sees |
|---|---|---|
| **Write denied — BU** | User's permitted-BU set doesn't include the record's BU | "This record belongs to a Business Unit you're not set up for. Flag it to your R&C rep if that's wrong." No retry that pretends otherwise. |
| **Write denied — role** | Requester attempts an R&C-only field | "This field is maintained by R&C and can't be edited here." |
| **Identity unverifiable** | Host can't forward a verified identity | Read-only mode; writes disabled with an explanation; escalate path shown. |
| **Entitlements stale / missing** | Export failed to load or is past cadence | Writes may tighten to read-only; a banner states access data is being refreshed. |
| **Screening unavailable** | The platform's own screening call (CSL/watchlist) times out or errors | "Screening couldn't be completed just now — nothing was cleared. Try again shortly." Record's screening status stays `PENDING`, never presented as cleared. |
| **Blocked at R&C sign-off** *(new, §7.2 step 6)* | R&C reviewer sets Custodian's Decision to `BLOCKED — ESCALATION REQUIRED` | Requester sees: "This onboarding has been blocked pending R&C review — no field list has been generated for RCTP yet." Names the escalation path. No field export shown, no partial handoff implied — this is not an "upload rejected" or system error, it's a compliance decision, and reads as one. |
| **Upload rejected** | Unsupported type / oversize (see §10 file constraints) | Per-file error on the chip; other files proceed. |
| **Extraction weak/empty** | Agent extracts little or nothing usable | Draft shows fields blank + "couldn't extract — enter manually"; never a fabricated fill. |
| **Low-confidence judgment field** | §2.1 case | Field left blank, "needs confirmation" flag, citation still linked so the reviewer can check the ambiguous source. |

### 7.11 View all third parties (platform index)
**Trigger:** user opens the "Third Parties" icon in the topbar.
**Behaviour:** a full-page, non-chat view (§5) listing every third party in the viewer's access scope — own BU for a Requester, all BUs grouped for an R&C reviewer, per §6 — showing company name, reference, risk tier, status, and **when that record's time-derived fields (e.g. days-to-expiry) were last recomputed**. Filterable by risk tier and searchable by name/reference.

This view reads the platform's own store directly — record data itself is always current (written on every confirmed onboarding/renewal); only the derived temporal fields can lag between scheduled recomputes, and that recompute timestamp is always shown so a lagging field is never presented as freshly current.

Clicking a row's "Open" control expands **inline, directly beneath that row** (no navigation away) to show the key fields already staged for that record from **both**:
- the **canvas workspace draft** (the mandatory fields populated during onboarding, §7.2 step 3), and
- the **compliance-screening panel** (§7.9), if a screening has run for that record.

A record with nothing staged locally shows an explicit "nothing cached yet" state rather than a blank or fabricated table — consistent with the no-fabrication principle in §2.1. A secondary control opens the full record back in the chat/canvas view (running the §7.1 dedup-check) for anyone who needs to act on it, not just read it. A persistent control (also the topbar brand mark, §5) returns to the chat/canvas home view.

### 7.12 Portfolio remediation & renewal forecast *(R&C)*
**Trigger:** produced by the **Custodian agent** on its own schedule (a periodic portfolio sweep), not by a live user action; surfaced to R&C in the client.
**Behaviour:** a canvas table forecasting the portfolio's near-term compliance workload — TPAs inside the renewal/expiry window, each with a **risk tier** (High / Medium / Low), **days-to-expiry** (overdue cases highlighted), the **primary remediation trigger**, and **open exceptions / required action items** (e.g. "full KYC refresh," "updated shareholder registry"). This is richer than the §7.7 due-for-renewal list: §7.7 is an on-demand *list* the R&C reviewer pulls; §7.12 is the *scheduled forecast* the Custodian pushes, adding remediation actions and overdue prioritisation on top.
**Read-only / no automated action:** the forecast informs and prioritises; it triggers **no** automated renewal, termination, or write. Like every other view, it reads the platform's own store and shows a freshness indicator — if the scheduled temporal recompute failed or is overdue, the forecast is labelled **"data may be stale"** rather than presented as current. BU-scoping (§6) applies as in §7.7.
*(Backed by the Custodian agent, `summarise_tpas_due_for_remediation`. The Custodian reads the platform's own store directly and never calls any external system.)*

---

## 8. Multi-process platform & KYC-readiness

**Standing name for the combined application: KAI Census — confirmed, not just a working name.** The end-state is **one host client, several processes, one switcher** — not a separate app per process. TPA (this PRD) is the first process built on the shell; **FM&I KYC** is the second, specified in its own sibling PRD (`Onboarding Host Client - FM&I KYC - Product Requirements Document.md`) that plugs into the shell defined here rather than redefining it. Further processes (e.g. the non-MAS/Non-FM&I KYC process, KYC plan §6 item 4) are expected to follow the same pattern once scoped. Branding/visual design ownership sits with R&C (§10) — resolved, no longer an open item.

The upload, citation/provenance display, and canvas patterns above must be **parameterised, not hardcoded to TPA** — driven by a "required documents / property checklist" per process, not by TPA-specific field names baked into the UI. Concretely:

- **Process switcher.** The task-selector (§5) must expose a way to move between processes (e.g. TPA ↔ FM&I KYC) without a full reload of the chat/canvas shell or loss of session state (roster, panel sizes) — this is now an explicit requirement, not just an implied consequence of the task-selector being "workflow-aware."
- **Process-specific canvas view types.** A process may introduce canvas content types TPA never needed (e.g. FM&I KYC's document-checklist and CTC-triage views, and its human-gated customer-email draft) — the shell must render these as first-class canvas content, not bolt them on as one-offs.
- **Per-process cached index, confirmed separate (17 Jul 2026).** The full-page cached index (§7.11) stays **TPA-only** ("Third Parties" page); FM&I KYC gets its own **"KYC Cases"** page (FM&I KYC PRD §7.12) rather than a unified cross-process index. Reason: simpler to build independently, less migration risk while the two record shapes are still diverging. The **roster pane** (§5, a session-scoped "recently worked on" list, a different mechanism from the full-page index) wasn't part of this decision — by default it's reasonable to assume the same per-process split for consistency, but that's an inference, not a confirmed decision; revisit if it comes up.

No KYC-specific screens (document-chase emails, CTC triage) are built as part of *this* PRD — see the sibling FM&I KYC PRD for that process's own journeys, now that its own required-docs checklist work is underway.

---

## 9. Non-functional requirements

- **Security:** the client is the sole, authenticated path to the platform's own backend (locked topology, per `RnC_Agentic_Architecture.html`); it never embeds or exposes backend service-account credentials. There is no RCTP credential or session in the client at all — the human authenticates to RCTP separately, outside this platform, when they go to key the record in.
- **Plain-language errors:** denials/failures are explained in user terms ("this field is locked by R&C policy") — no internal error codes or system jargon surfaced to the user.
- **Traceability:** every populated field is traceable to a source document; every action the client displays as "done" corresponds to a real, confirmed backend response — never an assumed success. The client never claims an RCTP-side outcome (submitted, approved, activated) it cannot itself observe.
- **Performance:** document processing shows progress feedback; the client does not appear to hang during multi-document extraction.
- **Accessibility:** target **WCAG 2.1 AA**. Concretely: full keyboard navigation of canvas tables and the field list; the citation/source drawer is a proper modal dialog (focus moved in on open, focus trapped while open, returned on close, closable with `Esc`); chat updates announced via an `aria-live` region; sortable table headers expose `aria-sort`; all state conveyed by colour (confidence, tier, mandatory) is **also** conveyed by text/icon; motion (e.g. stamp/spinner) respects `prefers-reduced-motion`.
- **Data handling:** uploaded documents are used for extraction and, where relevant, attached to the platform's own record as evidence (visible in the manual-entry export so the human can attach them in RCTP too); they are not retained by the client beyond what's needed to complete the task.

---

## 10. Assumptions to confirm

These are noted, not asserted as decided — confirm before committing to a design:
- **~~Screening-panel visibility to Requesters~~ — resolved (v7).** Decision: Requesters see the same screening panel and remediation controls as R&C, and may act on them — but any Requester action is recorded as a `PROPOSED` action, not a confirmation. R&C review and confirmation is required in every case, at the same sign-off gate that confirms Screener's own recommendations. See §7.9.
- **~~Screening verdict language~~ — resolved (v7).** Decision: the screening agent recommends only (`CLEARED`, `RESOLVED FALSE POSITIVE`, `TRUE MATCH` are recommended classifications); a human explicitly confirms at the R&C sign-off gate before any classification is treated as final. Applied across `screener.md`, `custodian.md`, `census_orchestrator.md`, and §7.9 above.
- **~~Session persistence~~ — resolved.** Mechanism: server-side, keyed to user identity (`app:inflight_drafts`, not a device/browser store) — resumable from any device, same login. Retention: **no automatic expiry** — a draft persists until the user finishes (commits) or explicitly discards it. Scope: resumable up through the confirmation gate, including any partial field edits made before the user left, not just the raw extraction. See §5 (roster pane surfaces in-progress drafts) and §7.2.
- **~~Panel-size persistence~~ — resolved.** Server-side, keyed to user identity — same pattern as session persistence (§7.2, §10) — so resized pane widths/heights follow the user across devices rather than being stuck to whichever device they resized it on. This is a host-client shell preference, not TPA-specific: since the shell is shared across processes (§8), it's stored once per user, not per process.
- **~~File constraints~~ — resolved by default, confirm or override.** No product owner input received; set to standard enterprise-document-AI defaults so the "upload rejected" state (§7.10) is buildable now: **accepted types** — PDF, DOCX, DOC, XLSX, PNG, JPG/JPEG, TIFF (covers registry extracts, contracts, DDQs, and scanned documents); **max file size** — 25MB per file (generous for scanned multi-page registry documents while still failing fast on accidental huge uploads); **max files per upload** — 20 (well above the observed ~5-10 document onboarding pack). Flag if actual constraints (e.g. a scanner DPI that produces larger TIFFs, or a need for .msg/.eml for correspondence) differ.
- **~~Platform surface~~ — resolved by default, confirm or override.** MVP: standalone web app only. Teams embedding deferred to **Future** (§13) — it's a materially different delivery surface (auth context, canvas real estate, notification model) not worth building speculatively before the standalone web experience is validated.
- **~~Remediation-forecast channel (§7.12)~~ — resolved by default, confirm or override.** MVP: shown only in the client (consistent with the client being read-only/no-automated-action for this view, §7.12). Email/Teams push deferred to **Future** (§13) — it's a notification-infrastructure dependency, not core to the forecast's function.
- **~~Branding/visual design ownership~~ — resolved.** R&C owns branding/visual design for the client. **"KAI Census" is confirmed as the standing name** for the combined multi-process application (not just a working name). What "KAI" stands for is not specified — pending R&C's own naming decision, doesn't block PRD structure/behaviour work.
- **~~Roster pane, cross-process or not (§8)~~ — resolved by consistency, confirm or override.** Follows the same per-process split as the full-page index (Third Parties vs. KYC Cases) — the confirmed reasoning for that split (§8: "simpler to build independently, less migration risk while the two record shapes are still diverging") applies equally to the roster pane, and nothing points the other way. If a shared cross-process roster is wanted later, it's a bigger design conversation than the reasoning here covers.
- **~~Citation resolution~~ — resolved by default, confirm or override** *(moved from §14)*: clicking a source citation opens an **inline snippet preview** (fast, keeps the reviewer in the canvas) with an **"open full document" control** to jump to the source when the snippet alone isn't enough. Combines both options from §14 rather than forcing a choice between them.
- **~~BU/role confirmation frequency~~ — already answered by §6, moved here for closure** *(moved from §14)*: §6 already specifies this is shown **"on first write action in a session"** — i.e. once per session, not before every write. This §14 item was really asking the same question §6 already answers; no separate decision needed.

---

## 11. Success metrics

- **Time saved:** Requester and reviewer time-to-complete, measured against the baseline the workflow plans call for (not yet captured — see the TPA/KYC fix lists).
- **Adoption:** proportion of onboardings/renewals initiated through the chatbot versus manual entry.
- **Quality:** rate at which pre-filled fields require correction, and citation accuracy in the review pack (ties to the accuracy-eval item in the TPA fix list).

**Instrumentation (so the above are actually measurable, not aspirational).** The client must emit timestamped, anonymised events for at least: task start/complete (per flow) with duration; per-field *edited-after-prefill* (the correction signal); citation opened; low-confidence/blank fields encountered vs confirmed; manual-entry export generated (the platform-side handoff point — the client cannot observe whether the human went on to actually key it into RCTP). Without these events the baseline comparison the plans call for cannot be computed. Event schema and store are a dependency to agree with the platform/analytics owner.

---

## 12. Dependencies

- **Platform backend & guardrails** (`RnC_Agentic_Architecture.html`) — the client assumes access control, validation, and audit are enforced backend-side and does not duplicate them.
- **Platform's own screening infrastructure** (CSL/sanctions API, per the architecture doc's Census pipeline) — replaces any dependency on a Dow Jones screening read-back API.
- **AD / Entra SSO** — identity provider for sign-in.
- **BU/role registry** — source for the user→Business Unit permitted-set (a maintained list, or AD/Entra group membership — see §7.7, still to be decided).
- **Dow Jones RCTP native application** — the destination the human manually enters records into; the platform has no API into it and does not track what happens there after handoff.
- **RCTP questionnaire field layout (new, §14)** — the manual-entry export is decided to mirror RCTP's own form field order/labels, which requires that layout as a build input (screenshots, a field export, or direct access to the RCTP questionnaire UI). Not yet obtained — blocks building the export formatter, not the rest of the client.

---

## 13. Rollout / phasing

- **MVP:** Find, Onboard, Renew, Status, Review Pack, Exception Report (Requester + R&C). Standalone web app only (§10). Remediation forecast (§7.12) shown in-client only, no email/Teams push.
- **Phase 2:** Due-for-renewal portfolio view, portfolio remediation forecast (§7.12).
- **Future:** KYC functional screens (separate plan, once the required-docs checklist is codified); Teams embedding (§10); email/Teams push for the remediation forecast (§10, §7.12).

---

## 14. Open questions

1. Remaining unresolved items in §10 (assumptions to confirm) — as of this pass, only **branding/visual design ownership** is still genuinely open there; everything else in §10 has been resolved (by explicit decision or reasonable default) or moved here for closure.
2. ~~Exactly how a source citation resolves to a viewable passage~~ — resolved, moved to §10: inline snippet with an "open full document" control.
3. ~~Whether the BU/role confirmation (§6) is a one-time-per-session prompt or shown before every write action~~ — resolved, moved to §10: §6 already specifies once per session.
4. ~~Ownership of visual/brand design for the client~~ — resolved, moved to §10: R&C owns it; "KAI Census" confirmed as the standing name.
5. **~~Screening read-back API~~ — resolved, moot as of v7.** The org will not pursue RCTP API access; screening now runs on the platform's own infrastructure, so there is no external "read-back" to wait on.
6. **~~RCTP manual-entry format~~ — resolved, moved to §7.2 step 6.** Decision: mirror RCTP's own questionnaire field order/labels, not a generic field/value list — optimises for the actual point of the export (fast top-to-bottom manual entry). **New dependency this creates (not yet satisfied):** the client needs RCTP's actual field order/labels as a build input — someone needs to pull that from RCTP's real questionnaire UI (screenshots, a field export, or direct access) before the export formatter can be built. Added to §12.

---

## Appendix A — Feature → task-tool traceability

**All task tools below are internal to the platform's own backend — none call Dow Jones RCTP or any other external SaaS system (see §12).**

| User-facing feature                    | Underlying task tool                                                                          | Backend reference                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Find / dedup check                     | `tpa_find_third_party`                                                                          | `RnC_Agentic_Architecture.html` — Agent Topology, System 1                                              |
| Onboard from documents                 | `tpa_onboard_from_documents`                                                                     | Architecture doc — System 1, §D4-equivalent screening tiers; commits to `app:portfolio_registry`        |
| Renew from documents                   | `tpa_renew_from_documents`                                                                       | Architecture doc — System 1 renewal delta flow; commits to `app:portfolio_registry`                     |
| Status check                           | `tpa_record_status`                                                                              | Architecture doc — System 1, read-only                                                                  |
| Review pack                            | `tpa_review_pack`                                                                                | Architecture doc — System 1; TPA plan §2 (citation-only model)                                          |
| Exception report                       | `tpa_exception_report`                                                                           | Architecture doc — System 1                                                                             |
| Due-for-renewal list                   | `tpa_list_due_for_renewal`                                                                       | Architecture doc — System 1                                                                             |
| Portfolio remediation forecast         | *(Custodian agent — scheduled sweep; reads the platform's own store, no user-triggered task tool)* | §7.12; `custodian.md` (`summarise_tpas_due_for_remediation`)                                             |
| View all third parties (platform index) | *(none — client-side read of the platform's own store)*                                          | §7.11; no external dependency, reuses records already surfaced via `tpa_find_third_party` and prior session activity |

---

*This is a product requirements document for the host client only. Access control, validation, screening, and audit are specified and enforced in the platform's own backend (see `RnC_Agentic_Architecture.html`) — this document does not restate them.*
