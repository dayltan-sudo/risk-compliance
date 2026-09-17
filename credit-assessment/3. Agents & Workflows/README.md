# Credit Assessment — Agents & Workflows

Agent-layer design for Fiscus. Governing documents:

- [`Credit_Assessment_PRD_MVP.md`](../1.%20Planning%20%26%20Prototyping/Credit_Assessment_PRD_MVP.md) (v1.2-MVP) — requirements; §5 defines module ownership
- [`Baseline_Scorecard_Extract_v1.2.md`](../1.%20Planning%20%26%20Prototyping/Baseline_Scorecard_Extract_v1.2.md) — methodology
- `Credit_Assessment_PRD_v0.10.md` — V2 requirement text only

`Credit_Assessment_Agent_Architecture_Plan.html` and `c. State/Credit_Assessment_State_Management_Plan.html` predate the MVP PRD. Where they disagree with this README, this README governs.

## Components

Six modules in PRD §5, held in five MVP files.

**Two model surfaces, at opposite ends of the pipeline.** Extraction (FR2) sits upstream and produces candidate values a human confirms before any reaches a ratio. Risk Commentary (FR11) sits downstream of a finished score, reads it, and writes prose about risks the eleven criteria cannot express. Everything between them is arithmetic.

**Calculation's purity is load-bearing.** A band lookup a model performed cannot be reproduced, which fails the Reproducibility NFR's parity test against the baseline workbook. That is why the commentary is a separate module reading Calculation's output rather than a step inside it.

**Where judgement sits is a separate question from where a model sits.** Field Review is the most judgement-heavy step in the product, and all of that judgement is the analyst's. The module renders a grid, jumps to a source location, records Confirm and Amend, runs nine arithmetic checks, ranks a failed check's operands by movement (FR3.13), and counts what is outstanding. Every one of those is deterministic.

| PRD §5 module | File | Type | Release | File status |
|---|---|---|---|---|
| Intake + Extraction | [Statement Extraction](a.%20Agents/Statement%20Extraction.md) | Deterministic + **Agent** | MVP | Current, v1.2-MVP basis |
| Field Review | [Field Review](a.%20Agents/Field%20Review.md) | Deterministic | MVP | v1.2-MVP basis; discrepancy attribution (FR3.13) not yet written in |
| Calculation | [Scoring & Decisioning](a.%20Agents/Scoring%20%26%20Decisioning.md) | Deterministic | MVP | Current, v1.2-MVP basis |
| Risk Commentary | *(new file needed)* | **Model** | MVP | Not written |
| Record | [Governance & Records](a.%20Agents/Governance%20%26%20Records.md) | Deterministic | MVP | Current, v1.2-MVP basis |
| — | [Adverse-Media Screening](a.%20Agents/Adverse-Media%20Screening.md) | Deterministic + Agent | V2 | Parked, v0.12 basis |
| — | [Assistant Q&A Orchestrator](a.%20Agents/Assistant%20Q%26A%20Orchestrator.md) | Agent | V2 | Parked, v0.12 basis |

## State keys & ownership

All `cra:` keys are application scope and persistent.

| Key | Written by | Read by |
|---|---|---|
| `cra:customer_registry` | Record **only** | Every module |
| `cra:assessment_registry` | Record **only** — mints versions (keyed on Customer + Division), applies transitions through guards, derives relationship type and division, persists Field Review's recency-flag determination | Intake, Extraction, Field Review, Calculation |
| `cra:document_store` | Intake **only** | Extraction, Field Review, Record |
| `cra:extracted_field_store` | Extraction (skeleton rows, values, scale, currency, confidence, pointer) → Field Review (status, amendments) | Calculation (Confirmed/Amended only), Record |
| `cra:criterion_input_store` | Extraction (criterion 5 prefill only) → Field Review (every other input, all statuses) | Calculation (Confirmed/Amended only), Record |
| `cra:integrity_check_store` | Field Review **only** | Record |
| `cra:ratio_store` | Calculation **only** | Record, Risk Commentary |
| `cra:rating_store` | Calculation **only** | Record, Risk Commentary |
| `cra:risk_commentary_store` | Risk Commentary **only** | Record |
| `cra:approval_decision_log` | Record **only** | Record |
| `cra:audit_log` | **Every module**, append-only | Any authenticated user |
| `cra:identity` | *(integration — SSO)* | Record's guards (acting user ID only — no roles or scope at MVP) |

`temp:` keys, discarded after each turn: `temp:extraction_raw` (Extraction), `temp:driver_breakdown` (Calculation).

Removed from v0.12: `cra:recommendation_store`, `cra:scorecard_config`, `cra:user_scope_registry`. V2 keys are listed under V2 components.

**Structural rules, enforced by table grants, not convention:**

1. `cra:assessment_registry` has one writer. No state transition is applied except through a named guard (FR7.3).
2. `cra:audit_log` has no UPDATE or DELETE path for any module.
3. A split store (`extracted_field_store`, `criterion_input_store`) splits by column. The upstream module never writes status. The downstream module never writes the value it did not produce, except as an amendment that retains the original.

## Cross-cutting guardrails

1. **Review gate.** Nothing computes while any review item is Unconfirmed — no ratio, tier, or composite (FR3.8).
2. **Absent is not zero.** An absent input scores tier 1 (FR6.5). A zero divisor scores by the ratio's own semantics (FR4.11–FR4.12).
3. **Never silently overwrite.** Re-upload creates a version (FR1.5). Amendment retains the original (FR3.10). Correcting an approved assessment creates a new one (FR7.8). Each pairs with an audit entry.
4. **Stored results are immutable.** Compute on write, stamp `scorecard_version`, never recompute a stored ratio or rating (FR4.10, FR6.12, FR6.14).
5. **The class is an outcome, not an instruction.** No module writes to an external system (FR6.11).
6. **All authorization goes through guards.** No role, scope, or segregation-of-duties logic anywhere else. Guards allow any authenticated user at MVP (FR7.3, FR7.7).
7. **No scale or currency in computation.** Values are raw absolute from extraction onward. Scale and currency are review provenance only (FR2.3, FR4.9).
8. **No model touches a computed figure.** Extraction is upstream of confirmation (FR2, FR3.8); Risk Commentary is downstream of a finished score and writes only prose (FR11.2). The class an approver sees is always the one the workbook would produce.
9. **Commentary observes, never recommends, and never ranks.** Every observation cites the figures behind it (FR11.3), proposes no action (FR11.4), and carries no severity — an ordinal scale beside a deterministic class becomes a second, unreproducible score (FR11.5).
10. **Nothing found is not the same as not run.** A commentary record is written even when empty (FR11.6), the same distinction the recency flag and integrity checks hold to.

## Build sequence

| Order | Work |
|---|---|
| MVP 1 | Record foundations: customer and assessment registry, audit log, guard layer with allow-all implementations |
| MVP 2 | Intake, then Extraction: field skeleton, raw-absolute normalization, criterion 5 prefill, extraction evaluation harness |
| MVP 3 | Field Review: review grid, integrity checks with discrepancy attribution, recency flag, criterion input screen |
| MVP 4 | Record: relationship type derivation and override |
| MVP 5 | Calculation: four ratios, derived inputs, zero-divisor rules |
| MVP 6 | Calculation: scorecard, composite, class. Parity test against the baseline workbook before continuing |
| MVP 6a | Risk Commentary: observation categories, citation discipline, regeneration on rescore. After the parity test, since it reads a score that must already be correct |
| MVP 7 | Record: submit and approval transitions, customer directory, read-only drill-down |
| MVP 8 | Record: export |

MVP 4 precedes Calculation because the weight set depends on relationship type. MVP 6's parity test is a gate, since the Reproducibility NFR requires the composite to match the workbook — and MVP 6a describes that score, so it cannot start until the score is trusted.

## V2 components

Order and dependencies are in PRD §7.

| Item | V2 state keys |
|---|---|
| Roles, segregation of duties, delegation — new guard implementations only | `cra:identity` gains roles |
| Credit limit sizing and payment terms | Fields added to `cra:rating_store` |
| Qualitative override of the class | Adjustment layer on `cra:rating_store` |
| ACRA and AR-system lookups for criteria 5, 7, 9, 11 | Prefill into `cra:criterion_input_store` |
| Versioned methodology configuration | `cra:scorecard_config` |
| Adverse-media screening | `cra:screening_subject_register`, `cra:screening_run_store`, `cra:adverse_finding_store` |
| Assistant / Q&A | Read-only across existing stores; `temp:query_selection` |
| Refresh linkage, cross-assessment comparison, trend chart, document reuse | Additions to `cra:assessment_registry` and `cra:document_store` |

## Conventions

`# System Instruction:` opens a file that is an actual model prompt — Statement Extraction and Risk Commentary. The other three MVP files open `# Module Specification:`, since they specify deterministic services and a prompt header on them implies a model that is not there. *(Convention agreed; the files still carry the old header.)* Then comes a banner giving module type, release, and companion docs. Numbered sections follow, ending in Failure & Denial Handling and MCP Task-Tool Bindings. Flows are ASCII node graphs. Gates are `$$`-delimited convergence formulas. Every non-obvious claim cites an FR or NFR in the MVP PRD.
