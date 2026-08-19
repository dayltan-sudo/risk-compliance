# Onboarding Host Client — FM&I KYC — Product Requirements Document

| | |
|---|---|
| **Owner** | Da'yl Tan, Senior Manager, Risk & Compliance — Keppel |
| **Date** | 17 July 2026 (v1 · v1.1 · v1.2 · v1.3 · v1.4 · v1.5 · v1.6 · v1.7) · 22 July 2026 (v1.8) |
| **Status** | Draft v1.8 — **added the missing honest-handoff message copy for all three write-backs** (§7.2, §7.3, §7.4) and made the Review Pack's field-volume grouping/filter treatment explicit (§7.9) — both surfaced by a Sentinel UX walkthrough that found the agent files and this PRD never actually wrote out chat-pane copy or confirmed TPA PRD §5's grouping guidance applied here, only implied it by "mirrors TPA" framing. No behavioural/data change, same as v1.7. On top of v1.7's restructuring, v1.6's **certifier-eligibility characterization (§7.6) deferred to v2, KIV**, and the checklist/field-level property contracts existing as derived CSVs (§12); remaining open items (§10, §14) are narrower — tool register formalization, authoritative-source sign-off, baseline measurement, several unresolved picklists, branding, and whether the Custodian-equivalent's remediation forecast becomes a real journey (see Appendix A). |
| **Audience** | Product / front-end team building the host client (chatbot) |
| **Sibling document** | [`Sentinel Host Client - Product Requirements Document.md`](../a.%20TPA/Sentinel%20Host%20Client%20-%20Product%20Requirements%20Document.md) — the **TPA PRD**, in the sibling `a. TPA` folder. Read that one first. It defines the host client shell (three-pane layout, identity/role model, product principles, confidence-indicator scale) that this document reuses rather than re-specifies. This PRD only defines what's **different** for the FM&I KYC process. |
| **Related documents** | `KYC Agentic Workflows - MAS and non-MAS - Plan and Fix List.md` (source plan for this PRD's journeys and its fix list) · `DJ RCTP MCP Server - Project Handover.md` (shared guardrail/capability platform, reused as-is) · `TPA Agentic Workflows - Consolidated Handoff (2026-07-15).md` (status of the shared platform this PRD depends on) · `4. Properties/Combined Consolidated Questionnaire Questions.xlsx` (`FM&I` tab — the required-docs checklist and CDD-typing determination logic §7.2–§7.5 are sourced from) · `3. Agentic Workflows/b. FM&I KYC/` — the agent/sub-agent design implementing this PRD's journeys, mirroring `3. Agentic Workflows/a. TPA/`'s four agents, now organized into four subfolders: `Agents/` (`KYC Orchestrator.md`, `KYC DocReviewer.md`, `KYC Custodian.md`, plus `Agents/Deferred (v2)/CTC Reviewer.md`), `Workflows/` (each agent's companion `*.Flows.md` — full diagrams/routing, plus `Workflows/Deferred (v2)/CTC Reviewer - Flows.md`), `State Schema/` (`FM&I KYC - Google ADK State Reference.md`), and `References/` (`FM&I KYC - Output Templates.md` plus the three `KYC Reference - *.csv` property extracts) · *(not yet created)* a KYC MCP Tool Register, the KYC twin of `TPA MCP Tool Register v2.xlsx` |

> **What this document is.** A product requirements document for the **FM&I KYC journeys** of the same host client specified in the TPA PRD. "FM&I KYC" = MAS-regulated Know-Your-Customer (the folder taxonomy under `3. Agentic Workflows/b. FM&I KYC` and `4. Properties/b. FM&I KYC` uses this label; the KYC plan doc calls the same thing "MAS-regulated KYC"). This is **not** a standalone application — it is the second process to run on the same chatbot shell as TPA, per the multi-process platform direction in TPA PRD §8. Where a requirement is identical to TPA's, this document says so and points there rather than duplicating it, so the two PRDs stay consistent as they're edited independently.

> **How to read this alongside the TPA PRD.** If you're starting a fresh session with only one of these two documents, you're missing half the picture. The TPA PRD owns the **shell** (layout, identity, confidence scale, product principles, non-functional baseline) and the **multi-process platform** framing (§8). This PRD owns the **FM&I KYC journeys** that plug into that shell as the second process — new document-chase, CTC triage, and human-gated customer-comms behaviour that TPA never needed. Upload both when working on either.

## Changelog

| Version | Date | Changes |
|---|---|---|
| **v1.8** | 22 Jul 2026 | **Added explicit honest-handoff message copy** for all three write-backs — §7.2 step 6 (`kyc_open_case`), §7.3 (`kyc_submit_cdd_typing`), §7.4 (`kyc_submit_wave2_documents`) — mirroring TPA PRD §7.2 step 6's pattern, which none of this PRD's three write-backs had until now (they only inherited the §2.1 *principle*, never got the actual scripted line). **Made §7.9's field-volume treatment explicit**: a case reaching review carries up to ~39 items across all three stages combined, inside TPA PRD §5's "must not be a flat list" range — grouping + mandatory-only filter now stated directly rather than left to be inferred from "mirrors TPA." Both gaps surfaced by a Sentinel test walkthrough that, for the first time, wrote out actual chat/canvas copy against these files instead of treating every human-in-the-loop step as an abstract confirmation. No behavioural or data change — same posture as v1.7. |
| **v1.7** | 17 Jul 2026 | **Restructured the four live/KIV agent instruction files for length** (`3. Agentic Workflows/b. FM&I KYC/`) — no behavioural change, doc organization only. `KYC Orchestrator.md` (4,096 → 991 words), `KYC DocReviewer.md` (1,803 → 667), `CTC Reviewer.md` (1,369 → 555), `KYC Custodian.md` (994 → 801), `FM&I KYC - Google ADK State Reference.md` (2,059 → 1,002, description prose tightened, no keys dropped). Full flow diagrams/step-by-step routing moved to new companion `<Agent> - Flows.md` files (one per agent); all four Output Archetype worked examples consolidated into a new shared `FM&I KYC - Output Templates.md`. Each main file keeps its core mandate, a compact flow-summary table, and an explicit pointer to its companion doc(s) — nothing was deleted, only relocated. TPA's agent files were explicitly left untouched. |
| **v1.6** | 17 Jul 2026 | **Deferred certifier-eligibility characterization to v2 (KIV)** — the `CTC Reviewer` agent and its handoff/eligibility-flag gate are removed from the live build (`3. Agentic Workflows/b. FM&I KYC/KYC Orchestrator.md`, `KYC DocReviewer.md`, `FM&I KYC - Google ADK State Reference.md`, `KYC Custodian.md` all updated). §7.6's **factual completeness / date / self-certification checks stay in scope**, executed by `KYC DocReviewer` and resolving directly to a `Present`/`Missing`/`Non-CTC` checklist status (§7.5) — only the further "does this certifier's claimed capacity actually qualify" judgment is deferred. A `Non-CTC` item is left for an R&C reviewer to assess manually today, the same posture as the already-deferred §7.7 rectification-email workflow. `CTC Reviewer.md` is kept as the preserved v2 design reference, not deleted. §1, §2.1, §5, §7.2, §7.6, §11, §13, Appendix A updated accordingly. |
| **v1.5** | 17 Jul 2026 | **Extracted three property CSVs directly from the checklist workbook** (`3. Agentic Workflows/b. FM&I KYC/`): `KYC Reference - Document Checklist Properties.csv` (41 properties — every checklist status/remarks field, since document-request questions count as batch-upload properties too, not just baseline identity data), `KYC Reference - Baseline Identity Properties.csv` (18 properties), `KYC Reference - CDD Typing Questionnaire.csv` (38 properties, now with a resolved `Factual`/`Judgment` split — Q1–4 factual, Q5–19 judgment — and Q5/Q11 marked as the only screening-recommendation-eligible questions). Per direction, the checklist CSV's wave-assignment logic is now owned by `KYC Orchestrator.md` (new §5), not `KYC DocReviewer.md` — the Orchestrator computes the wave/tier-scoped item subset and hands it to DocReviewer, rather than DocReviewer self-filtering. Several baseline-identity picklists (Customer Type, Country of Residence, Gender, ID Type, etc.) have no sourced answer list — flagged `LIST_PENDING`, mirroring TPA's own answer-list dependency. §10/§12 updated. |
| **v1.4** | 17 Jul 2026 | **Built the agent/sub-agent orchestration design**, mirroring TPA's four-agent structure (`3. Agentic Workflows/a. TPA/`): `KYC Orchestrator.md` (sole MCP caller, three staged confirmation gates — Wave 1 / CDD typing / Wave 2 — vs. TPA's single gate), `KYC DocReviewer.md` (default first-pass checklist matcher, universal CTC-candidate handoff rather than TPA's complexity-gated handoff), `CTC Reviewer.md` (certifier-eligibility specialist, characterizes but never certifies — deliberately avoiding the verdict-language mistake `Screener.md` flags in its own KIV banner), `KYC Custodian.md` (case-staleness sweep, reframed from TPA Custodian's expiry-based trigger since KYC cases stall rather than expire — new capability, no PRD journey yet, flagged in Appendix A). **Revised Appendix A** to match the agent design's refined MCP tool table (checklist matching and CTC triage are agent-side analysis, not separate MCP tools; `kyc_start_case`+`kyc_request_wave1_documents` collapsed into `kyc_open_case`). |
| **v1.3** | 17 Jul 2026 | **Grounded the document-chase journeys in the real checklist**: `4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab. Replaced the placeholder "base/enhanced" framing with the confirmed structure — **Wave 1** (Q1 + Q2's tier-independent items, sent upfront regardless of tier) and **Wave 2** (tier-dependent: Standard adds Q2's remaining items + Q3 + Q4; Enhanced adds Q5 on top; Simplified gets no Wave 2 at all). Resolved the sub-item nuance where 2.4/2.7 are Standard/Enhanced-only despite sitting under Q2: deferred to Wave 2. §7.3 now cites the actual Simplified/Standard/Enhanced determination rule and names Q5/Q11 as the typing questions the screening-derived recommendation (v1.2) attaches to. §7.5 gets a full item-level table; §7.6 (CTC triage) now cites the sheet's actual certification rules, splitting factual completeness/date/self-cert checks (agent-doable) from certifier-eligibility/translation-adequacy (human judgment). §10/§12/Appendix A updated to reflect the checklist as found, not pending. |
| **v1.2** | 17 Jul 2026 | Folder move: this PRD now lives in `1. Planning & Prototyping/b. FM&I KYC/`, sibling to the TPA PRD in `.../a. TPA/` — link path updated. **Resolved two open questions:** (1) CDD typing (§7.3) gets a lightweight "waiting on screening resolution" status gate, plus one narrow, confirm-required exception to the no-screening-surface rule — a recommended answer surfaced on the typing question when the screener flags a compliance/sanctions hit (§2.1 updated to match); (2) the cached case index (§7.12) is confirmed as its own **"KYC Cases"** page, not unified with TPA's Third Parties page. §4, §10, §14, Appendix A updated accordingly. |
| **v1.1** | 17 Jul 2026 | Confirmed the **Requester** (not R&C) owns the CDD-typing questionnaire (§3, §7.3) and would own sending customer emails if/when that workflow is built. **Deferred §7.7** (rectification email draft/send) out of MVP — not a current priority; the underlying document-checklist detection and CTC triage stay in scope, only the client-native drafting/send tooling moves out (§9, §10, §12, §13, §14, Appendix A updated accordingly). |
| **v1** | 17 Jul 2026 | Initial draft. Derived from the KYC plan's process facts (§4) and fix list (§7), structured to mirror the TPA PRD's sections so the two stay legible as a pair. Everything downstream of the required-docs checklist (§10) is provisional until that checklist is codified — this is deliberately an architecture-and-journeys PRD, not a field-level spec, because the KYC plan itself states "nothing here is built yet." |

---

## 1. Purpose & scope

This PRD specifies the **FM&I KYC (MAS-regulated) journeys** of the Onboarding Host Client — the same chatbot application the TPA PRD specifies, running the same shell, extended with a second, process-specific set of task tools, questionnaires, and canvas views. Working name for the combined, multi-process application: **KAI Sentinel** (see TPA PRD §8; naming/branding ownership still open, TPA PRD §10).

**In scope for this PRD:** the FM&I KYC case journeys — base/enhanced document intake, the document-checklist canvas view, CTC (certified-true-copy) **factual completeness detection** (§7.6 — Present/Missing/Non-CTC; certifier-**eligibility characterization** is deferred to v2, KIV), human-gated customer rectification-email drafting, discrepancy flagging, review pack/exception report for the KYC property set, and case status.

**Out of scope for this PRD** (see §4): the shell itself (TPA PRD), screening-hit resolution/adjudication, CDD-typing decision logic, approval/activation, and **Non-FM&I (non-regulated) KYC** — a distinct, currently unscoped process (KYC plan §6 item 4) that will get its own PRD once scoped, not assumed to mirror this one.

**Sequencing dependency.** Per the KYC plan (§"Sequencing"), this process is the **second wave**, built after the TPA platform establishes the shared guardrail + capability layer. This PRD assumes that platform exists and is functioning as described in the TPA PRD and handover; it does not re-litigate it.

---

## 2. Background & goals

Per the KYC plan §2: the goal is to cut **requester** and **reviewer** time by having an LLM read/interpret documents and pre-fill/draft what it can. The **#1 bottleneck** (KYC plan's stated assessment, not yet measured — see §10) is **checking documents plus the back-and-forth chasing missing or non-CTC documents from the customer**. This is materially different from TPA's bottleneck: it is **customer-facing** (a risk class TPA doesn't carry) and **iterative** — a KYC case realistically involves multiple chase rounds against an external party, not a single upload-then-review pass.

Two consequences for the client that don't exist in the TPA PRD:
- The client must support a **live, multi-round document chase**, not a one-shot upload flow.
- The client **produces outbound, customer-facing communication** (rectification emails) for the first time — everything in TPA stays internal to Keppel until the RCTP handoff.

### 2.1 Product principles

This PRD **inherits the TPA PRD §2.1 principles in full** (review-not-create, no-fabrication on judgment fields, honest handoff, evidence-not-verdicts) — they apply unchanged. It adds the following, specific to FM&I KYC:

- **Human-gated external communications.** Any customer-facing message (a document rectification chase, in particular) is always shown to a human for review/edit **before** it sends — never auto-sent, no exceptions. TPA has no analogue to this because it produces no customer-facing output at all.
- **Certifier eligibility is a regulated judgment, not a factual check.** When a CTC stamp is present, the client extracts *who* certified the document and surfaces it for human review; it never marks eligibility itself. This is the KYC plan's explicit CTC posture (§4): "stamp present → agent extracts who certified it and flags for human review (certifier eligibility under MAS rules is a regulated judgment, not auto-decided)." **Deferred to v2, KIV (17 Jul 2026):** the agent-side certifier-extraction-and-flag step this principle describes is not built in the current agent design (`CTC Reviewer.md` is a preserved v2 reference, not live) — today, a `Non-CTC`-flagged item is simply left for an R&C reviewer to assess manually, outside any agent step. The principle itself still holds for whenever this is built.
- **Screening-hit resolution and results stay out of scope of this client — no proposed panel.** Unlike TPA PRD §7.9 (which keeps a *labelled, proposed* screening-visibility panel on the table pending an API decision), the KYC plan is more definitive here: no API exists, and screening isn't the bottleneck (KYC plan §6 item 2, §5). This client shows no hit data, match scores, lists-checked, or adverse-media content for FM&I KYC cases — not even a "proposed" concept. **One narrow, confirmed exception (17 Jul 2026):** if the screener flags an apparent compliance/sanctions-related hit on the third party or any individual party, the CDD-typing questionnaire (§7.3) surfaces a **recommended answer** to the relevant typing question, visibly highlighted — never silently accepted, always requiring explicit Requester confirmation. This is the existing confidence-indicator + no-fabrication pattern (§2.2) applied to one specific decision point, not a reopening of the broader screening-panel question.
- **No-fabrication extends to document status.** The client must never mark a checklist item **"present"** or **"CTC-satisfied"** without a verifiable source page/stamp. A false "present" *hides* a compliance gap — the KYC plan calls this out as the single most dangerous failure mode for this process (§6 item 2: "a false 'present' ... hides a gap — the dangerous direction"). This is stricter than TPA's blank-judgment-field rule because a wrong document-status verdict is actively misleading, not merely incomplete.

### 2.2 Confidence indicator

Reuses the **TPA PRD §2.2 scale unchanged** (High / Medium / Low, same reviewer-behaviour mapping). One extension: for **document-checklist items** (§7.5), the same scale applies to the present/missing/CTC verdict itself — e.g. "Medium confidence this file satisfies checklist item 4." Per §2.1 above, a **Low**-confidence checklist verdict never resolves to "present" — it resolves to "needs human check," the document-status equivalent of TPA's blank-judgment-field behaviour.

---

## 3. Personas

| Persona | Who | What they do in this client |
|---|---|---|
| **Requester** | Same role as in TPA — first line, initiates the KYC case | Start/find a case, upload or forward customer documents, monitor chase progress, check status, **complete the CDD-typing questionnaire**, and — once that workflow is prioritized (§7.7) — send customer rectification emails |
| **R&C reviewer** | Same allowlist as TPA — second line | Everything a Requester can do, plus: CTC eligibility review (manual today — no agent characterization, deferred to v2 per §7.6), review pack, exception report, discrepancy resolution |
| **Customer** | External counterparty — **not a client user, no login** | Receives rectification emails and is the source of new documents; interacts entirely outside this client (email, or whatever channel is confirmed — §14). Modelled here only as the *recipient* of an outbound flow, not as a persona with client access. |

Role resolution (AD/Entra, server-side) is identical to TPA PRD §3/§6 — not restated here.

---

## 4. Explicitly out of scope

- **The host client shell** — three-pane layout, identity/role model, roster, Third Parties/cases index pattern. See TPA PRD §5, §6, §8.
- **Screening-hit resolution & adjudication** — no API (KYC plan §4, §6 item 2); this PRD's client shows no hit data, match scores, or adjudication surface for FM&I KYC (§2.1), aside from one narrow, confirmed exception — a confirm-required recommended answer in the CDD-typing questionnaire when a hit is flagged (§7.3). Firmer than TPA's stance because the plan has already concluded the broader surface isn't worth building, not merely that it's API-blocked.
- **CDD-typing decision logic** — the *rule* that maps a resolved screening hit + questionnaire answers to Standard vs. Enhanced is server/agent-side (mirrors TPA's server-side validation). The client **captures** the questionnaire and **displays** the resulting type (§7.3); it does not compute the type.
- **Approval, activation** — Dow Jones RCTP native application, same exclusion as TPA PRD §4.
- **Non-FM&I (non-regulated) KYC** — a distinct process (own parties, sequence, required docs per KYC plan §6 item 4); explicitly **not** assumed to mirror this PRD. Gets its own PRD once scoped (KYC plan §7 fix-list item 8).
- **Customer email send/receive mechanics** — the client drafts and gates the send action (§7.7); the underlying mailbox/API integration and how customer replies + new documents re-enter the pipeline are a dependency, not specified here (§14).

---

## 5. Core experience model

This PRD **reuses the TPA PRD §5 three-pane layout, roster pane, and cases-index pattern without modification**. FM&I KYC is reached as a second process via the switcher noted in TPA PRD §8, not via a separate shell.

**New canvas content types** this process introduces (all live in the canvas pane, same as TPA's tables/cards):
- The **document checklist** (§7.5) — item / wave / status / confidence / source citation / mandatory, including the factual Present/Missing/Non-CTC detection (§7.6).
- The **rectification email draft** (§7.7) — editable, human-gated.

*(A dedicated **CTC triage** view — certifier details surfaced for eligibility review — is deferred to v2, KIV; §7.6's factual detection folds into the document checklist above, with no separate eligibility-review canvas today.)*

**Designing for the chase rhythm.** Unlike TPA's flat 30–50-field draft, a KYC case's checklist unlocks in **two waves, with the second wave's exact contents depending on which of three CDD tiers the case resolves to** (confirmed 17 Jul 2026 against the actual checklist source, `4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab — see §7.2–§7.5 for the item-level detail):

- **Wave 1 (upfront, all tiers)** is visible from case start.
- **Wave 2 (post-typing)** stays hidden/locked until CDD typing resolves (§7.3) — and for a **Simplified**-tier case, there is no Wave 2 at all; the case goes straight from Wave 1 to review (§7.9).

The canvas must reflect this explicitly — a locked "Wave 2 (unlocks after CDD typing)" section, its eventual contents dependent on tier, not a flat list that implies everything is requestable from day one. This is this process's analogue of TPA §5's field-volume design guidance.

---

## 6. Identity & role in the UI

Reuses **TPA PRD §6 unchanged** — SSO, role/BU confirmation prompt, BU-scoped visibility. An FM&I KYC case belongs to a Business Unit exactly as a TPA record does, and is scoped by the same user→BU registry.

---

## 7. User journeys

Tool names below are **proposed** — there is no KYC MCP Tool Register yet (§10, §12). They follow the TPA register's `tpa_*` naming convention (`kyc_*`) for consistency, pending confirmation with whoever builds it.

### 7.1 Find / open an existing KYC case — `kyc_find_case` *(proposed)*
Mirrors TPA PRD §7.1: search by company/customer name, show any match (name, reference, stage), offer to continue rather than duplicate.

### 7.2 Start a new FM&I KYC case & Wave 1 document request — `kyc_start_case`, `kyc_request_wave1_documents` *(proposed)*
**Trigger:** "Start KYC for [company]" / no existing case found.
**Name required before proceeding:** same rule as TPA PRD §7.2/§7.3 — a quick-action chip must prompt for the company name rather than silently acting on an assumed one.
**Steps:**
1. **Wave 1** — the tier-independent document set — is requested **upfront, before CDD typing is known** (confirmed 17 Jul 2026, resolving the base/Q2 sub-item question raised while drafting): everything under checklist Q1 (Proof of existence) plus the tier-independent items of Q2 (Proof of authority & control). See §7.5 for the exact item list. Two intake paths likely both apply: (a) if nothing is on hand yet, the client can draft an initial document-request email (human-gated send, §7.7); (b) once documents are available (via whichever channel is confirmed, §14), the Requester uploads them via the same multi-file flow as TPA PRD §7.2 step 1.
2. Uploaded documents run through the document-checking + missing-doc detector (KYC plan §7 fix item 3) against the codified checklist (`4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab, source rows "Simplified Standard Enhanced" — confirmed 17 Jul 2026; see §12).
3. Canvas shows the checklist: item, status (**Present / Missing / Non-CTC**), confidence, source citation — same confidence+citation UI as TPA's field draft, applied to checklist-item verdicts.
4. Items requiring certification run through the factual completeness check automatically (§7.6), resolving directly to Present/Non-CTC — certifier-eligibility characterization is deferred to v2 (KIV); a Non-CTC item today is left for an R&C reviewer to assess manually.
5. Any Missing or Non-CTC item feeds a draft rectification email (§7.7) — never auto-sent.
6. **Explicit handoff message (added 22 Jul 2026, mirroring TPA PRD §7.2 step 6 — no equivalent existed for any of this process's three write-backs until now):** *"Wave 1 is staged in RCTP as [case reference]. It has not been submitted. Any open mandatory items carry forward as outstanding — confirming this draft doesn't require them to be resolved first. CDD Typing is next."* The client never implies Wave 1 is complete just because it's confirmed and staged.

### 7.3 CDD typing — `kyc_capture_cdd_typing` *(proposed)*
**Trigger:** Wave 1 resolved. Screening-hit resolution (which happens entirely outside this client — §4) gates this step; see the status gate below.
**Source (confirmed 17 Jul 2026):** the same workbook's `FM&I` tab, source rows "Type of CDD (RA)", holds the actual determination logic — **Simplified** applies if the answer is Yes to any of that questionnaire's Q1–4 (listed entity, MAS/FATF-equivalent regulated FI, Singapore Government entity, or qualifying pension/superannuation scheme); **Enhanced** applies if Yes to any of Q5–19 (PEP or adverse-media exposure, UBO who is a PEP, source of funds from a PEP, FATF grey/black-list exposure, high-risk jurisdiction, sanctions exposure, high-risk sector, complex ownership, personal asset holding vehicle, unusual business-relations circumstances, nominee/bearer shares, cash-intensive business, shell-company characteristics, or inability to evidence business/financial activity); otherwise **Standard** applies. The client captures the questionnaire; this mapping rule itself runs server-side (§4).
**Status gate (confirmed 17 Jul 2026):** the case status card (§7.10) shows a lightweight, content-free status — **"Waiting on screening resolution"** — while the case sits between Wave 1 completion and a human resolving any name-screening hit elsewhere. CDD typing stays locked until that status clears. No hit data, scores, or match detail ever appears here — purely an unlock gate.
**Behaviour:** the **Requester** completes the CDD-typing questionnaire (same persona who owns the rest of the case, not R&C), submits it, and the client displays the server-determined result (**Simplified**, **Standard**, or **Enhanced**). Resolving to Standard or Enhanced unlocks §7.4; Simplified skips straight to review (§7.9) — there is no Wave 2 for a Simplified-tier case.
**Explicit handoff message (added 22 Jul 2026):** *"CDD Typing is staged in RCTP as [case reference]. Resolved tier: [Simplified/Standard/Enhanced]. It has not been submitted."* For Simplified, add: *"No Wave 2 applies — this case moves straight to review."* For Standard/Enhanced, add: *"Wave 2 is next."*
**Screening-derived recommendation (confirmed 17 Jul 2026 — narrow exception to §2.1's no-screening-surface rule):** if the screener identified an apparent compliance/sanctions-related hit on the third party or any individual party, the questionnaire highlights the relevant typing question — most directly **Q5** (PEP/adverse-media exposure) or **Q11** (sanctions exposure) of the typing questionnaire — with a **recommended answer**, flagged for attention. Per §2.1/§2.2, this is never auto-accepted — the Requester must explicitly confirm it before the questionnaire can submit. No other screening content (parties, lists, scores, adverse media) is shown alongside it.

### 7.4 Wave 2 document chase — `kyc_request_wave2_documents` *(proposed)*
**Trigger:** CDD type resolves to **Standard** or **Enhanced** (§7.3). Not triggered for Simplified.
**Behaviour:** same pattern as §7.2, against the tier-dependent portion of the checklist (§7.5), explicitly labelled **"Wave 2"** in the canvas so a reviewer sees the case's chase history rather than one undifferentiated list. **Wave 2's contents depend on the resolved tier** — Standard gets the Standard/Enhanced-tagged items (checklist Q2's remaining sub-items, plus Q3 and Q4); Enhanced gets all of those plus Q5. A case that resolves to Enhanced does not get a separate third round — everything beyond Wave 1 that applies to Enhanced is requested together, in one Wave 2.
**Explicit handoff message (added 22 Jul 2026):** *"Wave 2 is staged in RCTP as [case reference]. It has not been submitted. Any open items remain outstanding — everything that will be requested for this case has now been asked for; what's left needs the customer, not another wave."*

### 7.5 Document checklist status view
**Behaviour:** canvas table — **Item | Wave | Status | Confidence | Source citation | Mandatory** — covering Wave 1 (+ Wave 2 once unlocked, sized to the resolved tier). Same evidence-not-verdict posture as TPA PRD §7.5: the three-way Present/Missing/Non-CTC status is a factual detection outcome, not a compliance sign-off. Item list, confirmed against the checklist source (17 Jul 2026):

| Wave | Group | Item | Applicable tiers |
|---|---|---|---|
| 1 | Q1 — Proof of existence | 1.1 Certificate of Incorporation/Registration (or equivalent) | All |
| 1 | Q1 | 1.2 Certificate of Incumbency / company or business registration extract | All |
| 1 | Q1 | 1.3 Certificate of Change of Name (where applicable) | All |
| 1 | Q1 | 1.4 Constitution, Memorandum & Articles of Association, LPA, or Trust Deed | All |
| 1 | Q2 — Proof of authority & control | 2.1 Register of Directors (Customer) | All |
| 1 | Q2 | 2.2 Board resolution authorising/appointing persons to act on the Customer's behalf | All |
| 1 | Q2 | 2.3 Board resolution / clauses / power of attorney authorising the Customer to open account, subscribe, or transact | All |
| 1 | Q2 | 2.5 Specimen signature or electronic verification (person acting on behalf) | All |
| 1 | Q2 | 2.6 Government-issued ID (person acting on behalf) | All |
| 2 | Q2 (tier-gated) | 2.4 Government-issued ID for each Connected Party (e.g. Director) | Standard, Enhanced |
| 2 | Q2 (tier-gated) | 2.7 Proof of residential address (person acting on behalf, where not in ID) | Standard, Enhanced |
| 2 | Q3 — Proof of ultimate ownership | 3.1 Register of Shareholders/Members | Standard, Enhanced |
| 2 | Q3 | 3.2 Ownership and control structure | Standard, Enhanced |
| 2 | Q3 | 3.3 AML/CFT + UBO undertaking/declaration | Standard, Enhanced |
| 2 | Q3 | 3.4 Government-issued ID for each UBO with >25% effective shareholding | Standard, Enhanced |
| 2 | Q3 | 3.5 Proof of residential address for each UBO | Standard, Enhanced |
| 2 | Q4 — SOF/SOW of the Customer | 4.1 Source of Funds / Source of Wealth declaration (Customer) | Standard, Enhanced |
| 2 | Q5 — SOF/SOW of the Customer *and* its UBOs | 5.1 Financial statements / management accounts / annual reports or other proof of SOF/SOW (Customer) | Enhanced only |
| 2 | Q5 | 5.2 SOF/SOW declaration for each UBO | Enhanced only |
| 2 | Q5 | 5.3 Financial statements or other proof of SOF/SOW for each UBO | Enhanced only |

*(Item numbering follows the source workbook's own Q#/sub-item scheme for traceability — do not renumber independently.)*

### 7.6 CTC factual completeness detection — *(agent-side, no MCP tool; folds into §7.5's checklist)*
Folds into §7.2 step 4 / §7.4, spec'd separately because it's a distinct decision. The checklist source (`FM&I` tab, "Customer Due Diligence Document Upload" guidance) gives the actual certification rules, which sharpen the factual-vs-judgment split.

**⚠️ Certifier-eligibility characterization and translation-adequacy flagging (the two judgment bullets below) are deferred to v2, KIV (confirmed 17 Jul 2026).** The bullets below describe the full intended design; only the first three (factual, agent-executed today by `KYC DocReviewer`) are in the current build. A `Non-CTC` item today is simply left for an R&C reviewer to assess manually, end to end — there is no agent-surfaced "needs eligibility review" flag or dedicated triage view yet. The `CTC Reviewer` agent that would perform the deferred bullets is kept as a preserved design (`3. Agentic Workflows/b. FM&I KYC/CTC Reviewer.md`) for when this is reprioritized.

- **Factual completeness check (agent can do this with confidence — in scope today):** does the upload show the phrase "certified true copy of the original" (or equivalent), a certifier name, professional capacity + registration number, a date, and a signature/stamp? Missing any of these → **Non-CTC** (a factual gap, high-confidence), folds into the rectification chase (§7.7) — same as no stamp at all.
- **Date check (factual — in scope today):** certification must be dated within the last 6 months at submission, **unless** the customer is existing, was previously assessed low ML/TF/PF risk, and confirms no change — that exception is itself a judgment call, not auto-applied.
- **No-self-certification check (factual — in scope today):** if the extracted certifier name matches the document holder's own name, flag as **Non-CTC** — self-certification is never valid.
- **Certifier eligibility (judgment, never auto-decided — deferred to v2, KIV):** even with a complete, dated, non-self certification, whether the certifier's stated professional capacity actually qualifies under the eligible-certifier list (embassy/consulate/high-commission officer, Commissioner of Oaths, lawyer/notary of a recognised body, judiciary member, accountant or company secretary of a recognised body, or a licensed FI's compliance officer) is a **regulated judgment under MAS rules**, never auto-decided (§2.1). When this is built, the item would be flagged "needs eligibility review" for an R&C reviewer; today, R&C reaches this same judgment manually off the plain `Non-CTC` status, with no agent-extracted certifier detail to assist.
- **Translation (judgment — deferred to v2, KIV):** a foreign-language document critical to AML/CFT measures needs a qualified translation — when built, the agent would flag the language mismatch factually, leaving translation-adequacy itself a human call; today this flag isn't surfaced automatically.

### 7.7 Rectification email draft (human-gated) — `kyc_draft_rectification_email` *(proposed)* — **deferred, not prioritized for v1**
**Status (17 Jul 2026):** confirmed that the Requester is who would send these emails when this workflow is built, but the workflow itself is **not a current priority** — no send-channel integration is being built now. The checklist detection (§7.5) and CTC factual completeness detection (§7.6) that identify *what's* outstanding remain fully in scope; only the client-native drafting/send tooling is deferred. Until this is built, a Requester acts on the checklist manually (composing and sending the chase themselves, outside the client).
**Trigger (when prioritized):** Missing/Non-CTC items exist for the currently open wave.
**Behaviour (when prioritized):** client drafts a customer-facing email listing exactly what's outstanding, sourced from live checklist state — it must never ask for something already marked Present (accuracy matters here specifically: KYC plan §6 item 3 flags that asking for an already-provided document erodes customer trust). The draft opens editable in the chat pane; **sending always requires an explicit human (Requester) confirmation**, no exceptions (§2.1). Once sent, the client states plainly that a customer-facing communication went out (traceability).
**Kept in this PRD** so the concept and its human-gating principle (§2.1) aren't lost when this is revisited — not because it's scheduled.

### 7.8 Discrepancy flagging
**Trigger:** a document contradicts the questionnaire or a registry value.
**Behaviour:** canvas shows the conflicting values side by side with both citations — no auto-resolution, flagged for the reviewer. Same evidence-only posture as TPA's review pack.

### 7.9 Review pack & exception report — `kyc_review_pack`, `kyc_exception_report` *(proposed)* *(R&C)*
Directly mirrors TPA PRD §7.5/§7.6: **Field | Value | Source reference | Confidence | Mandatory?** table and a blank/red-flag/unconfirmed pre-sign-off list — applied to the FM&I KYC property set (`4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab; see §12) instead of TPA's.
**Field-volume treatment also inherits from TPA PRD §5 (confirmed 22 Jul 2026, not previously stated):** a case reaching review carries Wave 1 (9 items) + CDD Typing (19 questions) + Wave 2 (up to 11 items) — up to ~39 items combined, in TPA's own "30–50 fields, must not be a flat list" range. The same treatment applies here: grouped by wave/section, with a mandatory-review-only filter, not one continuous table regardless of case size. This was previously left to be inferred from §7.9's "mirrors TPA" framing alone; stated explicitly now since a flat table is exactly what TPA's §5 guidance exists to prevent.

### 7.10 Case status — `kyc_case_status` *(proposed)*
**Trigger:** "Where is [company]'s KYC?" or from within any other flow.
**Behaviour:** read-only card — case stage (**Wave 1 chase / Waiting on screening resolution / CDD typing / Wave 2 chase / Review / Complete**), resolved CDD tier once known (Simplified/Standard/Enhanced), outstanding item count. Unlike TPA PRD §7.4, this card shows **no** screening-hit content at all (§2.1, §4) beyond the content-free status label itself.

### 7.11 Failure & denial states
Reuses the shared states from **TPA PRD §7.10 verbatim** (write denied — BU/role, identity unverifiable, entitlements stale, RCTP unavailable, upload rejected). Adds, specific to this process:

| State | Trigger | What the user sees |
|---|---|---|
| **Customer email send failed** | Delivery bounce / API error | "Couldn't send to the customer just now — nothing went out. Try again." No partial-send implied. |
| **Document doesn't match any checklist item** | Detector can't classify an uploaded file | Shown unclassified, not silently dropped or force-matched to the nearest item — a human files it manually. Direct application of the §2.1 no-false-present rule. |
| **CDD typing incomplete** | Wave 2 attempted before typing resolved | Wave 2 request blocked with an explanation; Wave 1 stays open. |

### 7.12 View all KYC cases (cached index) — "KYC Cases" page
**Confirmed (17 Jul 2026): a separate, KYC-only page** — not unified with TPA's Third Parties page (TPA PRD §7.11/§8). Reuses that page's pattern (full-page cached index, inline per-record detail, freshness timestamp, brand-mark way back to chat/canvas home) under its own topbar icon, **"KYC Cases"**, with case-specific columns: company/customer, stage, wave (base/enhanced), CDD type once resolved, and days since last customer contact. Filterable by stage and searchable by name/reference, mirroring TPA §7.11's filter/search pattern.

---

## 8. Relationship to the shared platform (KAI Sentinel)

This PRD does not redefine the host client shell — see **TPA PRD §5** (layout) and **TPA PRD §8** (multi-process platform / KYC-readiness, process switcher). FM&I KYC is the **first concrete process to exercise** the parameterised design TPA PRD §8 anticipated ("a future 'process a KYC document set' option can be added without redesigning the chat/canvas shell"): this document's checklist canvas (including its CTC factual-detection status, §7.6) and human-gated email draft are new *view types* the shell must support generically, not TPA-specific ones repurposed.

The combined application's working name, **KAI Sentinel**, and the process-switcher requirement live in the TPA PRD as the shell-owning document; this PRD assumes both and does not restate them.

---

## 9. Non-functional requirements

Reuses **TPA PRD §9 in full** (security, plain-language errors, traceability, performance, accessibility, data handling) — not restated here. Adds, specific to FM&I KYC:

- **Customer-data handling.** Customer-supplied documents are subject to customer-facing data-protection standards (KYC plan §6 item 3 flags this as a new risk class) — which standard applies (e.g. PDPA) is to be confirmed with Legal/Compliance (§14). Applies now, independent of whether §7.7's drafting tool is built.
- **Accuracy bar for auto-drafted customer comms is non-negotiable, if/when §7.7 is built.** Internal chat copy can tolerate minor imprecision; a customer-facing chase email cannot — asking for a document already provided is a trust cost TPA's internal-only UI never risks. Recorded now so this isn't lost when §7.7 is revisited.

---

## 10. Assumptions to confirm

These are open, not decided — this PRD is deliberately architecture-and-journeys level because the KYC plan states nothing is built yet:

- **Required-docs checklist confirmed to exist (17 Jul 2026)** — `4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab, satisfies KYC plan fix-list item 1 in substance; §7.2–§7.5 are now written directly against it, and three derived CSV extracts now exist in `3. Agentic Workflows/b. FM&I KYC/` (checklist properties, baseline identity properties, CDD-typing questionnaire — see §12). Still open: (a) whether this combined workbook is the **authoritative, signed-off** source or a working draft — confirm with whoever owns it; (b) `4. Properties/b. FM&I KYC` (the process-specific subfolder the taxonomy anticipates) is still empty — confirm whether these CSVs should live there instead, or whether `3. Agentic Workflows/b. FM&I KYC/` (their current location, alongside the agents that consume them) is the right home; (c) several `Dropdown with List` baseline-identity fields (Customer Type, Country of Residence, Year of Birth, Gender, ID Type, Registered Country, Fund/Listed Vehicle type) have **no predetermined answer list sourced anywhere in the workbook** — flagged `LIST_PENDING` in the CSV, mirrors TPA's own answer-list dependency on a separate Functional Spec file; needs the same treatment here.
- **Baseline not yet measured** (KYC plan §6 item 1). The stated bottleneck (document chase) should be confirmed with real case data before the chase UI is over-built around it.
- **Customer email send channel/integration** (§7.7) — moot for now; §7.7 is confirmed deferred (17 Jul 2026), not a blocking dependency until it's reprioritized.
- **Non-FM&I KYC stays explicitly out of this PRD's scope** — confirm this document should remain MAS-only rather than trying to generalise now.
- **KYC MCP Tool Register doesn't exist yet** — every tool name in §7/Appendix A here is proposed, not confirmed. Confirm the `kyc_*` naming convention with whoever builds the register.
- **"KAI Sentinel" as the standing name for the combined application** — confirmed as the working name to carry forward (see TPA PRD §8 edit accompanying this PRD); final ownership of branding is still open (TPA PRD §10).

---

## 11. Success metrics

Same measurement posture as TPA PRD §11 (instrumentation required, not aspirational). KYC-specific:
- **Chase-cycle count** per case, and **time-to-complete-documents** — the direct measure of KYC plan §7's baseline item.
- **Rectification-email accuracy** — rate of emails that ask for a document already marked Present (the specific trust-cost risk in §9).
- **CTC factual-detection accuracy** — present/missing/non-CTC classification correctness against a human-reviewed sample (ties to KYC plan §7 fix-list item 7, the accuracy eval). *(Scoped to the factual layer only — certifier-eligibility characterization accuracy isn't measurable yet since that step is deferred to v2, KIV.)*

---

## 12. Dependencies

- **Shared guardrail/capability platform** (TPA build, handover) — reused as-is per KYC plan §3.
- **Required-docs checklist** (KYC plan fix-list item 1) — `4. Properties/Combined Consolidated Questionnaire Questions.xlsx`, `FM&I` tab (confirmed 17 Jul 2026); §7.2–§7.5 are now sourced from it directly. Authoritative-source status still to confirm (§10).
- **Three derived CSV reference files** (17 Jul 2026), in `3. Agentic Workflows/b. FM&I KYC/`: `KYC Reference - Document Checklist Properties.csv` (41 properties, owned by `KYC Orchestrator.md` §5), `KYC Reference - Baseline Identity Properties.csv` (18 properties) and `KYC Reference - CDD Typing Questionnaire.csv` (38 properties, both owned by `KYC DocReviewer.md` §6) — the KYC twin of `TPA Reference - In-Scope Extraction Properties.csv`, generated directly from the checklist workbook above.
- **CDD-typing determination logic** — same workbook, `FM&I` tab, "Type of CDD (RA)" source rows; the actual Simplified/Standard/Enhanced rule §7.3 now cites is server-side logic this client only captures/displays.
- **KYC MCP Tool Register** — not yet created; the KYC twin of `TPA MCP Tool Register v2.xlsx`.
- **AD/Entra SSO, DJ RCTP entitlements export** — reused from TPA PRD §12, no KYC-specific change.

*(Customer email send/receive channel is not listed as a dependency — §7.7 is confirmed deferred, 17 Jul 2026.)*

---

## 13. Rollout / phasing

- **MVP:** Find/open case, base document chase, document checklist view, CTC factual completeness detection (Present/Missing/Non-CTC — §7.6), CDD-typing capture (Requester-filled) + enhanced chase, review pack, exception report, case status.
- **Deferred (confirmed 17 Jul 2026 — not prioritized, revisit later):** the rectification-email draft/send workflow (§7.7), and **certifier-eligibility characterization + translation-adequacy flagging (§7.6, KIV for v2)** — the `CTC Reviewer` agent design is preserved but not built. The checklist and CTC factual-detection that inform both stay in MVP; only the client-native drafting/send tooling and the eligibility-characterization step are deferred, and the Requester/R&C reviewer handle both manually until they're built.
- **Future:** discrepancy-flagging depth, the "KYC Cases" index (§7.12, confirmed as its own page — not unified with TPA's), **Non-FM&I KYC** as its own scoped PRD.

---

## 14. Open questions

1. All items in §10.
2. *(Deferred with §7.6's certifier-eligibility characterization, not urgent)* Does the CTC eligibility decision get recorded anywhere the client should reflect back, analogous to TPA's mandatory-review tagging — revisit only once §7.6's judgment bullets are reprioritized for v2.
3. *(Deferred with §7.7, not urgent)* What system would send/receive the customer-facing emails, and how would customer replies and new document uploads re-enter the pipeline — revisit only once §7.7 is reprioritized.
4. What "KAI" stands for, if anything, and who owns final branding — tie to TPA PRD §10/§14.

---

## Appendix A — Feature → task-tool traceability *(all proposed — no KYC tool register yet, §12)*

**Superseded by the agent design (17 Jul 2026) — table below revised to match.** Building out the agentic/sub-agentic orchestration (`3. Agentic Workflows/b. FM&I KYC/` — `KYC Orchestrator.md`, `KYC DocReviewer.md`, `KYC Custodian.md`; `CTC Reviewer.md` is a preserved v2 design, KIV, not part of the live chain) surfaced that document-checklist matching is **agent-side analysis, not a separate MCP tool** — its output feeds the payload of whichever write commits next, exactly as TPA's DocReviewer/Screener analysis feeds `tpa_onboard_from_documents` rather than calling MCP themselves (see `TPA Orchestrator.md` §6). `kyc_start_case` + `kyc_request_wave1_documents` also collapsed into one composed write tool, matching TPA's one-tool-per-composed-write discipline. Names below now match `KYC Orchestrator.md` §6 exactly.

| User-facing feature | Underlying task tool (proposed) | Notes |
| --- | --- | --- |
| Find / open case | `kyc_find_case` | Mirrors `tpa_find_third_party`; `KYC Orchestrator` Flow A |
| Wave 1 document intake & case opening | `kyc_open_case` | §7.2; composed write — case creation + Wave 1 checklist status + baseline identity fields; `KYC Orchestrator` Flow B |
| CDD typing capture | `kyc_submit_cdd_typing` | §7.3; typing *logic* is server-side (Simplified/Standard/Enhanced rule); surfaces a confirm-required recommended answer on Q5/Q11 when the screener flags a compliance/sanctions hit; `KYC Orchestrator` Flow C |
| Wave 2 document intake | `kyc_submit_wave2_documents` | §7.4; item set depends on resolved tier (Standard vs. Enhanced); not triggered for Simplified; `KYC Orchestrator` Flow D |
| Document checklist view | *(reads case state — no new tool)* | §7.5; drafted by `KYC DocReviewer` |
| CTC factual completeness detection | *(agent-side — `KYC DocReviewer`, no MCP tool)* | §7.6; factual layer only (Present/Missing/Non-CTC), folds into whichever wave's write commits next. Eligibility characterization — was `CTC Reviewer`'s job — is **deferred to v2, KIV**; `CTC Reviewer.md` preserved as a design reference, not invoked. |
| Rectification email draft | *(none — deferred, not prioritized for v1)* | §7.7; see `KYC Orchestrator.md` Flow J (KIV stub) |
| Review pack | `kyc_review_pack` | Mirrors `tpa_review_pack`; `KYC Orchestrator` Flow G |
| Exception report | `kyc_exception_report` | Mirrors `tpa_exception_report`; `KYC Orchestrator` Flow E |
| Case status | `kyc_case_status` | Mirrors `tpa_record_status`; excludes screening state; `KYC Orchestrator` Flow H |
| KYC Cases portfolio view | *(reads cache — no tool call)* | §7.12; `KYC Orchestrator` Flow I |
| Scheduled case-registry refresh | `kyc_list_active_cases` | Background-scheduled, not user-triggered; `KYC Orchestrator` Flow F |

**Open, flagged by the agent design, not yet reflected in §7 above:** `KYC Custodian.md` proposes a scheduled case-staleness/remediation-forecast sweep (mirroring TPA's `Custodian` → PRD §7.12) with **no corresponding journey in this PRD yet**. If that surface should ship, it needs its own §7.13 here, cross-linked the way TPA PRD §7.12 documents `Custodian`. Treat it as agent-layer design ahead of the product surface until then.

---

*This is a product requirements document for the FM&I KYC journeys of the host client only. It assumes the shell, identity model, and product principles defined in the TPA PRD, and the guardrails/validation/audit enforced by the MCP server (handover) — this document does not restate either.*
