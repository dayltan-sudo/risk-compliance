# Census Test Run 6 — Regression Check (ENGIE RCS)

**Purpose:** confirm the ENGIE RCS case still produces correct output after the fictional-scenario work (Kestrel Bay / Dr. Priya Ratnam), which touched only test fixtures, not the persona `.md` files. Freshly re-derived, not copied from `Census Output 4`. Same 5 source documents, same `DocAnalyst` extraction as Tests 1–4. `Custodian` not invoked. Steps 3 and 5 remain `[SIMULATED]`.

**Pre-check:** file timestamps on `Custodian.md` (22:15), `Screener.md` (22:14), `TPA DocReviewer.md` (23:30), `TPA Orchestrator.md` (23:58) — all 16 Jul, all predate Test 4 (17 Jul 09:47) and are unchanged since. No persona drift to account for.

---

## 1. TPA DocReviewer — `ops_report`

| # | Field | Value | Confidence | Source | Mandatory |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Entity Company Number | 200105444R | High | ACRA Bizfile p.1 | No |
| 2 | Entity Registered Address | 108 Pasir Panjang Road, #05-07, Golden Agri Plaza, Singapore 118535 | High | ACRA Bizfile p.1 | No |
| 3 | Entity Registered Country | Singapore [SINGP] | High | ACRA Bizfile p.1 | Yes |
| 4 | Entity Third Party Legal Name | ENGIE RCS PTE. LTD. | High | ACRA Bizfile p.1 | Yes |
| 5 | Entity Website | *(blank)* | — | — | No |
| 6–10 | *(Person fields)* | N/A — Entity TPA | — | — | N/A |
| 11 | Third Party Legal Structure | Entity | High | ACRA Bizfile p.1 | Yes |
| 12 | CEO Legal Name | *(blank)* | — | — | **Yes — MISSING** |
| 13 | Nature of relationship / biz justification | Scope stated (7-storey data centre, 82 Genting Lane, for Memphis 2 (DC2) Pte. Ltd.); business justification not stated | Low | Contract Specimen p.1 | **Yes — PARTIAL** |
| 14 | Notable Org specific RF | *(blank)* | — | — | **Yes — judgment field, left blank** |
| 15 | Notable Txn specific RF | *(blank)* | — | — | **Yes — judgment field, left blank** |
| 16 | Payment terms | *(blank)* | — | Contract Specimen (placeholder) | **Yes — MISSING** |
| 17 | TPA Contract sum | *(blank)* | — | Contract Specimen (placeholder) | **Yes — MISSING** |
| 18 | TPA Interaction with Third parties | *(blank)* | — | — | **Yes — Requester to assess** |
| 19 | TPA Keppel Entity | Memphis 2 (DC2) Pte. Ltd. | Medium | Contract Specimen p.1 — "the Employer" | No |
| 20 | TPA Services / Industry | Construction / General Contractors / Builders | High | ACRA Bizfile p.1 — SSIC 43299 | Yes |
| 21 | Other Associated Entities | ENGIE South East Asia Pte. Ltd. (SG, Immediate Parent, 100%); ENGIE Energie Services (FR, Intermediate); ENGIE S.A. (FR, Ultimate) | High | ACRA Bizfile p.4; Audited FS Note 1 | Yes |
| 22 | Shareholders | ENGIE South East Asia Pte. Ltd. — 100% | High | ACRA Bizfile p.4 | No |
| 23 | Third Party Directors | Yoong Tuk Mun Derrick; Janet Olivia Tang Schmidtner Muo Lung (both current) | High | ACRA Bizfile p.3; Register of Directors | Yes |
| 24 | Ultimate Beneficial Owners | Deferred — `COMPLEX`, handed to KYC Agent | — | — | Yes |

**Node 4:** `COMPLEX` — corporate shareholder, no terminating natural person, multi-tier chain across 2 jurisdictions. **Node 5:** 8 mandatory fields outstanding (12–18, 24).

✅ Matches Tests 2–4: Field 13 still correctly partial (not fully blanked — fix #3 holds); no director residential address (dropped correctly); no Auditor/Paid-up Capital/Incorporation Date/Secretary carried in from `DocAnalyst`'s bonus table (scope-discipline note holds).

---

## 2. KYC/Screening Agent — `screening_report`

| Layer | Party | Ownership % (ultimate) | Confidence |
| :-- | :-- | :-- | :-- |
| 0 | ENGIE South East Asia Pte. Ltd. | 100% direct | High |
| 1 | ENGIE Energie Services | 100% of ENGIE SEA | High |
| 2 (apex) | ENGIE S.A. (Euronext-listed) | **99.99%** | High |
| — | French State (via ENGIE S.A.) | ~22.64% equity / ~34.15% voting rights → **≈22.64%** effective | Medium (open-source) |

Directors referenced by name + ID only, pointer to `ops_report` — not restated. 6 parties submitted for screening `[SIMULATED]`, pending.

✅ Matches Tests 1–4: **99.99% stated consistently, no stray "100%"** (fix #1, original round). **French State at 22.64% consistently, no stray "22.62%"** (fix #2, original round). No director bio restatement (fix #5, original round).

---

## 3. Custodian — not invoked ✅ (fix holds — Custodian's Prompt 6 remains a separate, independently-scheduled portfolio sweep, not a Flow B step)

---

## 4. TPA Orchestrator — Final Consolidated Report

### [EXECUTIVE TPA ONBOARDING & COMPLIANCE REVIEW]
Compliance Status: `CONDITIONAL APPROVAL — PENDING RCTP & DOCUMENTATION` | Staged ID: `[SIMULATED]` `TPA-ENGIE-RCS-001`

#### SECTION 1: Company Information Summary
Legal Name: ENGIE RCS PTE. LTD. | Former Name: RCS Engineering Pte Ltd (11 Apr 2019) | Company Number: 200105444R | Country: Singapore | Address: 108 Pasir Panjang Road, #05-07, Golden Agri Plaza, Singapore 118535 | Structure: Entity | Industry: Construction / General Contractors / Builders | Website: *(not found)*

#### SECTION 2: Documents Reviewed
5 documents, each row scoped to facts that also appear in Sections 1/3/4 — ACRA Bizfile (legal name, company number, address, industry, shareholder), Register of Directors (current + historical directors), Audited FS (ownership chain; financials labelled supplementary, not a tracked field), Shareholding Structure (corroboration), Contract Specimen (scope/Field 13, Keppel entity/Field 19).

✅ Matches Test 3/4 fix: no untracked "incorporation date, secretary" claimed as extracted (fix #6).

#### SECTION 3: Organisation Structure
```
ENGIE S.A. [France] ── French State: 22.64% (own row below)
   │ 99.99%
   ▼
ENGIE Energie Services [France]
   │ 100%
   ▼
ENGIE South East Asia Pte. Ltd. [Singapore]
   │ 100%
   ▼
ENGIE RCS PTE. LTD. ◄── BASE ENTITY
```
| Role | Name | Ownership % | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- |
| Direct Shareholder | ENGIE South East Asia Pte. Ltd. | 100% | High | `ops_report` |
| Intermediate Parent | ENGIE Energie Services | 100% of SEA | High | `ops_report` |
| Ultimate Parent | ENGIE S.A. | 99.99% effective | High | `ops_report` |
| Apex minority | French State | ~22.64% of ENGIE S.A. | **Medium** — open-source, not document-sourced | `screening_report` §1 |
| Director (current) | Yoong Tuk Mun Derrick | N/A | High | `ops_report` |
| Director (current) | Janet Olivia Tang Schmidtner Muo Lung | N/A | High | `ops_report` |

✅ Matches Test 3/4 fix: French State has its own cited row, not just a diagram annotation (fix #4).

#### SECTION 4: Field Ledger
All 24 fields reproduced inline (as in Section 1 of this report, above — not deferred to `ops_report`). Field 24 (UBO) reads: "Resolved by KYC/Screening Agent — corporate chain (Layer 0–2) **High**; French State apex minority stake **Medium**" — split confidence, not a blanket rating.

**Count reconciliation:** `ops_report` flagged 8 outstanding; UBO (24) resolved downstream by the KYC Agent — **7** remain open: Fields 12, 13 (partial), 14, 15, 16, 17, 18.

✅ Matches Test 3/4 fixes: full table reproduced, not "see above" (fix #1, second round); Field 24's confidence honestly split (fix #2, second round); count explicitly reconciled (fix #5, second round).

#### SECTION 5: Key Flags (At a Glance)
Exhaustive over all 7 open mandatory fields, one flag each, plus 3 discretionary items:
⚠️ CEO Legal Name missing · ⚠️ Nature of relationship partial · ⚠️ Notable Org RF blank · ⚠️ Notable Txn RF blank · ⚠️ Payment terms missing · ⚠️ TPA Contract sum missing · ⚠️ TPA Interaction unassessed · ⏳ Sanctions screening pending (6 parties) · 🔗 Ownership `COMPLEX`, apex exemption pending · ⚠️ Sovereign voting-rights flag (French State)

✅ Matches Test 4 fix: 10 flags, not 6 — no mandatory field silently folded into a generic bullet (fix #1, second round).

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Priority |
| :-- | :-- | :-- |
| Entity Verification | 🟢 | LOW |
| Sanctions Clearance | 🟡 | MEDIUM |
| Documentation Completeness | 🟠 (7 fields outstanding) | HIGH |
| Ownership Transparency | 🟡 | MEDIUM |
| Jurisdictional Risk | 🟡 | MEDIUM |

**Overall Risk Tier: `HIGH`**

#### SECTION 7: Decision & Conditions
**Decision: `CONDITIONAL APPROVAL`** — C1 (executed contract incl. business justification) · C2 (CEO name) · C3 (RF flags, interaction level) · C4 (RCTP adjudication) · C5 (listed-entity exemption) · C6 (French State voting-rights assessment) · C7 (ENGIE SEA Bizfile + French registry extract).

#### SECTION 8: Escalation Path & Next Review
Confirmed sanctions/PEP match → escalate, reclassify `BLOCKED`. C1 not received by 30 Jul 2026 → administrative hold. Next review: 13 Aug 2026.

---

## Regression checklist — all 12 fixes across Tests 1–4

| # | Fix | Still holds? |
| :-- | :-- | :-- |
| 1 | ENGIE S.A. ownership consistently 99.99%, never "100%" | ✅ |
| 2 | French State consistently 22.64%, never "22.62%" | ✅ |
| 3 | Director residential address dropped (out of CSV scope) | ✅ |
| 4 | Custodian never invoked mid-flow | ✅ |
| 5 | Screener doesn't restate director bios | ✅ |
| 6 | Documents Reviewed section exists, scoped to tracked facts | ✅ |
| 7 | Field Ledger fully reproduced in Orchestrator's own report, not deferred | ✅ |
| 8 | Key Flags exhaustive over mandatory gaps (10, not 6) | ✅ |
| 9 | Field 13 partially populated (scope), not fully blanked | ✅ |
| 10 | Org-structure diagram/table parity (French State has a cited row) | ✅ |
| 11 | Field count reconciled explicitly (8 → 7) | ✅ |
| 12 | Field 24 confidence honestly split (High/Medium), not blanket High | ✅ |

**No regressions found.** Output is substantively identical to `Census Output 4`, as expected given no persona file changed in between — this run's value is in independently re-deriving the result rather than assuming it, and it landed in the same place.
