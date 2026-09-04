# System Instruction: CoverageAnalyst

> **Deterministic, MVP (Config Change-Control Should/V2). No LLM in the loop, no judgement calls (§02)** — each function is a pure function of its inputs and the current config version, or (Config Change-Control) a fixed approval state machine. Four functions: three computation engines sharing a config-version dependency and snapshot-writing discipline, plus the governance workflow that gates them.
>
> **Companion docs:** upstream — [`Insurance DocAnalyst.md`](Insurance%20DocAnalyst.md). Read by — [`Salus Orchestrator.md`](Salus%20Orchestrator.md), [`InsuranceCustodian.md`](InsuranceCustodian.md). Storage/retention rules — [`InsuranceCustodian.md`](InsuranceCustodian.md) §6. §8–§9 reproduce PRD §7 and PRD §10 verbatim.

## 1. Core Mandate & Operational Objectives
1. **Coverage & Ratio (§4)** — computes every KPI in PRD §7.1–7.8 (formulas: §8) from posted policy, asset, premium, and claims data (FR2.1). Judgement-free: same inputs + `config_version_id` → same `computed_snapshot`. Pure function of `app:policy_registry` + `app:fx_rates`.
2. **Risk Scoring (§5)** — computes the composite 0–100 risk score per country, site, entity, and BU (FR4.1); driver breakdown is the output, not an add-on (FR4.4). Composes §4's KPI output with external risk indices and news signals.
3. **Contract Compliance (§6)** — owns third-party contractual insurance requirements (FR7) and policy exclusions/sub-limits (FR9) as one merged register with one status field: `Met` / `At-risk` / `Gap` / `Excluded`. Consumes placed-coverage and validated required-limit data without deriving either.
4. **Config Change-Control (§3)** — sole path by which KPI thresholds (FR2.5), risk-score weights (FR4.5), and risk-appetite thresholds change. Computes nothing; makes every change reviewable, dated, non-destructive.

## 2. State Management
**Reads (shared):** `app:config_versions`. **Per function:** Coverage & Ratio — `app:policy_registry`, `app:fx_rates`. Risk Scoring — `app:kpi_snapshot_store`, `app:risk_indices`, `app:news_signals` (optional). Contract Compliance — `app:policy_registry`, `app:contract_requirement_inputs` (Insurance DocAnalyst §13, all four counterparty types).

**Writes (shared):** `app:kpi_snapshot_store`. **Per function:** Contract Compliance also writes `app:contract_requirements_register` and `app:exclusions_register`. Config Change-Control is the **sole writer** of `app:config_versions`.

**Session keys** (shared pattern, one instance per function): `computation_inputs`, `computed_snapshot`, `config_version_id`. **Temp keys:** `temp:driver_breakdown` (Risk Scoring), `temp:conflict_candidates` (Contract Compliance).

## 3. Config Change-Control (FR2.5, FR4.5 — Should/V2)
Propose → review → approve → version, gating changes to KPI thresholds, risk-score weights, and risk-appetite thresholds. These settings determine what leadership, auditors, and the Board see as "high risk," so every change carries an owner and a paper trail.

**The critical rule (PRD §10.3):** historical KPI and risk-score values retain the weights/thresholds in effect when calculated. Enforced structurally — Snapshot Convergence (below) requires a bound `config_version_id`, immutable once written; a new config version only becomes available for the *next* recompute.

**Snapshot Convergence** — gates every engine write to `app:kpi_snapshot_store` (§4, §5, §6):
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every run writes a row keyed to the current `config_version_id`, never a mutated "latest" figure — a later threshold change must never rewrite what a value *was*.

### Flow A: Propose → Review → Approve → Version
```
[Entry: salus_propose_config_change — threshold/weight/appetite edit]
                 │
                 ▼
[Node 1: Propose] ──► Rationale logged against the proposed change
                 │
                 ▼
[Node 2: Review] ──► Named owner reviews (owner TBC, PRD §18 PRD)
                 │
                 ▼
[Node 3: Approve] ──► Approval captured in app:audit_log via salus_write_audit
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
Trigger: `salus_propose_config_change`, sole caller this agent, precondition proposer holds `C` (Configure) per InsuranceCustodian §5.

> **MVP scope note.** This precondition is stubbed to always-allow for now — see README "MVP Scope — RBAC Deferred." The permission check's data source, once enforced, is `app:user_scope_registry`; this key should be added to §2's reads for this function at that point (currently undeclared).

**Review cadence.** Annual at minimum, or earlier on a material risk-environment change (new peril category, regulatory requirement) — a scheduled re-entry into Node 2, not a new proposal type.

**Configuration Version entity** — backed by `app:config_versions`; append-on-change, current version has no `superseded_by` set.

| Field | Type | Description |
| :--- | :--- | :--- |
| `version_id` | ID (PK) | Unique identifier |
| `effective_from` | Date | When this version became live |
| `superseded_by` | Reference (nullable) | The next version, once one exists — this version is never deleted |
| `rationale` | Text | Logged justification for the change (PRD §10.3) |
| `approved_by` | Reference | Named reviewer/owner who approved it (owner still TBC, PRD §18) |
| `threshold_set` | Structured | The KPI thresholds / risk-score weights / risk-appetite values this version carries |

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Proposer lacks `C` (Configure) permission | Rejected outright, not queued |
| Review owner not yet assigned (org gap, not system fault) | Proposal sits at Node 2 indefinitely, visible as "awaiting review owner." By design at MVP — reassignment is a manual action by whoever holds admin access, not an automated escalation; no maker-checker/SLA tooling exists anywhere in this architecture yet |
| Approval attempted without logged rationale | Blocked — rationale is mandatory input at Node 1, not optional metadata |
| Version conflict (two proposals on the same threshold concurrently) | Second approval creates the next sequential version; does not merge or silently supersede the first mid-review |
| Engine attempts a recompute with no `config_version_id` resolved | Recompute blocked — Snapshot Convergence cannot be met; engine falls back to last-known version |

## 4. Coverage & Ratio Engine
You compute values; you do not decide what a value *means* for risk or compliance — §5 and §6 consume this output.

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
[Node 3: KPI Computation] ──► Applies the §8 formulas
                 │
                 ▼
[Node 4: Lineage Assembly] ──► Binds inputs, formula id, FX rate, timestamp to
                                each value (FR2.4)
                 │
                 ▼
[Node 5: Snapshot Write] ──► Writes computed_snapshot to app:kpi_snapshot_store,
                              tagged config_version_id + as_of_date
```
Trigger: `salus_compute_kpis`, sole caller this agent, precondition Posting Convergence (Insurance DocAnalyst §7) or scheduled recompute. Gated by Snapshot Convergence (§3).

**Recalculation.** Automatic on underlying data change (FR2.3, Must/MVP) — Insurance DocAnalyst's `recalc_trigger_set` is the trigger; no manual-only path at MVP.

**Configurable thresholds (FR2.5, Should/V2).** Post-MVP, configurable via §3. At MVP, the §8 defaults are fixed.

**Lineage (FR2.1–FR2.4).** Every KPI value carries inputs, formula id, FX rate + rate date, and computation timestamp. `salus_get_lineage` (callers: Salus Orchestrator, InsuranceCustodian) reads this off `app:kpi_snapshot_store` — this function doesn't serve lineage queries itself.

**KPI / Risk Score Snapshot entity** — backed by `app:kpi_snapshot_store`, written by all three engines.

| Field | Type | Description |
| :--- | :--- | :--- |
| `snapshot_id` | ID (PK) | Unique identifier |
| `entity_ref` | Reference | Country/Site/Entity/BU/Asset/Policy this value applies to |
| `metric_name` | Enum/Text | e.g. "ITV", "Composite Risk Score", "Contractual Requirement Coverage Ratio" |
| `metric_value` | Number | The computed value |
| `as_of_date` | Date | Valid-time — the date this value represents |
| `computed_at` | Timestamp | Transaction-time — when Salus computed it |
| `config_version_id` | Reference | FK to Configuration Version in effect at computation (not optional) |
| `computed_by` | Enum | Coverage & Ratio / Risk Scoring / Contract Compliance |
| `lineage_ref` | Reference | Pointer to the inputs/formula used (FR2.4) |

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| FX rate missing for value date | Computation blocked for affected KPIs; exception logged, prior snapshot stands |
| Mandatory field unconfirmed | Excluded from computation per the validation gate (PRD §9.1); KPI reflects confirmed data only |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Recalc trigger storm (bulk posting) | Batched, not dropped — every affected KPI still recomputes, no silent skip |
| Formula/input mismatch (schema drift) | Fails closed; flagged for alert dispatch (Orchestrator §10), no partial snapshot written |

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
                                       its defined band (§9)
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
Trigger: `salus_compute_risk_score`, sole caller this agent, precondition KPI drivers current and `config_version_id` resolved. Gated by Snapshot Convergence (§3).

**Recalculation.** Automatic on underlying data change (Must/MVP). Recompute on weight change (FR4.5) is Should/V2 — at MVP a weight change applies from the next data-driven recompute onward.

**Outputs (PRD §10.2).** Ranked "Top exposures" table (filterable by insurance line and dimension), a geographic heat map shaded by composite score, and the per-row driver breakdown (FR4.4) — all read off the same `computed_snapshot`.

**Worked example — driver breakdown (FR4.4).** *Site E, composite 74 (High band)*; illustrative placeholder data.

| Driver | Weight | Sub-score | Contribution |
| :--- | :--- | :--- | :--- |
| Coverage gap severity | 28% | 65 | 18.2 |
| Uninsured / under-insured TIV | 18% | 80 | 14.4 |
| Nat-cat exposure | 14% | 90 | 12.6 |
| Political / sanctions / country risk | 10% | 40 | 4.0 |
| Adverse claims history | 9% | 55 | 5.0 |
| Carrier credit quality & concentration | 8% | 30 | 2.4 |
| Emerging risk signal (news-driven) | 8% | 70 | 5.6 |
| Mandatory-cover non-compliance | 5% | 0 | 0.0 |
| **Composite** | | | **74** — High band (70–84) |

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Driver KPI unconfirmed/excluded | That driver's sub-score treated as missing, not zero; flagged in driver breakdown |
| `app:risk_indices` stale or unavailable | Nat-cat/political-risk sub-scores held at last-known value, flagged stale |
| `app:news_signals` empty or sparse | Emerging-risk weight may be configured to zero; score computes without it |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Weight set doesn't sum to 100% | Computation blocked; flagged for alert dispatch (Orchestrator §10), no partial snapshot written |

## 6. Contract Compliance Engine
You compare required vs. placed limit, then apply the exclusion cross-check as an override. You do not compute KPIs (§4) or risk scores (§5).

### Flow D: Requirement Comparison, Exclusion Cross-Check, Override
```
[Entry: salus_evaluate_compliance — placed coverage or exclusion version
        changed, OR app:contract_requirement_inputs updated for a
        requirement in scope, any counterparty type]
                 │
                 ▼
[Node 1: Requirement Comparison] ──► Per requirement: Placed Limit ÷ Required
                                      Limit, by counterparty type (Customer/Tenant,
                                      Lender, JV Partner, Government/Concession).
                                      Required Limit sources from app:contract_
                                      requirement_inputs where a validated
                                      contract/agreement exists (Insurance
                                      DocAnalyst §13)
                 │
                 ▼
[Node 2: Status Classification] ──► Met (≥100%) / At-risk ([100%−tolerance%,
                                     100%)) / Gap (<100%−tolerance%). Tolerance
                                     configurable (§3), default 10% — so at
                                     default: At-risk [90%,100%), Gap <90%. Both
                                     bounds move together when tolerance changes;
                                     100% itself is always Met, never At-risk
                 │
                 ▼
[Node 3: Exclusion Cross-Check] ──► Checks app:exclusions_register for a full
                                     exclusion or material sub-limit on the same
                                     asset + coverage line; writes
                                     temp:conflict_candidates
                 │
                 ▼
[Node 4: Excluded Override] ──► Any Node 3 match overrides the Node 2 status
                                 to Excluded — applied even where the placed limit
                                 numerically satisfies the requirement (FR9.3)
                 │
                 ▼
[Node 5: Snapshot Write] ──► Writes computed_snapshot (status per requirement) to
                              app:contract_requirements_register and
                              app:exclusions_register, tagged config_version_id
```
Trigger: `salus_evaluate_compliance`, sole caller this agent, precondition placed coverage or exclusion version changed, **or** Insurance DocAnalyst's Flow G writes `app:contract_requirement_inputs` for a requirement in scope. Either source runs the identical Node 1→4 pass. Gated by Snapshot Convergence (§3).

Requirements and exclusions merge to one status field, Node 2 always completing before Node 3 — no window where two views of the same requirement's status could disagree, no tie-break rule needed.

**Contract Requirements (FR7.1–FR7.5).** Captures required limit/term, counterparty type, and contractual source per requirement, from a validated extracted agreement where one exists. Default At-risk tolerance 10%, configurable. Open gaps and at-risk requirements surface in a dedicated register, filterable by asset, counterparty type, and coverage line (FR7.4), and escalate to alert dispatch (Orchestrator §10) with priority reflecting counterparty type and shortfall size (FR7.5).

**Insurance Exclusions (FR9.1–FR9.6).** Captures exclusions and sub-limits per asset and coverage line (FR9.1), cross-checked against the requirements register for the same asset and line (FR9.2). Where an exclusion undermines a requirement, status becomes `Excluded` (FR9.3). Conflicts escalate to alert dispatch with priority reflecting counterparty type and exposure (FR9.5). Register supports an all / conflicts-only filtered view (FR9.6).

**Contextual warnings (FR9.4, Should/MVP).** Global Map, Coverage Adequacy, and Risk Hotspots surface a warning for any asset carrying an `Excluded`-status requirement.

**Recalculation.** Auto-recalc on coverage change (FR7.6) is Should/V2 — at MVP, triggered off `recalc_trigger_set` for placed-coverage/exclusion changes, and separately off Flow G for a required-limit change. Either source runs one atomic Node 1→4 pass, never interleaved.

**Worked example — `Excluded` override (FR9.3).** Illustrative placeholder data.

| Field | Value |
| :--- | :--- |
| Requirement | Minimum Industrial All Risks limit, *Site F* |
| Counterparty type | Lender |
| Required limit | S$40.0M |
| Placed limit | S$42.0M |
| Numeric comparison | 105% — would read `Met` on limit alone |
| **Status** | **`Excluded`** |
| Explanation (inline, FR9.3) | Placed limit numerically satisfies the requirement, but Policy Exclusion `EXC-0087` removes flood cover for *Site F*'s coverage line — the peril the facility agreement actually requires |
| Source | Facility Agreement cl. 14.2 · Exclusion register `EXC-0087` |

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Required limit or contractual source missing | Requirement stays in exception queue, excluded from status classification |
| Exclusion and requirement reference mismatched asset/line | No cross-check match; requirement status stands on Node 2 alone |
| Two exclusions conflict with one requirement | Both cited in the `Excluded` note; status still resolves to one value |
| `config_version_id` unresolved (tolerance %) | Recompute deferred; cannot write a snapshot without a bound version |
| `salus_evaluate_compliance` fires mid-Node-3 | Re-entrant run queued, not interleaved — Node 2→3→4 always completes atomically per requirement |

## 7. MCP Task-Tool Bindings
| Tool                          | Function              | Sole caller     | Precondition                                                             |
| :---------------------------- | :-------------------- | :-------------- | :----------------------------------------------------------------------- |
| `salus_propose_config_change` | Config Change-Control | This agent      | Proposer holds `C` (InsuranceCustodian §5)                               |
| `salus_compute_kpis`          | Coverage & Ratio      | This agent      | Posting Convergence or scheduled recompute                               |
| `salus_compute_risk_score`    | Risk Scoring          | This agent      | KPI drivers current, `config_version_id` resolved                        |
| `salus_evaluate_compliance`   | Contract Compliance   | This agent      | Placed coverage/exclusion change, or requirement input change            |
| `salus_write_audit`           | All four functions    | Every component | Every propose/review/approve/version transition and every snapshot write |

Every write logs to `app:audit_log` (`salus_write_audit`, no exceptions).

## 8. Appendix A — KPI Formulas (PRD §7, verbatim)
Computed by §4 on FX-normalised values with full lineage (FR2.1–FR2.4). All thresholds are proposed defaults for sponsor confirmation, configurable per KPI per FR2.5 (Should/V2 — fixed at MVP).

**PRD §7.1 Coverage adequacy**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Insurance-to-Value (ITV) | Sum Insured ÷ Total Insurable Value | ≈100%; flag <90% under / >110% over |
| Limit-to-PML | Policy Limit ÷ Probable Maximum Loss | ≥1.0; flag if limit < PML |
| Coverage Gap % | (Required − Placed) ÷ Required | 0%; flag any positive gap |
| BI Adequacy | BI Sum Insured ÷ Annual Gross Profit (+ indemnity period vs. restoration time) | ≥100% and period ≥ restoration |
| Peril Sublimit Adequacy | Peril Sublimit ÷ Peril PML | ≥1.0 per modelled peril |
| Mandatory Cover Compliance % | Compliant entities/sites ÷ total in scope | 100% |

**PRD §7.2 Risk retention**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Retention / Deductible Ratio | Deductible (or SIR) ÷ Sum Insured | Within risk-appetite band [TBC] |
| Aggregate Retained Exposure | Σ retained layers / SIRs across programme | ≤ risk appetite [TBC] |
| Aggregate Limit Erosion | Claims paid vs. aggregate ÷ Aggregate limit | Alert at >70% eroded |

**PRD §7.3 Cost efficiency**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Rate on Line (RoL) | Premium ÷ Limit | Benchmark vs. prior year |
| Premium Rate | Premium ÷ Sum Insured (per mille) | Benchmark by line/region |
| Premium-to-Revenue | Total Premium ÷ Revenue | Track trend |
| Total Cost of Risk (TCOR) % | (Premiums + Retained losses + Risk-mgmt costs + Fees) ÷ Revenue | Minimise; track trend |
| YoY Premium Change % | (Premium − Prior premium) ÷ Prior premium | Explain variances |

**PRD §7.4 Claims / loss experience**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Loss Ratio | Incurred Claims ÷ Earned (or Paid) Premium | Monitor; alert >100% |
| Claims Frequency | Number of claims ÷ exposure unit | Track by line/site |
| Claims Severity | Total claim cost ÷ Number of claims | Track by line/site |
| Open vs. Closed / Settlement time | Counts and average days to settle | Track ageing |

**PRD §7.5 Concentration & counterparty risk**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Carrier Concentration | % of sum insured / premium per insurer | Alert if single carrier > [25%] |
| Carrier Credit Quality | Exposure-weighted avg rating; % sub-investment-grade | Flag sub-investment-grade exposure |
| Broker Concentration | % of premium per broker | Monitor |
| Geographic Concentration | TIV/Sum insured per country; % in high-risk countries | Monitor concentration |
| Line-of-Business Concentration | Exposure split by insurance line | Monitor |

**PRD §7.6 Programme continuity & governance**

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Renewal Pipeline | Policies & sum insured expiring in 30/60/90 days | All actioned ≥60 days pre-expiry |
| Coverage Continuity / Lapse Risk | Entities/sites with gaps in continuous cover | Zero lapses |
| Data Completeness & Confidence | % policies with all mandatory fields captured & validated | ≥90% |

**PRD §7.7 Contractual compliance** — computed by §6, not §4; listed for PRD §7 completeness.

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Contractual Requirement Coverage Ratio | Placed Limit ÷ Contractually Required Limit (per requirement) | ≥100% Met; [100%−tolerance%, 100%) At-risk; <100%−tolerance% Gap — see §6 Node 2 |
| Open Contractual Gaps | Count and S$ value of requirements below 100% of required limit | Zero open gaps |

**PRD §7.8 Exclusion & conflict detection** — computed by §6, not §4; listed for PRD §7 completeness.

| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Exclusion Conflict Count | Count of exclusions flagged as conflicting with an open Contract Requirement | Zero open conflicts |
| Full-Exclusion Share | Full exclusions ÷ total exclusions tracked | Monitor; investigate concentration by peril |

## 9. Appendix B — Risk Score Drivers (PRD §10, verbatim)
Consumed by §5. Default weights are proposed; all configurable (FR4.5) and every score is explainable (FR4.4).

| Driver | What it measures | Default weight | Source |
| :--- | :--- | :--- | :--- |
| Coverage gap severity | Size of coverage shortfall vs. requirement, by line (PRD §7.1) | 28% | §4 (KPI) |
| Uninsured / under-insured TIV | Value at risk not covered | 18% | §4 (KPI) |
| Natural-catastrophe exposure | Flood / quake / windstorm index for the location | 14% | `app:risk_indices` (external) |
| Political / sanctions / country risk | Country-risk rating and sanctions exposure | 10% | `app:risk_indices` (external) |
| Adverse claims history | Claims frequency × severity | 9% | §4 (KPI) |
| Carrier credit quality & concentration | Sub-investment-grade and single-carrier reliance | 8% | §4 (KPI) |
| Emerging risk signal (news-driven) | Sector/geography news signals affecting the asset (PRD §6.6) | 8% | `app:news_signals` (RiskScanner, Stretch/V2) |
| Mandatory-cover non-compliance | Missing statutory/board-mandated covers | 5% | §4 (KPI) |

Weights sum to 100%. Five drivers are KPIs §4 already computes; only nat-cat, political/country risk, and the news signal are externally sourced with their own refresh cadence.

The emerging-risk-signal weight links RiskScanner's Stretch/V2 impact-scoring capability (FR6.4–FR6.6) into the score — RiskScanner itself ships at MVP (baseline tier), but this weighted-input capability does not (RiskScanner.md §7). It is configurable to zero for entities or lines with sparse news coverage; the composite still computes on the remaining seven drivers, and no re-normalisation is required since weights are additive.

**PRD §10.1 Scoring approach**
1. Normalise each driver to a 0–100 sub-score using a defined band (e.g. coverage gap % mapped to a curve).
2. Weighted-sum the sub-scores to a composite 0–100 score.
3. Assign a band: Low (0–39) / Medium (40–69) / High (70–84) / Critical (85–100) — thresholds configurable.
4. Recompute whenever underlying data changes (MVP); recompute on weight change is separate and V2 (FR4.5).
