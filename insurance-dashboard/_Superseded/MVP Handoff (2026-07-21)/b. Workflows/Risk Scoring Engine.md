# Workflow Specification: Risk Scoring Engine

> **Workflow, MVP.** Deterministic — not an agent; §10.1 specifies the algorithm exactly, no reasoning boundary. Owns the composite 0–100 score only; it does not compute the KPI drivers it consumes. **Companion docs:** driver weights — [`../d.%20Reference/Salus%20Reference%20-%20Risk%20Score%20Drivers.md`](../d.%20Reference/Salus%20Reference%20-%20Risk%20Score%20Drivers.md). State schema — [`../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md). Driver source — [`Coverage & Ratio Engine.md`](Coverage%20%26%20Ratio%20Engine.md).

## 1. Core Mandate & Operational Objectives
You compute the composite 0–100 risk score per country, site, entity, and BU (FR4.1). Every score must be explainable — the driver breakdown is not an optional add-on, it's the output (FR4.4). Judgement-free given resolved inputs and a resolved `config_version_id`: normalise, weighted-sum, band.

## 2. State Management
See [`Salus - Google ADK State Reference.md`](../c.%20State/Salus%20-%20Google%20ADK%20State%20Reference.md) for the full schema. You read `app:kpi_snapshot_store`, `app:risk_indices`, `app:news_signals` (optional), and `app:config_versions`; you write `app:kpi_snapshot_store`. Session keys: `computation_inputs`, `computed_snapshot`, `config_version_id`; `temp:driver_breakdown` discarded after turn.

## 3. Deterministic Execution Flow
```
[Entry: recalc_trigger_set from Enrichment & Posting, or scheduled recompute]
                 │
                 ▼
[Node 1: Driver Assembly] ──► Five drivers from app:kpi_snapshot_store (Coverage &
                               Ratio Engine's own output); three from app:risk_indices
                               (nat-cat, political/country risk) and app:news_signals
                               (emerging-risk signal, optional)
                 │
                 ▼
[Node 2: Sub-Score Normalisation] ──► Each driver mapped to a 0–100 sub-score via
                                       its defined band — see Risk Score Drivers ref
                 │
                 ▼
[Node 3: Weighted Sum] ──► Composite = Σ(sub-score × weight); weights from the
                            resolved config_version_id
                 │
                 ▼
[Node 4: Banding] ──► Low 0–39 / Medium 40–69 / High 70–84 / Critical 85–100
                       (thresholds configurable)
                 │
                 ▼
[Node 5: Driver Breakdown] ──► Writes temp:driver_breakdown — each driver's
                                sub-score, weight, and contribution to the total
                 │
                 ▼
[Node 6: Snapshot Write] ──► Writes computed_snapshot to app:kpi_snapshot_store,
                              tagged config_version_id + as_of_date
```
Trigger: `salus_compute_risk_score`, sole caller Risk Scoring Engine, precondition KPI drivers current and `config_version_id` resolved.

## 4. Driver Set (FR4.4, §10)
Full driver-by-driver table, default weights, and the news-signal zero-weight override: [`Salus Reference - Risk Score Drivers.md`](../d.%20Reference/Salus%20Reference%20-%20Risk%20Score%20Drivers.md). Five of the eight drivers are KPIs Coverage & Ratio Engine already computes (coverage gap severity, uninsured/under-insured TIV, adverse claims history, carrier credit quality & concentration, mandatory-cover non-compliance) — you read them from `app:kpi_snapshot_store` rather than recomputing. Only nat-cat exposure, political/country risk, and the emerging-risk signal are genuinely external, separately-sourced indices with their own refresh cadence (`app:risk_indices`, `app:news_signals`).

## 5. Recalculation Behaviour
Recomputes automatically on underlying data change (Must/MVP) — a driver KPI refresh, a risk-index update, or a confirmed news signal all trigger recompute. Recompute on **weight change** (FR4.5) is Should/V2 — at MVP, changing a weight does not itself trigger a re-score; the new weight applies from the next data-driven recompute onward.

## 6. Snapshot Writing (§10.3, FR2.6)
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Every recompute writes a dated snapshot tagged to the weight-configuration version that produced it (§10.3), regardless of FR2.6's own Should/V2 tag — a later reweight must never rewrite what a score *was*. Historical scores retain the weights in effect when calculated. Each row is an instance of the formal **KPI / Risk Score Snapshot** entity — field list: [`Salus - Data Lifecycle & Versioning Reference.md`](../c.%20State/Salus%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md).

## 7. Outputs (§10.2)
Ranked "Top exposures" table (highest score first, filterable by line/dimension), a geographic heat map shaded by composite score, and the per-row driver breakdown (§4). All three read off the same `computed_snapshot` — no separate computation path for the ranked table versus the heat map.

## 8. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| Driver KPI unconfirmed/excluded | That driver's sub-score treated as missing, not zero; flagged in driver breakdown |
| `app:risk_indices` stale or unavailable | Nat-cat/political-risk sub-scores held at last-known value, flagged stale |
| `app:news_signals` empty or sparse | Emerging-risk weight may be configured to zero (§10.3); score computes without it |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Weight set doesn't sum to 100% | Computation blocked; flagged to Alerts, no partial snapshot written |

Every write logs to `app:audit_log` (`salus_write_audit`, no exceptions).
