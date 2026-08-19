# FM&I KYC — Google ADK 2.0 State Reference

Consolidated state schema for all four FM&I KYC agents. Each agent file carries a one-line pointer here rather than the full table.

**⚠️ `CTC Reviewer` and its keys are KIV, deferred to v2 (17 Jul 2026).** Three agents are live — `KYC Orchestrator`, `KYC DocReviewer`, `KYC Custodian`. The **CTC Reviewer** section and every key it introduces describe the preserved v2 design only — nothing reads or writes them today. `KYC DocReviewer` no longer writes `session:ctc_candidate_items` either.

**Scope note:** this consolidation applies to FM&I KYC only — TPA agents (`3. Agentic Workflows/a. TPA/`) keep their state schemas inline, per explicit instruction.

---

## Cross-Agent Key Index

| Key | Written By | Read By |
| :--- | :--- | :--- |
| `app:kyc_case_registry` | `KYC Orchestrator` only (sole `kyc_*` MCP caller) | `KYC Orchestrator`, `KYC Custodian` |
| `app:user_bu_registry` | `TPA Orchestrator` (shared platform key) | `KYC Orchestrator` |
| `app:certification_rules` | Not written by any agent — static regulatory reference | *(none live — v2 design only)* |
| `app:inflight_kyc_drafts` | `KYC Orchestrator` | `KYC Orchestrator` |
| `user:kyc_orchestration_rules` | — (configured) | `KYC Orchestrator` |
| `user:kyc_ingestion_rules` | — (configured) | `KYC DocReviewer` |
| `user:reviewer_override_config` | — (configured) | *(none live — v2 design only)* |
| `user:kyc_custodian_preferences` | — (configured) | `KYC Custodian` |
| `[no prefix]` session keys | `KYC Orchestrator`, `KYC DocReviewer` | Per handoff chain |
| `temp:*` keys | Computing agent | Same agent, same turn |

**Exclusions:** `KYC DocReviewer` holds no key for `app:kyc_case_registry`/`app:certification_rules`. Neither it nor `KYC Custodian` calls `kyc_*` MCP.

---

## KYC Orchestrator — State Schema

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:kyc_case_registry` | Application, persistent — cached, synced from Dow Jones RCTP | Master cached DB of open/completed cases. You're the sole agent authorized to call `kyc_*` MCP APIs that populate/refresh it (Flows A, B/D, C, F). Others (e.g. `KYC Custodian`) may read directly. Separate cache from TPA's `app:portfolio_registry`. |
| `app:user_bu_registry` | Application — reused verbatim from TPA | Maps users to permitted BU(s). Consumed by Flow I; you read it, don't maintain a copy. |
| `app:certification_rules` | Application, persistent — static regulatory reference | *(KIV, deferred to v2.)* Eligible-certifier taxonomy `CTC Reviewer` would cross-reference against. |
| `app:inflight_kyc_drafts` | Application, persistent, retention-windowed | Resumable store for in-progress Wave 1/CDD-typing/Wave 2 drafts. Check on (re)entry to any flow; offer to resume. Cleared at each write-back commit. **Not readable by `KYC Custodian`** (accepted gap, 22 Jul 2026 — see `KYC Custodian.md`'s banner) — a case abandoned before its first confirmation never reaches `app:kyc_case_registry` and is invisible to any staleness sweep. |
| `user:kyc_orchestration_rules` | User, persistent | Executive reporting templates and escalation pathways. |
| `[no prefix]` | Session | `orchestrator_state`, `case_resolution_result`, `historical_case_profile`, `wave1_checklist_draft`/`cdd_typing_draft`/`wave2_checklist_draft` (unconfirmed), `screening_status_gate` (`PENDING`/`CLEARED`), `wave1_confirmation_status`/`cdd_typing_confirmation_status`/`wave2_confirmation_status`, `confirmed_wave1_checklist`/`confirmed_cdd_typing`/`confirmed_wave2_checklist` (only payloads passed to an MCP tool), `resolved_cdd_tier`, `staged_case_id`. *(`ctc_review_queue` KIV/deferred.)* |
| `temp:consolidated_report` | Temporary, discarded after turn | Raw multi-agent payloads before consolidation into the case report. |

**Screening Gate — a structural difference from TPA.** `screening_status_gate` has no MCP-driven source: resolution happens entirely outside this system. You set it `CLEARED` only on explicit human signal, never a tool call. Until then, CDD typing stays locked and status shows "Waiting on screening resolution" — no hit data ever populates this key, except the narrow recommended-answer-flag exception.

### Process Synchronization & State Convergence
Three staged convergence checkpoints, since a case commits to RCTP at three separate points:

$$\text{Wave 1 Convergence} = \left( \text{confirmed\_wave1\_checklist} \neq \emptyset \right) \land \left( \text{wave1\_confirmation\_status} = \text{CONFIRMED} \right) \land \left( \text{staged\_case\_id} \neq \emptyset \right)$$

$$\text{CDD Typing Convergence} = \left( \text{screening\_status\_gate} = \text{CLEARED} \right) \land \left( \text{confirmed\_cdd\_typing} \neq \emptyset \right) \land \left( \text{cdd\_typing\_confirmation\_status} = \text{CONFIRMED} \right) \land \left( \text{resolved\_cdd\_tier} \neq \emptyset \right)$$

$$\text{Wave 2 Convergence} = \left( \text{confirmed\_wave2\_checklist} \neq \emptyset \right) \land \left( \text{wave2\_confirmation\_status} = \text{CONFIRMED} \right) \quad \textit{— if } \text{resolved\_cdd\_tier} \neq \text{Simplified}$$

$$\text{Case Complete} = \text{Wave 1 Convergence} \land \text{CDD Typing Convergence} \land \left( \left[ \text{resolved\_cdd\_tier} = \text{Simplified} \right] \lor \text{Wave 2 Convergence} \right)$$

Don't present a case as further along than its convergence state: a populated draft alone isn't sufficient; a `CONFIRMED` status isn't sufficient without `resolved_cdd_tier` set. A `Simplified` case is **Case Complete** the moment CDD Typing Convergence is met — don't wait for a Wave 2 that will never trigger.

---

## KYC DocReviewer — State Schema

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `user:kyc_ingestion_rules` | User, persistent | Document-requirement config, identity-matching thresholds. Not mandatory-ness — that's the checklist's `R'd` column. |
| `[no prefix]` | Session | `wave1_checklist_draft`, `cdd_typing_draft`, `wave2_checklist_draft`, `case_historical_profile`. *(`ctc_candidate_items` KIV/deferred — no longer written.)* |
| `temp:delta_changes` | Temporary, discarded after turn | Comparison arrays for a reopened case, against `case_historical_profile`. |

No key for `app:kyc_case_registry`/`app:certification_rules` — Orchestrator hands you case history directly.

---

## CTC Reviewer — State Schema

**⚠️ KIV, deferred to v2 — not live.** Every key below is preserved v2 design only.

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:certification_rules` | Application, persistent — static regulatory reference | Eligible-certifier taxonomy, certification-format rules, 6-month validity window + exception, no-self-certification rule — from the `FM&I` tab's CDD upload guidance. Read-only. |
| `user:reviewer_override_config` | User, persistent | Reviewer's judgment notes, threshold adjustments, format preferences. |
| `[no prefix]` | Session | `ctc_items_under_review`, `certifier_extraction_results`. |
| `temp:ctc_extraction_raw` | Temporary, discarded after turn | Raw stamp extraction before structuring. |

---

## KYC Custodian — State Schema

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:kyc_case_registry` | Application, persistent — cached, synced by `KYC Orchestrator`'s Flow F | Same cache as the Orchestrator section above; read directly, never MCP. |
| `user:kyc_custodian_preferences` | User, persistent | Active filters, staleness thresholds, reporting templates. |
| `[no prefix]` | Session | Conversational facts, audit targets, intermediate checks. |
| `temp:delta_changes` | Temporary, discarded after turn | Days-since-last-contact deltas, wave-dwell-time calculations. |
| `temp:remediation_target_list` | Temporary, discarded after turn | Cases past the Node 2 staleness filter, with Node 3 risk tier. |
