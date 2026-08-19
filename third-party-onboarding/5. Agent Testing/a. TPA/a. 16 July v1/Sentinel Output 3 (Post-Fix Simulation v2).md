# Sentinel Test Run 3 — Post-Fix Simulation v2

Same input as Tests 1 and 2: ENGIE RCS PTE. LTD. onboarding, same 5 source documents, same `DocAnalyst` extraction output (unchanged, reused verbatim — see `Sentinel Output 1.kix` lines 1–414). Simulated by Claude, role-playing each agent against the `.md` instruction files **as they stand after the 6 fixes applied following Test 2's review**. `Custodian` is not invoked — same as Test 2. Steps 3 (Host Client Confirmation Gate) and 5 (RCTP Write-Back) remain `[SIMULATED]`.

Only `TPA DocReviewer` and `TPA Orchestrator` outputs changed from Test 2 (the 6 fixes landed in those two files); the `KYC/Screening Agent` section is unchanged from Test 2 and not reproduced here — see `Sentinel Output 2 (Post-Fix Simulation).md`, Section 2, for `screening_report` in full.

---

## 1. TPA DocReviewer — `ops_report`

Unchanged from Test 2 **except** Field 13, per the new partially-stated-factual-field rule:

| # | Field | Value | Confidence | Source Citation | Mandatory |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 13 | Nature of commercial relationship / biz justification | **Design, execution and completion of Main Contract Works: proposed 7-storey single-user data centre with underground fuel storage tanks, 82 Genting Lane, Singapore — Project Geras 2 Building 3 (Employer: Memphis 2 (DC2) Pte. Ltd.).** Business justification for selecting ENGIE RCS specifically: not stated in any document. | Low | Contract Specimen p.1 | Yes — **NEEDS CONFIRMATION** (scope is stated; business justification is not) |

> **Fix check (#3):** Test 2 marked this field fully `BLANK`, even though the specimen contract states the scope of work in full prose — only the amount, dates, and signatories are template placeholders. Per the Factual-field rule, the stated portion is now populated at `Low` confidence rather than the whole field being withheld. It's still flagged `NEEDS CONFIRMATION` and still counts as an outstanding mandatory item — the business-justification component genuinely isn't stated anywhere — so this fix changes *what's shown*, not the gap count.

All other 23 fields, Node 3 tables, Node 4 complexity classification (`COMPLEX`), and Node 5 gap analysis are identical to Test 2 — see `Sentinel Output 2`, Section 1.

---

## 2. KYC/Screening Agent — `screening_report`

Unchanged from Test 2. See `Sentinel Output 2 (Post-Fix Simulation).md`, Section 2, for the full Layered UBO Table, screening targets, and escalation alerts (99.99% / 22.64% consistency fixes from Test 1 still hold — nothing in this round touched `Screener.md`).

---

## 3. Custodian — not invoked

Same as Test 2 — see `Sentinel Output 2`, Section 3.

---

## 4. TPA Orchestrator — Final Consolidated Report

### [EXECUTIVE TPA ONBOARDING & COMPLIANCE REVIEW]
| | |
| :-- | :-- |
| Orchestration Ref | `ORCH-TPA-ENGIE-RCS-SIM01` |
| Review Generated | 16 July 2026 |
| Workflow Phase | `AUDIT_READY` |
| Compliance Status | `CONDITIONAL APPROVAL — PENDING RCTP & DOCUMENTATION` |
| Staged Third Party ID | `[SIMULATED]` `TPA-ENGIE-RCS-001` |

---

#### SECTION 1: Company Information Summary
*(Unchanged from Test 2.)*

| Field | Value |
| :-- | :-- |
| Legal Name | ENGIE RCS PTE. LTD. |
| Former Name | RCS Engineering Pte Ltd (changed 11 Apr 2019) |
| Company Number | 200105444R |
| Registered Country | Singapore |
| Registered Address | 108 Pasir Panjang Road, #05-07, Golden Agri Plaza, Singapore 118535 |
| Legal Structure | Entity |
| Industry | Construction / General Contractors / Builders |
| Website | *(not found)* |

#### SECTION 2: Documents Reviewed
| Document | Type | Key Information Extracted | Confidence |
| :-- | :-- | :-- | :-- |
| ACRA Bizfile — 30 Mar 2026 | Corporate registry extract | Legal name, company number, registered address, industry (SSIC), direct shareholder | High |
| Register of Directors — 30 Mar 2026 | Corporate registry extract | Current + historical directors | High |
| Audited Financial Statements FY2024 | Financial statement | Ownership chain to ultimate parent *(financial figures noted as supplementary context below, not a tracked field — see note)* | High |
| Shareholding Structure | Internal org chart | Ownership chain corroboration | Medium (secondary source) |
| Contract Agreement / LOA | Contract instrument (specimen) | Scope of engagement (Field 13), contracting Keppel entity (Field 19) | Low — unpopulated placeholders |

*Supplementary context (not a tracked field): FY2024 revenue SGD 103.8M (FY2023: SGD 170.8M), net profit SGD 7.6M — Audited FS, informational only, not part of the 24-field ledger.*

> **Fix check (#6):** Test 2 listed "incorporation date, secretary" as extracted from the ACRA Bizfile and "financial position" as extracted from the Audited FS — neither appears anywhere else in the report. Both are now either removed (incorporation date, secretary — genuinely untracked, out of CSV scope) or explicitly labelled supplementary rather than presented as a tracked extraction (financial figures).

#### SECTION 3: Organisation Structure
```
ENGIE S.A. [France — Euronext Paris: ENGI]  ── French State: 22.64% (see table)
   │  99.99%
   ▼
ENGIE Energie Services [France]
   │  100%
   ▼
ENGIE South East Asia Pte. Ltd. [Singapore — UEN 198602334W]
   │  100%
   ▼
ENGIE RCS PTE. LTD. [Singapore — UEN 200105444R]  ◄── BASE ENTITY
```
| Role | Name | Ownership % | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- |
| Direct Shareholder | ENGIE South East Asia Pte. Ltd. | 100% | High | `ops_report` — ACRA Bizfile p.4 |
| Intermediate Parent | ENGIE Energie Services | 100% of ENGIE SEA | High | `ops_report` — Audited FS Note 1 |
| Ultimate Parent | ENGIE S.A. (Euronext-listed) | 99.99% effective | High | `ops_report` — Audited FS Note 1 |
| Apex minority shareholder | French State (République Française) | ~22.64% of ENGIE S.A. (≈22.64% effective of the chain) | Medium — open-source research, not a submitted document | `screening_report` §1 |
| Director (current) | Yoong Tuk Mun Derrick | N/A | High | `ops_report`, Node 3 |
| Director (current) | Janet Olivia Tang Schmidtner Muo Lung | N/A | High | `ops_report`, Node 3 |

*Full historical (ceased) directors: `ops_report`, Node 3.*

> **Fix check (#4):** French State now has its own table row with an honest `Medium` confidence (it's web-research-derived, not document-sourced) and a citation, instead of appearing only as an uncited diagram annotation as in Test 2.

#### SECTION 4: Field Ledger (In-Scope Extraction Properties)
Full 24-field ledger, reproduced in this report — not deferred to `ops_report`.

| # | Field | Value | Confidence | Source Citation | Mandatory? |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Entity Company Number | 200105444R | High | ACRA Bizfile p.1 | No |
| 2 | Entity Registered Address | 108 Pasir Panjang Road, #05-07, Golden Agri Plaza, Singapore 118535 | High | ACRA Bizfile p.1 | No |
| 3 | Entity Registered Country | Singapore [SINGP] | High | ACRA Bizfile p.1 | Yes |
| 4 | Entity Third Party Legal Name | ENGIE RCS PTE. LTD. | High | ACRA Bizfile p.1 | Yes |
| 5 | Entity Website | *(blank)* | — | — | No |
| 6 | Gender | N/A — Entity TPA | — | — | N/A |
| 7 | Person Business Address | N/A — Entity TPA | — | — | N/A |
| 8 | Person Country of Residence | N/A — Entity TPA | — | — | N/A |
| 9 | Person Third Party Legal Name | N/A — Entity TPA | — | — | N/A |
| 10 | Person Year of Birth | N/A — Entity TPA | — | — | N/A |
| 11 | Third Party Legal Structure | Entity | High | ACRA Bizfile p.1 | Yes |
| 12 | CEO Legal Name | *(blank)* | — | — | **Yes — ⚠️ MISSING** |
| 13 | Nature of commercial relationship / biz justification | Scope stated (7-storey data centre, 82 Genting Lane, for Memphis 2 (DC2) Pte. Ltd.); business justification not stated | Low | Contract Specimen p.1 | **Yes — ⚠️ PARTIAL, NEEDS CONFIRMATION** |
| 14 | Notable Org specific RF | *(blank)* | — | — | **Yes — ⚠️ judgment field, left blank** |
| 15 | Notable Txn specific RF | *(blank)* | — | — | **Yes — ⚠️ judgment field, left blank** |
| 16 | Payment terms | *(blank)* | — | Contract Specimen (placeholder) | **Yes — ⚠️ MISSING** |
| 17 | TPA Contract sum or annual spend | *(blank)* | — | Contract Specimen (placeholder) | **Yes — ⚠️ MISSING** |
| 18 | TPA Interaction with Third parties | *(blank)* | — | — | **Yes — ⚠️ Requester to assess** |
| 19 | TPA Keppel Entity | Memphis 2 (DC2) Pte. Ltd. | Medium | Contract Specimen p.1 — "the Employer" | No |
| 20 | TPA Services provided or Industry | Construction / General Contractors / Builders | High | ACRA Bizfile p.1 — SSIC 43299 | Yes |
| 21 | Other Associated Entities | ENGIE South East Asia Pte. Ltd. (SG, Immediate Parent, 100%); ENGIE Energie Services (FR, Intermediate Parent); ENGIE S.A. (FR, Ultimate Parent) | High | ACRA Bizfile p.4; Audited FS Note 1 | Yes |
| 22 | Shareholders | ENGIE South East Asia Pte. Ltd. — 100% | High | ACRA Bizfile p.4 | No |
| 23 | Third Party Directors | Yoong Tuk Mun Derrick; Janet Olivia Tang Schmidtner Muo Lung (both current) | High | ACRA Bizfile p.3; Register of Directors | Yes |
| 24 | Ultimate Beneficial Owners | Resolved by KYC/Screening Agent — see Section 3, layered chain (Layer 0–2 + French State apex minority) | High | `screening_report` §1 | Yes — **resolved, not blank** |

**Count reconciliation:** `ops_report` Node 5 flagged **8** mandatory fields outstanding (Fields 12–18 + 24). Field 24 (UBO) has since been resolved by the KYC/Screening Agent — see Section 3 — so **7** genuinely remain open in this report: Fields 12, 13 (partial), 14, 15, 16, 17, 18.

> **Fix check (#1 and #5):** the full 24-row table is reproduced inline — no "see `ops_report`" deferral this time. The 8-vs-7 count discrepancy between `ops_report` and this report is now stated and explained, not left for the reader to notice on their own.

#### SECTION 5: Key Flags (At a Glance)
- ⚠️ CEO Legal Name missing — Section 4.
- ⚠️ Nature of relationship partial (justification missing) — Section 4.
- ⏳ Sanctions screening pending, 6 parties — Section 6.
- 🔗 Ownership `COMPLEX`, apex exemption pending — Section 6.
- ⚠️ Sovereign voting-rights flag, French State — Section 3.
- 📄 Contract specimen unexecuted — Section 4.

> **Fix check (#2):** each flag is now a short fragment + pointer (≤10 words before the dash), not a restated sentence. Compare to Test 2's "Ownership `COMPLEX` — apex listed-entity exemption for ENGIE S.A. pending compliance officer adjudication (`screening_report` §3)," which duplicated Section 6's own sentence almost word for word.

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Finding | Priority |
| :-- | :-- | :-- | :-- |
| Entity Verification | 🟢 | Identity confirmed via dual ACRA source, `ops_report` §1 | LOW |
| Sanctions Clearance | 🟡 | `[SIMULATED]` submission pending for all 6 parties, `screening_report` §2 | MEDIUM |
| Documentation Completeness | 🟠 | 7 mandatory fields outstanding (Section 4), specimen contract only | HIGH |
| Ownership Transparency | 🟡 | Chain resolved 4 tiers + apex minority; apex exemption pending adjudication, `screening_report` §1 | MEDIUM |
| Jurisdictional Risk | 🟡 | Indonesian representative office (medium-risk jurisdiction), `screening_report` §3 | MEDIUM |

**Overall Risk Tier: `HIGH`** — driven by Documentation Completeness and unresolved Sanctions Clearance; no confirmed adverse findings at this time.

#### SECTION 7: Decision & Conditions for Full Approval
**Decision: `CONDITIONAL APPROVAL`**

| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | Executed Contract/LOA naming ENGIE RCS as Contractor, fully populated (incl. business justification) | Requester | 30 Jul 2026 |
| C2 | CEO / senior officer legal name provided | Requester | 23 Jul 2026 |
| C3 | Risk Assessment fields completed (RF flags, interaction level) | Requester / Compliance Business Partner | 30 Jul 2026 |
| C4 | RCTP results received and all 6 parties adjudicated | Senior Compliance Officer | Within 3 business days of RCTP return |
| C5 | Listed-entity UBO exemption for ENGIE S.A. formally adjudicated | Senior Compliance Officer | 23 Jul 2026 |
| C6 | French State voting-rights position assessed | Senior Compliance Officer | 23 Jul 2026 |
| C7 | ACRA Bizfile for ENGIE SEA + French registry extract for Energie Services obtained | TPA Onboarding Team | 30 Jul 2026 |

#### SECTION 8: Escalation Path & Next Review
**Escalation Path:** Any confirmed sanctions/PEP match on the 6 submitted parties → immediate escalation to Senior Compliance Officer and Group Legal; record reclassified `BLOCKED`; no RCTP activation until cleared. If C1 is not received by 30 Jul 2026 → file placed on administrative hold.
**Next Review Date:** 13 Aug 2026, or earlier if C1–C7 resolve sooner.

---

## Fix verification — Round 2

| # | Issue (found reviewing Test 2) | Verified fixed here? |
| :-- | :-- | :-- |
| 1 | Field Ledger deferred to "see `ops_report` above" instead of reproducing all 24 fields | ✅ Section 4 — full 24-row table, no deferral |
| 2 | Key Flags restated Section 6 findings as full sentences | ✅ Section 5 — fragments only, ≤10 words before the pointer |
| 3 | Factual field (13) fully blanked despite partial source content | ✅ `ops_report` — scope populated at Low confidence, justification still flagged missing |
| 4 | French State in diagram with no table row / citation | ✅ Section 3 — has its own row, `Medium` confidence, cited |
| 5 | 8-vs-7 mandatory field count unreconciled between reports | ✅ Section 4 — explicit reconciliation line |
| 6 | Documents Reviewed listed untracked facts (incorporation date, secretary, financials) as "extracted" | ✅ Section 2 — trimmed to tracked facts; financials relabelled supplementary |

No new regressions found against Test 2's other content (Screener output, ownership % consistency, Custodian non-invocation) — those weren't touched by this round of fixes and were spot-checked for drift; none found.
