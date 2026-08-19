# System Instruction: CoverageAnalyst

> **Deterministic, MVP (Config Change-Control Should/V2). No LLM in the loop, no judgement calls (§02)** — each function is a pure function of its inputs and the current config version, or (Config Change-Control) a fixed approval state machine. Four functions: three computation engines sharing a config-version dependency and snapshot-writing discipline, plus the governance workflow that gates them.
>
> **Companion docs:** KPI formulas — [`../d.%20Reference/Atlas%20Reference%20-%20KPI%20Formulas.md`](../d.%20Reference/Atlas%20Reference%20-%20KPI%20Formulas.md). Risk score drivers — [`../d.%20Reference/Atlas%20Reference%20-%20Risk%20Score%20Drivers.md`](../d.%20Reference/Atlas%20Reference%20-%20Risk%20Score%20Drivers.md). Alert triggers — [`../d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md`](../d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Upstream — [`Insurance DocAnalyst.md`](Insurance%20DocAnalyst.md). Read by — [`Atlas Orchestrator.md`](Atlas%20Orchestrator.md), [`InsuranceCustodian.md`](InsuranceCustodian.md).

## 1. Core Mandate & Operational Objectives
1. **Coverage & Ratio (§4)** — computes every KPI in §7.1–7.8 from posted policy, asset, premium, and claims data (FR2.1). Judgement-free: same inputs + `config_version_id` → same `computed_snapshot`.
2. **Risk Scoring (§5)** — computes the composite 0–100 risk score per country, site, entity, and BU (FR4.1); driver breakdown is the output, not an add-on (FR4.4).
3. **Contract Compliance (§6)** — owns third-party contractual insurance requirements (FR7) and policy exclusions/sub-limits (FR9) as one merged register with one status field: `Met` / `At-risk` / `Gap` / `Excluded`.
4. **Config Change-Control (§3)** — sole path by which KPI thresholds (FR2.5), risk-score weights (FR4.5), and risk-appetite thresholds change. Computes nothing itself; makes every change reviewable, dated, non-destructive.

Coverage & Ratio is a pure function of `app:policy_registry` + `app:fx_rates`; Risk Scoring composes Coverage & Ratio's KPI output with external risk indices and news signals; Contract Compliance consumes placed-coverage and validated required-limit data without deriving either.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema.

**Reads (shared):** `app:config_versions`. **Reads (per function):** Coverage & Ratio — `app:policy_registry`, `app:fx_rates`. Risk Scoring — `app:kpi_snapshot_store`, `app:risk_indices`, `app:news_signals` (optional). Contract Compliance — `app:policy_registry`, `app:contract_requirement_inputs` (Insurance DocAnalyst §11a, all four counterparty types).

**Writes (shared):** `app:kpi_snapshot_store`. **Writes (per function):** Contract Compliance also writes `app:contract_requirements_register` and `app:exclusions_register`. Config Change-Control is the **sole writer** of `app:config_versions`.

**Session keys (shared pattern, one instance per engine):** `computation_inputs`, `computed_snapshot`, `config_version_id`. **Temp keys:** `temp:driver_breakdown` (Risk Scoring), `temp:conflict_candidates` (Contract Compliance).

## 3. Config Change-Control (FR2.5, FR4.5 — Should/V2)
Propose → review → approve → version, gating changes to KPI thresholds, risk-score weights, and risk-appetite thresholds.

**The critical rule (§10.3):** historical KPI and risk-score values retain the weights/thresholds in effect when calculated. Enforced structurally: each engine's Snapshot Convergence (§4, §5, §6) requires a bound `config_version_id`, immutable once written — a new config version only becomes available for the *next* recompute.

### Flow A: Propose → Review → Approve → Version
```
[Entry: atlas_propose_config_change — threshold/weight/appetite edit]
                 │
                 ▼
[Node 1: Propose] ──► Rationale logged against the proposed change
                 │
                 ▼
[Node 2: Review] ──► Named owner reviews (owner TBC, §18 PRD)
                 │
                 ▼
[Node 3: Approve] ──► Approval captured in app:audit_log via atlas_write_audit
                 │
                 ▼
[Node 4: Version] ──► New dated config version written to
                       app:config_versions; prior version retained,
                       never overwritten
                 │
                 ▼
[Output: config_version_id] ──► Available to Coverage & Ratio, Risk Scoring,
                                 and Contract Compliance on their next
                                 scheduled or triggered recompute
```
Trigger: `atlas_propose_config_change`, sole caller this agent, precondition proposer holds `C` (Configure) per §4.2.

**Review cadence.** Annual at minimum, or earlier on a material risk-environment change — a scheduled re-entry into Node 2, not a new proposal type.

**Configuration Version entity.** `app:config_versions` backs it.

| Field | Type | Description |
| :--- | :--- | :--- |
| `version_id` | ID (PK) | Unique identifier |
| `effective_from` | Date | When this version became live |
| `superseded_by` | Reference (nullable) | The next version, once one exists — this version is never deleted |
| `rationale` | Text | Logged justification for the change (§10.3) |
| `approved_by` | Reference | Named reviewer/owner who approved it (owner still TBC, §18) |
| `threshold_set` | Structured | The actual KPI thresholds / risk-score weights / risk-appetite values this version carries |

Storage: append-on-change; current version has no `superseded_by` set.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Proposer lacks `C` (Configure) permission | Rejected outright, not queued; §4.2 access denial |
| Review owner not yet assigned (org gap, not system fault) | Proposal sits at Node 2 indefinitely; visible as "awaiting review owner", not silently dropped |
| Approval attempted without logged rationale | Blocked — rationale is mandatory input at Node 1, not optional metadata |
| Version conflict (two proposals on the same threshold concurrently) | Second approval creates the next sequential version; does not merge or silently supersede the first mid-review |
| Engine attempts a recompute with no `config_version_id` resolved | Recompute blocked — Snapshot Convergence cannot be met; engine falls back to last-known version |

## 4. Coverage & Ratio Engine
You do not decide what a value *means* for risk or compliance — Risk Scoring and Contract Compliance consume this output.

### Flow B: KPI Computation
```
[Entry: recalc_trigger_set from Insurance DocAnalyst (Flow H),
        or scheduled recompute]
                 │
                 ▼
[Node 1: Input Assembly] ──► Reads app:policy_registry; resolves FX rate for each
                              monetary value from app:fx_rates as of computation date
                 │
                 ▼
[Node 2: FX Normalisation] ──► Converts to [SGD]; retains original currency
                                alongside the normalised value
                 │
                 ▼
[Node 3: KPI Computation] ──► Applies §7.1–7.8 formulas — see KPI Formulas
                                reference; never restated here
                 │
                 ▼
[Node 4: Lineage Assembly] ──► Binds inputs, formula id, FX rate, timestamp to
                                each value (FR2.4)
                 │
                 ▼
[Node 5: Snapshot Write] ──► Writes computed_snapshot to app:kpi_snapshot_store,
                              tagged config_version_id + as_of_date
```
Trigger: `atlas_compute_kpis`, sole caller this agent, precondition Posting Convergence (Insurance DocAnalyst §6a) or scheduled recompute.

**Recalculation.** Automatic on underlying data change (FR2.3, Must/MVP) — Insurance DocAnalyst's `recalc_trigger_set` is the trigger; no manual-only path at MVP.

**Snapshot writing (§10.3, FR2.6).**
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every `atlas_compute_kpis` run writes a `computed_snapshot` row keyed to the current `config_version_id`, not a mutated "latest" figure — a later threshold change must never rewrite what a KPI *was*.

**Configurable thresholds (FR2.5, Should/V2).** Post-MVP, thresholds are configurable via §3. At MVP, thresholds are the fixed defaults in the KPI Formulas reference.

**Lineage (FR2.1–FR2.4).** Every KPI value carries: inputs, formula id, FX rate + rate date, computation timestamp. `atlas_get_lineage` (callers: Atlas Orchestrator, InsuranceCustodian) reads this off `app:kpi_snapshot_store` — this function doesn't serve lineage queries itself.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| FX rate missing for value date | Computation blocked for affected KPIs; exception logged, prior snapshot stands |
| Mandatory field unconfirmed | Excluded from computation per the validation gate (§9.1); KPI reflects confirmed data only |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Recalc trigger storm (bulk posting) | Batched, not dropped — every affected KPI still recomputes, no silent skip |
| Formula/input mismatch (schema drift) | Computation fails closed; flagged for alert dispatch (Orchestrator §11), no partial snapshot written |

## 5. Risk Scoring Engine
You compute the composite score only — the KPI drivers you consume are §4's.

### Flow C: Risk Score Computation
```
[Entry: recalc_trigger_set from Insurance DocAnalyst (Flow H),
        or scheduled recompute]
                 │
                 ▼
[Node 1: Driver Assembly] ──► Five drivers from app:kpi_snapshot_store (§4's
                               own output); three from app:risk_indices
                               (nat-cat, political/country risk) and app:news_signals
                               (emerging-risk signal, optional)
                 │
                 ▼
[Node 2: Sub-Score Normalisation] ──► Each driver mapped to a 0–100 sub-score via
                                       its defined band — see Risk Score Drivers ref
                 │
                 ▼
[Node 3: Weighted Sum] ──► Composite = Σ(sub-score × weight); weights from the
                            resolved config_version_id
                 │
                 ▼
[Node 4: Banding] ──► Low 0–39 / Medium 40–69 / High 70–84 / Critical 85–100
                       (thresholds configurable)
                 │
                 ▼
[Node 5: Driver Breakdown] ──► Writes temp:driver_breakdown — each driver's
                                sub-score, weight, and contribution to the total
                 │
                 ▼
[Node 6: Snapshot Write] ──► Writes computed_snapshot to app:kpi_snapshot_store,
                              tagged config_version_id + as_of_date
```
Trigger: `atlas_compute_risk_score`, sole caller this agent, precondition KPI drivers current and `config_version_id` resolved.

**Driver set (FR4.4, §10).** Full table: [`Atlas Reference - Risk Score Drivers.md`](../d.%20Reference/Atlas%20Reference%20-%20Risk%20Score%20Drivers.md). Five of eight drivers are §4's own KPIs, read from `app:kpi_snapshot_store` rather than recomputed. Nat-cat exposure, political/country risk, and the emerging-risk signal are external, separately-sourced.

**Recalculation.** Automatic on underlying data change (Must/MVP). Recompute on weight change (FR4.5) is Should/V2 — at MVP a weight change applies from the next data-driven recompute onward.

**Snapshot writing (§10.3, FR2.6).**
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every recompute writes a dated snapshot tagged to the weight-configuration version that produced it — a later reweight must never rewrite what a score *was*.

**Outputs (§10.2).** Ranked "Top exposures" table, a geographic heat map, and the per-row driver breakdown — all read off the same `computed_snapshot`.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Driver KPI unconfirmed/excluded | That driver's sub-score treated as missing, not zero; flagged in driver breakdown |
| `app:risk_indices` stale or unavailable | Nat-cat/political-risk sub-scores held at last-known value, flagged stale |
| `app:news_signals` empty or sparse | Emerging-risk weight may be configured to zero (§10.3); score computes without it |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Weight set doesn't sum to 100% | Computation blocked; flagged for alert dispatch (Orchestrator §11), no partial snapshot written |

## 6. Contract Compliance Engine
You compare required vs. placed limit, then apply the exclusion cross-check as an override. You do not compute KPIs (§4) or risk scores (§5).

### Flow D: Requirement Comparison, Exclusion Cross-Check, Override
```
[Entry: atlas_evaluate_compliance — placed coverage or exclusion version
        changed, OR app:contract_requirement_inputs updated for a
        requirement in scope, any counterparty type]
                 │
                 ▼
[Node 1: Requirement Comparison] ──► Per requirement: Placed Limit ÷ Required
                                      Limit, by counterparty type (Customer/Tenant,
                                      Lender, JV Partner, Government/Concession).
                                      Required Limit sources from app:contract_
                                      requirement_inputs where a validated
                                      contract/agreement exists for that
                                      requirement, for all four counterparty
                                      types (Insurance DocAnalyst §11a)
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
Trigger: `atlas_evaluate_compliance`, sole caller this agent, precondition placed coverage or exclusion version changed, **or** Insurance DocAnalyst's Flow G writes `app:contract_requirement_inputs` for a requirement in scope. Either trigger source runs the identical Node 1→4 pass.

**Requirements and exclusions merge to one status field** (Met/At-risk/Gap/Excluded, Node 2 always completing before Node 3) — no window where two views of the same requirement's status could disagree, no tie-break rule needed.

**Contract Requirements (FR7.1–FR7.5).** Captures required limit/term, counterparty type, and contractual source per requirement. For all four counterparty types, these come from a validated, extracted contract/agreement where one exists (`app:contract_requirement_inputs`). Default At-risk tolerance 10%, configurable. Open gaps and at-risk requirements surface in a dedicated register, filterable by asset, counterparty type, coverage line (FR7.4). Open gaps escalate to alert dispatch (Orchestrator §11) with priority reflecting counterparty type and shortfall size (FR7.5).

**Insurance Exclusions (FR9.1–FR9.6).** Captures exclusions and sub-limits per asset and coverage line (FR9.1). Cross-checked against the requirements register for the same asset and line (FR9.2). Where an exclusion undermines a requirement, status becomes `Excluded` — applied even where the placed limit numerically satisfies the requirement (FR9.3). Exclusion conflicts escalate to alert dispatch with priority reflecting counterparty type and exposure (FR9.5). Register supports an all / conflicts-only filtered view (FR9.6).

**Contextual warnings (FR9.4).** Global Map, Coverage Adequacy, and Risk Hotspots surface a contextual warning for any asset carrying an `Excluded`-status requirement. Should/MVP.

**Recalculation.** Auto-recalc on coverage change (FR7.6) is Should/V2 — at MVP, triggered off Insurance DocAnalyst's `recalc_trigger_set` for placed-coverage/exclusion changes, and separately off Flow G for a required-limit change. Either trigger source still runs one atomic Node 1→4 pass, never interleaved with another.

**Snapshot writing (§10.3, FR2.6).**
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every status change is versioned rather than overwritten, tagged to the tolerance-configuration version in effect.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Required limit or contractual source missing | Requirement stays in exception queue, excluded from status classification |
| Exclusion and requirement reference mismatched asset/line | No cross-check match; requirement status stands on Node 2 alone |
| Two exclusions conflict with one requirement | Both cited in the `Excluded` note; status still resolves to one value |
| `config_version_id` unresolved (tolerance %) | Recompute deferred; cannot write a snapshot without a bound version |
| `atlas_evaluate_compliance` fires mid-Node-3 | Re-entrant run queued, not interleaved — Node 2→3→4 always completes atomically per requirement |

## 7. MCP Task-Tool Bindings
| Tool                          | Function              | Sole caller     | Precondition                                                             |
| :---------------------------- | :-------------------- | :-------------- | :----------------------------------------------------------------------- |
| `atlas_propose_config_change` | Config Change-Control | This agent      | Proposer holds `C` per §4.2                                              |
| `atlas_compute_kpis`          | Coverage & Ratio      | This agent      | Posting Convergence or scheduled recompute                               |
| `atlas_compute_risk_score`    | Risk Scoring          | This agent      | KPI drivers current, `config_version_id` resolved                        |
| `atlas_evaluate_compliance`   | Contract Compliance   | This agent      | Placed coverage/exclusion change, or requirement input change            |
| `atlas_write_audit`           | All four functions    | Every component | Every propose/review/approve/version transition and every snapshot write |

Every write logs to `app:audit_log` (`atlas_write_audit`, no exceptions).
