# System Instruction: Field Review

> **Deterministic, MVP.** One component: Field Review, Confirmation & Posting. No LLM in the loop, no judgement call of its own — the judgement lives in the human, this agent's job is to make that judgement recordable and irreversible-by-accident. The only legitimate path from an extracted value into a ratio (FR3.8); the largest single block of Must/MVP sub-requirements in the roster.
>
> **Companion docs:** upstream — [`Statement Extraction.md`](Statement%20Extraction.md). Downstream — [`Scoring & Decisioning.md`](Scoring%20%26%20Decisioning.md) (recompute trigger), [`Governance & Records.md`](Governance%20%26%20Records.md) (re-entry point on Return for Revision).

## 1. Core Mandate & Operational Objectives

Back the core GUI: present every extracted field, grouped by statement section, one row per field with every uploaded period as a column (FR3.1) — the review unit is the assessment on a period axis, not one document. Accept a human's Confirm, Amend, or Not Present decision per field-period cell, and turn that decision into a versioned, auditable record that atomically triggers recomputation downstream.

**Capabilities:** (1) Serve the field × period grid with confidence indicator and source-location jump per cell (FR3.2–FR3.3). (2) Accept Confirm, Amend, Not Present, and bulk-confirm-all-High, all per cell (FR3.4–FR3.5, FR3.7). (3) Retain the original extracted value and confidence on Amend (FR3.6). (4) Count review-item progress per field-period cell, treating Not Present as reviewed (FR3.9). (5) Enforce the FR3.8 gate toward the Ratio Engine in both directions. (6) Normalize currency, version the confirmed record, and fire recomputation — one transaction (§3 below). (7) Serve as the re-entry point when an Approver returns an assessment for revision (FR7.4).

You never decide whether a value is right. You make it possible for someone else's decision to be recorded, reversed-with-history, and impossible to lose.

## 2. State Management

**Reads:** `cra:extracted_field_store` (values, confidences, source pointers written by Statement Extraction), `cra:assessment_registry` (which assessment is in scope), `cra:user_scope_registry` (role gate, NFR RBAC).

**Writes:** `cra:extracted_field_store` (status, amendment history — the status/amendments half of this store; value/confidence/pointer belong to Statement Extraction).

**Session keys:** `review_context` (assessment_id, statement section in view), `review_item_count` (field-period cells, confirmed vs. outstanding), `pending_confirmation`.

**Temp keys:** none — every action in this agent either commits atomically or does not happen; there is no intermediate state worth buffering across a turn.

## 3. Flow A: Confirm / Amend / Not Present

One action, one atomic transaction — the core guarantee this agent exists to hold.

```
[Entry: cra_confirm_field — assessment_id, field_id, period, action
        (Confirm | Amend | Not Present), amended_value (Amend only),
        reason (optional)]
                 │
                 ▼
[Node 1: Load Cell] ──► Reads the field-period cell from
                         cra:extracted_field_store, scoped to this
                         assessment only
                 │
                 ▼
          ◇ action? ◇
    Confirm    │Amend                    │Not Present
      │         ▼                         ▼
      │  [Node 2a: Retain Original] ─►  [Node 2c: Positive
      │  extracted value + confidence     Absence] ─► Asserts
      │  preserved in amendment_          the line item is
      │  history (FR3.6)                  genuinely absent from
      │         │                          the source — not an
      │         ▼                          unreviewed empty state
      │  [Node 2b: Write Amended                 │
      │   Value]                                 │
      │         │                                │
      └─────────┴───────────────┬────────────────┘
                                 ▼
                  [Node 3: Status Transition] ──► Unconfirmed → Confirmed |
                                                   Amended | Not Present
                                                   (FR3.7) — one of three
                                                   terminal states
                                 │
                                 ▼
                  [Node 4: Currency Normalization] ──► Applied at write time
                                 │
                                 ▼
                  [Node 5: Versioned Write] ──► Into this assessment's own
                                                 field scope only (FR1.7) —
                                                 never crosses into another
                                                 assessment citing the same
                                                 document
                                 │
                                 ▼
                  [Node 6: Audit Entry] ──► cra_write_audit, before/after
                                             value
                                 │
                                 ▼
                  [Node 7: Recompute Trigger] ──► Fires unconditionally —
                                                   this node is not
                                                   optional (FR4.3)
                                 │
                                 ▼
       [Output: field-period cell status updated] ──► Scoring & Decisioning
                                                        (Ratio Engine)
```

Trigger: `cra_confirm_field`, sole caller this agent, precondition assessment in Draft or Returned-for-Revision state (FR3.8 gate context). Nodes 1–7 commit or fail as one transaction — a lost message between recompute-trigger and the versioned write would leave a field that looks Confirmed next to ratios computed from its old value, with nothing on screen to indicate the mismatch. This is the failure mode this agent exists to make impossible.

## 4. Flow B: Bulk Confirm

```
[Entry: cra_bulk_confirm — assessment_id, statement section]
                 │
                 ▼
[Node 1: Select Eligible Cells] ──► Every field-period cell at High
                                     confidence band and currently
                                     Unconfirmed in this section
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

Bulk-confirm never touches a Medium or below cell, and never touches a cell in another assessment — even one sharing the same source document (FR1.7).

## 5. Confirmation Convergence

Gates every transition into the Ratio Engine:

$$\text{Field Ready} = \left( \text{status} \in \{\text{Confirmed}, \text{Amended}, \text{Not Present}\} \right) \lor \left( \text{status} = \text{Unconfirmed} \land \text{Ratio.provisional\_flag} = \text{true} \right)$$

A field never simply vanishes from a ratio's inputs. Unconfirmed inputs compute and flag the ratio **Provisional** — never excluded (FR3.8, this document's central guardrail); a Not Present input makes the ratio **Not Calculable**, storing no value. Precedence runs one way: Not Present wins over Provisional whenever both could apply, so a ratio is never both (architecture plan §10).

## 6. Flow C: Return-for-Revision Re-Entry

```
[Entry: Approval Workflow's Return-for-Revision decision, with comments]
                 │
                 ▼
[Node 1: Re-open Assessment at Draft] ──► Governance & Records transitions
                                           state; this agent does not
                 │
                 ▼
[Node 2: Surface Approver Comments] ──► Attached to the relevant field(s)
                                         or assessment-level, per the
                                         Approver's input
                 │
                 ▼
[Output: Review grid re-entered] ──► Flow A available again on any cell,
                                      including previously Confirmed ones
```

A returned assessment's already-Confirmed cells are not reset — only the ones the analyst chooses to revisit re-enter Flow A. Revisiting one triggers the same Flow A Node 7 recompute.

## 7. Worked Example — Review-Item Counting (FR3.9)

Illustrative placeholder data. 34 fields × 3 periods = 102 review items; Not Present counts as reviewed, not outstanding.

| Statement section | Fields | Periods | Items | Confirmed | Amended | Not Present | Outstanding |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Balance sheet | 14 | 3 | 42 | 36 | 4 | 2 | 0 |
| Income statement | 11 | 3 | 33 | 28 | 3 | 0 | 2 |
| Cash flow | 9 | 3 | 27 | 20 | 1 | 3 | 3 |
| **Total** | **34** | | **102** | **84** | **8** | **5** | **5** |

Submission is blocked while any Provisional ratio stands (FR3.10) — the 5 outstanding items above, all Unconfirmed, keep at least one ratio Provisional until reviewed.

## 8. Failure & Denial Handling

| State | Behaviour |
| :--- | :--- |
| Confirm/Amend/Not Present attempted on a field in another assessment | Rejected — this agent enforces assessment-scoped writes structurally, not by convention |
| Amend with no amended_value supplied | Rejected — a value is mandatory input for Amend, not optional |
| Bulk-confirm on a section with no High-confidence cells | No-op, not an error — nothing eligible, nothing changes |
| Recompute trigger fails mid-transaction | Entire Flow A transaction rolls back — no field left Confirmed with stale downstream ratios |
| Confirm attempted on an already-terminal cell (Confirmed/Amended/Not Present) | Treated as an Amend to that state if the value differs — original retained per FR3.6 regardless of which terminal state preceded it |
| Currency mismatch across periods within one field | Blocked at Node 4 (Currency Normalization, §3) — reject the mismatched period rather than invent an FX treatment at an unspecified rate and date; this guardrail is enforced by this agent, not by Governance & Records |
| Return-for-Revision re-entry on an assessment not in Returned state | Rejected — Flow C's Node 1 precondition unmet |

## 9. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
| :--- | :--- | :--- | :--- |
| `cra_confirm_field` | Confirm / Amend / Not Present | This agent | Assessment in Draft or Returned-for-Revision; caller holds field-level access under NFR RBAC |
| `cra_bulk_confirm` | Bulk-confirm-all-High | This agent | At least one High-confidence Unconfirmed cell in the targeted section |
| `cra_write_audit` | Every action | Every agent | Every status transition and amendment |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions).
