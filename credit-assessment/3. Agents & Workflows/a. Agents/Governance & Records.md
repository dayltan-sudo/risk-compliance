# System Instruction: Governance & Records

> **Deterministic / Infra, mixed release.** Five merged components — Approval Workflow, Customer & Assessment Registry, Audit & Access Log, Methodology Config & Change-Control, Reporting & Export. No LLM in the loop anywhere; two are pure infrastructure (Registry, Audit Log) that every other agent writes *through* rather than calls. None advances a document toward a number — each gates, records, configures, or exports a decision another agent already computed.
>
> **Companion docs:** upstream — every other agent writes through this one's Audit & Access Log function, and reads its Registry function for assessment scope. [`Scoring & Decisioning.md`](Scoring%20%26%20Decisioning.md) supplies the outputs the Registry compares and the Recommendation this agent's Approval function locks. §5 is the role-capability matrix every agent's access gate reads; §6 is the data lifecycle reference every agent's entity table cross-references.

## 1. Core Mandate & Operational Objectives

Decide an assessment (Approval Workflow, FR7), own the customer/assessment master record and every cross-assessment read (Registry, FR8), log every write in the system (Audit Log, FR9), version the methodology every engine computes against (Config, FR10), and export a closed assessment (Reporting, FR11). Five components under one owner because none of them writes a value into a ratio-eligible state on its own; each exists to make a decision defensible rather than to advance it.

**Capabilities:** (1) Own the Draft→Submitted→Approved|Rejected|Returned state machine, enforcing approver ≠ preparer (FR7.1–FR7.5). (2) Evaluate the New-vs-Refresh entry point from a read of the customer's assessment count (FR8.3). (3) Serve read-only drill-down, per-customer history, and cross-assessment delta comparison (FR8.5–FR8.9). (4) Serve the Customer Directory browse mode, a third top-level entry point (FR8.10–FR8.11). (5) Route Refresh-this-customer from the browse surface into the Prepare entry point (FR8.11→FR8.3). (6) Log every write in the system, append-only (FR9.1–FR9.2). (7) Hold ratio formulas, scorecard weights, and rating bands as a versioned config record (FR10.1–FR10.5). (8) Export a completed assessment to PDF/Excel (FR11.1–FR11.3).

You are the record, not the decision — except where the decision *is* a record, which is exactly what Approval Workflow and Methodology Config are: state machines over configuration and authorization, never over what a number means.

## 2. State Management

**Reads (shared):** `cra:assessment_registry`, `cra:user_scope_registry`. **Per function:** Approval Workflow — `cra:recommendation_store` (what it locks). Registry cross-assessment reads — `cra:ratio_store`, `cra:rating_store`, `cra:recommendation_store`, `cra:document_store` (FR1.9). Reporting & Export — all of the above, read-only.

**Writes (shared):** `cra:audit_log` (Audit & Access Log function, sole writer; every other function and every other agent writes *through* this, never around it). **Per function:** Approval Workflow — `cra:approval_decision_log` (sole writer), and the state field on `cra:assessment_registry`. Registry — `cra:customer_registry` (sole writer) and the record/version-mint half of `cra:assessment_registry` (state transitions belong to Approval Workflow, not this function). Methodology Config — `cra:scorecard_config` (sole writer). Reporting & Export writes nothing — read-only by function definition (FR11.1's export never becomes an alternative path to a value the pipeline wouldn't have produced).

**Session keys** (per function): `approval_context`, `entry_point_decision`, `comparison_result`, `directory_scope`, `export_payload`, `config_proposal`.

**Temp keys:** `temp:render_buffer` (Reporting & Export — PDF/Excel render buffer, discarded after delivery).

## 3. Approval Workflow

```
[Entry: cra_submit_assessment — assessment_id, preparing analyst identity]
                 │
                 ▼
[Node 1: Visibility Rule] ──► Only a Submitted assessment reaches an
                               Approver (FR7.2) — Draft is invisible to
                               the Approver queue
                 │
                 ▼
[Node 2: Segregation Check — Submit Time] ──► Approver pool excludes the
                                                preparing analyst (FR7.5)
                 │
                 ▼
[Node 3: Grant Lineage Access] ──► Full extraction, ratio, and rating
                                    lineage plus the audit trail, to the
                                    Approver (FR7.3)
                 │
                 ▼
[Node 4: cra_decide_approval — Approve | Reject | Return]
                 │
                 ▼
          ◇ Decision? ◇
    Approve │              Reject │              Return │
        ▼                     ▼                      ▼
[Node 5a: Lock          [Node 5b: Close,       [Node 5c: Re-open at
 Recommendation]         Required Reason]       Draft with Comments]
 No further write        Terminal                Re-enters Field
 path past this point                            Review's Flow C
        │                     │                      │
        └─────────────────────┴──────────────────────┘
                               ▼
              [Node 6: Segregation Check — Decision Time] ──► Re-verified,
                                                                not assumed
                                                                from Node 2
                               │
                               ▼
              [Output: cra:assessment_registry.state] ──► ApprovalDecision
                                                            appended
                                                            (FR7.7 —
                                                            collection, not
                                                            overwrite)
```

Trigger: `cra_submit_assessment` / `cra_decide_approval`, sole caller this agent, precondition Node 1's visibility rule for the latter. FR7.5's segregation check runs at **both** submit and decision time (Node 2 and Node 6) — checking only at submission would let an assessment be routed to a queue the preparer could later claim from.

**Decision Convergence:**

$$\text{Decision Valid} = \left( \text{state} = \text{Submitted} \right) \land \left( \text{decider} \neq \text{preparer} \right) \land \left( \left[ \text{Reject} \Rightarrow \text{reason supplied} \right] \right)$$

**No eligible second approver.** Blocks by default (FR7.6). Any delegation or break-glass path is an audited exception, never a silent bypass — the delegation model itself is `OPEN` (PRD §5).

## 4. Customer & Assessment Registry

**The entry point is a Registry read, not an analyst preference (FR8.3).**

```
[Entry: cra_start_assessment — customer_id or new-customer details]
                 │
                 ▼
[Node 1: Count Prior Assessments] ──► Reads cra:customer_registry +
                                       cra:assessment_registry
                 │
                 ▼
          ◇ Prior assessments = 0? ◇
           │yes                      │no
           ▼                          ▼
[Node 2a: New Assessment]     [Node 2b: Refresh Assessment]
Mints version 1, empty         Captures a source assessment
field scope                    (default: most recent), mints
                                version n+1, links via
                                source_assessment_id (set
                                once, never re-pointed)
           │                          │
           │                          ▼
           │              [Node 3: Hand Prior-Period Refs to
           │               Statement Extraction] ──► Raises FR1.7's
           │               reuse event exactly as an upload-attach
           │               does — this agent never becomes a second
           │               writer of ExtractedField
           └──────────────┬───────────┘
                           ▼
       [Output: cra:assessment_registry] ──► New record in Draft; every
                                              transition out of Draft
                                              belongs to Approval Workflow
                                              (§3)
```

**Three cross-assessment reads, none of which writes anything (FR8.5, FR8.6, FR8.8–FR8.9).** FR8.5 opens any prior assessment read-only at its last-recorded state, never reopens it for editing. FR8.6 serves the per-customer trend of ratings and limits over time. FR8.8–FR8.9 compute the delta between this assessment's fresh outputs and the refresh source's stored ones — read at view time, no engine invoked:

```
[Entry: cra_compare_assessments — this assessment_id, source assessment_id]
                 │
                 ▼
[Node 1: Load Both Assessments' Stored Rows] ──► cra:ratio_store,
                                                   cra:rating_store,
                                                   cra:recommendation_store
                                                   — read only, neither
                                                   re-derived
                 │
                 ▼
          ◇ Either side Provisional or Not Calculable? ◇
           │yes                                          │no
           ▼                                              ▼
[Suppress that line, state reason        [Node 2: Compute Delta] ──►
 and side (FR8.8 rule 1)]                 Direction, magnitude, grade
                                           movement, limit/terms change
           │                                              │
           └──────────────────────┬───────────────────────┘
                                   ▼
              ◇ config_version_id differs between the two? ◇
               │yes                                  │no
               ▼                                      ▼
    [State the methodology change      [Present delta as-is]
     alongside the delta — never
     as like-for-like (FR8.8 rule 2,
     FR10.3)]
                                   │
                                   ▼
                    [Output: comparison_result] ──► Never re-derives the
                                                      source assessment's
                                                      ratios under current
                                                      config — that would
                                                      rescore a closed
                                                      assessment
```

**Browse mode — a third top-level entry point, not a screen inside Prepare (FR8.10–FR8.11).**

```
[Entry: cra_browse_directory — caller identity]
                 │
                 ▼
[Node 1: Role-Scoped Aggregate] ──► Filter runs on the aggregate before
                                     the per-customer rollup, not on the
                                     list afterward (§5) — a customer
                                     whose assessments are all invisible
                                     to the caller is absent, not present
                                     and blank
                 │
                 ▼
[Node 2: Condense Per Customer] ──► Name, most recent assessment date/
                                     state, that assessment's grade where
                                     FR5 has run, most recent Approved
                                     limit/terms — blank grade means "FR5
                                     hasn't run," blank limit means "no
                                     Approved assessment," never rendered
                                     alike
                 │
                 ▼
[Node 3: Select a Row] ──► cra_get_customer_detail — assembles FR8.6's
                            trend, FR8.5's drill-down, and FR1.9's
                            document list. Nothing here edits a field,
                            ratio, rating, or document in place
                 │
                 ▼
          ◇ Caller selects "Refresh this customer"? ◇
           │yes                                      │no
           ▼                                          ▼
[Node 4: Gate on FR8.3 Rights] ──►          [Stay in Browse — no write]
Auditor sees no such action
           │
           ▼
[Node 5: Route to Node 1, §4 above] ──► Customer pre-selected always;
                                          assessment pre-selected as
                                          refresh source only when reached
                                          via FR8.5 drill-down
```

**FR1.9's document list is served here, not by Statement Extraction** — half the requirement is a customer-scoped, cross-assessment lookup only this component can perform; the other half reads `Document`'s version chain, which Statement Extraction still solely writes. This agent gains no write path to `Document`.

## 5. Personas & Role-Capability Scope (PRD §1, NFR RBAC)

| Persona | Reads | Writes | Notes |
| :--- | :--- | :--- | :--- |
| Credit Analyst | Own + team assessments | Uploads, field confirmations, assessment prep/refresh, submission | May query the Assistant within this same scope once built (FR13.7) |
| Credit Approver | Submitted assessments, full lineage of same | Approval decisions | Must differ from preparing analyst (FR7.5) — enforced at submit and decision time |
| Auditor | Audit log, completed assessments (FR9.3) | None | Read-only everywhere, including the browse surface; no FR8.3 or FR7 rights by any path — never sees Refresh-this-customer |
| Config Admin (V2) | `cra:scorecard_config` proposal history | Config proposals (subject to review/approve, §8) | Scope pending the V2 admin editing surface (FR10.2) |

**Every query scoped by role before it reaches data, not filtered at the UI layer (NFR RBAC).** This is the rule Node 1 of the browse flow above enforces on an aggregate; every other read in this agent enforces the same rule on a single record.

## 6. Data Lifecycle, Versioning & Retention

| Entity | Mutable until | Versioning rule | Owning function |
| :--- | :--- | :--- | :--- |
| Customer | Ongoing — master data | Slowly-changing, audit-logged | Registry |
| Assessment | State transitions until Approved/Rejected | New version per Refresh, linked via `source_assessment_id`, set once, never re-pointed | Registry (record); Approval (state) |
| ApprovalDecision | Never — append-only per action | One record per action, accumulates across return-and-resubmit | Approval Workflow |
| AuditLogEntry | Never — immutable | N/A, append-only by definition | Audit & Access Log |
| ScorecardConfig | Never once effective | New version per change, supersedes, never edits in place | Methodology Config |

**Four clocks:** (1) the assessment cycle — the only meaningfully mutable window; (2) the credit-limit clock — an approved limit stays live until the next re-assessment supersedes it, cadence `OPEN`; (3) the regulatory retention clock — duration and jurisdiction `OPEN`, but documents outlive the assessments citing them and configs outlive every assessment computed under them regardless of the eventual duration; (4) the audit clock — never prunes during normal operation.

## 7. Audit & Access Log

```
[Entry: cra_write_audit — actor, entity_type, entity_id, action,
        before_value, after_value, timestamp — called by every agent,
        every write, no exceptions]
                 │
                 ▼
[Node 1: Append] ──► cra:audit_log — no UPDATE or DELETE path exists,
                      enforced structurally
                 │
                 ▼
[Output: AuditLogEntry] ──► Readable by Approver, Admin, Auditor (FR9.3).
                             Analyst read access to their own entries is
                             OPEN (PRD §5)
```

Must exist before Statement Extraction ships (build sequence, README) — FR9.1 requires extraction confidence scores logged, so the log has to exist before the component that produces them.

## 8. Methodology Config & Change-Control

```
[Entry: cra_propose_config_change — threshold/weight/band/sizing edit]
                 │
                 ▼
[Node 1: Propose] ──► Rationale logged against the proposed change
                 │
                 ▼
[Node 2: Review] ──► Named reviewer (V2 admin surface, FR10.2)
                 │
                 ▼
[Node 3: Approve] ──► Captured to cra:audit_log
                 │
                 ▼
[Node 4: Version] ──► New dated version written to cra:scorecard_config;
                       prior version retained, never overwritten (FR10.5)
                 │
                 ▼
[Output: config_version_id] ──► Available to Scoring & Decisioning's
                                 three engines and Statement Extraction's
                                 confidence bands (FR10.4) on their next
                                 compute
```

**The critical rule (FR10.3):** historical assessments retain the config version live at the time they were computed — never retroactively rescored. Enforced structurally by Scoring & Decisioning's Compute Convergence, not by this agent alone — this agent supplies the versioned record; the engines are what refuse to read-current-config.

**Schema is MVP, the editing screen is not.** FR10.1 and FR10.3–FR10.5 (versioned record, loaded at compute time, changed by deployment) are Must/MVP; only FR10.2's admin screen is Should/V2, blocked until the baseline template arrives. Build the seam first.

## 9. Reporting & Export

```
[Entry: cra_export_assessment — assessment_id, format (PDF | Excel)]
                 │
                 ▼
[Node 1: Assemble Payload] ──► Confirmed fields, ratios, rating,
                                recommendation, approval trail — read
                                only, never a second path to a value
                 │
                 ▼
[Node 2: Config Version Stamp] ──► Carries the config_version_id that
                                    produced the rating (FR11.2) — or the
                                    export stops being reconstructable the
                                    moment methodology changes
                 │
                 ▼
[Node 3: Role Scope & Masking] ──► Applies the caller's role scope and
                                    any masking treatment (FR11.3) — a
                                    generated file leaves the system's
                                    access controls behind entirely
                 │
                 ▼
[Output: rendered file] ──► temp:render_buffer, discarded after delivery
```

**`OPEN`:** the masking treatment itself is undecided (PRD §5) — this function enforces whichever is chosen, but assumes none until told.

## 10. Failure & Denial Handling

| State | Behaviour |
| :--- | :--- |
| Submit attempted by a user with no eligible approver | Blocked by default (FR7.6); break-glass path, if any, is an audited exception |
| Decision attempted where decider = preparer | Rejected at Node 6 even if Node 2 somehow passed — segregation is re-verified, not assumed |
| Refresh attempted with a source assessment still in Draft/Submitted | `OPEN` whether this is permitted at all (PRD §5); if permitted, the comparison's reproducibility claim weakens until the source reaches a terminal state |
| Browse-directory query from a customer with zero visible assessments to the caller | Customer absent from the list — never present with blank fields |
| Refresh-this-customer selected by a caller without FR8.3 rights | Action not offered — not merely disabled, absent from the surface entirely |
| Config proposal with no rationale | Blocked at Node 1 — rationale is mandatory input, not optional metadata |
| Export requested for a still-open (Draft/Submitted) assessment | Permitted, but the config-version stamp and role scope still apply — export is not gated on assessment state, only on role scope |
| `cra_write_audit` call fails | The originating write is not considered committed — no agent may treat an unlogged action as done |

## 11. MCP Task-Tool Bindings

| Tool | Function | Sole caller | Precondition |
| :--- | :--- | :--- | :--- |
| `cra_submit_assessment` | Approval Workflow | This agent | Assessment in Draft, no Provisional ratio outstanding (FR3.10) |
| `cra_decide_approval` | Approval Workflow | This agent | Assessment Submitted; decider ≠ preparer |
| `cra_start_assessment` | Registry | This agent | Customer identified or new-customer details supplied |
| `cra_compare_assessments` | Registry | This agent; Assistant / Q&A Orchestrator, read-only invocation once built (Assistant §11) | Both assessments have engine output for at least the non-suppressed lines |
| `cra_browse_directory` | Registry | This agent | Caller identity resolved |
| `cra_get_customer_detail` | Registry | This agent | Customer row visible under caller's role scope |
| `cra_propose_config_change` | Methodology Config | This agent | Rationale supplied |
| `cra_export_assessment` | Reporting & Export | This agent | Assessment exists, caller holds read access to it |
| `cra_write_audit` | Audit & Access Log | Every agent | Every write, no exceptions |

Every write logs to `cra:audit_log` (`cra_write_audit`, no exceptions) — this agent's own Audit & Access Log function is where that write lands.
