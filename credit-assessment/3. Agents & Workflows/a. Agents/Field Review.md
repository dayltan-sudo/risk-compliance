# System Instruction: Field Review

> **Deterministic, MVP.** One PRD §5 module: Field Review. No LLM in the loop — the only legitimate path from an extracted value or an analyst-entered criterion into a ratio (FR3.8), and the largest single block of Must/MVP requirements in the roster.
>
> **Companion docs:** upstream — [`Statement Extraction.md`](Statement%20Extraction.md) (fields and the criterion 5 prefill). Downstream — [`Scoring & Decisioning.md`](Scoring%20%26%20Decisioning.md) (compute trigger), [`Governance & Records.md`](Governance%20%26%20Records.md) (re-entry point on Return for Revision; owns `Assessment.recency_flag`, which this agent computes but does not write), [`Risk Commentary.md`](Risk%20Commentary.md) (reads this agent's Confirmed/Amended fields and criterion inputs read-only, alongside Calculation's output — this agent has no relationship to it beyond being a data source).

## 1. Core Mandate & Operational Objectives

Back the core GUI: present every extracted field grouped by statement, one row per field with both periods as columns (FR3.1), and a separate entry screen for the five non-financial criteria (FR5.1). Accept a human's Confirm or Amend per field-period cell and per criterion input, turn each into a versioned, auditable record, run the integrity checks and recency determination that ride alongside review, and gate everything downstream until every review item is terminal.

**Capabilities:** (1) Serve the field × period grid with confidence indicator, source scale/currency, and source-location jump per cell (FR3.1–FR3.3). (2) Accept Confirm (with or without a value, asserting genuine absence) and Amend, per cell, retaining the original on Amend (FR3.4–FR3.5, FR3.10). (3) Bulk-confirm all High-confidence cells at once (FR3.9). (4) Run the nine FR3.7 integrity checks after extraction and surface every failure, anchored to its fields, with a signed difference and an operand movement ranking on every failure, never blocking (FR3.6, FR3.13). (5) Compute the FR3.12 statement recency flag and hand it to Governance & Records for persistence. (6) Serve the FR5 criterion-input screen — five criteria, each with its own validation, evidence requirements, and visibility rule — through the same Confirm/Amend lifecycle. (7) Count review-item progress across both field-period cells and criterion inputs (FR3.11). (8) Enforce the FR3.8 gate in both directions: nothing computes while anything is Unconfirmed, and any amendment after computation reopens it (FR4.8). (9) Serve as the re-entry point when an assessment is Returned for Revision (FR7.4).

You never decide whether a value is right. You make it possible for someone else's decision to be recorded, reversed-with-history, and impossible to lose.

## 2. State Management

**Reads:** `cra:extracted_field_store` (values, confidences, source pointers written by Extraction), `cra:document_store` (FR3.3's source viewer), `cra:criterion_input_store` (Extraction's criterion 5 prefill; this agent's own prior writes to criteria 7, 8, 9, 11), `cra:assessment_registry` (state — Draft or Returned-for-Revision gate; `relationship_type` — governs criterion 11's visibility, FR5.5, and reacts to a later change, FR5.14).

**Writes:** `cra:extracted_field_store` (status, amendment_history — the status/amendment half; value/confidence/pointer belong to Extraction). `cra:criterion_input_store` (value for criteria 7, 8, 9, 11 in full; status and amendment_history on all five, including criterion 5's Extraction-sourced value). `cra:integrity_check_store` (sole writer).

**Calls, no direct write:** `cra_set_recency_flag` — this agent computes the FR3.12 determination but hands it to Governance & Records, which alone writes `Assessment.recency_flag`; this agent has no write path into `cra:assessment_registry`.

**Session keys:** `review_context` (assessment_id, statement section or criterion in view), `review_item_count` (field-period cells plus criterion inputs, FR3.11), `pending_confirmation`, `integrity_check_results`, `recency_determination`.

**Temp keys:** none — every action either commits atomically or does not happen; there is no intermediate state worth buffering across a turn.

## 3. Flow A: Confirm / Amend a Field-Period Value

One action, one atomic transaction.

```
[Entry: cra_confirm_field — assessment_id, field_id, period, action
        (Confirm | Amend), value (Amend: required; Confirm: optional —
        null asserts the line item is genuinely absent from the source,
        FR3.5), reason (optional, Amend only)]
                 │
                 ▼
[Node 1: Load Cell] ──► Reads the field-period cell from
                         cra:extracted_field_store, scoped to this
                         assessment only
                 │
                 ▼
          ◇ action? ◇
    Confirm    │                              │Amend
      │        ▼                              ▼
      │  [Node 2a: Write As-Is]        [Node 2b: Retain Original]
      │  Extracted value accepted,      Extracted value + confidence
      │  or accepted as genuinely       preserved in amendment_history
      │  absent (value = null)          (FR3.10)
      │        │                              │
      │        │                              ▼
      │        │                       [Node 2c: Write Amended Value]
      │        │                       Mandatory new value — Amend
      │        │                       without one is rejected
      │        └──────────────┬───────────────┘
      │                       ▼
      └──────────► [Node 3: Status Transition] ──► Unconfirmed →
                    Confirmed | Amended (FR3.4) — both terminal; no
                    separate "absent" status, absence is carried by a
                    null value (FR3.5)
                                │
                                ▼
                 [Node 4: Versioned Write] ──► Into this assessment's
                                                own field scope only
                                │
                                ▼
                 [Node 5: Audit Entry] ──► cra_write_audit, before/after
                                            value
                                │
                                ▼
                 [Node 6: Review-Complete Check] ──► §5's gate — fires
                                                       cra_compute_ratios
                                                       only once every
                                                       review item is
                                                       terminal, first
                                                       time (FR3.8,
                                                       FR4.1) or re-
                                                       trigger (FR4.8)
                                │
                                ▼
      [Output: field-period cell status updated] ──► Scoring &
                                                        Decisioning, only
                                                        when the gate
                                                        holds
```

Trigger: `cra_confirm_field`, sole caller this agent, precondition assessment in Draft or Returned-for-Revision. Nodes 1–6 commit or fail as one transaction — a lost message between the status write and the compute-trigger check would leave a field that looks Confirmed with no ratio reflecting it, with nothing on screen to indicate the mismatch. This is the failure mode this agent exists to make impossible.

## 4. Flow B: Bulk Confirm

```
[Entry: cra_bulk_confirm — assessment_id, statement section]
                 │
                 ▼
[Node 1: Select Eligible Cells] ──► Every field-period cell at High
                                     confidence and currently Unconfirmed
                                     in this section (FR3.9)
                 │
                 ▼
[Node 2: Per-Cell Confirm] ──► Re-enters Flow A Node 3 onward for each
                                selected cell — same atomicity per cell,
                                not one transaction across all of them
                 │
                 ▼
[Output: multiple cells confirmed] ──► A field High in one period and
                                        Medium in another has only its
                                        High cell bulk-confirmed
```

Bulk-confirm never touches a Medium-or-below cell, and never touches a cell in another assessment.

## 5. Review-Complete Convergence

Gates every trigger of `cra_compute_ratios`:

$$\text{Review Complete} = \forall \text{ field-period cells} \cup \text{ criterion inputs} : \text{status} \in \{\text{Confirmed}, \text{Amended}\}$$

No exceptions, no partial-data compute (FR3.8). A field or criterion input never counts as reviewed by any state other than these two — there is no Provisional or Not Present status to fall back to (v0.12's ratio states are removed; see README).

## 6. Flow C: Integrity Checks (FR3.6–FR3.7)

Runs automatically once Extraction's Flow B completes — not tied to any confirm action.

```
[Entry: Statement Extraction's Flow B complete for this assessment]
                 │
                 ▼
[Node 1: Load Operand Fields] ──► Both periods' extracted values for the
                                   nine checks below
                 │
                 ▼
[Node 2: Evaluate] ──► Six inequalities, exact. Three equalities,
                        passing within 0.1% of Total Assets — a relative
                        tolerance, since raw-number extraction (FR2.3)
                        makes the baseline's absolute ±1 fail every
                        statement reported in thousands
                 │
                 ▼
          ◇ passed? ◇
    Pass      │                                    │Fail
      │       │                                    ▼
      │       │                    [Node 2a: Signed Difference] ──►
      │       │                    expected − actual on the check's own
      │       │                    equation, kept signed, not absolute
      │       │                    (FR3.13)
      │       │                                    │
      │       │                                    ▼
      │       │                    [Node 2b: Rank Operands by Movement]
      │       │                    ──► Each operand field's own period-
      │       │                    over-period change, same formula as
      │       │                    FR4.6 — computed locally here, not
      │       │                    read from Calculation, since this
      │       │                    flow fires on Extraction's Flow B
      │       │                    completion, before any review item
      │       │                    is terminal and before Calculation
      │       │                    has run at all. Arithmetic, not
      │       │                    judgement — no model (FR3.13).
      │       │                    Ranked highest-movement first, so
      │       │                    the operand that moved most surfaces
      │       │                    first. An operand whose prior-period
      │       │                    value is absent is excluded from the
      │       │                    ranking, not defaulted to zero or
      │       │                    last place — its movement is not
      │       │                    calculable, the same non-
      │       │                    substitution rule FR4.6 applies.
      │       │                    Where every operand in the check has
      │       │                    no prior value, the ranking is empty
      │       │                    and Node 3 writes the difference
      │       │                    alone
      │       └────────────────────┬───────────────────┘
      │                            ▼
      └───────────────► [Node 3: Write] ──► cra:integrity_check_store,
                          each result anchored to the exact operand
                          field IDs it tested, plus — on failure —
                          the signed difference and the movement
                          ranking (or its absence)
                 │
                 ▼
[Output: IntegrityCheckResult rows] ──► Surfaced on the review screen,
                                          ranked operand first on a
                                          failure. A failure never
                                          blocks computation (FR3.8's
                                          gate is untouched by this
                                          flow) and never names an
                                          operand as wrong — it directs
                                          attention only. Every operand
                                          remains an independent review
                                          item the analyst must Confirm
                                          or Amend regardless (FR3.11)
```

**The nine checks.** NPAT ≤ Sales · Cash ≤ Current Assets · Current Assets ≤ Total Assets · Non-Current Assets ≤ Total Assets · Current Liabilities ≤ Total Liabilities · Non-Current Liabilities ≤ Total Liabilities · Total Assets = Current Assets + Non-Current Assets (0.1% tolerance) · Total Liabilities = Current Liabilities + Non-Current Liabilities (0.1% tolerance) · Total Equity + Total Liabilities = Total Assets (0.1% tolerance).

## 7. Flow D: Statement Recency Flag (FR3.12)

Runs alongside Flow C, same trigger.

```
[Entry: Statement Extraction's Flow B complete for this assessment]
                 │
                 ▼
[Node 1: Load Latest Period's financials_date]
                 │
                 ▼
[Node 2: Compare] ──► earlier than today − 540 days → Non-Recent, else
                       Recent
                 │
                 ▼
[Node 3: Hand to Governance & Records] ──► cra_set_recency_flag —
                                            Record is Assessment's sole
                                            writer; this agent computes
                                            the value, never writes it
                 │
                 ▼
[Output: cra:assessment_registry.recency_flag] ──► Held on the
                                                     assessment, not the
                                                     document — one
                                                     verdict for the
                                                     whole assessment.
                                                     Advisory only: no
                                                     effect on any tier,
                                                     ratio, or score
```

## 8. Flow E: Criterion Input Review (FR5)

Five criteria — 5, 7, 8, 9, 11 — each an analyst-entered field, confirmed like any extracted field, that scores against the scorecard's bands with no further analyst step. Criterion 5 may already carry Extraction's prefill (Flow D of [`Statement Extraction.md`](Statement%20Extraction.md)) at Unconfirmed; criteria 7, 8, 9, 11 start fully blank — this agent is their sole source of value.

```
[Entry: cra_confirm_criterion — assessment_id, criterion_number (5 | 7 |
        8 | 9 | 11), action (Confirm | Amend), value(s), evidence fields
        (criteria 8, 11 only), reason (optional)]
                 │
                 ▼
[Node 1: Load Criterion Row] ──► Including Extraction's prefill and its
                                  source, for criterion 5
                 │
                 ▼
[Node 2: Visibility Gate] ──► Criterion 11 hidden entirely when
                               relationship_type = New (FR5.5) — zero
                               contribution is written explicitly by
                               Scoring & Decisioning (FR6.6), never
                               left unevaluated
                 │
                 ▼
[Node 3: Per-Criterion Validation] ──► See table below
                 │
                 ▼
[Node 4: Status Transition] ──► Unconfirmed → Confirmed | Amended,
                                 same lifecycle as Flow A
                 │
                 ▼
[Node 5: Rescore Notice] ──► Amending criterion 5's total exposure
                              rescores the assessment, surfaced on
                              screen (FR5.4). Any criterion amendment
                              after computation re-runs the affected
                              tier and composite generally (FR4.8)
                 │
                 ▼
[Node 6: Audit Entry]
                 │
                 ▼
[Node 7: Review-Complete Check] ──► Same gate as Flow A Node 6 — a
                                     criterion input counts exactly like
                                     a field-period cell (§5)
                 │
                 ▼
      [Output: criterion input status updated] ──► Scoring &
                                                      Decisioning, only
                                                      when the gate holds
```

**Per-criterion validation (Node 3).**

| Criterion | Input | Validation |
|---|---|---|
| 5 — Paid-up capital cover | Paid-up capital, total exposure | Both figures must share a currency — reject a mismatch, never convert (FR5.6). Total exposure must be > 0 — reject zero or negative at entry (FR5.15). Total exposure is scoped to the assessing division only; MVP does not aggregate exposure across divisions (FR5.16) |
| 7 — Years registered in SG | Year first registered to operate in Singapore | Own incorporation year for an SG-incorporated company, or the ACRA branch/subsidiary registration year for a foreign-incorporated one (FR5.9) — never an overseas incorporation date |
| 8 — Litigation record | Clean / Motor suits only / Other record + source searched + date searched | Both evidence fields required to confirm; neither affects the tier (FR5.10) |
| 9 — Change in directors, last 3 yrs | Yes / No | Director appointed or resigned only, per the ACRA officer register — company secretary and auditor changes, and shareholding changes, do not count (FR5.11) |
| 11 — Prompt payment record | Good / Late / None held + system checked + period covered | Both evidence fields required to confirm; neither affects the tier (FR5.12). Not collected at all for New customers — Node 2 hides it |

## 9. Flow F: Relationship-Type Change Reaction (FR5.14)

Triggered by Governance & Records when an analyst overrides `relationship_type` (FR5.13) on an assessment where criterion 11 has already been touched.

```
[Entry: Governance & Records signals a relationship_type change for this
        assessment]
                 │
                 ▼
          ◇ New value? ◇
    New       │                              │Renewal
      ▼                                       ▼
[Node 1a: Zero and Hide]          [Node 1b: Reveal as Unconfirmed]
Criterion 11's contribution        Criterion 11's input becomes
is zeroed (FR6.6, Scoring &        visible and required. Never
Decisioning's job); its input      inherits a value from before a
is hidden here. Any prior          prior New designation — always
confirmed value is not carried     starts Unconfirmed on reveal
forward as reviewed
      │                                       │
      └──────────────────┬────────────────────┘
                          ▼
           [Node 2: Review-Complete Check] ──► Re-evaluated under §5 —
                                                 switching to Renewal
                                                 reopens the gate until
                                                 criterion 11 is supplied
                                                 (FR5.14)
```

## 10. Flow G: Return-for-Revision Re-Entry

```
[Entry: Governance & Records's Return-for-Revision decision, with
        comments]
                 │
                 ▼
[Node 1: Re-open Assessment at Draft] ──► Governance & Records
                                           transitions state; this agent
                                           does not
                 │
                 ▼
[Node 2: Surface Comments] ──► Attached to the relevant field(s),
                                criterion input(s), or assessment-level
                 │
                 ▼
[Output: Review grid re-entered] ──► Flows A and E available again on
                                       any cell or criterion, including
                                       previously terminal ones
```

A returned assessment's already-terminal cells are not reset — only the ones the analyst chooses to revisit re-enter Flow A or E. Revisiting one re-triggers Node 6/7's compute check.

## 11. Worked Example — Review-Item Counting (FR3.11)

11 fields × 2 periods = 22 field-period items, plus the five FR5 criterion inputs (four for a New customer — criterion 11 hidden, FR5.5).

| Customer type | Field-period items | Criterion inputs | Total review items |
|---|---|---|---|
| New | 22 | 4 | 26 |
| Renewal | 22 | 5 | 27 |

Submission is blocked while any review item is Unconfirmed (FR3.8) — nothing computes, so no class exists for FR7.2's submit precondition to find.

## 12. Failure & Denial Handling

| State | Behaviour |
|---|---|
| Confirm/Amend attempted on a field or criterion in another assessment | Rejected — assessment-scoped writes are enforced structurally, not by convention |
| Amend with no value supplied | Rejected — a value is mandatory input for Amend, not optional |
| Confirm attempted with no value on a criterion input | Rejected — criterion inputs have no FR3.5-style "confirmed absent" path; a criterion is either supplied or left Unconfirmed |
| Bulk-confirm on a section with no High-confidence cells | No-op, not an error |
| Criterion 5: currency mismatch between paid-up capital and total exposure | Rejected at Node 3 — no conversion is performed (FR5.6) |
| Criterion 5: total exposure ≤ 0 | Rejected at entry (FR5.15) |
| Criterion 8 or 11 confirmed with a tier but missing evidence field(s) | Rejected — both evidence fields are required to confirm (FR5.10, FR5.12) |
| Criterion 11 input attempted for a New customer | Rejected — hidden and not collected while relationship_type = New (FR5.5) |
| Confirm attempted on an already-terminal cell (Confirmed/Amended) | Treated as an Amend if the value differs — original retained per FR3.10 regardless of which terminal state preceded it |
| Return-for-Revision re-entry on an assessment not in Returned state | Rejected — Flow G's Node 1 precondition unmet |
| `cra_set_recency_flag` call fails | The originating extraction-completion event is not considered fully processed; retried, never silently dropped |
| A failed integrity check's operands all lack a prior-period value | Ranking is empty by design, not an error — the signed difference is still written and shown alone (FR3.13) |

## 13. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
|---|---|---|---|
| `cra_confirm_field` | Confirm / Amend a field-period value | This agent | Assessment in Draft or Returned-for-Revision |
| `cra_bulk_confirm` | Bulk-confirm-all-High | This agent | At least one High-confidence Unconfirmed cell in the targeted section |
| `cra_confirm_criterion` | Confirm / Amend a criterion input | This agent | Assessment in Draft or Returned-for-Revision; criterion 11 only when relationship_type = Renewal |
| `cra_set_recency_flag` | Persist the recency determination | This agent invokes; Governance & Records writes | Extraction's Flow B complete for this assessment |
| `cra_write_audit` | Every action | Every module | Every status transition and amendment |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions).
