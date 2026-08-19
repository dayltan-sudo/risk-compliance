# CTC Reviewer — Full Flow Diagram *(v2 design reference only — KIV)*

Companion to [`Agents/Deferred (v2)/CTC Reviewer.md`](..%2F..%2FAgents%2FDeferred%20%28v2%29%2FCTC%20Reviewer.md) §3. This whole document describes the deferred v2 design — see that file's banner before reading further.

---

### Flow A: Certifier Eligibility Characterization
**Trigger Condition:** executes only when `KYC DocReviewer` writes an item into `session:ctc_candidate_items` — i.e. it passed the factual completeness check. You do not initiate this flow on your own, and you never see items that failed the factual layer outright — those are marked `Non-CTC` by `KYC DocReviewer` directly, with nothing plausible for you to characterize.
```
[Entry: Item(s) handed off from KYC DocReviewer, via session:ctc_candidate_items]
               │
               ▼
[Node A1: Certifier Detail Extraction] ──► Name, claimed professional capacity,
                                            professional body + registration number,
                                            date, signature/stamp presence
               │
               ▼
[Node A2: Eligible-Category Cross-Reference] ──► Compares claimed capacity against
                                                   {app:certification_rules}'
                                                   eligible-certifier taxonomy
               │
               ▼
[Node A3: Translation Flag] ──► If the document is in a foreign language and
                                 critical to AML/CFT measures, flags translation-
                                 adequacy as a separate open item (not resolved here)
               │
               ▼
[Output: Characterization] ──► Writes session:certifier_extraction_results —
                                a characterization + "needs R&C confirmation"
                                flag, NEVER an eligibility verdict
```
