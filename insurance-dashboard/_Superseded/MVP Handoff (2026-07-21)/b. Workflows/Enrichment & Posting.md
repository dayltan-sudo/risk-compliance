# Workflow Specification: Enrichment & Posting

> **Workflow, MVP.** Deterministic ETL — FX lookup, geocode call, DB write, versioning; no judgement calls anywhere in it (§02). Absorbs §9 stages 5–7. Sole writer of `app:policy_registry`. **Companion docs:** upstream — [`../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md). Triggers — [`Coverage & Ratio Engine.md`](Coverage%20%26%20Ratio%20Engine.md), [`Risk Scoring Engine.md`](Risk%20Scoring%20Engine.md), [`Contract Compliance Engine.md`](Contract%20Compliance%20Engine.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md).

## 1. Core Mandate & Operational Objectives
You take a `validated_record` that has cleared Validation Convergence and turn it into a posted, live record. You normalise currency on dated FX rates while retaining the original currency (FR2.2), geocode sites, attach carrier credit rating and country-risk index, and map to the entity/site master. You then write the versioned record — preserving the source-document link and field-level location pointer captured at extraction (FR3.6) — never silently overwriting a prior value (FR3.7), with an audit entry every time. Finally you trigger recalculation in the three engines (FR2.3).

Your external calls (FX, geocode, carrier rating) are the flakiest part of the ingestion chain — you retry and cache them internally. **A record posts only once enrichment succeeds; you never post an un-enriched record to avoid blocking.** A stalled enrichment call delays posting — it does not degrade the record that eventually posts.

**Open item:** `app:policy_registry` is a surface that can expose named individuals' personal data from D&O/GPA/workmen's comp source documents (§13). No component in the architecture plan currently owns role-based redaction/masking on posted records — flagged, not resolved, here.

**Scope decision (sponsor, 21 Jul 2026):** deferred, not resolved. In-scope Atlas source documents are not expected to carry named-individual personal data in practice; this guardrail stays flagged rather than assigned an owner. Revisit before onboarding any line (e.g. D&O, GPA, workmen's compensation) where that assumption doesn't hold.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema. You read `app:fx_rates`, `app:risk_indices`, `app:entity_site_master`. You write `app:policy_registry` — **the only component authorised to**. Session keys: `validated_record`, `enrichment_result`, `posted_version_id`, `recalc_trigger_set`. `temp:fx_lookup` is discarded after the turn.

## 3. Deterministic Execution Flow
```
[Entry: validated_record (Validation Convergence met)]
                 │
                 ▼
[Node 1: FX Normalisation] ──► Resolves dated rate from app:fx_rates; converts
                                monetary fields to [SGD], retains original
                                currency alongside it (FR2.2)
                 │
                 ▼
[Node 2: Geocoding] ──► Resolves site geocode from address fields
                 │
                 ▼
[Node 3: Carrier Rating + Country-Risk Attachment] ──► Reads app:risk_indices
                 │
                 ▼
[Node 4: Entity/Site Master Mapping] ──► Reads app:entity_site_master
                 │
                 ▼
[Node 5: Enrichment Success Gate] ──► External calls retried/cached
                                       internally; fails closed — no
                                       partial-enrichment post
                 │
            ┌────┴────┐
            ▼          ▼
      [FAILURE]   [SUCCESS: enrichment_result = SUCCESS]
            │          ▼
    [Held; retry] [Node 6: Versioned Write] ──► Writes app:policy_registry;
                       new version, prior value retained, source-document
                       link + location pointer preserved (FR3.6); never
                       overwrites (FR3.7); audit entry written
                       │
                       ▼
                  [Node 7: Recalc Trigger] ──► Fires recalc_trigger_set to
                       Coverage & Ratio, Risk Scoring, Contract Compliance
                       engines (FR2.3)
```
Trigger: `atlas_post_record`, sole caller Enrichment & Posting, precondition Validation Convergence met **and** enrichment succeeded.

## 4. Posting Convergence
$$\text{Posting Convergence} = \text{Validation Convergence} \land \left( \text{enrichment\_result} = \text{SUCCESS} \right) \land \left( \text{posted\_version\_id} \neq \emptyset \right) \land \left( \text{audit entry written} \right)$$
All four conditions gate `atlas_post_record`. A `validated_record` alone is not sufficient — enrichment must succeed and the version/audit write must complete before any downstream engine can treat the record as current.

## 5. Never Silently Overwrite (FR3.7)
Every change to a posted policy, coverage, premium, asset, or exclusion field is a new version, not a mutation. Prior values stay retrievable indefinitely for audit (§8.3). This applies equally to a corrected re-post from reprocessing (FR3.8) and to a routine field update.

## 6. Recalculation Trigger (FR2.3)
Posting Convergence fires `recalc_trigger_set`, which each engine consumes on its own `atlas_compute_*` tool (sole caller in each case — see each engine's own doc). You do not call those tools yourself; you emit the trigger, they recompute. Contract Compliance Engine's automatic recalculation on a coverage change specifically (FR7.6) is Should/V2 — at MVP its recompute is triggered the same way as the other two engines, via your `recalc_trigger_set`, not by a separate change-detection path.

## 7. Data Migration & Backfill (§9.2)
Back-book (existing/expiring) policies load through this exact same pipeline — there is no shortcut past human validation for historical records. Two migration-specific rules you enforce beyond the ordinary posting gate:
- **Completeness floor:** a migrated record must meet the same threshold as the Data Completeness & Confidence KPI (§7.6, ≥90% of mandatory fields captured and validated) before it is treated as 'live'. Below the floor, it stays in the exception queue rather than being silently included in KPIs.
- **Parallel run:** each entity runs Atlas alongside its existing local tracker for at least one renewal cycle after migration before that tracker is retired, to catch migration gaps.

Migration is sequenced by entity/BU in priority order, not a single Group-wide cutover — this component is designed once and reused for both new intake and migration.

## 8. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| FX rate unavailable for value date | Enrichment blocked; record not posted; retried |
| Geocode / carrier-rating / country-risk call fails | Retried and cached internally; posting held, not skipped |
| `app:entity_site_master` mapping fails | Record held in enrichment; not posted with an unmapped entity |
| Migrated record below §7.6 completeness floor | Stays in exception queue; not marked 'live' |
| Recalc trigger delivery fails | Retried; a posted record must never silently fail to refresh downstream KPIs |

Every write logs to `app:audit_log` (`atlas_write_audit`, no exceptions).
