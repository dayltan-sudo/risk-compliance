# Pre-UI Readiness Review

| | |
|---|---|
| Reviewed | `Credit_Assessment_PRD_v0.4.md` (30 Jul 2026) · `Credit_Assessment_Agent_Architecture_Plan.html` (v1.3) |
| Purpose | Independent adversarial read before a draft UI prototype is built |
| Date | 30 July 2026 |
| Excluded by brief | Missing baseline Excel template; formulas, weights, bands, sizing rules |

## Verdict

**Not ready.** Resolve B1–B4 first — each is a decision, not a work package, but each one wrong sends the core screen back to the drawing board.

The single most important reason: **FR3, named "Core GUI requirement," does not define what one review screen contains.** Three unsettled things sit on top of each other — whether the unit of review is a document or an assessment spanning 2–3 periods (B1), whether ratios exist while review is in progress or only after it (B2, an outright PRD self-contradiction), and what an analyst does with a field the statement never contained (B3, a deadlock with no exit). A designer must guess all three, and all three change the screen's information architecture, not its styling.

Everything else found is cheaper. B5–B9 and all non-blocking items can be prototyped against a stated assumption.

## Blocking gaps

### B1 — The field review surface has no defined scope: document, or assessment × period

- **Missing:** FR1.3 requires multi-period upload ("prior 2–3 fiscal years"); FR1.1 permits "one or more" documents per customer. FR3.1/FR3.9 describe a single flat table with a single counter ("12 of 34 fields reviewed"). Nothing states whether the analyst reviews one document at a time or an assessment-wide matrix. §4 compounds it: `ExtractedField` belongs to `Document` and **carries no period attribute** (`id, document_id, field_name, value, unit/currency, confidence_score, source_pointer, extraction_model_version, status, amendment_history`), so period is only derivable if one document = exactly one period — which is false for audited accounts that carry a prior-year comparative column.
- **Refs:** FR1.1, FR1.3, FR2.2, FR3.1, FR3.5, FR3.9, FR4.4, §4 `ExtractedField`.
- **Designer must invent:** the primary axis of the largest screen in the product (fields-as-rows × periods-as-columns vs. one document at a time with a document switcher), the denominator of FR3.9's counter, the boundary of FR3.5's bulk-confirm (this document's High fields, or every document's), and how a value read from a comparative column is attributed to a period at all.
- **Recommended resolution:** decide (a) review unit = assessment, with a period axis; (b) add a period attribute to `ExtractedField` independent of `Document.period`, or state the constraint that a document supplies exactly one period and comparatives are ignored; (c) state FR3.5's scope explicitly in the requirement text. Without (b) the FR4.4 trend view cannot be sourced.

### B2 — FR4.1 and FR3.8 contradict each other on when ratios exist

- **Missing:** a decision on whether the ratios/rating/recommendation region of the screen is populated during review or empty until review completes. FR4.1: "Compute a standard ratio set **once required fields are Confirmed/Amended**." FR3.8: "**Compute ratios on Unconfirmed inputs** but mark every affected result Provisional." These are opposite triggers. The architecture plan asserts both in one cell (§05 Ratio Engine) without noticing.
- **Refs:** FR3.8, FR3.10, FR4.1, plan §05.
- **Designer must invent:** whether ratios render from the moment extraction finishes (all Provisional, decaying to firm as fields are confirmed) or appear only at 100% review — plus what the FR6 recommendation panel shows in the meantime, since FR3.10 bars a Provisional rating from ever reaching FR6, guaranteeing an empty or disabled state that no requirement describes.
- **Recommended resolution:** settle on FR3.8's reading (compute always, flag Provisional) and correct FR4.1's wording; then add the missing piece — what FR6's surface displays while any Provisional result stands. "Required fields" also needs defining: no entity carries a required/optional flag, so neither the Provisional trigger nor FR3.9's denominator has a source.

### B3 — No status for "not in the document," and no way to add a missed field — permanent submission deadlock

- **Missing:** FR3.7's lifecycle is `Unconfirmed → Confirmed | Amended` only. FR3.4 permits Confirm or Amend on fields the extractor produced; nothing permits marking a field absent, not applicable, or zero-by-absence, and nothing permits adding a field the extractor missed. FR2.3 names unaudited management accounts as the core case — and those routinely omit a cash-flow statement entirely, i.e. FR4.1's coverage and DSCR inputs simply do not exist in the source.
- **Refs:** FR2.3, FR3.4, FR3.7, FR3.8, FR3.10, FR4.1.
- **Designer must invent:** a third terminal status and its treatment in ratios. Without one, any never-extracted field stays Unconfirmed forever → every ratio touching it stays Provisional forever (FR3.8) → FR3.10 blocks submission forever. The product cannot complete an assessment on the document class FR2.3 calls the hard case.
- **Recommended resolution:** add a fourth field status (e.g. Not Present) with a stated ratio consequence — either the ratio is not computed and is labelled as such, or the field is treated as a confirmed zero. This is a methodology-adjacent question but the *existence of an exit* is not; decide it before the review screen is designed, because the status set drives the row control.

### B4 — No entry point: nothing creates a Customer, lists work, or navigates between stages

- **Missing:** FR8.1 requires every assessment to tie to a customer; §4 defines `Customer` with `id, name, industry, relationship owner`. No requirement in FR1–FR12 covers creating, searching, deduplicating, or editing a Customer, or creating an Assessment as a deliberate act. FR7.2 makes submitted assessments visible to the Approver but no requirement describes the list they are visible *in*; the word "queue" appears only inside FR7.5's rationale. No requirement covers a landing page, an in-flight work list, or movement between upload → review → ratios → rating → recommendation → submit.
- **Refs:** FR1.4, FR7.2, FR8.1, FR8.4, §1 personas, plan §06 Registry.
- **Designer must invent:** the whole application shell — home screen, customer create/search, the assessment creation moment, the analyst's in-flight list, the approver's inbox, and the stage navigation model (wizard vs. tabs vs. single scroll). All four personas' first click is undefined.
- **Recommended resolution:** add a short FR family covering customer create/search and the per-role work list, or record an explicit decision that the prototype invents them and the PRD follows. Note this collides with §0.1's out-of-scope line on "portfolio-level cross-customer analytics" — a work queue and the Auditor's cross-customer list are not analytics, but that boundary should be said out loud before someone applies the exclusion to them.

### B5 — Field confirmations and recomputes leak across assessments

- **Missing:** FR1.6/FR8.3 make Document many-to-many with Assessment so re-assessment reuses prior periods by reference. But status and amendment history live on `ExtractedField`, which belongs to `Document`, not to Assessment. Two consequences neither document addresses: (a) a new assessment reusing last year's document opens with those fields already Confirmed by a different analyst under a different config — FR3.9's counter starts part-done and FR3.5's bulk-confirm has nothing to act on; (b) FR4.3 requires recompute "whenever an underlying field is later amended," so amending a shared prior-period field in a new draft would recompute ratios in an already-Approved assessment — directly against FR8.2 (never overwritten), FR10.3 (never retroactively rescored) and the plan's own §08 warning about "a chart that rewrites itself."
- **Refs:** FR1.6, FR3.7, FR4.3, FR8.2, FR8.3, FR10.3, §4 `ExtractedField`, plan §08.
- **Designer must invent:** whether reused-document fields appear pre-confirmed, re-review-required, or read-only, and whether an amendment is scoped to the current assessment.
- **Recommended resolution:** decide that confirmation state is per-assessment (a join record) rather than per-document, or that reused documents are frozen read-only at the values confirmed in the assessment that first posted them. Also pin *which document version* an assessment references (FR1.5 creates versions; §4 Assessment says only "references many Documents").

### B6 — "Returned for Revision": a state, or an immediate transition back to Draft?

- **Missing:** FR7.1 lists five states including "Returned for Revision" and §4 stores `state (Draft/Submitted/Approved/Rejected/Returned)`; FR7.4 says a returned assessment "re-enters Draft." Both cannot be true. The plan asserts both in the same document — §02 "A five-state machine (FR7.1)" and §06 "on Return, sends it back with comments and re-enters Draft (FR7.4)."
- **Refs:** FR7.1, FR7.4, §4 Assessment, plan §02/§06.
- **Designer must invent:** whether a returned assessment is visually distinguishable from a never-submitted draft. Status chips, work-list grouping, filter sets, counts and the "you have comments to address" affordance all depend on it, as does where the approver's return comments are displayed — no requirement says where FR7.4's comments surface for the analyst.
- **Recommended resolution:** keep Returned as a distinct persisted state (editable like Draft) and correct FR7.4's wording; specify where return comments appear.

### B7 — FR12's screening subjects have no capture requirement and no data-model home

- **Missing:** FR12.2 screens "every director, beneficial owner (UBO), and guarantor **captured on the assessment**," plus "its recorded trading names." Nothing in FR1–FR11 captures directors, UBOs, guarantors, or trading names; `Customer` and `Assessment` in §4 carry no such attributes. `ScreeningRun.subjects_searched` records them at run time from a source that does not exist.
- **Refs:** FR12.2, §4 `Customer`, `Assessment`, `ScreeningRun`.
- **Designer must invent:** an entire officer/owner capture screen — person records, roles, add/remove, and the point in the flow at which it happens — plus whether those names are typed by the analyst or extracted from the statement (FR2.1's field set is financial line items only).
- **Recommended resolution:** add a requirement covering connected-party capture, with an explicit position on manual entry vs. extraction. This is V2-only work, but it is a screen, not a field, and it should be scoped before FR12 is estimated. Note it also lands new personal data in the system independent of the FR12 retention question already open.

### B8 — FR12 findings arrive after the only place they can be used has closed

- **Missing:** FR12.1 triggers screening on submission (FR7.2). FR12.6 makes the FR5.3 qualitative justification the only sanctioned destination for a Relevant finding. FR5.3 is an analyst action during preparation — but at submission the assessment has left Draft and the analyst's editing rights are gone (FR7.2 hands visibility to the Approver). Nothing says who reviews findings on a Submitted assessment, whether the Approver sees them at all (FR7.3 grants lineage and audit trail, and does not mention findings), or what an analyst does with a Relevant finding other than hope for a Return for Revision. The plan's §06 notes the ordering version of this problem ("shipping screening first produces findings with nowhere legitimate to land") without noticing that the same trap exists in the timing.
- **Refs:** FR5.3, FR7.2, FR7.3, FR12.1, FR12.5, FR12.6, plan §06/§10.
- **Designer must invent:** the findings review screen's owner, its placement in the flow, and the route from "Relevant finding found" back to an editable FR5.3 adjustment.
- **Recommended resolution:** V2-scoped, but decide now whether this forces the manual mid-draft re-run already listed `OPEN` under FR12.1 — as written, that open item is not optional; it is the only trigger that makes FR12.6 reachable. Also state whether the Approver sees findings.

### B9 — Extraction has no in-progress state, and the missing SLA is an interface blocker, not just a tuning one

- **Missing:** FR2 defines no processing state, no progress surface, and no failure state. FR3.7's lifecycle begins at Unconfirmed, i.e. after extraction succeeded. NFR Performance leaves turnaround `OPEN`. The plan §09 classifies that as blocking "Extraction design choices, **not the interface**" — that is wrong: 5 seconds means a spinner on the upload screen; 20 minutes across three documents means an async job list, a returnable-to state, and a notification the product has no requirement for.
- **Refs:** FR2.1–FR2.5, FR3.7, NFR Performance, plan §09.
- **Designer must invent:** synchronous vs. asynchronous intake, and every unhappy path — corrupt or password-protected file, unreadable scan, zero fields extracted, partial extraction, plus the virus-scan rejection the plan's §02/§04 introduces with no FR behind it.
- **Recommended resolution:** an order-of-magnitude answer (seconds / minutes / tens of minutes) is enough to choose the model; get that even if the SLA target stays open. Add an extraction status to the document record and a requirement covering extraction failure.

## Non-blocking gaps

Ranked by severity. Each can be prototyped against the stated assumption.

| # | Gap | Ref | Designer must invent | Assumption to adopt |
|---|---|---|---|---|
| N1 | Confidence band, field status, and Provisional are three independent visual dimensions on one row; no requirement says how they combine, or whether the confidence colour persists after Confirm | FR2.4, FR3.2, FR3.7, FR3.8 | The row's visual grammar and precedence when a High-confidence field is still Unconfirmed | Status is primary (row-level), confidence secondary (a chip that stays visible after confirm, greyed); Provisional is a badge on the *result*, not the field |
| N2 | Side-by-side source viewer must serve PDF, scanned image, Excel and Word with page / cell / coordinate pointers — three different highlight mechanics in one pane | FR1.1, FR2.2, FR3.3 | Whether non-PDF formats are converted to a canonical render, and the fallback when a pointer is absent or wrong | Prototype the PDF/image case; assume Excel and Word are converted to a paged render server-side; specify a "source location unavailable" state |
| N3 | Re-uploading a period (FR1.5) creates a new document version and, per plan §04, a new field set — silently discarding review progress on the prior version | FR1.5, FR3.9, plan §04 | Warning, diff, or carry-forward behaviour; FR3.9's counter jumping backwards | Re-upload prompts a confirmation naming how many confirmations will be superseded; prior version stays visible read-only |
| N4 | Units and scale: statements report in thousands/millions. FR2.2 carries `unit/currency` per field but no requirement covers displaying or amending scale | FR2.2, FR3.4 | Whether the analyst types 1,234 or 1,234,000, and whether unit is editable on Amend | Values stored and displayed in base units with the source scale shown beside the field; unit is editable as part of Amend |
| N5 | Mixed-currency assessments are to be rejected (NFR Multi-currency, plan §07) but no requirement gives that rejection a screen or a trigger point | NFR Multi-currency, FR1.4 | Whether rejection fires at upload of the second currency or at ratio time, and what the analyst can do about it | Block at upload with an inline error naming the conflicting document; assessment stays in Draft |
| N6 | The FR2.5 mandatory-review flag has no distinct UI effect: FR3.5 already restricts bulk-confirm to High, so sub-floor fields behave the same as Medium ones | FR2.5, FR3.5, FR10.4 | Whether flagged fields get their own treatment or the flag is invisible | Render flagged fields as a filterable, top-sorted subset; do not give them a fourth colour |
| N7 | FR2.4's bands leave a hole: High is ≥90, Medium is 70–89. A non-integer score of 89.4 falls in no band | FR2.4 | Which band an in-between score renders as | Treat bands as ≥90 / ≥70 / <70 and correct the wording; do not let the UI depend on integer scores |
| N8 | "Needs Follow-up" (FR12.5) is a terminal dead end — FR12.6 permits only Relevant to be cited, and nothing defines what resolves a follow-up | FR12.5, FR12.6 | Whether it blocks anything, who clears it, and what it becomes | Treat as an open task on the assessment that must reach Relevant or Not Relevant before approval; flag the decision |
| N9 | FR12.7's three states collapse "findings pending review" and "findings all reviewed" into one — the state that most needs a badge (unreviewed findings exist) is not distinguished. And `ScreeningRun.status` includes `Failed`, a fourth state FR12.7 does not enumerate | FR12.7, §4 `ScreeningRun` | A fourth and fifth badge state | Render five: not run, running, failed, clean, findings (n unreviewed) — a failed run must never render as clean, which is exactly FR12.7's own stated principle |
| N10 | FR12.4's "relevance/confidence indicator" is a second confidence concept with no bands, no scale, and no stated relationship to FR2.4 | FR12.4 | Whether relevance is colour-coded like FR3.2 and on what thresholds | Reuse FR3.2's visual language but a distinct hue, so extraction confidence and relevance are never confused |
| N11 | No audit-log viewing surface exists in any requirement. FR9.1–FR9.3 define what is logged and who may read it, not how it is read | FR9.1–FR9.3, §1 Auditor | Search, filter, entity scoping, and export for the Auditor's only screen | Per-assessment activity timeline plus a filterable global log; Auditor lands on the global log |
| N12 | The rating grade scale is unrenderable: no requirement states whether the internal rating is a letter grade, a number, or a score | FR5.1, FR5.2 | Badge vs. gauge vs. scale, and how many steps | Prototype a 7-step letter scale with a driver-breakdown bar chart, labelled placeholder; this is a display consequence of the open methodology, worth stating so it is not read as a proposal |
| N13 | NFR RBAC scopes the Analyst to "own + team assessments," but no Team entity or membership exists in §4 | NFR RBAC, §4 | A team concept and its selector | Single team at MVP; expose no team switcher |
| N14 | NFR RBAC and FR9.3 grant an "Admin" role, but §1 defines Admin only as "Config Admin (V2)". No user/role administration screen exists anywhere, though FR7.5/FR7.6 depend on knowing who is an eligible approver | §1, NFR RBAC, FR7.5, FR7.6, FR9.3 | Who administers users at MVP and where | Assume an out-of-product identity source at MVP; state it, because FR7.6's "no eligible second approver" needs a defined eligibility source |
| N15 | FR6.3's override has no defined location — the plan's §03 diagram has analyst edges into Intake, Review, Approval and (V2) the Scorecard, but none into the Recommendation Engine | FR6.3, plan §03 | Whether override happens on the recommendation panel or inside the submit dialog | Inline on the recommendation panel, with the system proposal shown struck through beside it (FR6.3 requires retention of both) |
| N16 | FR3.5 bulk-confirm has no undo and no stated confirmation step | FR3.5, §0.2 "bulk-confirm safety" | Dialog, count preview, undo window | Confirmation dialog stating the count and scope; no undo (FR3.6 makes individual amendment the recovery path) |
| N17 | "Completed assessment" (FR11.1, §1 Auditor, NFR RBAC) is never mapped to a state in FR7.1 — Approved only, or Rejected too? | FR7.1, FR11.1, §1 | The Auditor's and export's filter definition | Completed = Approved or Rejected; Returned and Draft excluded |

## Contradictions found

| # | Location A | Location B | UI consequence |
|---|---|---|---|
| C1 | PRD FR4.1: "Compute a standard ratio set **once required fields are Confirmed/Amended**" | PRD FR3.8: "**Compute ratios on Unconfirmed inputs** but mark every affected result **Provisional** — never silently exclude the field." Plan §05 asserts both in one cell | Whether the ratio/rating/recommendation panels are populated during review or empty until it ends. See B2 |
| C2 | PRD FR7.1: "Draft → Submitted → Approved \| Rejected \| **Returned for Revision**"; §4 Assessment: "state (Draft/Submitted/Approved/Rejected/**Returned**)"; Plan §02: "A **five-state** machine (FR7.1)" | PRD FR7.4: "Return for Revision (sends back to analyst with comments; **assessment re-enters Draft**)"; Plan §06: "on Return, sends it back with comments and **re-enters Draft** (FR7.4)" | Returned work is either indistinguishable from a fresh draft or a distinct queue state. Drives status chips, filters, counts. See B6 |
| C3 | PRD §0.2 success measure: "Share of fields reaching a ratio without human review … **Must be zero for Unconfirmed fields (FR3.8)** … Target 0% Unconfirmed" | PRD FR3.8 mandates precisely that Unconfirmed fields reach a ratio, flagged Provisional | The measure describes a product where Provisional ratios cannot exist. A designer reading §0.2 first will not build the Provisional surface at all |
| C4 | PRD FR12.7: "Distinguish, per assessment, **three** screening states: not yet run, run with no adverse findings, and run with findings pending or completed review" | PRD §4 `ScreeningRun`: "status (**Completed/Failed**)" | A failed run carries `finding_count = 0` and renders as "clean" — the exact false all-clear FR12.7 exists to prevent. See N9 |
| C5 | Plan §08, ApprovalDecision row: "Model as a collection from day one **for FR7.6**" | PRD FR7.6 is the segregation-of-duties fallback. The collection requirement is **FR7.7**: "Model approval decisions as a collection from MVP so this needs no data migration" — as the plan itself states correctly in §06 and §09 | Misattribution only, but it points the approval-panel design at the wrong requirement: the collection exists for the committee variant, not for the no-second-approver block |
| C6 | Plan §10, MVP 7: "**FR11.1 is Should/MVP — the only Should in the MVP set**, so it is the sanctioned drop if MVP compresses" | PRD FR8.5 is tagged Should / MVP, as are FR11.2 and FR11.3 | False. FR8.5 (record the date an approved limit took effect) is equally droppable under the plan's own rule — and it is the column the FR8.4 history view needs. Decide deliberately, not by a mis-stated inventory |
| C7 | Plan §10, MVP 6: "All of **FR7.1–FR7.5** is Must/MVP" | PRD FR7.6 is also Must / MVP | FR7.6's block-by-default behaviour — a hard-stop error state on the submit path — reads as out of the MVP 6 scope line and may go unbuilt |
| C8 | Plan component `PRD ref` lines omit FR1.6 (Intake), FR2.6 / FR2.7 (Extraction), FR3.10 (Field Review), FR4.5 (Ratio), FR6.4 (Recommendation), FR8.5 (Registry) | Each of those is Must or Should / MVP in the PRD, and the plan's own prose cites them elsewhere | **FR3.10 has no owning component anywhere in §04–§06.** It is the requirement that blocks submission while a Provisional result stands — i.e. the disabled-submit state and its explanatory message have no owner in the architecture |
| C9 | Plan §10, V3 row: "None of these has a requirement in **PRD v0.3**"; §02: "Applied to **PRD v0.3's** FR12" | Plan is resynced to and titled against PRD v0.4 | Stale version references only; no UI consequence. Listed for completeness |

## FR-by-FR buildability

| FR | UI-buildable as written? | Finding |
|---|---|---|
| FR1 | Partly | Upload and metadata are buildable. Entry point, document-version UX, extraction status and failure paths are not — B4, B9, N3 |
| FR2 | No user-facing surface defined | Extraction is backend, but its *visible* states (in progress, failed, no fields found) are undefined — B9. Band boundary hole — N7 |
| FR3 | **No** | Scope, computation timing, and terminal statuses all unresolved — B1, B2, B3. Row visual grammar undefined — N1 |
| FR4 | Partly | FR4.2 lineage display and FR4.4 trend are buildable once B1 fixes period attribution and B2 fixes timing. Recompute scope leaks across assessments — B5 |
| FR5 | Yes, with a placeholder scale | Driver breakdown is buildable. Grade scale unrenderable without a placeholder — N12. FR5.3 depends on B8 for its V2 evidence route |
| FR6 | Partly | Proposal display buildable; the empty/disabled state while Provisional is undefined (B2) and the override has no location (N15) |
| FR7 | Partly | Decision actions are clear. State set is contradictory (B6), no approver queue exists (B4), return comments have no home (B6), FR7.6's block state has no screen (C7) |
| FR8 | Partly | FR8.4 history view is buildable. Customer creation absent (B4); re-assessment document picker undefined (B5); FR8.5 effective date unowned (C8) |
| FR9 | No reading surface | Logging is specified; the Auditor's screen is not — N11 |
| FR10 | Fine as written | Editing surface is explicitly V2 and `OPEN`; MVP needs no config screen. No UI consequence at prototype stage |
| FR11 | Fine as written | Export is a button plus a document template; masking `OPEN` is correctly flagged and does not block the prototype |
| FR12 | **No** | Subjects have no capture screen or data home (B7); findings arrive after their only destination closes (B8); state set incomplete (N9); relevance indicator undefined (N10); Needs Follow-up is a dead end (N8) |

## Persona screen coverage

| Persona (§1) | Jobs §1 assigns | Screens covered by a requirement | Missing |
|---|---|---|---|
| Credit Analyst | Upload, review/confirm, prepare, submit | FR1 upload form, FR3 review, FR4.2 lineage, FR5.2 breakdown, FR6.3 override, FR7.2 submit | Landing/work list, customer create/search, return-comments view, connected-party capture (V2), findings review (V2) — B4, B6, B7, B8 |
| Credit Approver | Review with full lineage; approve/reject/return | FR7.3 read access, FR7.4 decision actions | Inbox of submitted assessments; any view of what they previously approved — NFR RBAC scopes them to *submitted* only, so an Approver loses sight of their own approved decisions. Screening findings visibility unstated — B4, B8 |
| Auditor | Read audit trail and completed assessments for control testing | FR9.3 read grant, FR11 export | Every screen. No log UI (N11), no cross-customer list (B4), "completed" undefined (N17) |
| Config Admin (V2) | Maintain formulas, weights, bands, rules | FR10.2, explicitly V2 and `OPEN` | Nothing needed at MVP — but the MVP "Admin" in NFR RBAC / FR9.3 is a different, undefined role (N14) |

## Verified-clean

Checked specifically and found sound:

- **No dangling FR references.** Every `FRn.n` cited in the architecture plan exists in PRD v0.4, and every FR in the PRD is cited somewhere in the plan — both sets match exactly, 66 identifiers.
- **Component arithmetic.** 3 pipeline + 3 engines + 6 governance = 12; type split in §02's table is 1 agent + 1 hybrid + 8 workflows + 2 infra, matching the footer, the meta-row, and §01's tier description.
- **FR3.10, FR7.5, FR12.6, FR2.7, FR4.5, FR6.4, FR10.4 restatements** in the plan's §05–§08 prose match the PRD's actual requirement text word for word where quoted.
- **§09's open-items table is complete** against PRD §5 — all 17 `OPEN` bullets are present, plus three `PLACEHOLDER` items the PRD marks inline. The "four FR12 open questions, two blocking the build" claim in §10 is accurate.
- **FR12 scope discipline.** The sanctions/PEP exclusion is stated consistently in PRD §0.1, FR12.3, §2.12 preamble and plan §06; no requirement anywhere implies a sanctions capability.
- **`ScreeningRun` fix from v0.4 is coherent.** The entity exists in §4, `AdverseFinding.screening_run_id` now resolves, FR12.7 and FR12.8 both cross-reference it, and the plan's §07/§08/§09 record the gap as closed rather than deleting it. The only residual defect is the `Failed` status omission (C4).
- **Release tags match.** Every MoSCoW/release tag on the plan's component cards matches the PRD's tag for the corresponding FR, except the two §10 inventory statements at C6 and C7.
- **Data-model referential integrity.** Every `_id` attribute in §4 points to an entity defined in §4; no orphans. The only structural defect found is the absent period attribute on `ExtractedField` (B1) and the assessment-scoping of field status (B5) — both omissions, not broken references.
