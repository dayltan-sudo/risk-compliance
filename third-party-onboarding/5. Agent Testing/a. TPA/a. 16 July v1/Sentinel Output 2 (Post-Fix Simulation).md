# Sentinel Test Run 2 — Post-Fix Simulation

**Same input as Test 1:** ENGIE RCS PTE. LTD. onboarding, same 5 source documents (`1. 160726/Source Docs/`), same `DocAnalyst` extraction output (unchanged — out of scope for this fix round, reused verbatim as the entry state for the pipeline below rather than restated here; see `1. 160726/Sentinel Output 1.kix` lines 1–414 for the full JSON).

**Simulated by Claude**, role-playing each agent strictly against the *current* `.md` instruction files, dated after the fixes made in this session. Two things are mocked because I have no real access to them: the Host Client human-confirmation click (Step 3) and the RCTP MCP write-back (Step 5) — both are marked `[SIMULATED]` where they occur, with no invented data beyond a placeholder ID.

**Agents invoked, in order:** `DocAnalyst` (reused, not re-run) → `TPA DocReviewer` → `KYC/Screening Agent` → `TPA Orchestrator`. **`Custodian` is not invoked** — that is itself one of the fixes under test.

---

## 1. TPA DocReviewer — `ops_report`

### [OPERATIONAL INGESTION REPORT]
| Parameter | Value |
| :--- | :--- |
| Processing Type | `NEW_ONBOARDING` |
| Data Lineage Source | `DocAnalyst` extracted_entities (5 documents) — consumed directly, not re-parsed |
| Record Status | `DRAFT — PENDING HUMAN CONFIRMATION` |
| Historical Profile Supplied | `N/A` — fresh onboarding |

**Scope note (fix in effect):** `DocAnalyst`'s own bonus "Consolidated Entity Master" table included fields outside the 24-field CSV contract (Auditor, Paid-Up Capital, Incorporation Date, Company Secretary). None of those are carried into the table below — they were not in Test 1 either, so no regression, but now explicitly by rule rather than by accident.

### Ingestion Metadata (24-Field Contract)
| # | Field | Value | Confidence | Source Citation | Mandatory |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Entity Company Number | 200105444R | High | ACRA Bizfile p.1; Register of Directors p.1 | No |
| 2 | Entity Registered Address | 108 Pasir Panjang Road, #05-07, Golden Agri Plaza, Singapore 118535 | High | ACRA Bizfile p.1 | No |
| 3 | Entity Registered Country | Singapore [SINGP] | High | ACRA Bizfile p.1 | Yes |
| 4 | Entity Third Party Legal Name | ENGIE RCS PTE. LTD. | High | ACRA Bizfile p.1 | Yes |
| 5 | Entity Website | *(not found)* | — | — | No |
| 11 | Third Party Legal Structure | Entity | High | ACRA Bizfile p.1 | Yes |
| 12 | CEO Legal Name | **BLANK** | — | — | **Yes — MISSING** (no CEO/MD designation in any document) |
| 13 | Nature of commercial relationship / biz justification | **BLANK** | Low | Contract Specimen (placeholders only) | **Yes — NEEDS CONFIRMATION** |
| 14 | Notable Org specific RF | **BLANK** | Low | — | **Yes — judgment field, left blank per no-fabrication rule** |
| 15 | Notable Txn specific RF | **BLANK** | Low | — | **Yes — judgment field, left blank per no-fabrication rule** |
| 16 | Payment terms | **BLANK** | — | Contract Specimen (placeholder) | **Yes — MISSING** |
| 17 | TPA Contract sum or annual spend | **BLANK** | — | Contract Specimen (placeholder) | **Yes — MISSING** |
| 18 | TPA Interaction with Third parties | **BLANK** | — | — | **Yes — Requester to assess** |
| 19 | TPA Keppel Entity | Memphis 2 (DC2) Pte. Ltd. | Medium | Contract Specimen p.1 — "the Employer" | No |
| 20 | TPA Services provided or Industry | Construction / General Contractors / Builders | High | ACRA Bizfile p.1 — SSIC 43299 | Yes |
| 21 | Other Associated Entities | *(table, Node 3 below)* | High | — | Yes |
| 22 | Shareholders | *(table, Node 3 below)* | High | — | No |
| 23 | Third Party Directors | *(table, Node 3 below)* | High | — | Yes |
| 24 | Ultimate Beneficial Owners | **Deferred to KYC/Screening Agent** — see `ownership_complexity_flag` | — | — | Yes |

*(Fields 6–10 — Gender, Person Business Address, Person Country of Residence, Person Third Party Legal Name, Person Year of Birth — not applicable; base entity is `Entity`, not `Person`.)*

### Node 3: Base Ownership Extraction
**Shareholders**
| Shareholder | Type | Reg. No. | Jurisdiction | Ownership % | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| ENGIE South East Asia Pte. Ltd. | Corporate Entity | 198602334W | Singapore | 100% | High | ACRA Bizfile p.4 |

**Third Party Directors** *(current only — full historical register, including 10 ceased directors, stays in this report's own state, not repeated in downstream output)*
| Name | Nationality | ID Number | Appointed | Status | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Yoong Tuk Mun Derrick | Malaysian | S8481406G | 11 Feb 2019 | Current | High | ACRA Bizfile p.3; Register of Directors p.4 |
| Janet Olivia Tang Schmidtner Muo Lung | Malaysian | S8389947F | 29 Jul 2020 | Current | High | ACRA Bizfile p.3; Register of Directors p.2 |

> **Fix check:** Test 1 also carried a full residential address per director (e.g. "108 Pasir Panjang Road, #05-04..."). That field is not in the 24-field CSV contract (`Third Party Directors` only calls for Full Legal Name + Country), so it's correctly dropped here — it was never sourced from `DocAnalyst`'s own JSON either, which is what originally made it look like an unexplained lineage gap.

**Other Associated Entities**
| Entity | Relationship | Jurisdiction | Ownership in Chain | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- | :-- |
| ENGIE South East Asia Pte. Ltd. | Immediate Parent | Singapore | 100% direct | High | ACRA Bizfile p.4 |
| ENGIE Energie Services | Intermediate Parent | France | 100% of ENGIE SEA | High | Audited FS Note 1 |
| ENGIE S.A. | Ultimate Parent (Euronext-listed) | France | 99.99% of Energie Services | High | Audited FS Note 1 |

### Node 4: Ownership Complexity
**Classification: `COMPLEX`** — corporate shareholder (ENGIE SEA) with no terminating natural person disclosed at this layer; 3 additional upstream entities across 2 jurisdictions.
**Handoff:** Documents evidencing Layer 1+ handed to `KYC/Screening Agent`. `Ultimate Beneficial Owners` (Field 24) left blank, deferred entirely — not populated here.

### Node 5: Gap Analysis
8 mandatory fields outstanding (Fields 12–18, 24 — see table above). Document-level gap: submitted Contract Agreement/LOA is an unpopulated specimen; ACRA Bizfile for ENGIE SEA and French registry extract for ENGIE Energie Services not supplied.

---

## 2. KYC/Screening Agent — `screening_report`

> **Scope note (fix in effect):** this report does not restate ENGIE RCS's registered address, industry, or website — that's `ops_report` territory. It does not restate the two directors' nationality/ID/appointment date beyond a name+ID label — `ops_report`, Node 3, has that. It adds only: Layer 1+ ownership (new to this agent), and screening submission/resolution status (new to this agent).

### [KYC RESOLUTION & SCREENING ATTESTATION]
Target Scope: ENGIE RCS Pte. Ltd. (UEN 200105444R) — full ownership chain + current directors, per `ops_report`.

### 1. Layered UBO Table
| Layer | Party | Type | Ownership % (ultimate, to ENGIE RCS) | Priority | Detail |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 0 | ENGIE South East Asia Pte. Ltd. | Entity | 100% direct | 🔴 HIGH | See `ops_report` — Shareholders table, for registration detail. *New here:* incorporated 22 Oct 1986, Live Company (web search, 16 Jul 2026). |
| 1 | ENGIE Energie Services | Entity | 100% of ENGIE SEA | 🔴 HIGH | Newly resolved — no French registry number available in submitted documents (name + jurisdiction only). |
| 2 (apex) | ENGIE S.A. | Entity, Euronext-listed (ENGI / FR0010208488) | **99.99%** | 🟡 MEDIUM | Newly resolved. Listed-entity exemption consideration — pending compliance officer adjudication, not resolved here. |
| — | French State (via ENGIE S.A.) | Sovereign, minority | ~22.64% equity / ~34.15% voting rights in ENGIE S.A. → **≈22.64%** effective of the ENGIE RCS chain | 🟡 MEDIUM | Structural observation (web search), not an individual PEP. |
| Director — Base Entity | Yoong Tuk Mun Derrick | Individual | N/A — no equity | 🔴 HIGH | See `ops_report` — Third Party Directors, for nationality/ID/appointment. |
| Director — Base Entity | Janet Olivia Tang Schmidtner Muo Lung | Individual | N/A — no equity | 🔴 HIGH | See `ops_report` — Third Party Directors, for nationality/ID/appointment. |

> **Fix check — ownership percentage consistency:** every mention of ENGIE S.A.'s effective ownership below reads **99.99%**, not "100%" anywhere. Test 1 had one row correctly stating 99.99% and another stating "100% ultimate of ENGIE RCS" for the same relationship — that contradiction is gone. French State's effective figure is stated once, correctly rounded to **22.64%** (22.64% × 99.99% ≈ 22.6377%) — Test 1 had a stray "22.62%" that didn't match its own math.

### 2. Screening Targets Submitted (6 parties — per MVP protocol: submission-only, no verdicts)
| # | Party | Type | RCTP Status | Note |
| :-- | :-- | :-- | :-- | :-- |
| 1 | ENGIE RCS PTE. LTD. (+ former name RCS Engineering Pte Ltd) | Entity | `[SIMULATED]` Submitted — pending | Former-name variant included per screening coverage rule |
| 2 | Yoong Tuk Mun Derrick | Individual | `[SIMULATED]` Submitted — pending | — |
| 3 | Janet Olivia Tang Schmidtner Muo Lung | Individual | `[SIMULATED]` Submitted — pending | Multi-barrelled surname — all name variants included |
| 4 | ENGIE South East Asia Pte. Ltd. | Entity | `[SIMULATED]` Submitted — pending | See §1, Layer 0 |
| 5 | ENGIE Energie Services | Entity | `[SIMULATED]` Submitted — pending | See §1, Layer 1 |
| 6 | ENGIE S.A. | Entity | `[SIMULATED]` Submitted — pending | See §1, Layer 2 |

Open-source adverse media (informational, 16 Jul 2026 search): none identified for any of the 6 parties.

### 3. Strategic Escalation Alerts
1. ⚠️ Sovereign voting-rights position (French State, ~34.15% of ENGIE S.A.) — compliance officer adjudication required; not a PEP hit.
2. ⚠️ Multi-name-variant risk — Janet Olivia Tang Schmidtner Muo Lung; confirm all variants reached RCTP.
3. ℹ️ Former entity name (RCS Engineering Pte Ltd, pre-Apr 2019) — historical adverse-media coverage should span both names.
4. ℹ️ Indonesian representative office (Jakarta, active since 2019) — medium-risk jurisdiction, no adverse findings.
5. ℹ️ No French registry extract for ENGIE Energie Services — RCTP query by name+jurisdiction only.
6. ℹ️ Listed-entity UBO exemption for ENGIE S.A. — evidence assembled, adjudication pending.

---

## 3. Custodian — **not invoked**

Per the fixed `TPA Orchestrator.md` Flow B, Step 7: this synthesis is now the Orchestrator's own job. `Custodian`'s Prompt 6 (portfolio-wide due-for-renewal sweep) is independently scheduled and does not run mid-onboarding. *(In Test 1, this step was where most of the wholesale duplication originated.)*

---

## 4. TPA Orchestrator — Final Consolidated Report

*Steps 3 (Host Client Confirmation Gate) and 5 (RCTP Write-Back) are `[SIMULATED]` — no real human-in-the-loop or MCP call available in this dry run. Assumed: human confirms the draft as-is, no amendments; `tpa_onboard_from_documents` returns a placeholder `third_party_id`.*

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

Identity Resolution: `NO_MATCH` — fresh onboarding, no existing `app:portfolio_registry` record. Ownership Complexity: `COMPLEX` (full detail — Section 3).

#### SECTION 2: Documents Reviewed
| Document | Type | Key Information Extracted | Confidence |
| :-- | :-- | :-- | :-- |
| ACRA Bizfile — 30 Mar 2026 | Corporate registry extract | Legal name, UEN, incorporation date, registered address, SSIC, shareholder, secretary | High |
| Register of Directors — 30 Mar 2026 | Corporate registry extract | Current + historical directors | High |
| Audited Financial Statements FY2024 | Financial statement | Ownership chain to ultimate parent; revenue/profit/assets | High |
| Shareholding Structure | Internal org chart | Ownership chain corroboration | Medium (secondary source) |
| Contract Agreement / LOA | Contract instrument (specimen) | Scope of engagement; contracting Keppel entity | Low — unpopulated placeholders |

*(This is the section that did not exist at all in Test 1 — the reviewer previously had no single place to see what was submitted and what each document actually contributed.)*

#### SECTION 3: Organisation Structure
```
ENGIE S.A. [France — Euronext Paris: ENGI]  ── 22.64% held by the French State
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
| Role | Name | Ownership % | Confidence |
| :-- | :-- | :-- | :-- |
| Direct Shareholder | ENGIE South East Asia Pte. Ltd. | 100% | High |
| Intermediate Parent | ENGIE Energie Services | 100% of ENGIE SEA | High |
| Ultimate Parent | ENGIE S.A. (Euronext-listed) | 99.99% effective | High |
| Director (current) | Yoong Tuk Mun Derrick | N/A | High |
| Director (current) | Janet Olivia Tang Schmidtner Muo Lung | N/A | High |

*Full historical (ceased) directors: `ops_report`, Node 3.*

#### SECTION 4: Field Ledger
*(All 24 CSV fields — see full table in `ops_report` above, reproduced here as the record of note; not re-derived, pulled directly from `session:confirmed_tpa_payload`.)*

8 of 24 fields blank and mandatory: CEO Legal Name, Nature of Commercial Relationship, Notable Org RF, Notable Txn RF, Payment Terms, Contract Sum, TPA Interaction with Third Parties, Ultimate Beneficial Owners (deferred — resolved by KYC Agent instead, see Section 3 above, not literally blank).

#### SECTION 5: Key Flags (At a Glance)
- ⚠️ 7 mandatory fields blank — CEO name, business justification, both RF assessments, payment terms, contract sum, third-party interaction level (Section 4).
- ⏳ Sanctions screening `[SIMULATED]` submitted for 6 parties, results pending (Section 2 of `screening_report`).
- 🔗 Ownership `COMPLEX` — apex listed-entity exemption for ENGIE S.A. pending compliance officer adjudication (`screening_report` §3).
- ⚠️ Sovereign voting-rights structural flag — French State ~34.15% voting rights in ENGIE S.A. (`screening_report` §3).
- 📄 Submitted contract is an unexecuted specimen — Contractor identity, amount, dates all unpopulated.

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Finding | Priority |
| :-- | :-- | :-- | :-- |
| Entity Verification | 🟢 | Identity confirmed via dual ACRA source, `ops_report` §1 | LOW |
| Sanctions Clearance | 🟡 | `[SIMULATED]` submission pending for all 6 parties, `screening_report` §2 | MEDIUM |
| Documentation Completeness | 🟠 | 7 mandatory fields outstanding, specimen contract only, Section 4 | HIGH |
| Ownership Transparency | 🟡 | Chain resolved 4 tiers; apex exemption pending adjudication, `screening_report` §1 | MEDIUM |
| Jurisdictional Risk | 🟡 | Indonesian representative office (medium-risk jurisdiction), `screening_report` §3 | MEDIUM |

**Overall Risk Tier: `HIGH`** — driven by Documentation Completeness (unexecuted contract blocking 6 of the 7 open mandatory fields) and unresolved Sanctions Clearance; no confirmed adverse findings at this time.

#### SECTION 7: Decision & Conditions for Full Approval
**Decision: `CONDITIONAL APPROVAL`**

| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | Executed Contract/LOA naming ENGIE RCS as Contractor, fully populated | Requester | 30 Jul 2026 |
| C2 | CEO / senior officer legal name provided | Requester | 23 Jul 2026 |
| C3 | Risk Assessment fields completed (justification, RF flags, interaction level) | Requester / Compliance Business Partner | 30 Jul 2026 |
| C4 | RCTP results received and all 6 parties adjudicated | Senior Compliance Officer | Within 3 business days of RCTP return |
| C5 | Listed-entity UBO exemption for ENGIE S.A. formally adjudicated | Senior Compliance Officer | 23 Jul 2026 |
| C6 | French State voting-rights position assessed | Senior Compliance Officer | 23 Jul 2026 |
| C7 | ACRA Bizfile for ENGIE SEA + French registry extract for Energie Services obtained | TPA Onboarding Team | 30 Jul 2026 |

#### SECTION 8: Escalation Path & Next Review
**Escalation Path:** Any confirmed sanctions/PEP match on the 6 submitted parties → immediate escalation to Senior Compliance Officer and Group Legal; record reclassified `BLOCKED`; no RCTP activation until cleared. If C1 is not received by 30 Jul 2026 → file placed on administrative hold.
**Next Review Date:** 13 Aug 2026, or earlier if C1–C7 resolve sooner.

---

## What changed vs. Test 1 — checklist

| Issue found in Test 1 | Status here |
| :-- | :-- |
| DocAnalyst said "three" then "five" documents | N/A — DocAnalyst not re-run; out of scope |
| Director residential address with no traceable source in the 24-field contract | Dropped — not in CSV scope |
| ENGIE S.A. ownership stated as both "99.99%" and "100%" in the same report | Fixed — 99.99% everywhere |
| French State effective ownership stated as "22.62%" (didn't match its own math) | Fixed — 22.64% everywhere |
| Screener restated directors' full bios 6× within its own output | Fixed — name+ID label, pointer to `ops_report` |
| Custodian re-printed nearly all of `ops_report`/`screening_report` verbatim | Fixed — Custodian not invoked; Orchestrator synthesizes with citations |
| No single place listing which documents were reviewed / what was extracted | Fixed — Orchestrator Section 2 |
| No full field-by-field ledger with confidence + source + mandatory flag in the final report | Fixed — Orchestrator Section 4 |
| No at-a-glance flag list for a time-pressed reviewer | Fixed — Orchestrator Section 5 |
