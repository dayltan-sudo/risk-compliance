# Sentinel Test Run 5 — Fictional Scenarios

Two new scenarios, simulated end-to-end by Claude against the current `.md` instruction files (same version used for `Sentinel Output 4`). Unlike Tests 1–4, `DocAnalyst`'s output is *also* simulated here (not reused), since these are new fictional documents. Two things remain `[SIMULATED]` because I have no real access to them: the Host Client human-confirmation step and the RCTP MCP write-back.

Purpose: exercise pipeline paths the ENGIE RCS test case never touched — a `SIMPLE` ownership classification (no KYC-Agent handoff for extraction), a fully-documented case with almost nothing blank, and a `Person`-type TPA (Fields 6–10, never previously populated).

---

# SCENARIO A — Kestrel Bay Industrial Services Pte. Ltd. (Entity, SIMPLE)

## 1. Doc Analyst (simulated)
5 documents read: ACRA Bizfile, Register of Directors, Company Profile, Executed Technical Advisory Services Agreement, Compliance Screening Note. All internally consistent (e.g. Rajan Selvam Kumaraswamy appears identically as Director in both registry documents and as CEO in the Company Profile — no contradiction across documents).

## 2. TPA DocReviewer — `ops_report`

### Ingestion Metadata (24-Field Contract)
| # | Field | Value | Confidence | Source | Mandatory |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Entity Company Number | T99AB1234C | High | ACRA Bizfile p.1 | No |
| 2 | Entity Registered Address | 8 Tuas Bay Close, #04-12, Kestrel Industrial Hub, Singapore 636988 | High | ACRA Bizfile p.1 | No |
| 3 | Entity Registered Country | Singapore [SINGP] | High | ACRA Bizfile p.1 | Yes |
| 4 | Entity Third Party Legal Name | Kestrel Bay Industrial Services Pte. Ltd. | High | ACRA Bizfile p.1 | Yes |
| 5 | Entity Website | www.kestrelbay-industrial.example | High | Company Profile | No |
| 6–10 | *(Person fields)* | N/A — Entity TPA | — | — | N/A |
| 11 | Third Party Legal Structure | Entity | High | ACRA Bizfile p.1 | Yes |
| 12 | CEO Legal Name | Rajan Selvam Kumaraswamy | High | Company Profile | Yes |
| 13 | Nature of commercial relationship / biz justification | Scope: technical advisory (mechanical/electrical/HSE compliance) for topside modification works, Benoi Yard Project BY-14. Justification: selected for specialised technical advisory capability and established track record with Employer's affiliated projects since 2021. | High | Contract, Recitals | Yes |
| 14 | Notable Org specific RF | "We noted ambiguity in resources, experience capability or staff qualifications to provide the goods or services" — headcount (~12) small relative to scope | High | Compliance Screening Note | Yes |
| 15 | Notable Txn specific RF | "Payment arrangements involving multiple transactions to different bank accounts" — split payment requested across operating account + separate corporate entity's account | High | Compliance Screening Note | Yes |
| 16 | Payment terms | 30 days from valid monthly invoice, supported by interim progress certificates; no advance payment | High | Contract §3 | Yes |
| 17 | TPA Contract sum or annual spend | SGD 480,000 p.a. → picklist: **$200k–$1m** | High | Contract §2 | Yes |
| 18 | TPA Interaction with Third parties | *(blank)* | — | — | **Yes — Requester to assess** |
| 19 | TPA Keppel Entity | Keppel Offshore & Marine Technology Centre Pte. Ltd. | High | Contract, recital | No |
| 20 | TPA Services provided or Industry | Technical Advisory services (Architectural, Mechanical & Electrical, HSE, Quantity Surveyors, etc.) | High | ACRA Bizfile SSIC 71213; Company Profile | Yes |
| 21 | Other Associated Entities | None — sole shareholder is a natural person; no corporate parent chain | High | ACRA Bizfile p.1 | Yes |
| 22 | Shareholders | Ang Wei Ling — 100% (natural person) | High | ACRA Bizfile p.1 | No |
| 23 | Third Party Directors | Ang Wei Ling (current); Rajan Selvam Kumaraswamy (current) | High | ACRA Bizfile p.1; Register of Directors | Yes |
| 24 | Ultimate Beneficial Owners | Ang Wei Ling — 100% (same as direct shareholder; `SIMPLE` case, no intermediate layer — resolved by this agent per Deferral Rule) | High | ACRA Bizfile p.1 | Yes |

### Node 4: Ownership Complexity
**Classification: `SIMPLE`** — single registration document, sole shareholder is a natural person, no corporate shareholder or additional registration extract present. **Handoff: `NOT REQUIRED`** — resolved entirely in-house; `session:extracted_parties` populated directly by this agent. *(First time this pipeline has actually exercised the `SIMPLE` / no-handoff path — every prior test was `COMPLEX`.)*

### Node 5: Gap Analysis
**Only 1 of 24 fields outstanding: Field 18 (TPA Interaction with Third Parties)** — structurally a Requester-assessment field, not extractable from any document. Contrast with the ENGIE RCS case (7–8 fields outstanding) — this document set was complete and internally consistent, and the pipeline reflects that.

---

## 3. KYC/Screening Agent — `screening_report`
`ownership_complexity_flag = SIMPLE` → **Flow A (extraction) does not run.** Flow B (screening) runs against the party list `TPA DocReviewer` already resolved.

**Screening targets (3 — entity + 2 individuals, no separate CEO screen since the CEO is also a screened director):**
| # | Party | Type | RCTP Status |
| :-- | :-- | :-- | :-- |
| 1 | Kestrel Bay Industrial Services Pte. Ltd. | Entity | `[SIMULATED]` Submitted — pending |
| 2 | Ang Wei Ling (Director, Shareholder, UBO — see `ops_report`) | Individual | `[SIMULATED]` Submitted — pending |
| 3 | Rajan Selvam Kumaraswamy (Director, CEO — see `ops_report`) | Individual | `[SIMULATED]` Submitted — pending |

Open-source adverse media: none identified (informational only, per MVP protocol).

---

## 4. Custodian — not invoked (same as all prior tests)

---

## 5. TPA Orchestrator — Final Consolidated Report

### [EXECUTIVE TPA ONBOARDING & COMPLIANCE REVIEW]
| | |
| :-- | :-- |
| Compliance Status | `CONDITIONAL APPROVAL — PENDING RCTP & ONE REQUESTER FIELD` |
| Staged Third Party ID | `[SIMULATED]` `TPA-KESTREL-001` |

#### SECTION 1: Company Information Summary
| Field | Value |
| :-- | :-- |
| Legal Name | Kestrel Bay Industrial Services Pte. Ltd. |
| Company Number | T99AB1234C |
| Registered Country | Singapore |
| Registered Address | 8 Tuas Bay Close, #04-12, Kestrel Industrial Hub, Singapore 636988 |
| Legal Structure | Entity |
| Industry | Technical Advisory services (Architectural, Mechanical & Electrical, HSE, Quantity Surveyors, etc.) |
| Website | www.kestrelbay-industrial.example |

#### SECTION 2: Documents Reviewed
| Document | Type | Key Information Extracted | Confidence |
| :-- | :-- | :-- | :-- |
| ACRA Bizfile | Corporate registry extract | Legal name, company number, address, industry, shareholder, directors | High |
| Register of Directors | Corporate registry extract | Director detail (ID, nationality, appointment) | High |
| Company Profile | Corporate profile document | Website, CEO | High |
| Technical Advisory Services Agreement (executed) | Contract instrument | Scope, justification, payment terms, contract sum, Keppel entity | High |
| Compliance Screening Note | Internal compliance memo | Org RF, Txn RF | High |

#### SECTION 3: Organisation Structure
```
Ang Wei Ling (natural person)
   │  100%
   ▼
Kestrel Bay Industrial Services Pte. Ltd.  ◄── BASE ENTITY
```
| Role | Name | Ownership % | Confidence |
| :-- | :-- | :-- | :-- |
| Sole Shareholder / UBO | Ang Wei Ling | 100% | High |
| Director | Ang Wei Ling | N/A | High |
| Director, CEO | Rajan Selvam Kumaraswamy | N/A | High |

No intermediate or ultimate parent — ownership terminates directly in a natural person. `SIMPLE` classification.

#### SECTION 4: Field Ledger
*(All 24 fields as in `ops_report` above — reproduced there in full; not repeated a second time within this same document for length, per this test file's own economy — a real Orchestrator output would still inline all 24 rows here directly.)*

**Count reconciliation:** not needed this time — no field resolved downstream changed the count; `ops_report`'s tally (1 outstanding) and this report's tally are identical.

#### SECTION 5: Key Flags (At a Glance)
*   ⚠️ TPA Interaction with Third Parties unassessed — Section 4 (the only outstanding mandatory field).
*   ⏳ Sanctions screening pending, 3 parties — Section 6.

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Finding | Priority |
| :-- | :-- | :-- | :-- |
| Entity Verification | 🟢 | Identity confirmed via ACRA Bizfile + Register of Directors | LOW |
| Sanctions Clearance | 🟡 | `[SIMULATED]` submission pending for 3 parties | MEDIUM |
| Documentation Completeness | 🟢 | 1 of 24 fields outstanding, and it's a Requester-only field, not a document gap | LOW |
| Ownership Transparency | 🟢 | `SIMPLE` — terminates directly in a natural person, no intermediate layers | LOW |
| Jurisdictional Risk | 🟢 | Singapore only, no cross-border operations disclosed | LOW |

**Overall Risk Tier: `MEDIUM`** — driven solely by pending sanctions screening; every other domain is `LOW`. Two internally-flagged red flags (Org/Txn) are noted but assessed as monitorable, not blocking, per the Compliance Screening Note's own framing.

#### SECTION 7: Decision & Conditions for Full Approval
**Decision: `CONDITIONAL APPROVAL`**
| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | TPA Interaction with Third Parties assessed and selected | Requester | 5 business days |
| C2 | RCTP results received and all 3 parties adjudicated | Senior Compliance Officer | Within 3 business days of RCTP return |
| C3 | Compliance officer to review the two internally-flagged red flags (capacity ambiguity; split payment arrangement) and confirm no further action required | Compliance Business Partner | 5 business days |

#### SECTION 8: Escalation Path & Next Review
**Escalation Path:** Any confirmed sanctions/PEP match → escalate to Senior Compliance Officer; record reclassified `BLOCKED`.
**Next Review Date:** 12 months post-onboarding (standard cycle) — no outstanding documentation issue to force an earlier date.

> **Contrast with ENGIE RCS:** this case reaches a materially better risk posture (`MEDIUM` vs `HIGH`) purely because the submitted documents were complete and internally consistent — same pipeline, same rules, very different outcome. That's the intended behaviour, not a discrepancy.

---

# SCENARIO B — Dr. Priya Nandakumar Ratnam (Person TPA)

## 1. Doc Analyst (simulated)
2 documents read: Identification & CV Summary, Executed Consultancy Services Agreement.

## 2. TPA DocReviewer — `ops_report`

### Ingestion Metadata (24-Field Contract)
| # | Field | Value | Confidence | Source | Mandatory |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1–5 | *(Entity fields)* | N/A — Person TPA | — | — | N/A |
| 6 | Gender | Female | High | ID/CV Summary | No |
| 7 | Person Business Address | Suite 12-3, Menara Alpha, Jalan Sultan Ismail, 50250 Kuala Lumpur, Malaysia | High | ID/CV Summary | No |
| 8 | Person Country of Residence | Malaysia [MALAY] | High | ID/CV Summary | Yes |
| 9 | Person Third Party Legal Name | Dr. Priya Nandakumar Ratnam | High | ID/CV Summary | Yes |
| 10 | Person Year of Birth | 1978 | High | ID/CV Summary | No |
| 11 | Third Party Legal Structure | Person | High | ID/CV Summary | Yes |
| 12 | CEO Legal Name | N/A — Person TPA | — | — | N/A |
| 13 | Nature of commercial relationship / biz justification | Scope: regulatory licensing advisory and permit facilitation for a proposed Johor facility expansion. Justification: selected for specialised expertise in Malaysian regulatory licensing. | High | Contract, Recitals | Yes |
| 14 | Notable Org specific RF | *(blank)* | — | — | Yes — no document states one; correctly left blank, not inferred |
| 15 | Notable Txn specific RF | *(blank)* | — | — | Yes — no document states one; correctly left blank, not inferred |
| 16 | Payment terms | 3 equal instalments of SGD 32,000 on (i) commencement, (ii) application submission, (iii) permit approval | High | Contract §3 | Yes |
| 17 | TPA Contract sum or annual spend | SGD 96,000 → picklist: **$20k–$200k** | High | Contract §2 | Yes |
| 18 | TPA Interaction with Third parties | *(blank)* | — | — | **Yes — Requester to assess** |
| 19 | TPA Keppel Entity | Keppel Energy Pte. Ltd. | High | Contract, recital | No |
| 20 | TPA Services provided or Industry | Licensing Agent | High | ID/CV Summary; Contract scope | Yes |
| 21 | Other Associated Entities | None disclosed — no other associated entity found in any submitted document | High | ID/CV Summary; Contract | Yes |
| 22 | Shareholders | None disclosed — no underlying corporate vehicle found; engaged directly as an individual | High | ID/CV Summary; Contract | No |
| 23 | Third Party Directors | None disclosed — same as above | High | ID/CV Summary; Contract | Yes |
| 24 | Ultimate Beneficial Owners | None disclosed — no associated entity exists for a beneficial-ownership chain to trace | High | ID/CV Summary; Contract | Yes |

### Node 4: Ownership Complexity
**Classification: `SIMPLE`** (vacuously — no corporate structure exists to be `COMPLEX` about). **Handoff: `NOT REQUIRED`.**

### Node 5: Gap Analysis
Only 1 field genuinely outstanding: TPA Interaction (18, Requester-only). Fields 21–24 are correctly satisfied by "None disclosed" — no other associated entity, shareholder, director, or UBO-chain was found in the submitted documents, which is a valid, complete answer for those fields, not a gap. *(Corrected from this test's first pass, which mislabeled these `N/A — not applicable` — see note below.)*

### Note on Fields 21–24 for Person-type TPAs (resolved, no instruction change needed)
My first pass through this scenario mislabeled Fields 21–24 as "not applicable" for a Person TPA, reasoning that a natural person doesn't have directors/shareholders of themselves. That was overthinking it: these fields apply to a Person TPA exactly the same way they apply to an Entity TPA with no further layers (e.g. Kestrel Bay's own Field 21, which correctly reads "None — sole shareholder is a natural person" rather than being flagged as missing) — populate if the documents show associated entities/shareholdings/directorships **belonging to** the TPA (e.g. a company the individual owns or directs, if relevant to the engagement), and`None disclosed` otherwise. No Person-type carve-out is needed in `TPA DocReviewer.md` — unlike Fields 6–10, which are genuinely and permanently inapplicable based on `Third Party Legal Structure`, Fields 21–24 are just ordinary table fields that happen to be empty in this instance.

---

## 3. KYC/Screening Agent — `screening_report`
`ownership_complexity_flag = SIMPLE`. Single screening target — the Person TPA herself; there's no separate CEO/director/UBO to screen since she *is* the party.
| # | Party | Type | RCTP Status |
| :-- | :-- | :-- | :-- |
| 1 | Dr. Priya Nandakumar Ratnam | Individual | `[SIMULATED]` Submitted — pending |

---

## 4. Custodian — not invoked

---

## 5. TPA Orchestrator — Final Consolidated Report

### [EXECUTIVE TPA ONBOARDING & COMPLIANCE REVIEW]
| | |
| :-- | :-- |
| Compliance Status | `CONDITIONAL APPROVAL — PENDING RCTP & ONE REQUESTER FIELD` |
| Staged Third Party ID | `[SIMULATED]` `TPA-RATNAM-001` |

#### SECTION 1: Company Information Summary
*(Renamed conceptually "Party Information Summary" for a Person TPA — the Section 1 spec as written assumes company fields; another small gap worth noting, see below.)*
| Field | Value |
| :-- | :-- |
| Legal Name | Dr. Priya Nandakumar Ratnam |
| Legal Structure | Person |
| Gender | Female |
| Country of Residence | Malaysia |
| Business Address | Suite 12-3, Menara Alpha, Jalan Sultan Ismail, 50250 Kuala Lumpur, Malaysia |
| Year of Birth | 1978 |
| Industry | Licensing Agent |

#### SECTION 2: Documents Reviewed
| Document | Type | Key Information Extracted | Confidence |
| :-- | :-- | :-- | :-- |
| Identification & CV Summary | Identity document | Name, gender, DOB, nationality, residence, business address | High |
| Consultancy Services Agreement (executed) | Contract instrument | Scope, justification, payment terms, contract sum, Keppel entity | High |

#### SECTION 3: Organisation Structure
No associated entities, shareholders, directors, or UBO chain disclosed in any submitted document — Dr. Priya Nandakumar Ratnam is engaged directly as an individual with no underlying corporate vehicle. (Fields 21–24, `ops_report`.)

#### SECTION 4: Field Ledger
*(All 24 fields as in `ops_report` above.)*

#### SECTION 5: Key Flags (At a Glance)
*   ⚠️ TPA Interaction with Third Parties unassessed — Section 4.
*   ℹ️ Contract scope describes "liaison with relevant Malaysian regulatory authorities," which reads as substantial government interaction — flagged as a suggested value for the Requester's own assessment of Field 18, not a substitute for it.
*   ⏳ Sanctions screening pending, 1 party — Section 6.

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Finding | Priority |
| :-- | :-- | :-- | :-- |
| Entity Verification | 🟢 | Identity confirmed via ID/CV document (single source — no independent registry cross-check available for an individual, unlike a corporate ACRA extract) | LOW |
| Sanctions Clearance | 🟡 | `[SIMULATED]` submission pending for 1 party | MEDIUM |
| Documentation Completeness | 🟢 | 1 of 24 applicable fields outstanding, Requester-only | LOW |
| Ownership Transparency | N/A | Domain doesn't map to a Person TPA — no ownership chain exists to be transparent or opaque about. *(Another small spec gap: Orchestrator's 5 fixed risk domains assume an entity with an ownership structure.)* | — |
| Jurisdictional Risk | 🟡 | Malaysia-resident consultant, regulatory-liaison role with a medium-risk-adjacent government-facing scope | MEDIUM |

**Overall Risk Tier: `MEDIUM`** — driven by pending sanctions screening and the government-facing nature of the engagement scope.

#### SECTION 7: Decision & Conditions for Full Approval
**Decision: `CONDITIONAL APPROVAL`**
| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | TPA Interaction with Third Parties assessed (contract scope suggests Government interaction — Requester to confirm level) | Requester | 5 business days |
| C2 | RCTP result received and adjudicated | Senior Compliance Officer | Within 3 business days of RCTP return |

#### SECTION 8: Escalation Path & Next Review
**Escalation Path:** Confirmed sanctions/PEP match → escalate to Senior Compliance Officer; record reclassified `BLOCKED`.
**Next Review Date:** 12 months post-onboarding.

---

## What this round found that no prior test surfaced

1. **`SIMPLE` / no-handoff path works as designed** (Scenario A) — never exercised before; `TPA DocReviewer` correctly resolved UBO in-house and `KYC/Screening Agent` correctly skipped Flow A.
2. **Judgment fields populate correctly when a document actually states one** (Scenario A, Fields 14/15) — every prior test only exercised the "correctly left blank" path; this confirms the "populate at High/Medium when the source clearly states it" half of the same rule also works.
3. **A genuinely complete, consistent document set drives risk tier down to `MEDIUM`**, not `HIGH` — useful confirmation that the pipeline's `HIGH` conclusions on ENGIE RCS were driven by real documentation gaps, not a bias toward `HIGH`.
4. **Two candidate gaps for Person-type TPAs were raised on first pass — both resolved, neither needed a fix:**
   - Fields 21–24 (`Other Associated Entities`, `Shareholders`, `Third Party Directors`, `Ultimate Beneficial Owners`): confirmed these need **no** Person-type carve-out — they apply to a Person TPA exactly as they would to any TPA with no further layers, populated if disclosed, `None disclosed` if not. Unlike Fields 6–10, they aren't type-locked. (Corrected above.)
   - The Orchestrator's 5 fixed Risk Domains ("Ownership Transparency") and Section 1's Entity-shaped framing: confirmed out of scope — Person-type TPA support isn't being built out further at this time.
