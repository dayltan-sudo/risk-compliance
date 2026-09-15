# Baseline Scorecard Extract v1.2

Source: `Credit Review Report template.xlsx`, sheet `Analysis` (client baseline, dated 26/3/2024). Supplies the values that [`Scoring & Decisioning.md`](../3.%20Agents%20&%20Workflows/a.%20Agents/Scoring%20&%20Decisioning.md) §7 carries as `PLACEHOLDER`.

Scope: ratio set, statement line items, scorecard bands, weights, rating bands, recommendation rules. Cell references given so any value can be traced back to the workbook.

**This spec is the build target, not a transcription.** Six defects in the baseline workbook are corrected in the body below; §7 records each correction against its originating cell. Where spec and workbook disagree, the spec governs.

## 1. Financial statement line items to extract

Two periods per assessment (`FY_current`, `FY_prior`; template uses 31/12/2023 and 31/12/2022). All feed `cra:extracted_field_store`.

Every figure is extracted as a raw absolute number, whatever the statement's own presentation. A statement reporting in thousands and showing `1,234` yields `1234000`. No reporting unit, scale or currency is stored alongside the value, and the engine is currency-agnostic throughout — every ratio in §2 is dimensionless, and the one cross-field comparison (§3 criterion 5) divides two figures drawn from the same entity.

| Field | Statement | Cell (cur/prior) | Used by |
| :--- | :--- | :--- | :--- |
| Sales | P&L | D38 / E38 | NPM, WC-over-revenue |
| NPAT | P&L | D39 / E39 | NPM, profitable-2FY |
| Current Assets | B/S | D40 / E40 | WC, current ratio |
| Cash and bank balances | B/S | D41 / E41 | integrity check only |
| Non-Current Assets | B/S | D42 / E42 | integrity check only |
| Total Assets | B/S | D43 / E43 | integrity check only |
| Current Liabilities | B/S | D44 / E44 | WC, current ratio |
| Non-Current Liabilities | B/S | D45 / E45 | integrity check only |
| Total Liabilities | B/S | D46 / E46 | D/E |
| Total Equity | B/S | D47 / E47 | D/E |
| Net operating cash flow, latest FY | Cash flow | C33 (Yes/No) | scorecard criterion 10 |
| Paid-up capital | Registry, or B/S share-capital note | C23 | scorecard criterion 5 |

Cash, Non-Current Assets, Total Assets and Non-Current Liabilities drive no ratio. They exist to validate the extraction. Keep them — dropping them removes the only arithmetic check on the balance sheet.

Paid-up capital is one field, not two. The workbook holds it twice (B21 and B23); store the single raw figure.

### 1.1 Integrity checks

Fail = surface to Field Review, do not block computation. Each check is anchored to the operands it tests, not to the workbook row that displayed it.

| Check | Baseline cell |
| :--- | :--- |
| NPAT ≤ Sales | G38 |
| Cash ≤ Current Assets | G41 |
| Current Assets ≤ Total Assets | G40 |
| Non-Current Assets ≤ Total Assets | G42 |
| Total Assets = CA + NCA | G43 |
| Current Liabilities ≤ Total Liabilities | G44 |
| Non-Current Liabilities ≤ Total Liabilities | G45 |
| Total Liabilities = CL + NCL | G46 |
| Total Equity + Total Liabilities = Total Assets | G47 |

The baseline's ±1 tolerance does not survive raw-number extraction. A statement reporting in thousands rounds to the nearest 1,000 in raw terms, so an absolute ±1 would fail every such balance sheet. Use a relative tolerance instead: the three equality checks pass when the difference is within 0.1% of Total Assets. That is scale-free and needs no stored unit.

### 1.2 Recency check

`financials_date < TODAY − 540 days` → `Non-Recent`, else `Recent` (D35/G35). Advisory flag, no score impact.

### 1.3 Period-over-period change

`(current − prior) / prior` for every line item above (column F). This is FR4.4's trend view. Undefined where `prior = 0`; store as Not Calculable rather than an error.

## 2. Ratios

Computed for both periods (rows 64–79).

| Ratio | Formula |
| :--- | :--- |
| Working Capital | Current Assets − Current Liabilities |
| Current Ratio | Current Assets / Current Liabilities |
| Net Profit Margin | NPAT / Sales |
| Debt to Equity | Total Liabilities / Total Equity |

Derived inputs used only by the scorecard:

| Input | Formula | Baseline cell |
| :--- | :--- | :--- |
| WC over revenue | Working Capital / Sales | D84 |
| Paid-up capital cover | Paid-up capital / total exposure | D100 |
| Profitable last 2 FY | `NPAT_cur > 0 AND NPAT_prior > 0` | D104 |
| Years of establishment | `assessment_year − year_established_SG` | D108 |

`assessment_year` is read from the assessment record. It is never a literal.

## 3. Scorecard

Eleven criteria. Each scores tier 3, 2 or 1; criterion score = tier × weight. Two weight sets, selected by relationship type (`New` → new set, otherwise renewal set; P81).

Composite = Σ(tier × weight). Weights sum to 100 in both sets, so the range is 100–300.

| # | Criterion | Tier 3 | Tier 2 | Tier 1 | Wt (renewal) | Wt (new) |
| :--- | :--- | :--- | :--- | :--- | ---: | ---: |
| 1 | WC over revenue | ≥ 20% | 0% ≤ x < 20% | < 0% | 5 | 5 |
| 2 | Current ratio | ≥ 3 | 2 ≤ x < 3 | < 2 | 10 | 10 |
| 3 | Net profit margin | ≥ 30% | 0% ≤ x < 30% | < 0% | 10 | 10 |
| 4 | Debt to equity | 0 < x ≤ 1 | 1 < x < 2 | ≥ 2, or ≤ 0 | 10 | 10 |
| 5 | Paid-up capital cover | ≥ 2× exposure | 1× ≤ x < 2× | < 1× | 5 | 5 |
| 6 | Profitable last 2 FY | both FY | latest FY only | neither | 15 | 25 |
| 7 | Years established in SG | ≥ 10 | 5 ≤ x < 10 | < 5 | 5 | 10 |
| 8 | Litigation record | clean (motor suits excepted) | — | any other record | 10 | 10 |
| 9 | Change in management, last 3 yrs | no | — | yes | 5 | 5 |
| 10 | Positive net operating CF, latest FY | yes | — | no | 10 | 10 |
| 11 | Prompt payment record, past 1 yr | good | — | late, or none held | 15 | 0 |

Every band is a closed interval on one side and open on the other, and the three bands of each criterion partition the whole real line. No value can fall through to a default.

Criteria 8, 9 and 10 are binary: there is no tier 2, so a miss costs two tiers, not one.

Criterion 11 carries weight 0 for new customers, so its tier is irrelevant there. Score it as an explicit 0 contribution rather than leaving the branch unevaluated.

Criterion 4's tier 1 covers negative equity (`x ≤ 0`) as well as high leverage. Both are worst-tier outcomes, but they are not the same condition — record which one fired in the driver breakdown.

## 4. Rating bands and recommendation

| Class | Score | Recommendation |
| :--- | :--- | :--- |
| A | 240–300 | Auto-recommend with GIRO; escalate to approving authority per MOA |
| B | 180–239 | Manual review with credit enhancement |
| C | 100–179 | Not recommended by Risk and Compliance |

Assumed contract terms: 14 days credit terms, 1.5× security deposit. Any deviation is a case-by-case review.

The baseline sizes no limit amount — it outputs a class and a handling route only. Recommendation Engine's `OPEN` on exposure-based sizing (Scoring & Decisioning §6) stays open.

## 5. What this closes and what it does not

Closes: the ratio set, the band boundaries, the weight sets, the score-to-grade mapping, and the shape of the recommendation output.

Does not close:
- **Not Calculable treatment.** Settled in the baseline's own direction: a missing or unconfirmed input scores tier 1, so every criterion always carries a score and the composite is always computable. The Provisional flag still applies until every input is confirmed, so a low class driven by absent data is distinguishable from one driven by assessed weakness — see §6.2.
- **Limit sizing.** No amount is derived anywhere in the workbook.
- **Qualitative override.** No mechanism in the baseline.

## 6. Non-financial inputs

Six criteria (1, 2, 3, 4, 6, 10) compute from the extracted statements. The remaining five need inputs the statements do not carry. Each is a UI field the analyst fills and confirms; on confirmation it scores against the bands below and flows into the composite with no further analyst step.

| # | Criterion | UI input | Tier 3 | Tier 2 | Tier 1 | Wt (renewal) | Wt (new) |
| :--- | :--- | :--- | :--- | :--- | :--- | ---: | ---: |
| 5 | Paid-up capital cover | Paid-up capital, and total exposure — two numbers | ≥ 2× exposure | 1× ≤ x < 2× | < 1× | 5 | 5 |
| 7 | Years established in SG | Year established — one number | ≥ 10 | 5 ≤ x < 10 | < 5 | 5 | 10 |
| 8 | Litigation record | Clean / Motor suits only / Other record — single select | clean, or motor suits only | — | any other record | 10 | 10 |
| 9 | Change in management, last 3 yrs | Yes / No — single select | no | — | yes | 5 | 5 |
| 11 | Prompt payment record, past 1 yr | Good / Late / None held — single select | good | — | late, or none held | 15 | 0 |
| | **Subtotal** | | | | | **40** | **30** |

Bands are identical to §3 — this table restates them so the UI can be built from one section. §3 remains the single source for the other six. Every tier-1 band is also the default before input, per §6.2.

### 6.1 What computes where

Criteria 5 and 7 derive a number from confirmed inputs, so they run in the Ratio Engine like any other ratio, then band-map in the Rating Engine. Criteria 8, 9 and 11 are categorical: there is nothing to compute, so they bypass the Ratio Engine and enter the Rating Engine as a confirmed tier directly. All five recompute the composite on amendment, exactly as an amended statement field does (FR4.3).

Criterion 5's exposure figure comes from the analyst, not a statement, so amending the contract value rescores the assessment. Make that visible in the UI.

### 6.2 Behaviour before confirmation

**Every criterion defaults to tier 1 until an input is provided and confirmed.** This applies to all eleven, not only the five here. An absent input is never evidence of a clean record, so the conservative tier is the only safe assumption — a blank litigation field must not score as a clean one.

The workbook's own prefills are not a guide. Criteria 8, 9 and 10 sit at the best tier and 11 at the worst, which is residual data from a prior assessment rather than a stated default. Ignore all four.

The composite is therefore always computable and always starts at the floor, rising as inputs are confirmed. Mark it Provisional until every input is confirmed, so a Class C driven by an empty form is distinguishable from one driven by assessed weakness. Show the count of unconfirmed criteria alongside the class.

Criterion 11 carries weight 0 for new customers. Hide the field in the new-customer flow rather than showing an input that cannot affect the score.

### 6.3 Sourcing — needs confirmation

| # | Proposed MVP source | Open question |
| :--- | :--- | :--- |
| 5 | Paid-up capital from ACRA Bizfile or the share-capital note; exposure from the contract | Which is authoritative when the two disagree |
| 7 | ACRA incorporation date | Whether foreign-incorporated counterparties are in scope, given the criterion says "in SG" |
| 8 | Analyst-entered from an external litigation search | No search vendor identified |
| 9 | ACRA officer history | Whether "management" means directors only, as the workbook's own field implies |
| 11 | Internal AR ageing / billing system | Which system, and whether it is queryable |

Also analyst-supplied, no score impact: product type, contract start date, contract period, average demand (MW) or contract value, principal activities, parentage/shareholding, audited-financials flag, relationship type.

Keep all eleven criteria for MVP. Dropping any is not a free simplification — the weights are normalised to 100 and the 240/180 thresholds are calibrated against that base, so removing a criterion requires recalibrating both. Automating the ACRA-sourced inputs (5, 7, 9) is a V2 registry-lookup item, not an MVP blocker.

## 7. Corrections applied to the baseline workbook

Each row is a deliberate deviation. The workbook is unchanged; these are the points at which this spec departs from it.

| Baseline cell | Defect | Correction in this spec | Where |
| :--- | :--- | :--- | :--- |
| E85 / N84 | Label reads "less than 20% but more than 10%"; formula tests `0 ≤ x < 20%`. The 0–10% band was unreachable as labelled. | Band is `0% ≤ x < 20%`, label corrected to match the formula | §3 criterion 1 |
| N88 | Current ratio of exactly 2 fell to tier 1 (test was `> 2`), contradicting the stated "Below 2" | Tier 2 is `2 ≤ x < 3`, tier 1 is `< 2` | §3 criterion 2 |
| D100 | Paid-up capital and exposure entered at different scales — result off by 1000× | Moot: all figures are extracted as raw absolute numbers, so both operands are already on the same scale | §1 |
| D108 | Assessment year hardcoded as `2023` | `assessment_year` read from the assessment record | §2 |
| O121 | New-customer path referenced empty cells J121/J122 | Criterion 11 contributes an explicit 0 for new customers | §3 |
| G38–G47 | Check formulas sat one row off their labels in places, so a displayed pass could belong to a different pair of operands | Checks anchored to their operands, not to display rows | §1.1 |
| B21 / B23 | Paid-up capital held twice, with no single authoritative value | One field, one raw figure | §1 |

Two further gaps found while applying the above, corrected here without a defect row in the baseline: period-over-period change is undefined when the prior period is zero (§1.3), and the baseline's absolute ±1 balance-sheet tolerance is replaced by a relative one, since raw-number extraction makes an absolute tolerance unworkable (§1.1).
