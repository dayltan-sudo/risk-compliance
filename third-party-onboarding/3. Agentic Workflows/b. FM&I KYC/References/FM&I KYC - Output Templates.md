# FM&I KYC — Output Templates (Example Response Structures)

Consolidated worked examples for all four FM&I KYC agents, extracted out of each agent's own `Output Archetype` section. Each agent file carries a one-line pointer into its section here rather than the full example — the structural rules (which sections reproduce vs. cite, column shapes, no-verdict discipline) live with the example since they're best understood against a concrete filled-in report, not abstracted into prose.

---

## KYC Orchestrator

Structure the consolidated case report so a Requester or R&C reviewer reads **this one report** and has everything — mirroring `TPA Orchestrator.md` §5's discipline: Sections 1–4 are the consolidated case record (reproduce in full); Sections 6–8 are this step's own synthesis (cite the source, don't restate); Section 5 is a short pointer into 6–8.

### [FM&I KYC CASE REVIEW]
*   **Orchestration Ref:** `ORCH-KYC-40217`
*   **Review Generated:** `{current_time}`
*   **Case Stage:** `WAVE_2_CONFIRMED` *(or whichever stage — see `KYC Orchestrator.md` Flow H's stage vocabulary)*
*   **Resolved CDD Tier:** `Standard`

---

#### SECTION 1: CASE INFORMATION SUMMARY
*(Source: confirmed Wave 1 baseline fields. Core identity only — the full checklist ledger is Section 4.)*

| Field | Value |
| :--- | :--- |
| Legal/Customer Name | *(value)* |
| Third Party Legal Structure | Entity / Person |
| Customer Type | *(picklist value)* |
| Registered Country / Country of Residence | *(value)* |

*   **Case Resolution:** `MATCH_FOUND` / `NEW_CASE` (Flow A outcome).

#### SECTION 2: DOCUMENTS REVIEWED
*(Grouped by wave, built from the citations already attached to each checklist item — not a re-parse.)*

| Document Name | Wave | Checklist Item(s) Satisfied | Confidence |
| :--- | :--- | :--- | :--- |
| *Certificate of Incorporation* | 1 | 1.1 | High |
| *Register of Shareholders* | 2 | 3.1 | High |

#### SECTION 3: CDD TYPING SUMMARY
*(Source: `confirmed_cdd_typing`, `resolved_cdd_tier`. No screening-hit content.)*
*   **Screening Gate:** `CLEARED` (human-confirmed resolution outside this system).
*   **Resolved Tier:** `Standard` — basis: Yes to none of Q1–4 (not Simplified-eligible), Yes to none of Q5–19 (not Enhanced-triggering).
*   **Recommended-Answer Flags:** *(if any)* Q5 (PEP exposure) — recommended `Yes`, confirmed by Requester on `{date}`. *(State plainly if none arose.)*

#### SECTION 4: CHECKLIST LEDGER
Every checklist item across all waves reached so far, reproduced in full — this is the record, not a summary of it. **Grouped by wave, then by item group within each wave — never one continuous table** (per TPA PRD §5's field-volume guidance, explicitly cited by FM&I KYC PRD §7.9: a case reaching review carries up to ~39 items across Wave 1 + CDD Typing + Wave 2 combined, squarely inside the range that guidance exists to prevent from flattening). A **mandatory-review only** filter view collapses to the `Mandatory: Yes` rows across all groups, for a reviewer who wants the risk-relevant subset first; the grouped tables below still list every item, since this is the record, not a summary of it.

**Wave 1 — Q1 Proof of Existence**
| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 Certificate of Incorporation | Present | High | p.1, Cert. of Inc. | Yes |
| ... | | | | |

**Wave 1 — Q2 Proof of Authority & Control (tier-independent)**
| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 2.3 Board resolution/POA | Missing | — | — | Yes |
| ... | | | | |

**Wave 2 — Q2 tier-gated / Q3 Proof of Ultimate Ownership / Q4 SOF/SOW (Standard, Enhanced)**
| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 2.4 Gov ID (Connected Party) | Non-CTC | High | p.2, NRIC copy | Yes |
| ... | | | | |

**Wave 2 — Q5 SOF/SOW of UBOs (Enhanced only)**
| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| ... | | | | |

*(Omit a group's table entirely if that wave/tier hasn't been reached yet — e.g. a Wave-1-only case shows no Wave 2 groups. List every item reached within a shown group, blank/Missing rows included — never truncate within a group. No CTC Eligibility Flag column — eligibility characterization is KIV, deferred to v2; a `Non-CTC` item is left for an R&C reviewer to assess manually.)*

---

#### SECTION 5: KEY FLAGS (At a Glance)
*   ⚠️ 2.4 Non-CTC — certification dated >6mo, no low-risk-existing-customer exception on file — Section 4.

#### SECTION 6: RISK DOMAIN TIERING
| Domain | Status | Finding | Priority |
| :--- | :--- | :--- | :--- |
| Document Completeness | 🟡 | 2 of 14 Wave 2 items outstanding — see Section 4 | MEDIUM |
| Certification Integrity | 🟠 | 1 item Non-CTC — factual completeness gap; no eligibility characterization in this build (KIV v2) | HIGH |
| CDD Type Appropriateness | 🟢 | Tier resolution basis clean, no ambiguous typing answers | LOW |
| Customer Responsiveness | 🟡 | 2 chase rounds so far, within normal range | MEDIUM |

**Overall Risk Tier:** `MEDIUM` — basis in 1–3 sentences.

#### SECTION 7: DECISION & CONDITIONS
*   **Decision:** `CONDITIONAL — Wave 2 outstanding items`.
*   **Conditions:** `Condition | Owner | Deadline` table.

#### SECTION 8: ESCALATION PATH & NEXT REVIEW
*   Escalation path and next review date, same shape as TPA's Section 8.

---

## KYC DocReviewer

### [KYC INGESTION & CHECKLIST REPORT]
*   **Processing Type:** `WAVE_1_INTAKE` *(or `CDD_TYPING_DRAFT` / `WAVE_2_INTAKE`, as resolved and handed to you by the Orchestrator)*
*   **Processing Date:** `{current_time}`
*   **Record Status:** `DRAFT — PENDING HUMAN CONFIRMATION` *(nothing below is written to RCTP until the Confirmation Gate resolves to `CONFIRMED`)*

#### 1. Checklist Status (Wave 1)
| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 Certificate of Incorporation | Present | High | p.1, Cert. of Inc. | Yes |
| 2.2 Board Resolution (persons acting on behalf) | Missing | — | — | Yes — **MISSING** |
| 2.6 Gov ID (person acting on behalf) | Present, plausible CTC | Medium | p.3, NRIC copy (certified) | Yes |

#### 2. Gap Analysis
*   [ ] **Missing Item:** 2.2 Board Resolution — not present in the current bundle.

*Action Required: Prompt coordinator to request missing documentation before advancing this wave.*

---

## CTC Reviewer *(KIV — v2 design reference only, see `CTC Reviewer.md`'s banner)*

**Scope discipline:** this report is a technical input consumed by `KYC Orchestrator`'s own consolidated case report — it is not itself the executive deliverable a Requester or R&C reviewer reads end-to-end. Do not restate the checklist item's own document-presence status (`Present`/`Missing`/`Non-CTC`) — that's `KYC DocReviewer`'s territory; this report starts from "a plausible certification exists" and adds only the eligibility characterization on top.

### [CTC ELIGIBILITY CHARACTERIZATION REPORT]
*   **Case Ref:** `{session:staged_case_id}` *(or "pre-commit" if Wave 1 hasn't written yet)*
*   **Evaluation Timestamp:** `{current_time}`
*   **Items Reviewed:** 2

#### Item 2.6 — Government-Issued ID (person acting on behalf)
*   **Certifier (as extracted):** *Jane Tan Wei Ling*
*   **Claimed Capacity:** "Notary Public, Law Society of Singapore, Reg. No. 4471"
*   **Certification Date:** `12 Feb 2026` — within 6 months of submission. ✅ factual layer (confirmed by `KYC DocReviewer`, not re-checked here).
*   **Self-Certification Check:** Certifier name does not match document holder name. ✅ (confirmed by `KYC DocReviewer`).
*   **Eligible-Category Cross-Reference:** **Plausible match** — "Notary Public" corresponds to the "lawyer or notary public who is a member of a recognised professional body" category. **Needs R&C confirmation** — this agent has not verified registration number `4471` against the Law Society's actual register.
*   **Translation Flag:** Not applicable — document is in English.

#### Item 3.4 — UBO Government-Issued ID
*   **Certifier (as extracted):** *[signature illegible]*
*   **Claimed Capacity:** "Company Secretary" — professional body not stated.
*   **Eligible-Category Cross-Reference:** **Ambiguous** — capacity claimed corresponds to an eligible category in principle, but no professional body / registration number is legible to confirm membership. **Flag for R&C: request a legible re-scan or the certifier's registration detail.**
*   **Translation Flag:** Not applicable.

---

#### Summary
2 items characterized. 1 plausible match (pending R&C confirmation), 1 ambiguous (missing professional-body detail — re-scan recommended). **No item in this report is eligible-certified by this agent** — every row above requires an explicit R&C decision before the underlying checklist item can be treated as CTC-satisfied.

---

## KYC Custodian

**Scope discipline:** `app:kyc_case_registry` already holds each listed case's full checklist ledger and CDD-typing summary — `KYC Orchestrator`'s own consolidated report. This sweep adds only what's specific to *this* pass: which cases are stalling, why, and what's changed. Do not re-summarize a case's checklist or CDD-typing detail here — `Case Name` and `Case ID` are lookup keys, not an invitation to restate the record behind them. `Risk Tier` in this table is your own Node 3 staleness-specific classification — a distinct, freshly-computed value, not the case's onboarding-time or Orchestrator-report tier carried forward unchanged; if it differs, say so explicitly.

### [FM&I KYC CASE PORTFOLIO AUDIT: STALLED CASE & REMEDIATION FORECAST]
*   **Audit Reference:** `AUDIT-KYC-Y26-Q3`
*   **Execution Time:** `{current_time}`
*   **Evaluation Scope:** Cases exceeding configured staleness thresholds
*   **Data Freshness:** `CACHE FRESH` (last refreshed by `KYC Orchestrator` Flow F at `{cache_refresh_timestamp}`) *(reads `DATA MAY BE STALE` instead if `CACHE_STALE` is set)*

| Case Name | Case ID | Risk Tier (this sweep) | Resolved CDD Tier | Days Stalled | Current Gate | Primary Remediation Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *Example Fund Pte Ltd* | `KYC-4471` | `HIGH` | Enhanced | 23 | Wave 2 | Stalled at screening-resolution gate — no human confirmation of clearance yet |
| *Alpha Capital Partners* | `KYC-5502` | `MEDIUM` | Standard | 16 | Wave 1 | Board Resolution (2.2) not yet received |

#### Strategic Remediation Directives:
1.  **Immediate Focus (Critical):** `KYC-4471` — screening resolution has been pending 23 days; escalate to R&C to confirm resolution occurred outside this system so `screening_status_gate` can clear.
2.  **Information Delta Requests:** `KYC-5502` requires a follow-up chase for the outstanding Board Resolution — Requester to action manually per the deferred §7.7 correspondence workflow (see `KYC Orchestrator.md` Flow J).
