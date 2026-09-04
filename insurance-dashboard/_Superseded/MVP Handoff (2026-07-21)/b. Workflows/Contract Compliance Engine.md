# Workflow Specification: Contract Compliance Engine

> **Workflow, MVP.** Deterministic — a threshold comparison plus an override rule, no reasoning boundary. Merges Contract Requirements (FR7) and Insurance Exclusions (FR9) into one engine owning one status field — not two registers that happen to interact. **Companion docs:** state schema — [`../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md). Alert triggers — [`../d.%20Reference/Salus%20Reference%20-%20Alert%20Triggers.md`](../d.%20Reference/Salus%20Reference%20-%20Alert%20Triggers.md).

## 1. Core Mandate & Operational Objectives
You own third-party contractual insurance requirements (FR7) and policy exclusions/sub-limits (FR9) as one merged register with one status field per requirement: `Met` / `At-risk` / `Gap` / `Excluded`. You compare required vs. placed limit, then apply the exclusion cross-check as an override. You do not compute KPIs (Coverage & Ratio Engine) or risk scores (Risk Scoring Engine) — you consume placed-coverage data, you don't derive it.

## 2. State Management
See [`Salus - Google ADK State Reference.md`](../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md) for the full schema. You read `app:policy_registry`; you write `app:contract_requirements_register` and `app:exclusions_register`. Session keys: `computation_inputs`, `computed_snapshot`, `config_version_id`; `temp:conflict_candidates` discarded after turn.

## 3. Deterministic Execution Flow
```
[Entry: salus_evaluate_compliance — placed coverage or exclusion version changed]
                 │
                 ▼
[Node 1: Requirement Comparison] ──► Per requirement: Placed Limit ÷ Required
                                      Limit, by counterparty type (Customer/Tenant,
                                      Lender, JV Partner, Government/Concession)
                 │
                 ▼
[Node 2: Status Classification] ──► Met (≥100%) / At-risk (90–100%, tolerance
                                     configurable, default 10%) / Gap (<90%)
                 │
                 ▼
[Node 3: Exclusion Cross-Check] ──► For each classified requirement, checks
                                     app:exclusions_register for a full exclusion or
                                     material sub-limit on the same asset + coverage
                                     line; writes temp:conflict_candidates
                 │
                 ▼
[Node 4: Excluded Override] ──► Any match from Node 3 overrides the Node 2 status
                                 to Excluded — applied even where the placed limit
                                 numerically satisfies the requirement (FR9.3)
                 │
                 ▼
[Node 5: Snapshot Write] ──► Writes computed_snapshot (status per requirement) to
                              app:contract_requirements_register and
                              app:exclusions_register, tagged config_version_id
```
Trigger: `salus_evaluate_compliance`, sole caller Contract Compliance Engine, precondition placed coverage or exclusion version changed.

## 4. Why Merging Removes a Race Condition
As two separate components — a Contract Requirements register and an independent Exclusion Conflict checker — the system needs strict ordering (exclusions must always evaluate after every requirement recalc, never before or concurrently) and a tie-break rule for who wins if a requirement recalc and an exclusion update land in the same instant with disagreeing verdicts. As one engine with one status field and one execution flow (Node 2 always completes before Node 3 starts, per requirement), that race condition doesn't exist by construction: there is no window where two components hold conflicting views of the same requirement's status, and no tie-break rule to write or maintain. `Excluded` is not a competing status alongside Met/At-risk/Gap — it's a single override step applied after, on the same pass.

## 5. Contract Requirements (FR7.1–FR7.5)
Captures required limit/term, counterparty type, and contractual source (agreement name, clause reference) per requirement (FR7.1–FR7.2). Status classification per Node 2, default At-risk tolerance 10%, configurable. Open gaps and at-risk requirements surface in a dedicated register, filterable by asset, counterparty type, coverage line (FR7.4). Open contractual gaps escalate to the Action Items panel with priority reflecting counterparty type and shortfall size (FR7.5).

## 6. Insurance Exclusions (FR9.1–FR9.6)
Captures exclusions and sub-limits per asset and coverage line — scope (full exclusion vs. sub-limit) and source policy-wording clause (FR9.1). Cross-checked against the requirements register for the same asset and coverage line (FR9.2). Where an exclusion undermines a requirement, that requirement's status becomes `Excluded` — distinct from Met/At-risk/Gap, applied even where the placed limit numerically satisfies the requirement (FR9.3). Exclusion conflicts escalate to the Action Items panel with priority reflecting counterparty type and exposure (FR9.5). The exclusion register itself supports an all / conflicts-only filtered view (FR9.6) — distinct from the requirements register's own gaps-and-at-risk filter (§5).

## 7. Contextual Warnings (FR9.4)
Global Map, Coverage Adequacy, and Risk Hotspots each surface a contextual warning for any asset carrying an `Excluded`-status requirement, linking back to the Insurance Exclusions register. Should/MVP — ships at MVP, but as a warning affordance on those three views rather than a Must-tier blocking control.

## 8. Recalculation Behaviour
Auto-recalc on coverage change (FR7.6) is Should/V2 — at MVP, `salus_evaluate_compliance` is triggered the same way Coverage & Ratio Engine and Risk Scoring Engine are: off Enrichment & Posting's `recalc_trigger_set`, not off an automatic coverage-change listener specific to this engine. Note this matters to §4's race-condition fix: the merge only holds if requirement recalc and exclusion recalc always run in the same triggered pass (Node 2 then Node 3), which is true at MVP because both fire off the same `recalc_trigger_set` event, not two independently-scheduled triggers.

## 9. Snapshot Writing (§10.3, FR2.6)
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every status change is versioned rather than overwritten, tagged to the tolerance-configuration version in effect (§10.3) — this holds regardless of FR2.6's own Should/V2 tag, same as the other two engines. The `computed_snapshot` written at Node 5 is an instance of the formal **KPI / Risk Score Snapshot** entity (`computed_by: Contract Compliance Engine`) — field list: [`Salus - Data Lifecycle & Versioning Reference.md`](../c.%20State/Salus%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md).

## 10. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| Required limit or contractual source missing | Requirement stays in exception queue, excluded from status classification |
| Exclusion and requirement reference mismatched asset/line | No cross-check match; requirement status stands on Node 2 alone |
| Two exclusions conflict with one requirement | Both cited in the `Excluded` note; status still resolves to one value |
| `config_version_id` unresolved (tolerance %) | Recompute deferred; cannot write a snapshot without a bound version |
| `salus_evaluate_compliance` fires mid-Node-3 | Re-entrant run queued, not interleaved — Node 2→3→4 always completes atomically per requirement |

Every write logs to `app:audit_log` (`salus_write_audit`, no exceptions).
