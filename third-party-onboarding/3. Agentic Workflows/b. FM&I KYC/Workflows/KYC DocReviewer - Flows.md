# KYC DocReviewer — Full Flow Diagrams

Companion to [`Agents/KYC DocReviewer.md`](..%2FAgents%2FKYC%20DocReviewer.md) §3, which carries only the flow summary table.

---

### Flow A: Wave 1 Checklist Matching & Baseline Extraction
Triggered by `KYC Orchestrator`'s Flow B. Item set: checklist Q1 (Proof of existence, 1.1–1.4) + Q2's tier-independent items (2.1, 2.2, 2.3, 2.5, 2.6) — see the main doc's §5.
```
[Entry: Raw Extracted Document Text (+ session:case_historical_profile if reopened)]
                 │
                 ▼
[Node 1: Checklist-Item Matching] ──► Matches each upload against its Wave 1 item(s),
                                       determines Present / Missing / Non-CTC,
                                       attaches confidence + citation
                 │
                 ▼
[Node 2: Baseline Identity Extraction] ──► Third Party Type, Customer Type,
                                            Person/Entity core fields
                 │
                 ▼
[Node 3: CTC Factual Check] ──► Per item with a certification mark: text present?
                                 dated within 6mo (or exception on file)? self-cert
                                 check? Resolves directly to Present/Non-CTC — no
                                 handoff (eligibility characterization is KIV,
                                 deferred to v2)
                 │
                 ▼
[Output: Wave 1 Draft] ──► Writes session:wave1_checklist_draft — missing mandatory
                            items surface here from the Node 1 statuses themselves
                            (see the main doc's Missing-Item Surfacing rule, §3)
                            (PROVISIONAL — Orchestrator presents to the human at the
                            Wave 1 Confirmation Gate before any kyc_* write)
```

---

### Flow B: CDD-Typing Questionnaire Drafting
Triggered by `KYC Orchestrator`'s Flow C, only after Wave 1 Convergence and the screening gate has cleared.
```
[Entry: Wave 1 baseline fields (+ optional screening-derived flag from Orchestrator)]
                 │
                 ▼
[Node 1: Questionnaire Drafting] ──► Drafts the Type of Customer Due Diligence
                                      Q1–19 battery for human completion. Any
                                      Q1–4 answer resting on a Medium/Low-
                                      confidence baseline field (e.g. Q2 on a
                                      Medium-confidence MASKYC Customer Type)
                                      is drafted with a suggested answer +
                                      confidence/basis stated alongside it,
                                      labelled "suggested, not confirmed" —
                                      still the Requester's call, never
                                      auto-answered (see main doc §3)
                 │
                 ▼
[Node 2: Recommendation Highlight] ──► If handed a screening-derived flag, highlights
                                        Q5 (PEP/adverse-media exposure) or Q11
                                        (sanctions exposure) with a recommended
                                        answer — never pre-accepted; the human
                                        must explicitly confirm it. Distinct
                                        mechanism from Node 1's confidence-
                                        flagged suggestions: this one only
                                        fires on an Orchestrator-supplied
                                        screening signal, never on document
                                        confidence alone
                 │
                 ▼
[Output: CDD Typing Draft] ──► Writes session:cdd_typing_draft
```
*   **You never compute the resolved tier.** That mapping rule — Enhanced if Yes to any of Q5–19 (checked first, takes precedence), else Simplified if Yes to any of Q1–4, else Standard (Enhanced-first, confirmed 22 Jul 2026) — is server-side, behind `kyc_submit_cdd_typing`. Drafting the questionnaire is not the same as resolving it, and this precedence has no bearing on how you draft: draft all 19 questions the same way regardless of which combination the Requester ends up confirming.

---

### Flow C: Wave 2 Checklist Matching
Triggered by `KYC Orchestrator`'s Flow D, only for a `Standard` or `Enhanced` resolved tier. Same shape as Flow A, against the tier-dependent item set: Standard gets 2.4, 2.7, Q3 (3.1–3.5), Q4 (4.1); Enhanced additionally gets Q5 (5.1–5.3) — see the main doc's §5.
