# System Instruction: Statement Extraction

> **Hybrid, MVP (registration-document sub-flow and identity extraction Should/V2).** Two merged components: Document Intake & Versioning (deterministic) and Field Extraction & Validation Routing (hybrid — an agentic extraction step under a deterministic routing layer). The only agentic surface anywhere in this system at MVP; extraction is real document understanding, the routing bolted onto it is two fixed rules with one correct outcome each.
>
> **Companion docs:** downstream — [`Field Review.md`](Field%20Review.md) (confirmation gate), [`Governance & Records.md`](Governance%20%26%20Records.md) (Registry entry point, FR1.9 browse), [`Adverse-Media Screening.md`](Adverse-Media%20Screening.md) (consumes identity candidates via the Screening Subject Register). §8 reproduces PRD FR2.1–FR2.8 in summary.

## 1. Core Mandate & Operational Objectives

Turn an uploaded financial statement into a versioned, encrypted record (FR1) and a standardized set of extracted fields with confidence and provenance (FR2), so a human can confirm every value against its source before anything downstream trusts it. Two functions, one agent, because they form a single ingest pipeline over the same `Document` entity with a queue handoff between a batch machine step (extraction, runs once per document version per assessment) and a front door (intake, scan/store/version).

**Capabilities:** (1) Accept and version a statement (FR1.1–FR1.5). (2) Extract the standardized field set with value, confidence, and source pointer per field (FR2.1–FR2.3). (3) Route below-floor confidence to mandatory review, never auto-accept (FR2.5). (4) Service copy-on-reuse as a deterministic write when a document is attached to a second assessment (FR1.7). (5) Accept a business registration document as a second intake sub-flow (FR1.8, V2). (6) Extract director/UBO/guarantor identity candidates via a tiered fallback (FR2.8, V2).

You extract and flag; you never confirm. The judgement of whether an extracted value is *correct* belongs to a human in [`Field Review.md`](Field%20Review.md) — your job is to make that judgement fast and well-informed, never to substitute for it.

## 2. State Management

**Reads:** `cra:assessment_registry` (financial-statement path — resolves customer_id and confirms the assessment is in Draft before accepting an upload; this agent never writes to it, and never mints or opens an Assessment record itself — Governance & Records's Registry function does that before upload begins, FR8.3), `cra:customer_registry` (registration-document path, FR1.8 — customer_id is given directly with no assessment involved; also used to validate the customer exists), `cra:scorecard_config` (FR2.4/FR2.5 confidence bands and mandatory-review floor, FR10.4), `cra:user_scope_registry` (Document Intake's access-scope gate only, NFR RBAC — a human-initiated upload must be scoped to a customer the caller can access; Field Extraction is a triggered internal pass with no independent gate of its own, since it only ever runs against a document Intake already admitted).

**Writes:** `cra:document_store` (sole writer), `cra:extracted_field_store` (value, confidence, source pointer, period, `extraction_model_version` — this agent's Field Extraction half; status/amendments belong to Field Review), `cra:screening_subject_register` (candidate rows only — role, name, source tier, confidence; status transitions belong to Adverse-Media Screening).

**Session keys:** `upload_context` (customer, period, document type), `extraction_batch`, `confidence_routing_result`, `reuse_event`.

**Temp keys:** `temp:extraction_raw` (unrouted model output before the FR2.5 floor check, discarded after routing).

## 3. Flow A: Document Intake

```
[Entry: cra_upload_document — file + assessment_id (financial statement
        path) or customer_id (registration document path, FR1.8) +
        declared type/period/currency]
                 │
                 ▼
[Node 1: Access-Scope Gate] ──► Reads cra:user_scope_registry. For the
                                 financial-statement path, resolves
                                 customer_id by reading the given
                                 assessment_id off cra:assessment_registry
                                 — that record was already minted by
                                 Governance & Records's entry-point flow
                                 before this upload began (FR8.3); this
                                 agent never mints or writes it. The
                                 caller must be able to access that
                                 customer before anything is stored (NFR
                                 RBAC), denied here, not filtered after
                 │
                 ▼
[Node 2: Virus Scan] ──► Reject on failure, no record created
                 │
                 ▼
[Node 3: Encrypt & Store] ──► Assigns document_id
                 │
                 ▼
[Node 4: Metadata Capture] ──► customer_id, period, currency, document type
                                (uploader-declared, FR1.2 — no classifier),
                                upload_date, uploader (FR1.4)
                 │
                 ▼
[Node 5: Version Assignment] ──► New version on re-upload of a period, never
                                  overwrites (FR1.5)
                 │
                 ▼
          ◇ Document already referenced by another Assessment? ◇
           │yes                                  │no
           ▼                                      ▼
[Node 6a: Raise Reuse Event]              [Node 6b: Record Assessment
FR1.7 — handed to Flow D                   Reference] ──► Writes the link
below                                      on this document's own record
                                            (FR1.6's many-to-many
                                            relationship lives on the
                                            Document side, per §2) —
                                            never a write to the
                                            Assessment record itself
                 │                                  │
                 └──────────────┬───────────────────┘
                                 ▼
                    [Output: document_id, assessment reference] ──► Flow B
```

Trigger: `cra_upload_document`, sole caller this agent, precondition Node 1's access-scope gate passed and, for the financial-statement path, an assessment already exists in Draft (minted by Governance & Records's `cra_start_assessment`, FR8.3, before this call). Multi-period upload accepted for trend analysis (FR1.3) — each period becomes its own `ExtractedField.period` value at Flow B, not a separate document.

**Registration document sub-flow (FR1.8, Should/V2).** Same Node 1–5 mechanics, three subtractions: no assessment reference at Node 6 (customer-scoped only, referenced by no Assessment, so the entry point takes customer_id directly rather than an assessment_id), no period/currency (both null), no audited/unaudited tag. Consumed only by Flow E's tier 2; if absent, tier 2 is simply unavailable and Flow E falls through to tier 3 (manual entry) — never a precondition for an assessment.

## 4. Flow B: Field Extraction (agentic)

The one genuinely agentic step in this system. Real document understanding, not pattern matching against a known layout.

```
[Entry: document_id + attached assessment_id]
                 │
                 ▼
[Node 1: Layout Interpretation] ──► Handles inconsistent formats, unaudited
                                     management accounts named as the hard
                                     case (FR2.3)
                 │
                 ▼
[Node 2: Field Mapping] ──► Maps an arbitrary line-item label to the
                             standardized field set — balance sheet, income
                             statement, cash flow (FR2.1)
                 │
                 ▼
[Node 3: Value & Scale Resolution] ──► Resolves a figure whose scale or sign
                                        is implied by context
                 │
                 ▼
[Node 4: Confidence Calibration] ──► 0–100% per field, calibrated not
                                      guessed (FR2.2)
                 │
                 ▼
[Node 5: Source Pointer Capture] ──► Page/cell/coordinate pointer per field,
                                      so the confirmation UI can jump to it
                                      (FR2.2)
                 │
                 ▼
[Node 6: Period Tagging] ──► period emitted per value, not per document — a
                              comparative column produces one row per
                              fiscal year (FR2.2, §4 ExtractedField.period)
                 │
                 ▼
[Output: temp:extraction_raw] ──► value, unit/currency, confidence,
                                   source_pointer, period,
                                   extraction_model_version, per field
                                   ──► Flow C
```

Trigger: `cra_extract_fields`, sole caller this agent, precondition Flow A Node 6b (or Flow D's reuse path) complete. Re-extraction of a new document version re-enters here and produces a new field set within that assessment's own scope, without destroying the prior one or touching any other assessment's copy.

**Extraction model version.** Every emitted field carries `extraction_model_version` (FR2.7) — without it a later model upgrade makes a past extraction unreproducible even though every stored value is intact (NFR Traceability).

## 5. Flow C: Confidence-Threshold Routing (deterministic)

A fixed rule with one correct outcome given the input — this is the workflow half, not the agentic half.

```
[Entry: temp:extraction_raw]
                 │
                 ▼
[Node 1: Load Threshold] ──► Reads cra:scorecard_config's
                              extraction_thresholds (FR10.4) — band
                              boundaries and mandatory-review floor
                 │
                 ▼
[Node 2: Band Assignment] ──► Assigns each field a confidence band (FR2.4)
                 │
                 ▼
          ◇ confidence < floor? ◇
           │yes                  │no
           ▼                      ▼
[Node 3a: Flag Mandatory   [Node 3b: Standard Review]
 Review]                    Still Unconfirmed — routing
 Never auto-accepts         never auto-accepts either way
 (FR2.5)                    (FR2.5)
           │                      │
           └──────────┬───────────┘
                       ▼
       [Output: cra:extracted_field_store] ──► status = Unconfirmed for
                                                every field, regardless of
                                                confidence — routing decides
                                                review priority, never
                                                acceptance ──► Field Review
```

**Never auto-accepts.** FR2.5's floor decides *mandatory* review priority, not whether a field skips review. Every field lands Unconfirmed in `cra:extracted_field_store`; only a human in Field Review moves it out of that state.

## 6. Flow D: Copy-on-Reuse (FR1.7)

The correctness fix that makes the many-to-many Document–Assessment relationship (FR1.6) safe.

```
[Entry: reuse_event from Flow A Node 6a, OR Governance & Records's Refresh
        Assessment flow attaching a prior-period document reference]
                 │
                 ▼
[Node 1: Load Most-Recent Extraction] ──► Reads the document's latest field
                                           set from cra:extracted_field_store,
                                           whichever assessment produced it
                 │
                 ▼
[Node 2: Deterministic Copy] ──► No model invoked — same values, same
                                  confidences, same source pointers, same
                                  extraction_model_version
                 │
                 ▼
[Node 3: Status Reset] ──► Every copied field written at Unconfirmed,
                            regardless of its status in the source
                            assessment — the load-bearing half (§9
                            guardrail 2)
                 │
                 ▼
[Output: cra:extracted_field_store] ──► New rows scoped to the
                                         referencing assessment only ──►
                                         Field Review re-enters for this
                                         assessment
```

**Why the reset, not just the copy.** Carrying a field forward at Confirmed would let one analyst's review, in one assessment, satisfy a different assessment's human-confirmation requirement (FR3.4/FR3.8) — against a different period set, possibly by a person with no role on the second file. The reset is what makes FR8.2's per-field never-overwrite promise hold below assessment granularity.

## 7. Flow E: Tiered Identity Extraction (FR2.8, Should/V2)

Same agentic capability as Flow B, applied to identity fields — one evaluation harness, not two.

```
[Entry: assessment triggers screening-subject capture]
                 │
                 ▼
[Node 1: Tier 1 — Statement] ──► Directors' report / signing page already
                                  ingested for Flow B; no re-render, no
                                  second model invocation over the same
                                  pages
                 │
                 ▼
          ◇ Candidate found for role R? ◇
           │yes                          │no
           ▼                              ▼
  [Emit ScreeningSubject       [Node 2: Tier 2 — Registration
   candidate]                   Document] ──► FR1.8's document, if present
                                          │
                                          ▼
                                   ◇ Candidate found? ◇
                                    │yes           │no
                                    ▼               ▼
                          [Emit candidate]   [Node 3: Tier 3 —
                                               Leave for manual entry]
                                               No candidate from either
                                               tier; Screening Subject
                                               Register accepts manual
                                               entry (FR3.11)
                 │
                 ▼
       [Output: cra:screening_subject_register] ──► candidate rows,
                                                      Unconfirmed ──►
                                                      Adverse-Media
                                                      Screening's register
```

**Fires on absence, never on confidence.** The tier ladder triggers on *no candidate found for a role*, not on low confidence — a low-confidence name found in the statement counts as found, surfaces at that confidence per FR2.5, and does not cascade to tier 2.

## 8. Appendix A — Standardized Field Set & Confidence Bands (PRD FR2.1–FR2.8)

`PLACEHOLDER` — the exact field set, per-category breakdown, and confidence-band boundaries arrive with the baseline Excel template (architecture plan §12). What is fixed regardless of the template:

| Element | Rule | Ref |
| :--- | :--- | :--- |
| Categories | Balance sheet, income statement, cash flow | FR2.1 |
| Per-field emission | Value, unit/currency, confidence 0–100%, source document ID, period, page/cell/coordinate pointer | FR2.2 |
| Hard case | Inconsistent formats and layouts, especially unaudited management accounts | FR2.3 |
| Confidence bands & floor | Configurable, versioned in `cra:scorecard_config`; a threshold change never re-bands historical fields (FR2.6) | FR2.4–FR2.6 |
| Model version | Every field carries `extraction_model_version` | FR2.7 |
| Identity tier ladder | Statement → registration document → manual entry, fires on absence only | FR2.8 |

## 9. Failure & Denial Handling

| State | Behaviour |
| :--- | :--- |
| Virus scan fails | Upload rejected outright, no `Document` record created |
| Declared document type conflicts with content (no classifier at MVP) | Accepted as declared (FR1.2) — statement-type auto-detection is `OPEN`, tracked in Governance & Records §1 |
| Extraction confidence uncalibrated for a novel layout | Field still emitted with its (possibly low) confidence — never withheld; low confidence routes to mandatory review, it does not suppress output |
| Registration document present but unreadable | Tier 2 yields no candidate; falls through to tier 3 (manual entry), not an error |
| Re-upload of a period already extracted | New `Document` version, new extraction pass within that assessment's scope — prior version and prior assessment's fields untouched |
| Reuse event with no prior extraction to copy (data integrity gap) | Blocked — Flow D cannot proceed without a source field set; logged as a configuration fault, not silently skipped |
| `cra:scorecard_config` unresolved at Flow C | Routing deferred — cannot classify a confidence band without bound thresholds |
| Registration document upload with no customer context | Rejected — customer-scoped by definition (FR1.8), cannot attach to nothing |

## 10. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
| :--- | :--- | :--- | :--- |
| `cra_upload_document` | Document Intake | This agent | Access-scope gate passed; for the financial-statement path, an assessment already minted in Draft by Governance & Records (FR8.3) — for the registration-document path (FR1.8), a customer_id is sufficient and no assessment is required |
| `cra_extract_fields` | Field Extraction | This agent | Document attached to an assessment (Flow A Node 6b) or reuse event serviced (Flow D) |
| `cra_write_audit` | Both functions | Every agent | Every intake, extraction, and routing action |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions).
