# Workflow Specification: Coverage & Ratio Engine

> **Workflow, MVP.** Deterministic — not an agent; no LLM in the loop. Owns §7.1–7.8 KPI computation only; it does not score risk or evaluate contract status. **Companion docs:** formulas — [`../d.%20Reference/Atlas%20Reference%20-%20KPI%20Formulas.md`](../d.%20Reference/Atlas%20Reference%20-%20KPI%20Formulas.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Feeds — [`Risk Scoring Engine.md`](Risk%20Scoring%20Engine.md).

## 1. Core Mandate & Operational Objectives
You compute every KPI in §7.1–7.8 from posted policy, asset, premium, and claims data (FR2.1). You do not decide what a value *means* for risk or compliance — Risk Scoring Engine and Contract Compliance Engine consume your output, they do not duplicate your math. Judgement-free: given the same inputs and `config_version_id`, you always produce the same `computed_snapshot`.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema. You read `app:policy_registry` and `app:fx_rates`; you write `app:kpi_snapshot_store`. Session keys: `computation_inputs`, `computed_snapshot`, `config_version_id`.

## 3. Deterministic Execution Flow
```
[Entry: recalc_trigger_set from Enrichment & Posting, or scheduled recompute]
                 │
                 ▼
[Node 1: Input Assembly] ──► Reads app:policy_registry; resolves FX rate for each
                              monetary value from app:fx_rates as of computation date
                 │
                 ▼
[Node 2: FX Normalisation] ──► Converts to [SGD]; retains original currency
                                alongside the normalised value
                 │
                 ▼
[Node 3: KPI Computation] ──► Applies §7.1–7.8 formulas — see KPI Formulas
                                reference; never restated here
                 │
                 ▼
[Node 4: Lineage Assembly] ──► Binds inputs, formula id, FX rate, timestamp to
                                each value (FR2.4)
                 │
                 ▼
[Node 5: Snapshot Write] ──► Writes computed_snapshot to app:kpi_snapshot_store,
                              tagged config_version_id + as_of_date
```
Trigger: `atlas_compute_kpis`, sole caller Coverage & Ratio Engine, precondition Posting Convergence or scheduled recompute.

## 4. Recalculation Behaviour
Recomputes automatically whenever underlying data changes (FR2.3, Must/MVP) — Enrichment & Posting's `recalc_trigger_set` is the trigger; there is no manual-only path at MVP. A changed sum insured, premium, or claim must produce a refreshed KPI within the defined SLA.

## 5. Snapshot Writing (§10.3, FR2.6)
$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Point-in-time snapshots are Should/V2 per FR2.6 — but §10.3 and the data-lifecycle design require every engine to write an immutable, dated snapshot tagged to the config version that produced it regardless of release tag. At MVP this means: even before configurable thresholds ship (FR2.5, V2), every `atlas_compute_kpis` run still writes a `computed_snapshot` row keyed to whatever `config_version_id` is current, not just a mutated "latest" figure. A later threshold change must never rewrite what a KPI *was*. Each row is an instance of the formal **KPI / Risk Score Snapshot** entity — field list: [`Atlas - Data Lifecycle & Versioning Reference.md`](../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md).

## 6. Configurable Thresholds (FR2.5, Should/V2)
Per-KPI thresholds/targets (e.g. ITV < 90% = under-insured) are configurable post-MVP via Config Change-Control, which writes `app:config_versions`. At MVP, thresholds are the fixed proposed defaults in the KPI Formulas reference — you read whichever `config_version_id` is current but cannot yet accept a user-proposed change yourself.

## 7. Why Coverage & Ratio Stays Separate from Risk Scoring
Five of Risk Scoring's eight drivers are KPIs you already compute (coverage gap severity, uninsured/under-insured TIV, adverse claims history, carrier credit quality & concentration, mandatory-cover non-compliance) — merging would seem to save a hop. It doesn't: Risk Scoring's remaining three drivers (nat-cat exposure, political/country risk, the news signal) are genuinely external, separately-sourced indices with their own refresh cadence, not KPI math. Folding them in would pull nat-cat/political-risk/news dependencies into what is otherwise a clean financial-ratio calculator, and couple your fast, purely-internal recompute path to slower external feeds you don't otherwise depend on. You stay a pure function of `app:policy_registry` + `app:fx_rates`; Risk Scoring composes your output with `app:risk_indices` and `app:news_signals` on top.

## 8. Lineage (FR2.1–FR2.4)
Every KPI value carries: inputs (field-level, from `app:policy_registry`), formula id (KPI Formulas reference), FX rate + rate date (`app:fx_rates`), and computation timestamp. `atlas_get_lineage` (caller: Atlas Assistant Orchestrator, Reporting & Export) reads this directly off `app:kpi_snapshot_store` — you do not serve lineage queries yourself.

## 9. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| FX rate missing for value date | Computation blocked for affected KPIs; exception logged, prior snapshot stands |
| Mandatory field unconfirmed | Excluded from computation per the validation gate (§9.1); KPI reflects confirmed data only |
| `config_version_id` unresolved | Recompute deferred; cannot write a snapshot without a bound version |
| Recalc trigger storm (bulk posting) | Batched, not dropped — every affected KPI still recomputes, no silent skip |
| Formula/input mismatch (schema drift) | Computation fails closed; flagged to Alerts, no partial snapshot written |

Every write logs to `app:audit_log` (`atlas_write_audit`, no exceptions).
