# Credit Assessment — Trade Credit Risk Tool

Product Requirements Document — MVP

| | |
|---|---|
| Version / Status | v1.2-MVP — Draft |
| Date | 9 September 2026 |
| Supersedes | `Credit_Assessment_PRD_v0.10.md` (v0.12 in-file) — retained for deferred requirement text |
| Methodology source | `Baseline_Scorecard_Extract_v1.2.md` — extracted from `Credit Review Report template.xlsx`, sheet `Analysis`, dated 26/3/2024. Governs the field set, ratio formulas, scorecard bands, weights, and rating classes. Where this PRD and the extract disagree on methodology, the extract governs; where they disagree on system behaviour, this document governs. |
| Domain | Trade credit (accounts-receivable risk) — assesses the business's own B2B customers. Not bank lending. |
| Deployment | Singapore. Criterion 7 measures years established in Singapore; criteria 5, 7 and 9 source from ACRA. |
| Classification | Confidential — Internal Use Only |

A deliberate reduction of v0.12, not an increment on it. v0.12 accreted precision across eleven revisions without re-testing scope. Deferred items are listed in §7 with their v0.12 requirement reference; none is cancelled.

## 0. Product Summary

Extracts a fixed set of financial figures from uploaded customer statements with confidence scoring, has a human confirm or amend every figure against the source, computes four ratios with full lineage, scores an eleven-criterion scorecard, and outputs a rating class with its handling route.

MVP produces **a rating class, not a credit limit**. The baseline workbook derives no limit amount; limit sizing and payment terms are V2 (§7).

### 0.1 Scope

| In scope | Out of scope |
|---|---|
| Statement upload, extraction, human field confirmation | Credit limit amount and payment terms (V2 — §7) |
| Balance-sheet integrity checks and statement recency flag | Qualitative override of the computed class (V2) |
| Four ratios with lineage and period-over-period change | Roles, permissions, segregation of duties (V2) |
| Eleven-criterion scorecard, composite score, A/B/C class | ACRA and AR-system lookups — criteria 5, 7, 9, 11 are analyst-entered at MVP (V2) |
| Analyst entry of five non-financial criteria | Adverse-media screening (FR12) and conversational Q&A (FR13) — both V2 |
| Customer directory, assessment history, read-only drill-down | Bank lending, credit bureau feeds, sanctions/PEP/KYC, collections, ERP write-back |
| Immutable audit trail; export of a completed assessment | Cross-customer portfolio analytics |

### 0.2 Success measures

`OPEN:` targets pending client input.

| Measure | Target |
|---|---|
| Assessment turnaround, upload to rating | `OPEN` |
| Analyst amendment rate by confidence band | `OPEN` |
| Composite score reproduces the baseline workbook on the same inputs | 100% |
| Assessments reconstructable from source at audit | 100% |

## 1. Users

One authenticated user type. Any user may upload, review, score, approve, and browse. **No roles, no permission matrix, no team scoping** — v0.12's Analyst / Approver / Auditor / Config Admin personas are deferred (§7).

**A user may approve an assessment they submitted.** MVP enforces no segregation of duties.

This is a policy decision, not a structural one. Every state transition passes through a named authorization guard (FR8.3); at MVP each guard allows any authenticated user. Adding RBAC and SoD in V2 replaces guard implementations and adds a role attribute — no state-machine change, no entity change, no backfill. The actor fields those rules will read (`Assessment.submitted_by`, `ApprovalDecision.actor`) are recorded from day one.

Consequence: **one person can prepare, submit, and approve an assessment alone.** Every action is attributed and logged (FR10), and `ApprovalDecision.policy_version` records which policy was live at decision time.

## 2. Functional Requirements

### FR1 — Document Upload & Intake

Documents belong to a single assessment. Re-assessing a customer re-uploads the prior statements; v0.12's customer-scoped documents and copy-on-reuse are deferred (§7).

| ID | Requirement |
|---|---|
| FR1.1 | Upload financial statement documents per assessment, in PDF, scanned image, Excel, or Word format. |
| FR1.2 | Tag each upload by statement type: audited or unaudited/management accounts. Uploader-supplied — the system does not infer it. |
| FR1.3 | **Exactly two fiscal periods per assessment**, current and prior. Criterion 6 (profitable last 2 FY) and every period-over-period change require both. A third period adds nothing the baseline consumes. |
| FR1.4 | Capture upload metadata: statement period, financials date, presentation currency, presentation scale (units/thousands/millions), statement basis (standalone/consolidated), document type, upload date, uploader. Currency, scale and basis are provenance for review only — no computation reads them (FR2.3, FR5.6). MVP accepts either basis as uploaded; nothing distinguishes them computationally (§3 Multi-entity). |
| FR1.5 | Re-uploading a period creates a new version — never overwrites a prior upload. |
| FR1.6 | **Optional ACRA registry document** (Bizfile or equivalent registry extract), uploaded per assessment as the authoritative source for paid-up capital (FR5.2). Not mandatory — an assessment without one is complete and scoreable. Not period-scoped: no statement period and no financials date, so it never feeds FR3.12's recency flag. Captures document type, upload date and uploader only. Narrower than v0.12's FR1.8, which also sourced director and UBO extraction and stays deferred (§7). |

### FR2 — Extraction

| ID | Requirement |
|---|---|
| FR2.1 | Extract the fixed field set in FR2.2 from both periods. The set is closed — it derives from the baseline workbook, not from what a given statement happens to contain. |
| FR2.2 | **Standardized field set.** Ten numeric line items plus one sign test. |
| FR2.3 | **Normalize to raw absolute numbers at extraction.** A statement reporting in thousands and showing `1,234` yields `1234000`. Every stored value is absolute, so no computation anywhere in the system reads a scale or currency. |
| FR2.4 | Record on each field the presentation scale factor applied (FR2.3) and the statement's currency, as provenance. These support the FR3.2 review display and nothing else — no ratio, criterion, or score reads them. |
| FR2.5 | Every extracted field carries value, confidence score (0–100%), source document ID, and a source location pointer (page/cell/coordinate) so a user can jump to it. |
| FR2.6 | Confidence bands: High (≥90%), Medium (70–89%), Low (<70%). Code constants at MVP, changed by deployment. `PLACEHOLDER` — tunable. |
| FR2.7 | Fields below the confidence floor are flagged for mandatory review — never silently auto-accepted. |
| FR2.8 | Record on every field the extraction model/prompt version that produced it, so a model upgrade does not make a past extraction irreproducible. |
| FR2.9 | **Create a row for every field in the FR2.2 set, for both periods, whether or not extraction found a value** — and whether or not extraction succeeded at all. A field extraction missed arrives Unconfirmed with a null value and no confidence score, so it appears on the review screen as outstanding work (FR3.11) and the analyst either supplies it or confirms it absent (FR3.5). Without this, a missed field has no row, cannot be reviewed, and is invisible rather than surfaced — and an unreadable scan would yield an empty assessment that FR3.8 reports as ready to compute. |

**FR2.2 field set.** Baseline cells given for traceability to the source workbook.

| Field | Statement | Cell (cur/prior) | Consumed by |
|---|---|---|---|
| Sales | P&L | D38 / E38 | Net profit margin, WC over revenue |
| NPAT | P&L | D39 / E39 | Net profit margin, criterion 6 |
| Current Assets | B/S | D40 / E40 | Working capital, current ratio |
| Cash and bank balances | B/S | D41 / E41 | Integrity check only |
| Non-Current Assets | B/S | D42 / E42 | Integrity check only |
| Total Assets | B/S | D43 / E43 | Integrity check only |
| Current Liabilities | B/S | D44 / E44 | Working capital, current ratio |
| Non-Current Liabilities | B/S | D45 / E45 | Integrity check only |
| Total Liabilities | B/S | D46 / E46 | Debt to equity |
| Total Equity | B/S | D47 / E47 | Debt to equity |
| Net operating cash flow positive, latest FY | Cash flow | C33 | Criterion 10 |

Cash, Non-Current Assets, Total Assets and Non-Current Liabilities drive no ratio. They exist to validate the extraction (FR3.6) and are not droppable — they are the only arithmetic check on the balance sheet.

**Known consequence of allowing unaudited accounts (FR1.2).** Management accounts frequently carry no cash flow statement. Criterion 10 then has no source, is confirmed absent, and scores tier 1 (FR6.5) — a 20-point swing on a binary criterion (FR6.4), falling hardest on the customers whose statements are already weakest. This is the baseline's behaviour, not a defect introduced here, and no requirement compensates for it. Flagged so it is a known property of the score rather than a surprise in the first months of use.

Paid-up capital is **not** in this set. It is an analyst input (FR5.2) prefilled per FR5.8's source precedence, and confirmed like any other criterion input.

### FR3 — Field Review & Confirmation

Core GUI requirement. **Review completes before anything computes** (FR3.8) — this replaces v0.12's Provisional and Not Calculable ratio states (§7).

| ID | Requirement |
|---|---|
| FR3.1 | Show extracted fields in a table grouped by statement, each field one row with its current and prior period values side by side. |
| FR3.2 | Each field-period value shows a colour-coded confidence indicator (FR2.6), and the presentation scale and currency the source statement used (FR2.4). A stored value of `1234000` against a source page reading `1,234` is correct only if the statement was in thousands — without that label the analyst cannot check it, and a 1000× extraction error is invisible. |
| FR3.3 | Selecting a field opens and highlights its exact location in a side-by-side source document viewer. |
| FR3.4 | Confirm (accept as-is) or Amend (edit value) each field-period value individually. Status lifecycle: Unconfirmed → Confirmed \| Amended. Both terminal. |
| FR3.5 | A field-period value may be confirmed with **no value**, recording that the line item is genuinely absent from the source. A completed review outcome, not a gap. No separate status: absence is carried by a null value. |
| FR3.6 | **Run the FR3.7 integrity checks after extraction and surface every failure on the review screen**, anchored to the fields it tests. A failure never blocks computation — it directs attention. |
| FR3.7 | **Integrity checks.** Six inequalities, exact. Three equalities, passing within **0.1% of Total Assets** — a relative tolerance, since raw-number extraction (FR2.3) makes the baseline's absolute ±1 fail every statement reported in thousands. |
| FR3.8 | Nothing computes while any review item is Unconfirmed — no ratio (FR4), no criterion tier, no composite (FR6). No score is ever displayed against unreviewed data. |
| FR3.9 | Bulk-confirm all High-confidence field-period values at once. Confidence is scored per field-period value independently. |
| FR3.10 | Amending requires the new value and an optional reason; the original extracted value and confidence are retained for audit. |
| FR3.11 | Show a completion indicator counting review items — one per field-period combination, plus one per FR5 criterion input. Reviewed at Confirmed or Amended. |
| FR3.12 | **Statement recency flag.** Computed from the latest period's `financials_date`: where it is earlier than today − 540 days, flag the assessment `Non-Recent`, else `Recent`. Held on the assessment, not the document — one verdict describes the whole assessment. Advisory only — no effect on any tier, ratio, or score. |

**FR3.7 integrity checks.**

| Check | Type | Baseline cell |
|---|---|---|
| NPAT ≤ Sales | Inequality | G38 |
| Cash ≤ Current Assets | Inequality | G41 |
| Current Assets ≤ Total Assets | Inequality | G40 |
| Non-Current Assets ≤ Total Assets | Inequality | G42 |
| Current Liabilities ≤ Total Liabilities | Inequality | G44 |
| Non-Current Liabilities ≤ Total Liabilities | Inequality | G45 |
| Total Assets = Current Assets + Non-Current Assets | Equality, 0.1% tolerance | G43 |
| Total Liabilities = Current Liabilities + Non-Current Liabilities | Equality, 0.1% tolerance | G46 |
| Total Equity + Total Liabilities = Total Assets | Equality, 0.1% tolerance | G47 |

### FR4 — Ratio Calculation

| ID | Requirement |
|---|---|
| FR4.1 | On review completion (FR3.8), compute the FR4.2 ratios for both periods. |
| FR4.2 | **Ratio set.** Working Capital = Current Assets − Current Liabilities · Current Ratio = Current Assets / Current Liabilities · Net Profit Margin = NPAT / Sales · Debt to Equity = Total Liabilities / Total Equity. |
| FR4.3 | **Derived scorecard inputs**, computed alongside the ratios and consumed only by FR6. WC over revenue = Working Capital / Sales (criterion 1) · Paid-up capital cover = paid-up capital / total exposure (criterion 5) · Profitability history (criterion 6) = the pair of NPAT signs across both periods, tiered per FR6.13 — not a single boolean, which cannot distinguish the four sign combinations · Years established = `assessment_year − year_registered_sg` (criterion 7, from its CriterionInput, FR5.9). |
| FR4.4 | `assessment_year` is read from the assessment record, never a literal. Baseline correction — the workbook hardcoded 2023 (D108). |
| FR4.5 | Every ratio displays its formula and full lineage to the exact source fields and values used. |
| FR4.6 | **Period-over-period change** for every FR2.2 line item: `(current − prior) / prior`. Where `prior = 0` the change is not calculable — render "—", never an error or a zero. |
| FR4.7 | Where a required input was confirmed with no value (FR3.5), the ratio is not calculable — render "—" with the missing input named. Never substitute a zero or compute partially. A ratio not calculable for this reason scores its criterion at tier 1 (FR6.5). |
| FR4.8 | Amending any field or criterion input after computation re-runs the affected ratios, criterion tiers, and the composite, and logs both results (FR9.1). |
| FR4.9 | **No ratio is currency-converted or scale-normalized.** Every stored value is already a raw absolute number (FR2.3), and every ratio is a quotient of two figures from the same entity, so the result is dimensionless. MVP performs no FX conversion anywhere and stores no rate. |
| FR4.10 | Store each computed ratio as a dated result — compute on write, not on read. Never recomputed except via FR4.8, which makes historical results immutable without a config-version mechanism. |
| FR4.11 | **A zero divisor is a distinct case from an absent input, and does not default to tier 1.** An absent input means no evidence, so the conservative tier is the only safe reading. A zero divisor means the figure is known and the quotient is unbounded — a fact about the customer, which the criterion's own semantics score. Apply FR4.12; render the ratio "—" with the divisor named in every case, and state the tier the criterion took. |
| FR4.12 | **Zero-divisor treatment by ratio.** Current ratio, current liabilities = 0 → **tier 3**: no current liabilities is the strongest possible liquidity, and scoring it worst would be plainly wrong. Debt to equity, total equity = 0 → **tier 1**: no equity buffer, alongside the negative-equity condition the band already covers (FR6.10). Net profit margin, sales = 0 → **tier 1**: no revenue is not profitability. WC over revenue, sales = 0 → **tier 1**, same reasoning. Paid-up capital cover never reaches this case — a total exposure of zero or less is rejected at entry (FR5.13). |

### FR5 — Non-Financial Criterion Inputs

Five of the eleven criteria need inputs the statements do not carry. Each is an analyst-entered field, confirmed like an extracted field, that scores against FR6's bands with no further analyst step.

| ID | Requirement |
|---|---|
| FR5.1 | Provide an entry screen for the five criteria in FR5.2. Each input follows FR3.4's Confirm/Amend lifecycle and counts as a review item (FR3.11). |
| FR5.2 | **Inputs.** Criterion 5 — paid-up capital and total exposure, two amounts. Total exposure is always analyst-entered; no document carries it. Paid-up capital is prefilled per FR5.8 and confirmed or amended by the analyst, exactly as for an extracted field. Criterion 7 — year the entity was first registered to operate in Singapore, one number (FR5.9). Criterion 8 — litigation record, single select: Clean / Motor suits only / Other record, plus the FR5.10 evidence fields. Criterion 9 — change in management in the last 3 years, single select: Yes / No, scoped by FR5.11. Criterion 11 — prompt payment record over the past year, single select: Good / Late / None held, plus the FR5.12 evidence fields. |
| FR5.3 | Criteria 5 and 7 derive a number from their inputs and compute in the ratio engine (FR4.3), then band-map in the scorecard. Criteria 8, 9 and 11 are categorical — they bypass ratio computation and enter the scorecard as a confirmed tier. |
| FR5.4 | **Amending the total exposure rescores the assessment** (FR4.8), since criterion 5 divides by it. State this on the screen — an analyst changing a contract value must expect the class to move. |
| FR5.5 | Criterion 11 carries weight 0 for new customers (FR6.3). Hide its input in the new-customer flow rather than collecting a value that cannot affect the score. |
| FR5.6 | Paid-up capital and total exposure must be entered in the same currency. Their quotient is dimensionless (FR4.9); the system converts nothing and stores no rate. |
| FR5.7 | Capture, with no score impact: product type, contract start date, contract period, contract value or average demand, principal activities, parentage/shareholding, audited-financials flag. |
| FR5.8 | **Paid-up capital source precedence.** Prefill from the ACRA registry document (FR1.6) when one is uploaded; otherwise from the statements' share-capital note when extraction finds one; otherwise leave blank for manual entry. ACRA governs because it is the current legal record, while the share-capital note is only ever as at the balance-sheet date — which FR3.12 may already have flagged Non-Recent. Record which of the three produced the value (`CriterionInput.source`, §4) and show it beside the field, so an analyst can see whether they are confirming a registry figure or a year-old one. The analyst may amend any prefilled value; an amendment sets the source to manual. |
| FR5.9 | **Criterion 7 measures Singapore presence, not incorporation age.** The input is the year the entity first registered to operate in Singapore — its own incorporation year for an SG-incorporated company, or the ACRA branch or subsidiary registration year for a foreign-incorporated one. Foreign-incorporated counterparties are in scope and score on their Singapore registration, never on an overseas incorporation date: the criterion tests how long the counterparty has traded in the jurisdiction where a debt would be enforced. |
| FR5.10 | **Criterion 8 records its evidence.** Alongside the tier, capture the source searched (free text — court records, a commercial search, an internal check) and the date searched. Both are required to confirm the input; neither affects the tier. No search vendor is selected at MVP (§6), so the requirement is that the analyst states what they did, not that they use a particular service. A tier-3 clean record is otherwise a 10-point input backed by nothing, and a reviewer cannot tell a completed search from an unperformed one. Show both fields in the FR6.9 driver breakdown and the FR10.1 export. |
| FR5.11 | **Criterion 9 counts directors only.** A change means a director appointed or resigned within the last 3 years, per the ACRA officer register. Company secretary and auditor changes do not count, and neither does a change in shareholding — a controlling-stake change is a real credit signal but a different one, and this criterion does not test it. Scoped this way because it is objectively verifiable from one registry source, which is what makes the V2 automation (§7) a lookup rather than a judgement. |
| FR5.12 | **Criterion 11 records its evidence.** Alongside the tier, capture the system checked (free text — the AR ageing or billing system used) and the period it covered. Both are required to confirm the input; neither affects the tier. No AR integration exists at MVP (§6), and this is the joint-heaviest renewal criterion at weight 15, so an unevidenced Good is the single largest unsupported input in the scorecard. Show both in the FR6.9 driver breakdown and the FR10.1 export. Not collected for new customers, whose criterion 11 weight is 0 and whose input is hidden (FR5.5). |
| FR5.13 | **Relationship type is derived, not chosen.** Default to `Renewal` where the **(Customer, Division) pair** (FR8.1) has at least one Approved Assessment, `New` otherwise. Scoped to the division conducting the assessment: a customer with Approved history in one division is still `New` to a division that has never assessed them — that division has no payment record of its own to score at criterion 11 (FR5.12). It selects the weight set (FR6.3) and governs whether criterion 11 is collected at all (FR5.5), so a free choice would let a 15-point criterion be removed from the score with no record. The analyst may override the derived value, but must record a reason; the override, its reason, and the value it replaced appear in the FR6.9 driver breakdown and the FR10.1 export. Overriding is legitimate — a customer returning after years dormant, or a long-standing account whose history predates the tool — which is why it is permitted rather than blocked. |
| FR5.14 | **Changing the relationship type after criterion 11 is entered re-opens the score.** Switching to `New` zeroes criterion 11's contribution (FR6.6) and hides its input; switching to `Renewal` reveals criterion 11 as Unconfirmed, which blocks computation under FR3.8 until the analyst supplies it. Never carry a previously confirmed criterion 11 across the switch as though it had been reviewed under the new weight set. |
| FR5.15 | Reject a total exposure of zero or less at entry. A criterion 5 with nothing at risk is not an assessment, and it is the only input that could otherwise reach FR4.12 with a zero divisor. |
| FR5.16 | **Total exposure is scoped to the assessing division.** MVP does not aggregate a customer's exposure across divisions — a customer within limit in every division's assessment individually can still be over-exposed at group level, and nothing in the system surfaces this. Accepted as a known limitation, not solved at MVP (§7). |

### FR6 — Scorecard & Rating

| ID | Requirement |
|---|---|
| FR6.1 | **Eleven criteria**, each scoring tier 3, 2 or 1. Criterion score = tier × weight. Composite = Σ(tier × weight). Weights sum to 100 in both sets, so the composite ranges 100–300. |
| FR6.2 | Apply the FR6.7 bands. The six interval criteria (1–5, 7) partition the real line, each band closed on one side and open on the other. The five categorical criteria (6, 8, 9, 10, 11) enumerate every outcome their input can take, criterion 6 across all four NPAT sign combinations (FR6.13). No value on any criterion falls through to a default. |
| FR6.3 | **Two weight sets**, selected by relationship type (FR5.13): `New` uses the new set, `Renewal` uses the renewal set. |
| FR6.4 | Criteria 8, 9 and 10 are binary — no tier 2 exists, so a miss costs two tiers, not one. This is intended, not a gap in the bands. |
| FR6.5 | **A criterion whose input is confirmed absent, or whose ratio is not calculable (FR4.7), scores tier 1.** An absent input is never evidence of a clean record. Combined with FR3.8, no composite is ever shown against unreviewed data, and every composite that is shown is complete. |
| FR6.6 | Criterion 11's weight is 0 for new customers. Score it as an explicit 0 contribution — never leave the branch unevaluated. Baseline correction: the workbook's new-customer path referenced empty cells (O121). |
| FR6.7 | **Scorecard bands and weights.** |
| FR6.8 | **Rating classes.** A: 240–300, auto-recommend with GIRO, escalate to approving authority per MOA. B: 180–239, manual review with credit enhancement. C: 100–179, not recommended by Risk and Compliance. |
| FR6.9 | Show a driver breakdown: each criterion's tier, weight, contribution, and the input that produced it. |
| FR6.10 | For criterion 4, record which of three conditions fired — high leverage (`x ≥ 2`), negative equity (`x < 0`), or zero equity (total equity = 0, reaching tier 1 via FR4.12 rather than via a band). All three are tier 1 by different routes and the breakdown must distinguish them. |
| FR6.11 | The class is an assessment outcome, not an instruction. No downstream system may act on it, and MVP writes to no external system. |
| FR6.12 | Store the composite, class, weight set used, and driver breakdown as a dated result, on the same compute-on-write terms as FR4.10. |
| FR6.13 | **Criterion 6 tiers on the pair of NPAT signs**, which the FR6.7 table states in full: both periods profitable is tier 3; the latest profitable with the prior not is tier 2; **a loss in the latest period is tier 1 whatever the prior period did**. The four sign combinations partition across three tiers with none unassigned, and recent performance dominates — a customer that has just turned loss-making is the one carrying the exposure now. |
| FR6.14 | **`scorecard_version` is a constant in code**, stamped onto every Rating at compute time (§4) and onto every export (FR10.2). Increment it whenever any band boundary, weight, or class threshold changes. Methodology configuration is deferred (§7), so this string is the only thing tying a stored score to the methodology that produced it — without it, the first weight change makes every historical score unattributable and the Traceability NFR's claim false. |

**FR6.7 scorecard.**

| # | Criterion | Tier 3 | Tier 2 | Tier 1 | Wt renewal | Wt new |
|---|---|---|---|---|---:|---:|
| 1 | WC over revenue | ≥ 20% | 0% ≤ x < 20% | < 0% | 5 | 5 |
| 2 | Current ratio | ≥ 3 | 2 ≤ x < 3 | < 2 | 10 | 10 |
| 3 | Net profit margin | ≥ 30% | 0% ≤ x < 30% | < 0% | 10 | 10 |
| 4 | Debt to equity | 0 < x ≤ 1 | 1 < x < 2 | ≥ 2, or ≤ 0 | 10 | 10 |
| 5 | Paid-up capital cover | ≥ 2× exposure | 1× ≤ x < 2× | < 1× | 5 | 5 |
| 6 | Profitability history (FR6.13) | both FY profitable | latest FY profitable, prior not | latest FY loss, whatever the prior | 15 | 25 |
| 7 | Years registered in SG (FR5.9) | ≥ 10 | 5 ≤ x < 10 | < 5 | 5 | 10 |
| 8 | Litigation record | clean, or motor suits only | — | any other record | 10 | 10 |
| 9 | Change in directors, last 3 yrs (FR5.11) | no | — | yes | 5 | 5 |
| 10 | Positive net operating cash flow, latest FY | yes | — | no | 10 | 10 |
| 11 | Prompt payment record, past 1 yr | good | — | late, or none held | 15 | 0 |

All eleven criteria are required. The weights are normalised to 100 and the 240/180 thresholds are calibrated against that base — dropping a criterion requires recalibrating both, so it is not a free simplification.

### FR7 — Assessment State & Approval

| ID | Requirement |
|---|---|
| FR7.1 | State machine: Draft → Submitted → Approved \| Rejected \| Returned for Revision. A Returned assessment re-enters Draft. |
| FR7.2 | Submitting requires a computed class (FR6). The submitting user is recorded on the assessment. |
| FR7.3 | Every transition is evaluated by a **named authorization guard** before it is applied — the single place any role, scope, or segregation-of-duties rule may ever live. A guard receives the assessment, the acting user, and the target transition, and returns allow or deny with a reason. No transition may be applied by any other path, and no authorization logic may be written anywhere else — not in the UI, not inline in a handler. At MVP every guard allows any authenticated user (FR7.7). |
| FR7.4 | The approver may Approve (locks the assessment), Reject (closes it, reason required), or Return for Revision (back to Draft with comments). Each is an ApprovalDecision (§4), accumulating across resubmit cycles. |
| FR7.5 | Record on every ApprovalDecision the `policy_version` live at the time, so a decision made under MVP's allow-all policy is distinguishable from one made under enforced SoD. |
| FR7.6 | The approver sees the full extraction, integrity-check results, ratio lineage, criterion inputs, driver breakdown, and audit trail before deciding. |
| FR7.7 | MVP guard implementations, all allow-any-authenticated-user. Enumerated so the V2 substitution is a known set rather than a search through the codebase. |
| FR7.8 | An Approved or Rejected assessment is immutable. Correcting one means creating a new assessment for that customer (FR8.2). |

**Transition guards (FR7.3, FR7.7).** Only the MVP column is a requirement; the V2 column records the intended target so the extension points are designed against it.

| Transition | Guard | Actor recorded as | MVP | Intended V2 |
|---|---|---|---|---|
| Draft → Submitted | `can_submit` | `Assessment.submitted_by` | Allow any | Analyst role; own or team |
| Submitted → Approved | `can_approve` | `ApprovalDecision.actor` | Allow any | Approver role **and** `actor ≠ submitted_by` |
| Submitted → Rejected | `can_approve` | `ApprovalDecision.actor` | Allow any | Same as Approve |
| Submitted → Returned | `can_return` | `ApprovalDecision.actor` | Allow any | Approver role; no SoD — returning work to its author is not a decision |
| Returned → Draft | *(automatic)* | — | No guard | Unchanged |

Two properties this buys: the SoD rule is one condition inside `can_approve`, since both operands are already recorded — no schema change, no backfill. And `can_return` is split from `can_approve` despite being identical today, because they diverge in V2; splitting later would mean re-deriving which past decisions were Returns.

### FR8 — Customer & Assessment Record

| ID | Requirement |
|---|---|
| FR8.1 | Every assessment ties to a customer entity **and a division** — the assessing organization's own business unit conducting the assessment. **(Customer, Division) is the unit of continuity**: versioning (FR8.2), Draft/Submitted concurrency (FR8.3), relationship-type derivation (FR5.13), and exposure (FR5.16) all scope to this pair, not to the customer alone. Different divisions may hold independent, even conflicting, assessments and ratings for the same customer at the same time — expected, not an inconsistency to reconcile at MVP. |
| FR8.2 | A (Customer, Division) pair may have multiple assessments over time; each is versioned and never overwritten. |
| FR8.3 | Entry point: search for and select an existing Customer, or create a new one; select the division conducting the assessment; then begin a new Assessment. Where the (Customer, Division) pair has prior assessments, the new one is the next version. **At most one non-terminal assessment (Draft or Submitted) may exist per (Customer, Division)** — selecting a pair with one already open resumes it rather than creating a second; a different division for the same customer may open its own concurrently. v0.12's Refresh Assessment flow and `source_assessment_id` linkage are deferred (§7). |
| FR8.4 | **Customer Directory** — a top-level entry point listing every (Customer, Division) pair with at least one Assessment, one row per pair — the same customer name may appear more than once, once per division that has assessed them. Each row shows customer name, division, most recent assessment date, and that division's most recent Approved assessment's class. Selecting a row opens FR8.5. |
| FR8.5 | **Customer detail view** — lists that (Customer, Division) pair's Assessments with date, state, class and composite, each clickable through to FR8.6. Read-only. Where a customer has been assessed by more than one division, a division selector switches between them; each division's list is independent. A **New assessment for this customer** action routes into FR8.3 with the customer and division pre-selected. |
| FR8.6 | Open any past Assessment read-only: its extracted fields with status, integrity-check results, ratios with lineage, criterion inputs, composite, class, and driver breakdown as they stood at approval. Opening it never reopens it for editing (FR7.8). |

### FR9 — Audit Trail

| ID | Requirement |
|---|---|
| FR9.1 | Log every extraction confidence score, confirm/amend action, integrity-check result, ratio and composite computation, state transition and approval, with actor, timestamp, and before/after value. |
| FR9.2 | Append-only and immutable — no update or delete path exists, enforced structurally rather than by convention. |
| FR9.3 | Readable in-app. Per-role read restriction is deferred with roles (§7). |

### FR10 — Export

| ID | Requirement |
|---|---|
| FR10.1 | Export a completed assessment to PDF or Excel: fields with confirmation status and source scale, integrity-check results, ratios with lineage, all eleven criterion inputs and tiers, composite, class, handling route, and the approval record. |
| FR10.2 | Stamp each export with the extraction model version (FR2.8), the scorecard version, and the export date. |

## 3. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Access | Authenticated users only; documents encrypted at rest. No roles, team scoping, or segregation of duties at MVP (§1). All authorization routes through FR7.3's guards, which are allow-all at MVP — the only place role logic may be introduced in V2. |
| Reproducibility | The composite must reproduce the baseline workbook's output for the same inputs, subject to the corrections in `Baseline_Scorecard_Extract_v1.2.md` §7. Test against the workbook, do not assume. |
| Traceability | Every ratio, tier and class must be reconstructable from source documents at any later date. Requires the source document, the field-level source pointer, the extraction model version, and the scorecard version to survive together for the full retention period. |
| Determinism | No model participates in ratio computation, band mapping, or scoring. A value a model produced cannot be reproduced on demand, which voids the reproducibility and traceability rows above. |
| Personal data | Statements contain director names, signatures and guarantor details, exposed in the FR3.3 viewer and FR10 exports. **No masking or redaction at any point — decided, not open.** This is an enterprise-level control (DLP, export monitoring, access review), not a workflow-application concern; building masking into this tool would duplicate controls that should apply uniformly across every system handling the same data, not just this one. |
| Multi-currency / FX | MVP holds no FX rate and performs no conversion. Values are stored as raw absolute numbers (FR2.3), ratios are dimensionless (FR4.9), and criterion 5's two operands share a currency by requirement (FR5.6). |
| Multi-entity / consolidated group | **Accepted as uploaded — decided, not open.** MVP does not distinguish standalone from consolidated statements computationally; statement basis is captured as provenance only (FR1.4), and the analyst judges suitability. Entity resolution (which subsidiary's numbers these are, whether a group's exposure should aggregate) is not attempted at MVP. |
| Performance | Extraction turnaround target. `OPEN`. |
| Data retention | `OPEN`. One ordering holds regardless: a document outlives every assessment citing it. |

## 4. Data Model

| Entity | Key attributes | Relationships |
|---|---|---|
| Customer | id, name, industry, relationship_owner | Has many Assessments |
| Assessment | id, customer_id, **division**, version, state, relationship_type (New/Renewal, derived per FR5.13, scoped to the customer_id+division pair), relationship_type_overridden, relationship_type_override_reason, assessment_year (set at creation, never re-derived on approval), recency_flag, contract metadata (FR5.7), created_by, created_at, submitted_by, submitted_at | Belongs to Customer; has many Documents, ExtractedFields, CriterionInputs, Ratios, ApprovalDecisions; has one Rating. Versioning and Draft/Submitted concurrency (FR8.2, FR8.3) key on (customer_id, division), not customer_id alone. `submitted_by` is recorded with no rule reading it at MVP — it exists so V2's SoD guard needs no backfill |
| Document | id, assessment_id, type (audited/unaudited/registry), period, financials_date, presentation_currency, presentation_scale, statement_basis (standalone/consolidated), version, uploader, upload_date | Belongs to Assessment — one owner, no join table. Registry documents (FR1.6) carry no period, financials date, currency, scale, or statement basis |
| ExtractedField | id, assessment_id, document_id, field_name, period, value (raw absolute, nullable per FR3.5), scale_applied, currency, confidence_score, source_pointer, extraction_model_version, status, amendment_history | Belongs to Assessment. `scale_applied` and `currency` are provenance for FR3.2 only — no computation reads them |
| IntegrityCheckResult | id, assessment_id, check_name, operand_field_ids, expected, actual, passed, tolerance_applied, evaluated_at | Belongs to Assessment; surfaced by FR3.6, never blocking |
| CriterionInput | id, assessment_id, criterion_number, value_numeric, value_categorical, currency (criterion 5 only), source (registry/statement-note/manual — criterion 5 only, FR5.8), source_document_id (nullable), evidence_source (criteria 8 and 11, FR5.10/FR5.12), evidence_period_or_date (criteria 8 and 11), status, entered_by, confirmed_by, confirmed_at | Belongs to Assessment. The five FR5.2 inputs; follows ExtractedField's confirmation lifecycle |
| Ratio | id, assessment_id, formula_ref, lineage (source field IDs), value_numeric (nullable), value_boolean (nullable), period (null where the result spans both periods or none — criterion 6's sign pair, criterion 7's years registered), not_calculable_reason, zero_divisor_field (nullable, FR4.12), computed_at | Belongs to Assessment; derived from ExtractedFields and CriterionInputs. Holds the FR4.3 derived scorecard inputs as well as the four FR4.2 ratios, so not every row is a period-scoped number |
| Rating | id, assessment_id, composite_score, rating_class (A/B/C), handling_route, weight_set (new/renewal), driver_breakdown (per-criterion tier, weight, contribution, source input), scorecard_version, computed_at | Belongs to Assessment, one per assessment. Replaces v0.12's separate Rating and Recommendation entities; carries no limit amount or terms at MVP (§7) |
| ApprovalDecision | id, assessment_id, actor, action (Approve/Reject/Return), comments, timestamp, policy_version | Belongs to Assessment — a collection, one row per action. `actor` and `Assessment.submitted_by` are the two operands V2's SoD rule evaluates |
| AuditLogEntry | id, entity_type, entity_id, actor, action, before_value, after_value, timestamp | References any of the above; append-only |

Ten entities, against v0.12's thirteen. Removed: ScorecardConfig (methodology is code at MVP), ScreeningSubject / ScreeningRun / AdverseFinding (FR12 deferred), the separate Recommendation entity, and the Document↔Assessment join. Added since v1.0: IntegrityCheckResult and CriterionInput.

## 5. Module Ownership & Handoffs

Five modules. **One is agentic — Extraction. The other four contain no model**, per the Determinism NFR.

Ownership is enforced structurally — each store grants write access only to its owning module's service identity — not by convention.

| Module | Type | Owns (sole writer) | Reads | May not |
|---|---|---|---|---|
| Intake | Deterministic | Document | — | Alter a stored document; overwrite a version (FR1.5) |
| Extraction | **Agent** | ExtractedField value, scale_applied, currency, confidence_score, source_pointer, extraction_model_version; the criterion 5 paid-up capital prefill value, source and source_document_id on CriterionInput (FR5.8) | Document | Write a field or input `status` — it produces candidates, never confirmations |
| Field Review | Deterministic | ExtractedField status and amendment_history; CriterionInput for every input except Extraction's criterion 5 prefill, plus status and amendments on that one; IntegrityCheckResult | ExtractedField, Document | Write a value without recording the original (FR3.10); compute a ratio or tier |
| Calculation | Deterministic | Ratio, Rating | ExtractedField and CriterionInput (Confirmed/Amended only); Assessment's relationship_type and assessment_year (weight set FR6.3, criterion 7 FR4.4) | Read an Unconfirmed input (FR3.8); write back to any field or input |
| Record | Deterministic | Customer, Assessment (including the derived relationship type and any override, FR5.13 — derived from the ApprovalDecision history Record already owns), ApprovalDecision, AuditLogEntry | All of the above | Apply a transition without passing FR7.3's guard; recompute a stored ratio or rating; edit an approved assessment (FR7.8); update or delete an audit entry (FR9.2) |

**Handoffs are one-directional.** Extraction hands values to Field Review and cannot take them back. Field Review hands confirmed inputs to Calculation and cannot influence the arithmetic. Calculation hands ratios and the rating to Record and cannot reach back into inputs. No module writes upstream of itself, which is what makes every stored value attributable to exactly one producer.

**On context:** only Extraction has a context window, scoped to one document — never the assessment, the customer's history, or the scorecard. No module's working set grows with the number of customers in the system.

## 6. Open Questions

Closed by `Baseline_Scorecard_Extract_v1.2.md`: the extracted field set, ratio formulas, scorecard bands and weights, score-to-grade mapping, and the treatment of a not-calculable input (tier 1, FR6.5).

**Criterion sourcing.** All five non-financial criteria are analyst-entered at MVP; none blocks the build. Criteria 5, 7 and 9 are now fully defined (FR5.8, FR5.9, FR5.11). Two questions remain, both about which service to license or integrate for V2 — not about what the criterion means.

| # | MVP source | Remaining question |
|---|---|---|
| 8 | Analyst-entered, with the search declared (FR5.10) | No search vendor identified — which service, if any, to license for V2 |
| 11 | Analyst-entered, with the system declared (FR5.12) | Which AR ageing or billing system to integrate for V2, and whether it is queryable |

**Other**

`OPEN:` Credit limit sizing — the baseline derives no amount anywhere. Determines what V2's limit engine takes as input beyond the class.

`OPEN:` Payment terms — the baseline assumes 14 days and a 1.5× security deposit, with deviations reviewed case by case. Confirm before building the V2 terms surface.

`OPEN:` Whether V2's `can_approve` guard needs a delegation or break-glass path for teams too small to staff a second approver.

`OPEN:` Data retention duration and governing jurisdiction.

`OPEN:` Extraction turnaround SLA.

`OPEN:` Automatic detection of statement type (FR1.2) instead of uploader tagging.

## 7. Deferred to V2

Requirement text for deferred items is retained in `Credit_Assessment_PRD_v0.10.md` under the reference given. Nothing is cancelled.

| Deferred | Reference | Why | Cost of reintroducing |
|---|---|---|---|
| Credit limit amount and payment terms | v0.12 FR6 | The baseline derives no limit amount and assumes fixed terms; sizing rules do not exist yet (§6) | Additive — new fields on Rating, plus a sizing rule set |
| Qualitative override of the computed class | v0.12 FR5.3 | No mechanism in the baseline | An adjustment layer over the composite, never folded into it |
| Roles, permission matrix, team scoping, Auditor and Config Admin personas | v0.12 §1, NFR Confidentiality, FR9.3 | Single-team deployment | A role attribute plus new implementations of FR7.3's existing guards. No state-machine or entity change |
| Segregation of duties (approver ≠ submitter) | v0.12 FR7.5 | One person may own an assessment end to end at MVP | One condition inside `can_approve`. Both operands already recorded — no schema change, no backfill |
| Approval delegation and break-glass path | v0.12 FR7.6 | Only relevant once SoD is enforced | May widen the guard signature; nothing else |
| Multi-approver committee | v0.12 FR7.7 | Depends on two-step approval | Additive |
| ACRA and AR-system lookups for criteria 5, 7, 9, 11 | Extract §6.3 | Analyst entry works. Criteria 5, 7 and 9 are fully defined (FR5.8, FR5.9, FR5.11) so their lookups are specified; criteria 8 and 11 await a vendor and a system (§6) | Additive — a lookup that prefills a CriterionInput the analyst still confirms |
| Versioned methodology configuration | v0.12 FR10 | Methodology is code; stored results are never recomputed (FR4.10, FR6.12), so historical results are already immutable | A config entity plus a stamp on Ratio and Rating |
| Customer-scoped documents, reuse by reference, copy-on-reuse | v0.12 FR1.6–FR1.7 | Saves an upload, not review work — reused fields reset to Unconfirmed anyway | Requires the Document↔Assessment join and the status-reset guardrail |
| Document browser | v0.12 FR1.9 | Depends on customer-scoped documents | Additive |
| Refresh Assessment and refresh-source linkage | v0.12 FR8.3–FR8.4 | A new assessment for an existing customer covers the workflow | Needs `source_assessment_id` on Assessment |
| Cross-assessment ratio and class comparison | v0.12 FR8.8–FR8.9 | Depends on refresh linkage | Depends on the row above |
| Assessment history trend chart | v0.12 FR8.6 | Charting over data MVP already stores | Additive, read-only |
| Provisional and Not Calculable ratio states | v0.12 FR3.7–FR3.10 | Serve draft ratios shown mid-review; MVP computes after review (FR3.8) and scores an absent input tier 1 (FR6.5) | Status column widened, submission gate rebuilt |
| Third and further fiscal periods | v0.12 FR1.3 | The baseline consumes exactly two (FR1.3) | Additive; no criterion reads a third |
| Director/UBO extraction from the registry document | v0.12 FR1.8, FR2.8, FR3.11 | The registry document itself ships at MVP for paid-up capital (FR1.6); only the director and UBO extraction on top of it is deferred, since its only consumer is adverse-media screening | Additive — extraction widens to identity fields on a document already uploaded |
| Adverse-media screening | v0.12 FR12 | Feeds a qualitative adjustment that is itself V2 | Self-contained; three entities |
| Assistant / conversational Q&A | v0.12 FR13 | Reads data MVP produces; blocked only on prioritisation | Self-contained, read-only, no entity change |
| Cross-division exposure aggregation | — | Each division assesses independently at MVP (FR5.16) — a customer within limit in every division's assessment individually can still be over-exposed at group level | Needs a customer-level running exposure total every division's assessment reads and writes, or a portfolio view |
| ERP/CRM write-back, portfolio analytics | — | No requirement written | — |

## 8. Glossary

| Term | Definition |
|---|---|
| Division | The assessing organization's own business unit conducting an assessment. (Customer, Division) — not Customer alone — is the scope for versioning, Draft/Submitted concurrency, relationship type, and exposure (FR8.1). |
| NPAT | Net Profit After Tax. |
| Working capital | Current Assets − Current Liabilities. |
| Composite | Σ(tier × weight) across the eleven criteria; ranges 100–300. |
| Tier | A criterion's band, 3 (best) to 1 (worst). Criteria 8, 9 and 10 have no tier 2. |
| Class | The rating output — A, B or C — mapped from the composite (FR6.8). |
| Handling route | The action a class prescribes: auto-recommend with GIRO, manual review with credit enhancement, or not recommended. |
| Weight set | One of two weight columns, selected by relationship type. Both sum to 100. |
| Raw absolute number | A figure normalized at extraction to its true magnitude, whatever scale the statement presented (FR2.3). |
| Presentation scale | The multiplier a statement declares — units, thousands, millions. Recorded as provenance; read by no computation. |
| Review item | One field-period combination, or one criterion input — the unit FR3.11 counts. |
| Not calculable | A ratio with an absent input or zero divisor (FR4.7). Scores its criterion tier 1. |
| ACRA | Accounting and Corporate Regulatory Authority — Singapore's company registry. |
| Confidence score | Extraction-model certainty (0–100%) that an extracted value is correct. |
| Lineage | The chain from a computed value back to the exact source field(s), document(s), and location(s) that produced it. |
