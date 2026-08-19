# Atlas — Output Templates

> Reference doc. Worked, illustrative output examples for the twelve Atlas components — other docs link into a section here (`#anchor`) rather than repeating a filled-in example inline. All data below is illustrative placeholder data; no Keppel-specific figures are assumed or implied, consistent with the PRD's own disclaimer (front matter).
>
> **Companion docs:** [`Atlas - Google ADK State Reference.md`](Atlas%20-%20Google%20ADK%20State%20Reference.md) · [`Atlas - Data Lifecycle & Versioning Reference.md`](Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md)

## Atlas Orchestrator Answer

Two variants: a grounded answer with citations (FR8.4), and the no-answer fallback (FR8.5). Produced by Atlas Orchestrator on Answer Convergence (State Reference).

**Grounded answer:**

> **Q:** "Which sites in [Country X] are under-insured right now?"
>
> Three sites show ITV below the 90% threshold: *Site A* (ITV 78%), *Site B* (ITV 84%), *Site C* (ITV 88%). All three carry Industrial All Risks cover; *Site A*'s gap is the largest.

| Ref | Record | Type |
| :--- | :--- | :--- |
| [1] | ITV snapshot, *Site A*, as-of 2026-07-18 | KPI (`app:kpi_snapshot_store`) |
| [2] | Policy `POL-XX-0091`, v3 | Policy (`app:policy_registry`) |
| [3] | ITV snapshot, *Site B*, as-of 2026-07-18 | KPI (`app:kpi_snapshot_store`) |

**No-answer fallback (FR8.5):**

> **Q:** "What's our total exposure net of reinsurance?"
>
> I don't have reinsurance-net figures in Atlas — I can show gross TIV by site instead. Want that?

Every grounded answer traces to a KPI, policy, or requirement record (FR8.4); the fallback states the gap rather than guessing (FR8.5).

## Validation Exception-Queue Entry

Worklist row produced by Insurance DocAnalyst, written to `app:validation_queue` (§9.1).

| Field | Value |
| :--- | :--- |
| Ingestion ID | `ING-2026-04471` |
| Document | *Broker slip — Site D, Property Damage* |
| Field | Sum Insured (per-occurrence) |
| Reason code | `LOW_CONFIDENCE` *(alt: `MANDATORY_MISSING`, `CLASSIFICATION_FAILED`)* |
| Confidence | 62% — below 85% threshold (`user:extraction_confidence_config`) |
| Source location | p.2, table row 4, *slip.pdf* |
| Owner | Entity Risk Champion, Site D |
| Status | `PENDING` — excluded from every KPI until validated (§9.1) |

## Risk-Score Driver Breakdown

Per-row explanation, FR4.4. *Site E — composite score 74 (High band)*, drivers per §10, weights per `app:config_versions`:

| Driver | Weight | Sub-score | Contribution |
| :--- | :--- | :--- | :--- |
| Coverage gap severity | 28% | 65 | 18.2 |
| Uninsured / under-insured TIV | 18% | 80 | 14.4 |
| Nat-cat exposure | 14% | 90 | 12.6 |
| Political / sanctions / country risk | 10% | 40 | 4.0 |
| Adverse claims history | 9% | 55 | 5.0 |
| Carrier credit quality & concentration | 8% | 30 | 2.4 |
| Emerging risk signal (news-driven) | 8% | 70 | 5.6 |
| Mandatory-cover non-compliance | 5% | 0 | 0.0 |
| **Composite** | | | **74** — High band (70–84), §10.1 |

Computed by Risk Scoring Engine from `temp:driver_breakdown`; band assignment per §10.1; frozen at `config_version_id` under Snapshot Convergence.

## Contract Requirement Status Row

`Excluded` override, FR9.3 — a numerically-satisfied requirement whose peril is undermined by a Policy Exclusion. Written by Contract Compliance Engine.

| Field | Value |
| :--- | :--- |
| Requirement | Minimum Industrial All Risks limit, *Site F* |
| Counterparty type | Lender |
| Required limit | S$40.0M *(illustrative)* |
| Placed limit | S$42.0M *(illustrative)* |
| Numeric comparison | 105% — would read `Met` on limit alone |
| **Status** | **`Excluded`** |
| Explanation (inline, FR9.3) | Placed limit numerically satisfies the requirement, but Policy Exclusion `EXC-0087` removes flood cover for *Site F*'s coverage line — the peril the facility agreement actually requires. |
| Source | Facility Agreement cl. 14.2 · Exclusion register `EXC-0087` |

`Excluded` applies after the numeric comparison, not instead of it — an override on the Contract Compliance Engine's own status field (`Met`/`At-risk`/`Gap`/`Excluded`), never a second parallel register.
