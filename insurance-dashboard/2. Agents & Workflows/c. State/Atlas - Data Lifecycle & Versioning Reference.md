# Atlas — Data Lifecycle & Versioning Reference

> Reference doc — governs how every non-reference §8.1 entity is stored, versioned, retained. Underlies `app:policy_registry`, `app:kpi_snapshot_store`, and other persisted `app:` keys.
>
> **Companion docs:** [`Atlas - Google ADK State Reference.md`](Atlas%20-%20Google%20ADK%20State%20Reference.md) · [`Atlas - Output Templates.md`](Atlas%20-%20Output%20Templates.md)

## The Core Pattern: Valid-Time vs. Transaction-Time

Atlas needs two time axes per non-reference record — bitemporal, not the full academic version:

- **Valid time** — the period a fact was true in the real world (a sum insured's effective dates).
- **Transaction time** — when Atlas recorded or corrected that fact (validator confirmation, correction post).

These diverge: a broker's July correction can restate what was true in March. Atlas must answer both "what was true in March" and "what did we believe then, versus now" — the second is what an auditor traces.

A mutable row plus change-log answers "what changed and when," not "what would a user have seen on a past date" — that needs replaying every log entry, fragile around a config-version boundary (§10.3). Storing `valid_from`/`valid_to`/`recorded_at` as first-class columns (or a snapshot table, below) makes that a direct query.

## Entity Lifecycle Classification (PRD §8.1)

| Category | Entities | Governing rule |
| :--- | :--- | :--- |
| Reference | Business Unit/Entity, Site/Location, Carrier/Insurer, Broker, User/Role, Counterparty/Agreement | Low change frequency; audit trail only. |
| Versioned | Asset, Policy, Coverage/Line, Premium, ExtractionField, Third-Party Requirement, Policy Exclusion, News/Emerging-Risk Signal | Type-2 SCD — never overwritten, new version per change (FR3.7). |
| Snapshot | **KPI / Risk Score Snapshot** — Risk Score, Coverage & Ratio KPIs (§7) | Frozen at the config version live when computed; never rewritten (§10.3, FR2.6). |
| Append-only | Document, FX Rate, News Item/Source | Immutable on ingest; reprocessing (FR3.8) adds a version alongside, never replaces. |
| Independent | Claim | Own lifecycle clock, independent of the policy filed against (§7.4) — resolved below. |
| Configuration | **Configuration Version** — KPI thresholds, risk-score weights, risk-appetite thresholds | Versioned on every change; every snapshot references the version that produced it (§10.3). Formally named, 21 Jul 2026. |

> **Resolved (sponsor, 21 Jul 2026):** Atlas continues tracking an open claim after the policy it was filed against has lapsed and been superseded by a new placement. Tracking ends at claim settlement, not at policy expiry — consistent with the claim's own independent lifecycle clock (§7.4).

## Retention Clocks

Four clocks govern retrievability — conflating them risks early archiving.

| Clock | Duration | Basis |
| :--- | :--- | :--- |
| Renewal-cycle | ~1 policy term (annual typical; multi-year for CAR/EAR) | The placed policy's own inception–expiry window. |
| Regulatory-retention | Indefinite (resolved) | §13: Group records-retention policy; retained indefinitely — resolved below. |
| Audit | Effectively permanent | §13: immutable log of every change, validation, export, access. |
| Migration | 1 renewal cycle, one-time, per entity | §9.2: Atlas and legacy tracker run concurrently before cutover. |

> **Resolved (sponsor, 21 Jul 2026):** retain indefinitely — no purge scheduled against this clock. Revisit if the Group's records-retention policy is later confirmed with a shorter defined duration.

**Rule:** archiving/purging waits for the longer of renewal-cycle and regulatory-retention; audit never prunes.

## Storage Patterns

**Versioned entities** (Asset, Policy, Coverage, Premium, ExtractionField, Third-Party Requirement, Policy Exclusion): type-2 SCD — `valid_from`/`valid_to` (real-world period) plus `recorded_at` (when Atlas learned it); current row has open-ended `valid_to`. A correction closes the old row, inserts a new one.

**Point-in-time snapshots** — the KPI / Risk Score Snapshot entity (Risk Score, Coverage & Ratio KPIs, Contract Compliance status): additive fact table keyed by `(entity_ref, metric_name, as_of_date, config_version_id)`; the FK to Configuration Version is not optional. Recompute inserts a new row, never updates one. Field lists: below.

**Append-only feeds and audit log** (Document, FX Rate, News Item/Source, `app:audit_log`): insert-only, no update path. The audit log is structurally incapable of UPDATE/DELETE — enforced at the DB/permissions layer, not convention (per the State Reference).

## Formally Named Entities (21 Jul 2026, Option A)

### KPI / Risk Score Snapshot

| Field | Type | Description |
| :--- | :--- | :--- |
| `snapshot_id` | ID (PK) | Unique identifier |
| `entity_ref` | Reference | Country/Site/Entity/BU/Asset/Policy this value applies to |
| `metric_name` | Enum/Text | e.g. "ITV", "Composite Risk Score", "Contractual Requirement Coverage Ratio" |
| `metric_value` | Number | The computed value |
| `as_of_date` | Date | Valid-time — the date this value represents |
| `computed_at` | Timestamp | Transaction-time — when Atlas computed it |
| `config_version_id` | Reference | FK to Configuration Version in effect at computation |
| `computed_by` | Enum | Coverage & Ratio Engine / Risk Scoring Engine / Contract Compliance Engine |
| `lineage_ref` | Reference | Pointer to the inputs/formula used (FR2.4) |

Backing state key: `app:kpi_snapshot_store`.

### Configuration Version

| Field | Type | Description |
| :--- | :--- | :--- |
| `version_id` | ID (PK) | Unique identifier |
| `effective_from` | Date | When this version became live |
| `superseded_by` | Reference (nullable) | The next version, once one exists — this version is never deleted |
| `rationale` | Text | Logged justification for the change (§10.3) |
| `approved_by` | Reference | Named reviewer/owner who approved it (owner still TBC, §18) |
| `threshold_set` | Structured | The actual KPI thresholds / risk-score weights / risk-appetite values this version carries |

Backing state key: `app:config_versions` (sole writer: Config Change-Control).

## Open Questions

Resolved (sponsor, 21 Jul 2026) — all four items previously listed here:
- Regulatory-retention duration → retain indefinitely (Retention Clocks, above).
- Configuration Version as a first-class entity → formally named (Formally Named Entities, above).
- Dismissed news-signal retention → retained indefinitely, archived from the active watchlist — see [News & Sector Intelligence Agent](../a.%20Agents/News%20%26%20Sector%20Intelligence%20Agent%20-%20V2.md) §5.
- Claim data ownership after policy retirement → tracking continues to settlement, independent of policy expiry (Entity Lifecycle Classification, above).
