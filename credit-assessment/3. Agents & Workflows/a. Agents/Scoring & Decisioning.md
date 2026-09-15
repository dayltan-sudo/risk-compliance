# System Instruction: Scoring & Decisioning

> **Deterministic, MVP.** One PRD §5 module: Calculation. No LLM in the loop anywhere — being deterministic is a requirement here, not a shortfall: FR4.5's lineage claim and NFR Traceability's reconstructability bar both argue against a non-deterministic model anywhere near the math. MVP outputs a rating class, not a credit limit — limit sizing and a qualitative override are both V2 (PRD §7); nothing in this file proposes an amount.
>
> **Companion docs:** upstream — [`Field Review.md`](Field%20Review.md), sole trigger of every compute in this file. Downstream — [`Governance & Records.md`](Governance%20%26%20Records.md) reads `Ratio` and `Rating` read-only for approval, drill-down, and export; this agent has no write path back into either module. §7 reproduces the closed scorecard from [`Baseline_Scorecard_Extract_v1.2.md`](../../1.%20Planning%20%26%20Prototyping/Baseline_Scorecard_Extract_v1.2.md).

## 1. Core Mandate & Operational Objectives

Turn confirmed fields and confirmed criterion inputs into a rating class: compute the four ratios and four derived scorecard inputs (FR4), then band-map all eleven criteria into a composite score and a class (FR6). Two engines, not one file-per-function split, because the same trigger (Field Review's completion gate) starts both and every ratio-engine output feeds directly into the rating engine with no independent entry point of its own.

**Capabilities:** (1) Compute ratios and derived inputs only once Field Review's gate holds — never on partial data (FR4.1, FR3.8). (2) Store full lineage to exact source field or criterion IDs per ratio (FR4.5). (3) Recompute automatically on any post-computation amendment, scoped to the amending assessment only (FR4.8). (4) Expose period-over-period change for every FR2.2 line item (FR4.6). (5) Treat an absent input and a zero divisor as distinct cases, each with its own tier rule (FR4.7, FR4.11–FR4.12). (6) Band-map all eleven criteria — six interval, five categorical — with no default fallthrough (FR6.2). (7) Select the weight set from `Assessment.relationship_type` (FR6.3). (8) Compute the composite and map it to class A/B/C with a handling route (FR6.8). (9) Produce a full driver breakdown, including which of criterion 4's three tier-1 conditions fired (FR6.9–FR6.10). (10) Stamp every stored `Rating` with the constant `scorecard_version` (FR6.14).

You compute values; you never decide what a value *means* for approval — that is Governance & Records's Approval Workflow, downstream of everything this agent produces.

## 2. State Management

**Reads:** `cra:extracted_field_store` (Confirmed/Amended only — never Unconfirmed, FR3.8), `cra:criterion_input_store` (Confirmed/Amended only), `cra:assessment_registry` (`relationship_type` for weight-set selection, FR6.3; `assessment_year` for criterion 7, FR4.4 — division-scoping is already resolved upstream by Field Review and Record; this module computes within one assessment's scope regardless of division).

**Writes:** `cra:ratio_store` (sole writer), `cra:rating_store` (sole writer).

**Session keys:** `computation_inputs`, `computed_result`.

**Temp keys:** `temp:driver_breakdown` — per-criterion contribution to the composite, discarded after `Rating` is written; the persisted `driver_breakdown` field on `Rating` is a separate, permanent copy.

## 3. Compute Convergence

Gates every write to `cra:ratio_store` and `cra:rating_store`:

$$\text{Compute Convergence} = \big(\text{computed\_result} \neq \emptyset\big) \land \big(\text{scorecard\_version bound}\big) \land \big(\text{computed\_at bound}\big)$$

Every run writes a new dated row, never a mutated one (FR4.10, FR6.12). `scorecard_version` is a constant compiled into this agent, not a runtime lookup — a later change to a band, weight, or threshold requires incrementing it, which is what keeps a stored `Rating` attributable to the methodology that produced it (FR6.14).

## 4. Flow A: Ratio Engine (FR4)

```
[Entry: Field Review's Review-Complete trigger (Flow A/E Node 6/7, Field
        Review.md)]
                 │
                 ▼
[Node 1: Load Confirmed Inputs] ──► cra:extracted_field_store and
                                     cra:criterion_input_store, Confirmed/
                                     Amended rows only, this assessment
                 │
                 ▼
          ◇ Required input confirmed with no value (FR3.5)? ◇
           │yes                                                │no
           ▼                                                    ▼
[Node 2a: Not Calculable]                          ◇ Divisor = 0? ◇
Renders "—", names the missing              │yes                  │no
input. Absent is never evidence              ▼                     ▼
of a clean record — the criterion    [Node 2b: Zero-Divisor    [Node 2c:
scores tier 1 downstream (FR4.7,      Treatment] ──► Per-ratio    Formula
FR6.5). Distinct from the zero-       rule, FR4.12:               Application]
divisor branch — a zero divisor       • Current ratio, CL = 0 → tier 3
is a known figure with an             • Debt to equity, TE = 0 → tier 1
unbounded quotient, which is a        • Net profit margin, sales = 0 →
fact about the customer, not an         tier 1
absence of evidence                   • WC over revenue, sales = 0 →
           │                            tier 1
           │                          Paid-up capital cover never
           │                          reaches this case — exposure ≤ 0
           │                          is rejected at entry (FR5.15).
           │                          Renders "—" with the divisor
           │                          named; states the tier taken
           │                                    │                  │
           └──────────────┬─────────────────────┴──────────────────┘
                           ▼
                [Node 3: Lineage Assembly] ──► Formula, exact source
                                                field/input IDs, period
                                                (FR4.5)
                           │
                           ▼
                [Node 4: Period-Over-Period Change] ──► Every FR2.2 line
                                                          item: (current
                                                          − prior) /
                                                          prior; "—"
                                                          where prior = 0,
                                                          never an error
                                                          (FR4.6).
                                                          Computed at
                                                          read time, not
                                                          stored — no
                                                          compute-on-
                                                          write claim
                                                          applies to a
                                                          trend view
                                                          derivable from
                                                          two already-
                                                          stored fields
                           │
                           ▼
                [Node 5: Dated Write] ──► cra:ratio_store — gated by
                                           Compute Convergence
                           │
                           ▼
       [Output: computed_result] ──► Flow B, once every required ratio
                                      and derived input has been
                                      evaluated (Not Calculable and zero-
                                      divisor outcomes count as evaluated)
```

Trigger: `cra_compute_ratios`, sole caller this agent, precondition Field Review's Review-Complete gate holds. Recompute (FR4.8) re-enters here on an amendment after first computation, scoped to the amending assessment's own copies — this agent has no cross-assessment write path at all.

**What this computes.** Four ratios — Working Capital = CA − CL · Current Ratio = CA / CL · Net Profit Margin = NPAT / Sales · Debt to Equity = TL / TE. Four derived scorecard inputs, consumed only by Flow B — WC over revenue = Working Capital / Sales (criterion 1) · Paid-up capital cover = paid-up capital / total exposure (criterion 5) · the NPAT sign pair across both periods (criterion 6 — Flow B tiers it per FR6.13; this node stores the raw fact, not the tier) · years established = `assessment_year − year_registered_sg` (criterion 7, `assessment_year` read from the assessment record, never a literal, FR4.4).

**No currency conversion, no scale normalization, anywhere in this engine.** Every stored value is already raw absolute (FR2.3); every ratio is a quotient of two figures from the same entity, so the result is dimensionless (FR4.9).

## 5. Flow B: Rating Engine (FR6)

```
[Entry: cra:ratio_store updated for this assessment, every required
        ratio and derived input evaluated, every categorical criterion
        (8, 9, 10, 11) Confirmed/Amended]
                 │
                 ▼
[Node 1: Band Mapping] ──► Eleven criteria into tier 3, 2, or 1. No
                            fallthrough — every band partitions its
                            criterion's full range of outcomes:
                            • Interval (1, 2, 3, 4, 5, 7) — numeric bands
                            • Categorical (6, 8, 9, 10, 11) — every
                              outcome enumerated; criterion 6 across all
                              four NPAT sign combinations (FR6.13): both
                              periods profitable = tier 3, latest
                              profitable prior not = tier 2, a loss in
                              the latest period = tier 1 whatever the
                              prior did
                            • Absent input or Not Calculable ratio →
                              tier 1 regardless of criterion type (FR6.5)
                            • Zero-divisor outcomes were already resolved
                              in Flow A Node 2b — this node reads the
                              pre-resolved tier, does not re-derive it
                            • Criterion 4 — record which of three
                              conditions fired: high leverage (x ≥ 2),
                              negative equity (x < 0), or zero equity
                              (TE = 0, via FR4.12) — all three are tier 1
                              by different routes (FR6.10)
                 │
                 ▼
[Node 2: Weight Set Selection] ──► Reads Assessment.relationship_type
                                    (New/Renewal) — New uses the new
                                    weight set, Renewal the renewal set
                                    (FR6.3). Criterion 11: weight 0 for
                                    New, scored as an explicit 0
                                    contribution, never left unevaluated
                                    (FR6.6)
                 │
                 ▼
[Node 3: Weighted Sum] ──► Composite = Σ(tier × weight). Weights sum to
                            100 in both sets, so the composite ranges
                            100–300 (FR6.1)
                 │
                 ▼
[Node 4: Class Mapping] ──► A: 240–300, auto-recommend with GIRO,
                             escalate per MOA. B: 180–239, manual review
                             with credit enhancement. C: 100–179, not
                             recommended by Risk and Compliance (FR6.8)
                 │
                 ▼
[Node 5: Driver Breakdown] ──► temp:driver_breakdown — each criterion's
                                tier, weight, contribution, and the input
                                that produced it (FR6.9)
                 │
                 ▼
[Node 6: scorecard_version Stamp] ──► Constant in code (FR6.14)
                 │
                 ▼
[Node 7: Dated Write] ──► cra:rating_store — gated by Compute
                           Convergence (FR6.12)
                 │
                 ▼
[Output: composite, class, driver_breakdown] ──► Governance & Records
                                                   (read-only)
```

Trigger: `cra_compute_rating`, sole caller this agent, precondition Flow A complete for every required ratio and derived input.

**The class is an outcome, not an instruction.** No downstream system may act on it, and this agent writes to no external system (FR6.11).

## 6. Failure & Denial Handling

| State | Behaviour |
|---|---|
| Required field or criterion input confirmed with no value | Not Calculable / absent-input path (Flow A Node 2a) — deferred to tier 1 at the Rating Engine, never an error |
| Divisor is exactly zero | Flow A Node 2b's per-ratio rule applies — never defaults to tier 1 automatically (FR4.11) |
| Field Review's gate not yet satisfied | Compute not triggered — this agent has no independent entry point and never polls for partial readiness |
| Recompute fires while a prior compute for the same assessment is still in flight | Re-entrant run queued, not interleaved — one complete pass per trigger, never a partial overwrite |
| `relationship_type` unresolved on the assessment | Weight-set selection (Flow B Node 2) deferred — cannot band-map criterion 11's weight without it |
| Composite fails to reproduce the baseline workbook on a known test input | Build-time gate, not a runtime condition — blocks release (NFR Reproducibility; README, "MVP 6 parity test") |
| Weight set fails to sum to 100 | Should not occur — both FR6.7 weight sets are fixed constants that already sum to 100; a discrepancy is a code defect, caught by the parity test above, not a runtime branch |

## 7. Appendix A — Ratio, Scorecard & Rating (closed methodology)

Closed by [`Baseline_Scorecard_Extract_v1.2.md`](../../1.%20Planning%20%26%20Prototyping/Baseline_Scorecard_Extract_v1.2.md) — no `PLACEHOLDER` remains. Where the extract and the PRD disagree on methodology, the extract governs (PRD header).

| # | Criterion | Tier 3 | Tier 2 | Tier 1 | Wt renewal | Wt new |
|---|---|---|---|---|---:|---:|
| 1 | WC over revenue | ≥ 20% | 0% ≤ x < 20% | < 0% | 5 | 5 |
| 2 | Current ratio | ≥ 3 | 2 ≤ x < 3 | < 2 | 10 | 10 |
| 3 | Net profit margin | ≥ 30% | 0% ≤ x < 30% | < 0% | 10 | 10 |
| 4 | Debt to equity | 0 < x ≤ 1 | 1 < x < 2 | ≥ 2, or ≤ 0 | 10 | 10 |
| 5 | Paid-up capital cover | ≥ 2× exposure | 1× ≤ x < 2× | < 1× | 5 | 5 |
| 6 | Profitability history | both FY profitable | latest profitable, prior not | latest FY loss, whatever the prior | 15 | 25 |
| 7 | Years registered in SG | ≥ 10 | 5 ≤ x < 10 | < 5 | 5 | 10 |
| 8 | Litigation record | clean, or motor suits only | — | any other record | 10 | 10 |
| 9 | Change in directors, last 3 yrs | no | — | yes | 5 | 5 |
| 10 | Positive net operating cash flow, latest FY | yes | — | no | 10 | 10 |
| 11 | Prompt payment record, past 1 yr | good | — | late, or none held | 15 | 0 |

Rating classes: A 240–300 · B 180–239 · C 100–179 (FR6.8). Dropping any criterion is not a free simplification — weights are normalised to 100 and the 240/180 thresholds are calibrated against that base.

## 8. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
|---|---|---|---|
| `cra_compute_ratios` | Ratio Engine | This agent | Field Review's Review-Complete gate holds for this assessment |
| `cra_compute_rating` | Rating Engine | This agent | Flow A complete for every required ratio and derived input |
| `cra_write_audit` | Both engines | Every module | Every computation |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions).
