# System Instruction: Scoring & Decisioning

> **Deterministic, MVP (qualitative override Should/V2).** Three merged components — Ratio Engine, Rating / Scorecard Engine, Recommendation Engine — strictly sequential, no LLM in the loop anywhere. Being deterministic is a requirement here, not a shortfall: FR4.2's lineage claim and NFR Traceability's reconstructability bar both argue against a non-deterministic model anywhere near the math. Methodology configuration itself is not this agent's function — it reads a versioned config `Governance & Records` owns and supersedes; see that file's §8.
>
> **Companion docs:** upstream — [`Field Review.md`](Field%20Review.md). Downstream — [`Governance & Records.md`](Governance%20%26%20Records.md) (Approval Workflow locks the recommendation, Registry reads all three outputs for comparison), [`Adverse-Media Screening.md`](Adverse-Media%20Screening.md) (this agent triggers screening, never consumes its output directly). §7 reproduces PRD FR4–FR6 formulas as `PLACEHOLDER`.

## 1. Core Mandate & Operational Objectives

Turn confirmed fields into a decision proposal: compute the ratio set (FR4), map it to an internal rating (FR5), and size a proposed credit limit and terms from that rating (FR6). Three components, kept separate rather than merged, because they recompute on different triggers, ratios are a first-class UI output on their own (FR4.4's trend view), and the recommendation may one day need inputs the scorecard never sees (limit sizing basis is `OPEN`, §7).

**Capabilities:** (1) Compute ratios as soon as required fields carry a value, including Unconfirmed ones flagged Provisional (FR4.1, FR3.8). (2) Store full lineage to exact source field IDs per ratio (FR4.2). (3) Recompute automatically on any field amendment, scoped to the amending assessment only (FR4.3). (4) Expose period-over-period trend (FR4.4). (5) Map ratios to a rating grade via bands, weights, and a composite score, with a per-ratio driver breakdown (FR5.1–FR5.2). (6) Trigger Adverse-Media Screening the moment ratios finish computing (FR12.1). (7) Derive a proposed limit and terms from the rating band (FR6.1). (8) Record an analyst override with mandatory justification, retaining the system proposal alongside it (FR6.3).

You compute values; you never decide what a value *means* for approval — that is Governance & Records's Approval Workflow, downstream of everything this agent produces.

## 2. State Management

**Reads (shared):** `cra:scorecard_config` (formulas, weights, bands, sizing rules — all `PLACEHOLDER` pending the baseline template, §7). **Per function:** Ratio Engine — `cra:extracted_field_store` (Confirmed/Amended/Not Present/Unconfirmed values, scoped to the computing assessment). Rating Engine — `cra:ratio_store` (this agent's own prior-stage output). Recommendation Engine — `cra:rating_store`.

**Writes (shared):** none shared. **Per function:** Ratio Engine writes `cra:ratio_store` (sole writer); Rating Engine writes `cra:rating_store` (sole writer); Recommendation Engine writes `cra:recommendation_store` — locked read-only past Approve by Governance & Records's Approval Workflow, but written only by this agent up to that point.

**Session keys** (per function): `computation_inputs`, `computed_result`, `config_version_id`.

**Temp keys:** `temp:driver_breakdown` (Rating Engine — per-ratio contribution to the composite score, discarded after the rating is written; the persisted `driver_breakdown` field on `Rating` is a separate, permanent copy).

## 3. Compute Convergence

Gates every write to `cra:ratio_store`, `cra:rating_store`, and `cra:recommendation_store` — the structural enforcement of FR10.3's never-retroactively-rescore guarantee:

$$\text{Compute Convergence} = \left( \text{computed\_result} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{computed\_at bound} \right)$$

Every run writes a new dated row keyed to the current `config_version_id`, never a mutated "latest" value. A later methodology change must never rewrite what a value *was* (architecture plan §10).

## 4. Flow A: Ratio Engine

```
[Entry: Field Review's recompute trigger (Flow A Node 7, Field Review.md),
        OR a new field carrying its first value]
                 │
                 ▼
[Node 1: Required-Field Assembly] ──► Reads cra:extracted_field_store for
                                       this assessment's fields
                 │
                 ▼
          ◇ Any required input Not Present? ◇
           │yes                              │no
           ▼                                  ▼
[Node 2a: not_calculable_flag]        [Node 2b: provisional_flag check]
Stores no value (Ratio.value null),          │
regardless of other inputs' status    ◇ Any required input still
(precedence: Not Present wins,          Unconfirmed? ◇
never both flags set) — FR3.8          │yes         │no
           │                            ▼             ▼
           │                  [Provisional = true] [Provisional = false]
           │                            │             │
           └────────────────┬───────────┴─────────────┘
                             ▼
                  [Node 3: Formula Application] ──► §7 formulas — skipped
                                                     entirely for a Not
                                                     Calculable ratio
                             │
                             ▼
                  [Node 4: Lineage Assembly] ──► Binds exact source field
                                                  IDs, formula reference,
                                                  period, category (FR4.2)
                             │
                             ▼
                  [Node 5: Snapshot Write] ──► cra:ratio_store, tagged
                                                config_version_id — gated
                                                by Compute Convergence
                             │
                             ▼
       [Output: computed_result] ──► Flow B (if all required ratios
                                      present, whether Provisional/Not
                                      Calculable or clean)
```

Trigger: `cra_compute_ratios`, sole caller this agent, precondition at least one required field carries a value. Gated by Compute Convergence (§3). Recompute is scoped to the amending assessment's own field copies and never reaches another assessment sharing the same source document (FR4.3, FR1.7) — this agent has no cross-assessment write path at all.

**Trend view (FR4.4).** Reads `ExtractedField.period` directly — no separate period-linking step. Distinct from Governance & Records's cross-assessment comparison (FR8.8–FR8.9): this is one assessment's own periods; that is two assessments' already-computed rows.

## 5. Flow B: Rating / Scorecard Engine

```
[Entry: cra:ratio_store updated for this assessment, all required ratios
        present (Not Calculable or Provisional count as present)]
                 │
                 ▼
[Node 1: Band Mapping] ──► Each ratio mapped to points via its configured
                            band (§7)
                 │
                 ▼
[Node 2: Weighted Sum] ──► Composite score = Σ(ratio points × weight),
                            weights from the resolved config_version_id
                 │
                 ▼
[Node 3: Grade Mapping] ──► Composite score → internal rating grade (FR5.1)
                 │
                 ▼
[Node 4: Driver Breakdown] ──► Writes temp:driver_breakdown — each ratio's
                                points, weight, and contribution (FR5.2)
                 │
                 ▼
[Node 5: Snapshot Write] ──► cra:rating_store, tagged config_version_id —
                              gated by Compute Convergence
                 │
                 ▼
[Node 6: Screening Trigger] ──► Fires cra_run_screening (Adverse-Media
                                 Screening) the moment this write
                                 completes — the earliest point at which a
                                 screening run is meaningful (FR12.1, moved
                                 here from submission at PRD v0.6)
                 │
                 ▼
[Output: computed_result] ──► Flow C
```

Trigger: `cra_compute_rating`, sole caller this agent, precondition Flow A complete for every required ratio. Gated by Compute Convergence (§3).

**Qualitative override (FR5.3, Should/V2).** A bounded adjustment with mandatory justification, recorded as an adjustment layer on top of the quantitative score — never folded into it, so the quantitative result stays independently reproducible. This is the *only* route by which an Adverse-Media Screening finding can affect a rating, and only one an analyst has marked Relevant (FR12.6): this agent reads the analyst's adjustment, never the finding itself.

**`OPEN`:** how a Not Calculable ratio is treated as scorecard input (exclude and reweight, substitute a neutral score, or another treatment) — pending the baseline template. Until answered, this agent propagates the state rather than coercing it to a number; silently treating Not Calculable as zero or a band boundary would convert a stated non-computation into a scored one.

## 6. Flow C: Recommendation Engine

```
[Entry: cra:rating_store updated for this assessment]
                 │
                 ▼
[Node 1: Band-to-Limit Lookup] ──► Rating grade → proposed limit amount and
                                    payment terms (days), per §7's sizing
                                    rule
                 │
                 ▼
[Node 2: Proposal Marking] ──► Output is a proposal only — never
                                auto-applied to a live customer account
                                (FR6.2)
                 │
                 ▼
[Node 3: Snapshot Write] ──► cra:recommendation_store, tagged
                              config_version_id — gated by Compute
                              Convergence
                 │
                 ▼
[Output: proposed_limit, proposed_terms] ──► Available for analyst
                                              override (below) and for
                                              Approval Workflow (Governance
                                              & Records)
```

Trigger: `cra_compute_recommendation`, sole caller this agent, precondition Flow B complete.

**Analyst override.** `salus`-equivalent: `cra_override_recommendation`, records the override value, flag, and mandatory justification, retaining the system-computed proposal alongside it (FR6.3) — never overwritten, never lost. Locked once Governance & Records's Approval Workflow reaches Approve (FR7.4); no write path from this agent past that point.

**`OPEN`:** whether limit sizing extends beyond the rating band to exposure/appetite-based inputs — pending the baseline template and a product decision. If the answer is "also exposure-based," this engine will need an input the scorecard never sees; this is why it is not merged with the Rating Engine now.

## 7. Appendix A — Ratio, Scorecard & Recommendation Formulas (`PLACEHOLDER`)

The client's baseline Excel template — which defines the exact ratio set, scorecard weights, rating bands, and limit sizing rule — has not been supplied. Every formula reference below is a placeholder structure, not a final value.

| Function | What is fixed regardless of the template | What is `PLACEHOLDER` |
| :--- | :--- | :--- |
| Ratio Engine | Five indicative categories: liquidity, leverage, profitability, coverage, efficiency | Exact ratio set and formulas per category |
| Rating Engine | Band → points → weighted sum → grade mapping shape | Band boundaries, weights, score-to-grade mapping |
| Recommendation Engine | Rating band drives a limit and terms lookup | Sizing rule; whether inputs extend beyond the rating band (§6) |

Build against the config seam with a provisional config so each engine is testable before the template arrives — hard-coding formulas instead would leave FR10.3's guarantee with nothing to point at (architecture plan §7).

## 8. Failure & Denial Handling

| State | Behaviour |
| :--- | :--- |
| Required field has no value at all (not even Unconfirmed) | Ratio computation deferred for that ratio — nothing to compute from yet, not an error state |
| `config_version_id` unresolved | Compute deferred for all three functions — Compute Convergence cannot be met without a bound version |
| Not Calculable ratio reaches Rating Engine with the scorecard treatment still `OPEN` | Propagated as-is, never coerced to a number — blocks nothing structurally, but the rating's driver breakdown must state which ratios were excluded |
| Recompute fires while a prior compute for the same assessment is still in flight | Re-entrant run queued, not interleaved — one complete Node 1→5 pass per trigger, never partial overwrite |
| Weight set in `cra:scorecard_config` doesn't sum to 100% | Rating computation blocked; flagged as a configuration fault, no partial snapshot written |
| Recommendation override attempted after Approval | Rejected — `cra:recommendation_store` is locked past Approve; no write path exists |
| Screening trigger fires but Adverse-Media Screening is unbuilt (pre-V2) | No-op — the event is emitted regardless (fire-and-forget), costing nothing structurally when there is no consumer yet |

## 9. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
| :--- | :--- | :--- | :--- |
| `cra_compute_ratios` | Ratio Engine | This agent | At least one required field carries a value |
| `cra_compute_rating` | Rating Engine | This agent | All required ratios present for this assessment |
| `cra_compute_recommendation` | Recommendation Engine | This agent | Rating computed for this assessment |
| `cra_override_recommendation` | Recommendation Engine | This agent | Assessment not yet Approved; justification supplied |
| `cra_write_audit` | All three functions | Every agent | Every computation and override |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions).
