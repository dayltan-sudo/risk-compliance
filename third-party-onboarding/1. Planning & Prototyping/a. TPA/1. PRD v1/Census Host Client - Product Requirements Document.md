# Onboarding Host Client — Product Requirements Document

| | |
|---|---|
| **Owner** | Da'yl Tan, Senior Manager, Risk & Compliance — Keppel |
| **Date** | 25 June 2026 (v1) · 6 July 2026 (v2) · 13 July 2026 (v3) · 15 July 2026 (v4) · 17 July 2026 (v5 · v6) |
| **Status** | Draft v6 — for review; several items marked as assumptions to confirm, including one v2 decision reversed in v3 (§7.9) |
| **Audience** | Product / front-end team building the host client (chatbot) |
| **Sibling document** | [`Onboarding Host Client - FM&I KYC - Product Requirements Document.md`](../b.%20FM%26I%20KYC/Onboarding%20Host%20Client%20-%20FM%26I%20KYC%20-%20Product%20Requirements%20Document.md) — the second process on this same shell (FM&I / MAS-regulated KYC), in the sibling `b. FM&I KYC` folder. This PRD defines the shell it plugs into (§5, §8); read both together. |
| **Related documents** | `DJ RCTP MCP Server - Project Handover.md` (backend/MCP server + guardrails) · `TPA MCP Tool Register v2.xlsx` (the task tools this client calls) · `TPA Agentic Workflow - Implementation Plan and Fix List.md` · `KYC Agentic Workflows - MAS and non-MAS - Plan and Fix List.md` · `Onboarding Host Client - FM&I KYC - Product Requirements Document.md` (sibling PRD, second process on this shell) |

> **What this document is.** A product requirements document for the **host client** — the custom, in-house chatbot application that Keppel colleagues use to run third-party onboarding, renewal, and review. It describes **what users see and do**. It deliberately does **not** re-specify the MCP server's internal guardrails, endpoints, or data contracts — those live in the handover; this document treats them as a dependency the client trusts.

## Changelog

| Version | Date | Changes |
|---|---|---|
| **v6** | 17 Jul 2026 | Folder reorganisation: this PRD now lives in `1. Planning & Prototyping/a. TPA/`, sibling to the FM&I KYC PRD in `1. Planning & Prototyping/b. FM&I KYC/` — sibling-document link path updated accordingly. **Confirmed the cached-index question §5 raised**: the full-page index stays **per-process** ("Third Parties" for TPA, "KYC Cases" for FM&I KYC), not unified — §8, §10 updated; the roster-pane sidebar wasn't part of this decision and stays an open inference. |
| **v5** | 17 Jul 2026 | Added a **sibling-document link** to the new `Onboarding Host Client - FM&I KYC - Product Requirements Document.md` (v1) — the first process built on the multi-process platform §8 anticipated. Expanded §8 into **"Multi-process platform & KYC-readiness"**, naming the combined application **KAI Census** (working name, ownership open — see §10) and adding the **process-switcher** as an explicit requirement rather than an implied consequence of the parameterised task-selector. No other section changed. Prompted by starting the FM&I KYC sibling PRD and wanting the two documents to read coherently together when uploaded separately in a future session. |
| **v4** | 15 Jul 2026 | Reconciled the PRD against the four agent files (`3. Agentic Workflows/`). Added §7.12 **Portfolio remediation & renewal forecast** — a home for the Custodian agent's scheduled risk-tiered remediation output, which previously had no PRD surface. **Removed §7.8 Risk-change alert and its deferred Dow Jones webhook from scope** (origin unclear, no confirmed need); `tpa_handle_risk_change` is now orphaned in the tool register. §7.8's number is kept as a tombstone so existing references to §7.9–§7.11 stay valid. Noted BU-scoping on §7.7 (due-for-renewal is filtered by the viewer's permitted Business Units, backed by a user→BU registry — agent Flow G). Mandatory-review field tagging is now defined in the agent field contract (DocReviewer §6 `Mandatory` column, migrating to CSV). Prompted by the agent-file gap review. |
| **v3** | 13 Jul 2026 | Reworked §5 to describe the actual **three-pane layout** (chat / canvas / roster), each pane and the workspace↔screening split **independently resizable**. Added §7.11 **View all third parties** — a topbar-accessible, full-page cached index of every third party in the viewer's scope, with inline per-record detail (cached workspace + screening fields, §5's roster/pane pattern applied full-page) and a persistent way back to the chat/canvas home view via the brand mark. Added a requirement to §7.2/§7.3 that Onboard/Renew must **prompt for the third party by name** rather than silently acting on a previously-viewed or default company. **Reversed a v2 decision in §7.9:** the proposed screening panel is no longer R&C-gated — it is now shown to both personas and is a **permanent fixture** (present with an empty state before any screening runs, persists across navigation) rather than appearing only during a live draft; flagged in §10 for reconfirmation with R&C given the prior Requester-exclusion stance. Prompted by a further round of prototype iteration. |
| **v2** | 6 Jul 2026 | Added §2.1 Product principles (review-not-create; **no-fabrication rule** for judgment fields; honest handoff; evidence-not-verdicts) and §2.2 Confidence-indicator definition (fixed High/Med/Low scale + reviewer behaviour per level). Added §5 field-volume design guidance (30–50 fields ⇒ grouping + mandatory-only filter). Added §7.9 Screening visibility (MVP is confirmation-only; richer reviewer panel reframed as an explicitly-proposed, R&C-gated concept pending an API dependency). Added §7.10 Failure & denial states. Elevated §10 session persistence from assumption to a resumability requirement. Specified §9 accessibility to WCAG 2.1 AA specifics. Added §11 instrumentation (so success metrics are measurable). Added §14 open question on the screening read-back API. Prompted by a review against the first-cut UI prototype, which had drifted from §4/§7.2 on screening visibility. |
| **v1** | 25 Jun 2026 | Initial draft. |

---

## 1. Purpose & scope

The host client is the **single chatbot surface** through which Requesters and R&C reviewers interact with the TPA onboarding automation (and, later, KYC). It is the **only path** to the underlying MCP server (a prior architecture decision) — no other application or user calls the server directly.

**In scope for this PRD:** the chat experience, document upload, the structured side-panel views, role-aware UI, and the user-facing handoffs to Dow Jones RCTP.

**Out of scope for this PRD** (see §4): the MCP server's access-control mechanics, field validation, audit design, and API contracts (handover); and the Dow Jones RCTP native application itself (approval, activation, screening-hit adjudication, questionnaire submission all happen there, not in this client).

---

## 2. Background & goals

Per the agentic-workflow plans, the objective is to **cut the time of both Requesters** (filling in onboarding/renewal questionnaires) **and R&C reviewers** (checking source documents against what was entered). The host client is the delivery vehicle for that: it lets a Requester upload documents and get a pre-filled draft instead of typing everything by hand, and gives an R&C reviewer a citation-backed report instead of cross-referencing document and questionnaire by eye.

The host client does not change *what* gets validated or *who* is allowed to write what — that is enforced server-side (handover Parts B–D). Its job is to present the right actions to the right person, clearly, and to hand off honestly to Dow Jones RCTP at the point where the client's job ends.

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

Role is resolved server-side (handover §B, §D) from the user's AD/Entra sign-in; the client **reflects** that role in what it shows — it does not decide it.

---

## 4. Explicitly out of scope

- **Backend/MCP server architecture** — identity reconciliation, BU scoping, field-level validation, audit retention. See the handover.
- **Approval, activation, and screening-hit adjudication** — confirmed to have no supporting API; these happen in the **Dow Jones RCTP native application**. The host client never claims to approve, activate, or clear a screening hit. *(What the client **may** show about screening is specified in §7.9 — confirmation-only in the MVP.)*
- **Questionnaire submission** — the client populates a **staged draft** in RCTP; a human still opens RCTP itself to review each questionnaire and click submit. The client is a pre-filling aid, not a replacement for the RCTP UI.
- **KYC functional screens** — document-chase emails, CTC triage, etc. are a separate, later build (KYC plan). This PRD only ensures the client's *shell* doesn't need a redesign to add them.

---

## 5. Core experience model

**Three-pane layout**, consistent across every task, with every pane **independently resizable** (drag handles between panes; the workspace↔compliance-screening split within the canvas pane is also user-adjustable, and sizes persist across a session):

- **Chat pane** — the conversation: instructions, document upload, confirmations, plain-language status and error messages, and the handoff message at the end of a task.
- **Canvas pane** — persistent, structured views for anything tabular: the review pack, the exception report, the due-for-renewal list, a record's status card, a renewal's "what changed" delta, and the compliance-screening panel (§7.9), which occupies a fixed sub-region of this pane. This is where a reviewer actually *works*, not just reads.
- **Roster pane ("Your third parties")** — a persistent list of records the current viewer has recently worked on plus every third party in their access scope (§6 BU-scoping), so a record can be reopened without re-typing its name. Opening a roster entry runs the same dedup-check as §7.1.

**Third Parties page** — a full-page alternate view, opened via an icon in the topbar, that lists *every* third party in the viewer's access scope with key cached fields and supports inline per-record detail (§7.11). It replaces the three-pane view while open; the brand mark in the topbar is always a way back to the chat/canvas home view, from here or any other screen.

**Task selection** — a user states or picks what they want to do (find a third party, onboard, renew, check status, review, etc.); the client routes to the matching flow. The menu of available tasks is **role-aware** (§6) and **workflow-aware** — built so a future "process a KYC document set" option slots into the same selector without restructuring the client (§8). Quick-action selection (chips) must never silently act on an assumed company — see the §7.2/§7.3 name-prompt requirement.

**Designing for field volume.** A draft is **~30–50 fields per onboarding** (per the workflow plans), not the handful a mockup might show. The canvas must stay navigable at that scale: fields **grouped** (mandatory-review vs administrative, and by domain), a **"mandatory-review only" filter** so the reviewer can collapse to the risk-relevant subset, and quick navigation to blank/low-confidence fields. A flat, ungrouped list is a non-goal — it does not survive 50 rows.

---

## 6. Identity & role in the UI

- **Sign-in is native SSO** via the user's existing AD/Entra credentials — no separate login screen or credential entry in the chatbot.
- On first write action in a session, the client shows the user their **resolved role and Business Unit(s)** and asks them to confirm. If they flag "this isn't my BU," the client escalates to their R&C representative. *(This is a UX safety net for honest mistakes — the actual access boundary is enforced server-side; the client is not the security control.)*
- The available task menu reflects role: **Requesters** see Find / Onboard / Renew / Status; **R&C reviewers** additionally see Review Pack / Exception Report / Due-for-Renewal / Remediation Forecast.
- The **roster pane** and the **Third Parties page** (§5, §7.11) apply the same BU-scoping rule: a Requester sees only their own Business Unit's third parties; an R&C reviewer sees all Business Units, grouped.
- Every action the client takes is a call to the MCP server, which is the actual enforcement point — the client displays what the server allows and denies, it does not make that decision itself.

---

## 7. User journeys

Each journey below states the trigger, what the user sees/does, and the underlying task tool it calls (full detail on tool composition is in the register — not repeated here).

### 7.1 Find an existing third party — `tpa_find_third_party`
**Trigger:** user names a company, or starts an onboarding.
**Behaviour:** client searches and shows any match (name, reference, status) in the chat; if a match exists, offers to continue with that record instead of creating a duplicate.

### 7.2 Onboard a new third party — `tpa_onboard_from_documents`
**Trigger:** "Onboard [company]" / no existing match found.
**Name required before proceeding:** if the flow is started without a company name already in hand (e.g. a quick-action chip rather than a typed instruction), the client **prompts for the third party's name** before doing anything else — it must never silently proceed against a default, previously-viewed, or assumed company. The prompt also offers the viewer's existing third parties (§5 roster pane) as one-click alternatives, in case they meant to continue an existing record via §7.1 rather than start a new one.
**Steps:**
1. Client prompts for documents (contract, ACRA Bizfile / registry equivalent, registers of directors & shareholders, DDQ, etc.) — **multi-file upload**, drag-and-drop or file picker.
2. Shows a processing/progress indicator while documents are read and fields extracted.
3. Populates the canvas with the draft: each field, its suggested value, a **confidence indicator**, and a **source citation** (e.g. "p.5, Contract X") the reviewer/requester can open.
4. Fields tagged **mandatory-review** by R&C are visually distinguished from administrative ones.
5. Screening is submitted automatically for the required parties (entity/CEO/directors/parent/UBOs, per the RC003 risk tier) — the client states this happened and lists *which parties were submitted*; in the MVP it does **not** show hit results, match scores, or adjudication controls (those live in RCTP). See §7.9 for the exact confirmation-only content and the proposed extension now shown to both personas.
6. **Explicit handoff message:** *"Your onboarding draft is staged in RCTP as [reference]. It has not been submitted. Go to RCTP to review each questionnaire and submit."* The client never implies onboarding is complete.

### 7.3 Renew an existing third party — `tpa_renew_from_documents`
**Trigger:** "Renew [company]" / prompted from the due-for-renewal list (§7.7).
**Name required before proceeding:** as with §7.2, invoking Renew without a company already specified (e.g. via the quick-action chip) prompts the user to choose one — typed, or picked from their existing third parties (§5 roster pane) — rather than assuming which record they meant.
**Steps:** same upload flow, but the canvas shows a **delta / "what changed"** view — only the properties that changed versus the current record, new documents attached, and any newly screened parties. Same handoff message pattern, with an added note when a changed field is on the high-risk-to-edit list (extra visual emphasis, not a different mechanism).

### 7.4 Check a record's status — `tpa_record_status`
**Trigger:** "Where is [company]?" or from within any other flow.
**Behaviour:** read-only card: risk band, approval state (as recorded in RCTP), and confirmation that screening was submitted. No action buttons — this is informational only.

### 7.5 Review pack — `tpa_review_pack` *(R&C)*
**Trigger:** R&C opens a record for review.
**Behaviour:** canvas table — **Field | Value | Source reference | Confidence | Mandatory?** — one row per property, scoped to the mandatory-review set. **No verdict column and no "matches ✓" indicator** — the report shows evidence, the human makes the call. Clicking a source reference jumps to (or shows) the cited passage.

### 7.6 Exception report — `tpa_exception_report` *(R&C)*
**Trigger:** R&C preparing to sign off.
**Behaviour:** a list of blank required fields, red-flag fields with their values, and any unconfirmed items — a pre-sign-off checklist, not a pass/fail verdict.

### 7.7 Due-for-renewal list — `tpa_list_due_for_renewal` *(R&C)*
**Trigger:** R&C planning the renewal pipeline.
**Behaviour:** canvas table of TPAs approaching expiry, sortable/filterable by risk tier and days remaining; each row can launch §7.3 directly.
**BU-scoped (per §6):** the list is filtered to the third parties whose owning Business Unit is in the viewer's permitted set — a Requester sees only their own BU, an R&C reviewer sees all/assigned BUs grouped. This is an **on-demand, user-triggered** view served from the cache (agent Flow G), distinct from the background job that keeps that cache current and from the scheduled remediation forecast in §7.12. Scoping requires two data sides: each third-party record carries its owning BU, and a user→BU registry records each viewer's permitted BUs (source — a maintained list or Active Directory / Entra group membership — is still to be decided).

### 7.8 Risk-change alert — *(removed from scope, v4)*
The risk-change alert journey and its (deferred) Dow Jones webhook have been **removed from scope** as of v4 — its origin was unclear and there is no confirmed need for it. `tpa_handle_risk_change` (register tool #7) is now orphaned and should be removed from the MCP Tool Register. The section number is retained as a tombstone so existing references to §7.9–§7.11 remain valid.

### 7.9 Screening visibility
**MVP (confirmation-only, all personas):** after an onboard/renew, the client states that screening was **submitted** and lists **which parties** were submitted (entity/CEO/directors/parent/UBOs per the RC003 tier). It shows **no** match scores, lists-hit, adverse-media, verdicts, or remediation controls — hit adjudication has no API and happens in RCTP (§4, handover Part E). This is the honest-handoff boundary for screening.

**Proposed extension (all personas as of v3, NOT in MVP — pending an API decision):** a screening panel that surfaces results (parties, lists checked, match scores, adverse-media summaries) and remediation recommendations. As of v3 it is shown to **both Requester and R&C reviewer**, and is a **permanent fixture** of the canvas pane: present from the start of a session with an explicit "no screening run yet" empty state, populated once an onboard/renew screening runs, and persisting across navigation rather than disappearing when the user moves to another view. This is **blocked on an open dependency**: the handover records that there is **no Dow Jones API to fetch hit data**. Until that is re-confirmed with Dow Jones (see §14.5), this panel is a concept only, must be **clearly labelled "proposed / not in current scope,"** and must never present itself as a place where a hit is *cleared* — any action is a recommendation synced to RCTP, where adjudication actually happens.

> **Reversed from v2 — flagged for reconfirmation (see §10).** v2 specified this panel as R&C-gated: *"a Requester must never see screening results or remediation controls."* The current design opens both the **read view** and the **remediation-recommendation controls** (Confirm hit / Clear — false positive / Escalate) to Requesters as well. This is a real widening of who can see, and act on, screening signal ahead of RCTP adjudication. Confirm with R&C whether that's acceptable as-is, or whether remediation recommendations specifically should stay R&C-only even if the read view is shared.

### 7.10 Failure & denial states (unhappy paths — must be designed, not just the happy path)

Every state below resolves to a **plain-language message** (§9) and, where relevant, a safe next step. These mirror the server's fail-closed behaviour (handover §F3) — the client reflects the denial, it does not soften or bypass it.

| State | Trigger | What the user sees |
|---|---|---|
| **Write denied — BU** | User's permitted-BU set doesn't include the record's BU | "This record belongs to a Business Unit you're not set up for. Flag it to your R&C rep if that's wrong." No retry that pretends otherwise. |
| **Write denied — role** | Requester attempts an R&C-only field | "This field is maintained by R&C and can't be edited here." |
| **Identity unverifiable** | Host can't forward a verified identity | Read-only mode; writes disabled with an explanation; escalate path shown. |
| **Entitlements stale / missing** | Export failed to load or is past cadence | Writes may tighten to read-only; a banner states access data is being refreshed. |
| **Dow Jones unavailable** | API down/timeout | "Couldn't reach RCTP just now — nothing was submitted. Try again shortly." No partial-write implied; retry is idempotent. |
| **Upload rejected** | Unsupported type / oversize (see §10 file constraints) | Per-file error on the chip; other files proceed. |
| **Extraction weak/empty** | Agent extracts little or nothing usable | Draft shows fields blank + "couldn't extract — enter manually"; never a fabricated fill. |
| **Low-confidence judgment field** | §2.1 case | Field left blank, "needs confirmation" flag, citation still linked so the reviewer can check the ambiguous source. |

### 7.11 View all third parties (cached index)
**Trigger:** user opens the "Third Parties" icon in the topbar.
**Behaviour:** a full-page, non-chat view (§5) listing every third party in the viewer's access scope — own BU for a Requester, all BUs grouped for an R&C reviewer, per §6 — showing company name, reference, risk tier, status, and **when that record's summary was last cached to the client**. Filterable by risk tier and searchable by name/reference.

This view is explicitly a **local cache read, not a live query**: it never triggers a fetch on open, and the "cached" timestamp is always shown so a stale entry is never presented as current data.

Clicking a row's "Open" control expands **inline, directly beneath that row** (no navigation away) to show the key fields already staged for that record from **both**:
- the **canvas workspace draft** (the mandatory fields populated during onboarding, §7.2 step 3), and
- the **compliance-screening panel** (§7.9), if a screening has run for that record.

A record with nothing staged locally shows an explicit "nothing cached yet" state rather than a blank or fabricated table — consistent with the no-fabrication principle in §2.1. A secondary control opens the full record back in the chat/canvas view (running the §7.1 dedup-check) for anyone who needs to act on it, not just read it. A persistent control (also the topbar brand mark, §5) returns to the chat/canvas home view.

### 7.12 Portfolio remediation & renewal forecast *(R&C)*
**Trigger:** produced by the **Custodian agent** on its own schedule (a periodic portfolio sweep), not by a live user action; surfaced to R&C in the client.
**Behaviour:** a canvas table forecasting the portfolio's near-term compliance workload — TPAs inside the renewal/expiry window, each with a **risk tier** (High / Medium / Low), **days-to-expiry** (overdue cases highlighted), the **primary remediation trigger**, and **open exceptions / required action items** (e.g. "full KYC refresh," "updated shareholder registry"). This is richer than the §7.7 due-for-renewal list: §7.7 is an on-demand *list* the R&C reviewer pulls; §7.12 is the *scheduled forecast* the Custodian pushes, adding remediation actions and overdue prioritisation on top.
**Read-only / no automated action:** the forecast informs and prioritises; it triggers **no** automated renewal, termination, or write. Like every other view, it consumes the cached registry and shows a freshness indicator — if the underlying cache is stale (the background refresh failed or is overdue) the forecast is labelled **"data may be stale"** rather than presented as current. BU-scoping (§6) applies as in §7.7.
*(Backed by the Custodian agent, `summarise_tpas_due_for_remediation`. The Custodian reads the cache directly and never calls RCTP itself.)*

---

## 8. Multi-process platform & KYC-readiness

**Working name for the combined application: KAI Census.** The end-state is **one host client, several processes, one switcher** — not a separate app per process. TPA (this PRD) is the first process built on the shell; **FM&I KYC** is the second, specified in its own sibling PRD (`Onboarding Host Client - FM&I KYC - Product Requirements Document.md`) that plugs into the shell defined here rather than redefining it. Further processes (e.g. the non-MAS/Non-FM&I KYC process, KYC plan §6 item 4) are expected to follow the same pattern once scoped. Final ownership of the "KAI Census" name/branding is open — see §10.

The upload, citation/provenance display, and canvas patterns above must be **parameterised, not hardcoded to TPA** — driven by a "required documents / property checklist" per process, not by TPA-specific field names baked into the UI. Concretely:

- **Process switcher.** The task-selector (§5) must expose a way to move between processes (e.g. TPA ↔ FM&I KYC) without a full reload of the chat/canvas shell or loss of session state (roster, panel sizes) — this is now an explicit requirement, not just an implied consequence of the task-selector being "workflow-aware."
- **Process-specific canvas view types.** A process may introduce canvas content types TPA never needed (e.g. FM&I KYC's document-checklist and CTC-triage views, and its human-gated customer-email draft) — the shell must render these as first-class canvas content, not bolt them on as one-offs.
- **Per-process cached index, confirmed separate (17 Jul 2026).** The full-page cached index (§7.11) stays **TPA-only** ("Third Parties" page); FM&I KYC gets its own **"KYC Cases"** page (FM&I KYC PRD §7.12) rather than a unified cross-process index. Reason: simpler to build independently, less migration risk while the two record shapes are still diverging. The **roster pane** (§5, a session-scoped "recently worked on" list, a different mechanism from the full-page index) wasn't part of this decision — by default it's reasonable to assume the same per-process split for consistency, but that's an inference, not a confirmed decision; revisit if it comes up.

No KYC-specific screens (document-chase emails, CTC triage) are built as part of *this* PRD — see the sibling FM&I KYC PRD for that process's own journeys, now that its own required-docs checklist work is underway.

---

## 9. Non-functional requirements

- **Security:** the client is the sole, authenticated path to the MCP server (locked topology, per the handover); it never embeds or exposes the server's service-account credentials.
- **Plain-language errors:** denials/failures are explained in user terms ("this field is locked by R&C policy") — no internal error codes or system jargon surfaced to the user.
- **Traceability:** every populated field is traceable to a source document; every action the client displays as "done" corresponds to a real, confirmed server response — never an assumed success.
- **Performance:** document processing shows progress feedback; the client does not appear to hang during multi-document extraction.
- **Accessibility:** target **WCAG 2.1 AA**. Concretely: full keyboard navigation of canvas tables and the field list; the citation/source drawer is a proper modal dialog (focus moved in on open, focus trapped while open, returned on close, closable with `Esc`); chat updates announced via an `aria-live` region; sortable table headers expose `aria-sort`; all state conveyed by colour (confidence, tier, mandatory) is **also** conveyed by text/icon; motion (e.g. stamp/spinner) respects `prefers-reduced-motion`.
- **Data handling:** uploaded documents are used for extraction and, where relevant, attached to the RCTP record as evidence; they are not retained by the client beyond what's needed to complete the task.

---

## 10. Assumptions to confirm

These are noted, not asserted as decided — confirm before committing to a design:
- **Screening-panel visibility to Requesters** *(new in v3 — reverses a v2 decision, confirm before committing):* §7.9's proposed screening panel, including its remediation-recommendation controls, is now shown to Requesters as well as R&C reviewers. Confirm with R&C whether Requester-visible remediation recommendations are acceptable, or whether that action specifically should be re-gated to R&C even though the read view stays shared.
- **Session persistence** *(elevated — treat as a requirement to confirm, not a nice-to-have):* a 30–50-field, multi-document onboarding realistically **cannot be assumed to complete in one sitting**. The default design position is that an in-progress onboarding/renewal is **resumable** (draft persists, documents stay attached); confirm the persistence mechanism and retention window. If resumption is genuinely out of scope, that constraint must be surfaced to the user before they start.
- **Panel-size persistence:** resized pane widths/heights (§5) persist locally for the current user's session/device. Confirm whether this should persist server-side per user (so layout preferences follow them across devices) or stay a local-only convenience.
- **File constraints:** accepted file types and size limits for uploads (PDF, DOCX, scanned images, etc.). Drives the "upload rejected" state (§7.10).
- **Platform surface:** standalone web app only, or also embedded in Teams?
- **Remediation-forecast channel (§7.12):** the Custodian's scheduled forecast shown only in the client, or also pushed via email/Teams?
- **Branding/visual design ownership** — not specified here; this PRD covers structure and behaviour, not visual design. Includes confirming **"KAI Census"** (§8) as the standing name for the combined multi-process application, and what (if anything) "KAI" stands for.
- **Roster pane, cross-process or not (§8):** the full-page index is confirmed per-process (Third Parties vs. KYC Cases); whether the roster pane sidebar follows the same split or ever spans processes was not explicitly decided and is inferred, not confirmed.

---

## 11. Success metrics

- **Time saved:** Requester and reviewer time-to-complete, measured against the baseline the workflow plans call for (not yet captured — see the TPA/KYC fix lists).
- **Adoption:** proportion of onboardings/renewals initiated through the chatbot versus manual entry.
- **Quality:** rate at which pre-filled fields require correction, and citation accuracy in the review pack (ties to the accuracy-eval item in the TPA fix list).

**Instrumentation (so the above are actually measurable, not aspirational).** The client must emit timestamped, anonymised events for at least: task start/complete (per flow) with duration; per-field *edited-after-prefill* (the correction signal); citation opened; low-confidence/blank fields encountered vs confirmed; handoff-to-RCTP reached. Without these events the baseline comparison the plans call for cannot be computed. Event schema and store are a dependency to agree with the platform/analytics owner.

---

## 12. Dependencies

- **MCP server & guardrails** (`DJ RCTP MCP Server - Project Handover.md`) — the client assumes access control, validation, and audit are enforced server-side and does not duplicate them.
- **DJ RCTP entitlements export** — drives what each user's role/BU allows the client to show.
- **AD / Entra SSO** — identity provider for sign-in.
- **Dow Jones RCTP native application** — where submission, approval, activation, and screening adjudication actually happen.

---

## 13. Rollout / phasing

- **MVP:** Find, Onboard, Renew, Status, Review Pack, Exception Report (Requester + R&C).
- **Phase 2:** Due-for-renewal portfolio view, portfolio remediation forecast (§7.12).
- **Future:** KYC functional screens (separate plan, once the required-docs checklist is codified).

---

## 14. Open questions

1. All items in §10 (assumptions to confirm).
2. Exactly how a source citation resolves to a viewable passage — inline snippet, or a jump to the source document itself?
3. Whether the BU/role confirmation (§6) is a one-time-per-session prompt or shown before every write action.
4. Ownership of visual/brand design for the client.
5. **Screening read-back API (gates §7.9's proposed screening panel).** Re-confirm with Dow Jones whether *any* API can return screening/hit data (parties, lists checked, match scores, adverse media) to the client. The handover records "no API"; the appetite for screening visibility (now proposed for both personas, §7.9) is real, so this is worth an explicit re-check. Until answered, the screening panel stays a labelled concept only, and the MVP is confirmation-only.

---

## Appendix A — Feature → task-tool traceability

| User-facing feature                   | Underlying task tool                                                                | Backend reference                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Find / dedup check                    | `tpa_find_third_party`                                                              | Register, "Tools (task layer)"                                                                                          |
| Onboard from documents                | `tpa_onboard_from_documents`                                                        | Register; Handover §D, §D4 (screening tiers)                                                                            |
| Renew from documents                  | `tpa_renew_from_documents`                                                          | Register; Handover Decisions table (Renewal)                                                                            |
| Status check                          | `tpa_record_status`                                                                 | Register                                                                                                                |
| Review pack                           | `tpa_review_pack`                                                                   | Register; TPA plan §2 (citation-only model)                                                                             |
| Exception report                      | `tpa_exception_report`                                                              | Register                                                                                                                |
| Due-for-renewal list                  | `tpa_list_due_for_renewal`                                                          | Register                                                                                                                |
| Portfolio remediation forecast        | *(Custodian agent — scheduled sweep; reads the cache, no user-triggered task tool)* | §7.12; Custodian.md (Prompt 6, `summarise_tpas_due_for_remediation`)                                                    |
| View all third parties (cached index) | *(none — client-side cache only)*                                                   | §7.11; no new backend dependency, reuses records already surfaced via `tpa_find_third_party` and prior session activity |

---

*This is a product requirements document for the host client only. Access control, validation, screening, and audit are specified and enforced in the MCP server (see the handover) — this document does not restate them.*
