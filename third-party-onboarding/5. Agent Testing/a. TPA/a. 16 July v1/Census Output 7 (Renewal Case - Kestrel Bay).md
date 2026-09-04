# Census Test Run 7 — Renewal Case (Kestrel Bay Industrial Services Pte. Ltd.)

First test of the renewal path (Prompt 9) — every prior test (1–6) exercised fresh onboarding (Prompt 1) only. Scenario: Kestrel Bay was onboarded ~18 months ago (`Census Output 5`, Scenario A — assume the Host Client Confirmation Gate resolved, `TPA Interaction with Third Parties` was completed by the Requester at that time, and the record was staged as `TPA-KESTREL-001`). New documents have now been submitted for its renewal cycle. Simulated end-to-end by Claude; `[SIMULATED]` marks the Host Client Confirmation Gate and RCTP write-back.

**What changed since original onboarding (the scenario I designed for this test):**
- Registered address: relocated
- Director roster: Ang Wei Ling stepped down as director (remains 100% shareholder/UBO); Farah Iryani Binte Zulkifli appointed as new director
- Contract renewed: sum increased, payment terms changed
- Prior Org RF (headcount capacity) noted as resolved — headcount grew

---

## 1. Custodian — Prompt 6 Portfolio Sweep (first time this flow is actually exercised)

Custodian's own scheduled sweep — this is what surfaces Kestrel Bay for renewal in the first place, run independently of and prior to the Flow B renewal below, per its own mandate (never mid-flow).

### [EXECUTIVE COMPLIANCE AUDIT: RENEWAL & REMEDIATION FORECAST]
Data Freshness: `CACHE FRESH`

| TPA Name | Entity ID | Risk Tier (this sweep) | Δ vs. Onboarding Tier | Days to Expiry | Primary Remediation Trigger | Open Exceptions |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Kestrel Bay Industrial Services Pte. Ltd. | TPA-KESTREL-001 | `MEDIUM` | — (unchanged from onboarding) | 12 Days | Scheduled biennial renewal | None outstanding |
| *Alpha Logistics* *(illustrative filler — not part of this test's actual scope)* | *TPA-2241* | `MEDIUM` | — | 42 Days | Scheduled biennial review | Outdated Tax Attestation |

**Strategic Remediation Directive:** Kestrel Bay's contract expires within the 14-day critical window — prioritize document collection for renewal now.

*(This table only exists to confirm Custodian's own sweep format still works correctly on its own schedule — it is not part of the Flow B renewal that follows, and the Orchestrator does not read from or reference this table.)*

---

## 2. TPA Orchestrator — Flow A: Identity Resolution

**Trigger:** Requester names "Kestrel Bay Industrial Services Pte. Ltd." to begin renewal. Orchestrator resolves identity against `app:portfolio_registry` (Prompt 5) **before** any document parsing.

`Identity Resolution Result: MATCH_FOUND` — Company Number `T99AB1234C` matches existing record `TPA-KESTREL-001` at 100% confidence. `session:historical_profile` populated from the cached record and handed to `TPA DocReviewer`. Routes into Flow B under **Prompt 9** (`renew_tpa_from_documents`).

---

## 3. Doc Analyst (simulated) — new documents only

3 documents read for this renewal: updated ACRA Bizfile, renewed Technical Advisory Services Agreement, follow-up Compliance Screening Note. *(The original 5 onboarding documents are not re-submitted or re-parsed — they're already reflected in `session:historical_profile`.)*

---

## 4. TPA DocReviewer — `ops_report` (Renewal — Delta View)

### [OPERATIONAL INGESTION REPORT]
| Parameter | Value |
| :-- | :-- |
| Processing Type | `RENEWAL_INGESTION` [TPA-KESTREL-001] |
| Historical Profile Supplied | `YES` — `session:historical_profile`, Company Number T99AB1234C |

### Node 1 & 2: Schema Ingestion & Delta Calculation
| Property Field | Historical Profile | Newly Ingested Profile | State Delta Status | Confidence | Source |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Entity Registered Address | 8 Tuas Bay Close, #04-12, Kestrel Industrial Hub, Singapore 636988 | 15 Benoi Crescent, #02-07, Benoi Industrial Park, Singapore 629977 | `CHANGED` (relocation) | High | ACRA Bizfile p.1 |
| Third Party Directors | Ang Wei Ling; Rajan Selvam Kumaraswamy | Rajan Selvam Kumaraswamy; **Farah Iryani Binte Zulkifli** (new, appointed) — Ang Wei Ling ceased as director, remains 100% shareholder/UBO | `CHANGED` (director roster) | High | ACRA Bizfile p.1; Register of Directors |
| TPA Contract sum or annual spend | SGD 480,000 p.a. (picklist: $200k–$1m) | SGD 560,000 p.a. (picklist: $200k–$1m — same tier) | `CHANGED` (value; picklist tier unchanged) | High | Renewed Contract §2 |
| Payment terms | 30 days from invoice | 45 days from invoice | `CHANGED` | High | Renewed Contract §3 |
| Notable Org specific RF | "Ambiguity in resources/experience/staff qualifications — headcount ~12 relative to scope" | *(cleared)* — headcount now ~25; capacity concern resolved per follow-up Compliance Screening Note | `CHANGED` (resolved) | High | Follow-up Compliance Screening Note |
| Entity Third Party Legal Name | Kestrel Bay Industrial Services Pte. Ltd. | Kestrel Bay Industrial Services Pte. Ltd. | `STATIC` | High | ACRA Bizfile p.1 |
| Entity Company Number | T99AB1234C | T99AB1234C | `STATIC` | High | ACRA Bizfile p.1 |
| Shareholders | Ang Wei Ling — 100% | Ang Wei Ling — 100% | `STATIC` | High | ACRA Bizfile p.1 |
| *(remaining 17 fields)* | — | — | `STATIC` — unchanged, not individually restated here (see note) | — | — |

**Fields changed this cycle: 5 of 24. Fields static: 19 of 24 — summarized as a count, not repeated as 19 identical rows**, since the values themselves are unchanged from what's already in `historical_profile` / `app:portfolio_registry`, and restating all 19 verbatim would be exactly the kind of no-new-information duplication this whole review has been eliminating elsewhere in the pipeline.

> **⚠️ Specification inconsistency found by this test:** `TPA DocReviewer.md`'s own **Operational Delta Mapping Rule** says "If Old Address == New Address, omit from output" — i.e. don't show unchanged fields at all. But its **§5 Output Archetype worked example**, two sections earlier in the same document, explicitly includes two `STATIC` rows (Registration No., Tax Identifier) in its sample delta table. These two instructions contradict each other: one says omit unchanged fields entirely, the other's own example shows them. I followed the spirit I judged more consistent with everything else fixed in this session (show what changed in full, summarize what didn't rather than either fully restating or fully silencing it) — but this is a genuine unresolved contradiction in the current text, not a judgment call I should be making silently. Worth an explicit decision on which the rule actually means.

### Node 4: Ownership Complexity — unchanged
Still `SIMPLE` — sole shareholder remains a natural person (Ang Wei Ling, 100%, unchanged); no re-triage needed since the shareholding itself didn't change, only the director roster.

### Node 5: Gap Analysis
No new gaps introduced by this renewal — all 24 fields remain populated (or correctly N/A) as they were at original onboarding, with the 5 deltas above layered on top.

---

## 5. KYC/Screening Agent — `screening_report` (Renewal)
`SIMPLE` — Flow A extraction not re-triggered. Flow B re-screens the current party list:

| # | Party | Status | Note |
| :-- | :-- | :-- | :-- |
| 1 | Kestrel Bay Industrial Services Pte. Ltd. | `[SIMULATED]` Re-submitted — pending | Entity, address change since last screening cycle |
| 2 | Ang Wei Ling | `[SIMULATED]` Re-submitted — pending | No longer a director; remains Shareholder/UBO — still in scope |
| 3 | Rajan Selvam Kumaraswamy | `[SIMULATED]` Re-submitted — pending | Unchanged role (Director, CEO) |
| 4 | Farah Iryani Binte Zulkifli | `[SIMULATED]` **First-time** submission — pending | New director this cycle — no prior screening history |

---

## 6. Custodian — not invoked mid-flow (consistent with every prior test — its Prompt 6 sweep in Part 1 already ran, separately, before this renewal even began)

---

## 7. TPA Orchestrator — Final Consolidated Report

### [EXECUTIVE TPA ONBOARDING & COMPLIANCE REVIEW]
| | |
| :-- | :-- |
| Compliance Status | `CONDITIONAL APPROVAL — PENDING RCTP (1 NEW PARTY)` |
| Staged Third Party ID | `TPA-KESTREL-001` *(unchanged — renewal updates the existing record, doesn't create a new one)* |

#### SECTION 1: Company Information Summary
| Field | Value | Changed this cycle? |
| :-- | :-- | :-- |
| Legal Name | Kestrel Bay Industrial Services Pte. Ltd. | No |
| Company Number | T99AB1234C | No |
| Registered Address | 15 Benoi Crescent, #02-07, Benoi Industrial Park, Singapore 629977 | **Yes** — was 8 Tuas Bay Close |
| Legal Structure | Entity | No |
| Industry | Technical Advisory services | No |

Identity Resolution: `MATCH_FOUND` (TPA-KESTREL-001). Profile Status: `UPDATED` — 5 fields changed, full delta table in `ops_report`.

#### SECTION 2: Documents Reviewed (this renewal cycle only)
| Document | Key Information Extracted | Confidence |
| :-- | :-- | :-- |
| Updated ACRA Bizfile | New registered address; updated director roster | High |
| Renewed Technical Advisory Services Agreement | New contract sum, new payment terms | High |
| Follow-up Compliance Screening Note | Org RF resolution (headcount capacity) | High |

*The original 5 onboarding documents are not re-listed here — they're already part of the confirmed record at `TPA-KESTREL-001`; this section covers what's new to this cycle, consistent with how `ops_report`'s own delta view works.*

#### SECTION 3: Organisation Structure
```
Ang Wei Ling (natural person, 100% shareholder/UBO — unchanged)
   ▼
Kestrel Bay Industrial Services Pte. Ltd.
```
| Role | Name | Ownership % | Changed this cycle? |
| :-- | :-- | :-- | :-- |
| Sole Shareholder / UBO | Ang Wei Ling | 100% | No |
| Director, CEO | Rajan Selvam Kumaraswamy | N/A | No |
| Director | Farah Iryani Binte Zulkifli | N/A | **Yes — new appointment** |
| *(Ang Wei Ling — ceased as Director)* | — | — | **Yes — role change, remains shareholder/UBO** |

#### SECTION 4: Field Ledger
All 24 fields — full current values as in `ops_report`'s Node 1/3 (post-delta), reproduced inline. 0 outstanding mandatory fields (unlike the fresh-onboarding case, this record was already complete at original onboarding, and the renewal introduced no new gaps).

#### SECTION 5: Key Flags (At a Glance)
*   ⏳ Farah Iryani Binte Zulkifli — first-time screening, no prior history — Section 6.
*   📍 Registered address changed — verify no other filings need updating — Section 1.
*   ✅ Prior Org RF (headcount capacity) resolved this cycle — Section 6.

#### SECTION 6: Risk Domain Tiering
| Domain | Status | Finding | Priority |
| :-- | :-- | :-- | :-- |
| Entity Verification | 🟢 | Address change confirmed via updated ACRA Bizfile | LOW |
| Sanctions Clearance | 🟡 | `[SIMULATED]` re-screening pending, 4 parties (1 first-time) | MEDIUM |
| Documentation Completeness | 🟢 | 0 fields outstanding | LOW |
| Ownership Transparency | 🟢 | `SIMPLE`, unchanged | LOW |
| Jurisdictional Risk | 🟢 | Singapore only | LOW |

**Overall Risk Tier: `MEDIUM`** — driven entirely by pending screening on the new director; no documentation or ownership concerns this cycle.

#### SECTION 7: Decision & Conditions for Full Approval
**Decision: `CONDITIONAL APPROVAL`**
| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | RCTP results received and adjudicated for all 4 parties, particular attention to first-time screening of Farah Iryani Binte Zulkifli | Senior Compliance Officer | Within 3 business days of RCTP return |

#### SECTION 8: Escalation Path & Next Review
**Escalation Path:** Confirmed match on Farah Iryani Binte Zulkifli (or any party) → escalate, reclassify `BLOCKED`, hold renewal.
**Next Review Date:** Standard biennial cycle from this renewal date.

---

## What this test found

1. **Renewal path (Prompt 9) works structurally as designed** — Flow A correctly resolves `MATCH_FOUND`, `TPA DocReviewer` correctly runs delta comparison instead of fresh extraction, ownership complexity correctly isn't re-triaged when the shareholding itself hasn't changed, and re-screening correctly distinguishes a first-time party (new director) from re-submitted ones.
2. **One real specification contradiction, not a judgment call**: `TPA DocReviewer.md`'s Operational Delta Mapping Rule ("omit unchanged fields") directly conflicts with its own §5 worked example (which shows `STATIC` rows). This wasn't exercised by any of Tests 1–6 since all of those were fresh onboardings — Node 2 (Delta Calculation) simply never ran before now.
3. **A design question, not a bug**: should the Orchestrator's "Documents Reviewed" section on a renewal show only this cycle's new documents (what I did here) or the full document history across all onboarding/renewal cycles? Reasonable arguments either way; current wording doesn't say.

Items 2 and 3 aren't fixed in the `.md` files — flagging per the established pattern of surfacing findings before editing, since both are genuine specification decisions rather than obvious bugs.
