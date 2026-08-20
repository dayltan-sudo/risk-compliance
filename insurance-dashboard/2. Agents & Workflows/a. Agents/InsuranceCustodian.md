# System Instruction: InsuranceCustodian

> **Deterministic, mixed release. No LLM in the loop, no judgement calls (§02).** Two functions: Reporting & Export (template-fill/render, **V2**) and Audit & Access Log (**MVP** — the log every other write goes through). Packaged together because the audit lineage report, one of Reporting's four outputs, is a direct read of Audit's own log.
>
> **§5–§6 are cross-cutting architecture references — MVP from go-live, independent of either function's release tag, and not owned behaviour of this agent.** Enforcement of §5 sits in [`Atlas Orchestrator.md`](Atlas%20Orchestrator.md) §8 (queries), §3 (exports), and §4 (audit reads).

## 1. Core Mandate & Operational Objectives
1. **Reporting & Export (§3, V2)** — four output types to PDF or Excel, on demand or schedule (PRD §12.2). Reads current state from the grounding engines; never computes a KPI, risk score, or compliance status.
2. **Audit & Access Log (§4, MVP)** — immutable, time-stamped log of every data change, validation action, export, and access event (PRD §13). Every other component writes here via `atlas_write_audit`, unconditionally.

## 2. State Management
**Reads (Reporting & Export):** `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:policy_registry`, `app:document_store`, `app:user_scope_registry` (export access scoping), `app:audit_log` (lineage output only), `user:reporting_templates`.

**Writes:** `temp:render_buffer`, discarded after turn. `app:audit_log` — **sole owner**; every other component writes via `atlas_write_audit`, none read each other's entries directly, only through this agent's read path (§4).

No session-state keys beyond the temp buffer.

## 3. Reporting & Export — V2

### Flow A: Report Generation
```
[Entry: atlas_generate_report — on demand or scheduled]
                 │
                 ▼
[Node 1: Source Read] ──► Pulls current KPI/risk/compliance snapshots,
                           requirement & exclusion registers, policy records
                 │
                 ▼
[Node 2: Template Fill & Render] ──► Board pack / renewal forecast /
                                      coverage-gap register / audit
                                      lineage → PDF or Excel
                 │
                 ▼
[Output: rendered file] ──► Delivered on demand or per schedule;
                             writes audit entry (§4 Flow B)
```
Trigger: `atlas_generate_report`, sole caller this agent, on demand or scheduled. Rendered output unavailable until V2; the audit lineage output's underlying log (§4) is populated from MVP regardless.

**Outputs (PRD §12.2).**

| Report | Content |
| :--- | :--- |
| Board/leadership insurance pack | Group-wide coverage, risk, and cost summary for leadership/Board review |
| Renewal forecast | Policies and sum insured expiring in upcoming windows |
| Coverage-gap register | Open coverage gaps, contractual requirement gaps, and exclusion conflicts |
| Audit lineage report | Calculation lineage and audit-trail extract for a given record or period |

None of the four are available at MVP go-live. PDF and Excel, distributed on demand or on schedule.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Source snapshot stale or mid-recompute | Waits for Snapshot Convergence on the affected engine, or renders with an "as-of" timestamp older than expected — never silently mixes partial and current data |
| Scheduled run fails (render error, source unavailable) | No partial file delivered; failure logged; retried on next scheduled window, not immediately in a loop |
| Requested output type has no data for the period | Renders an empty-state document explicitly, not a blank/broken file |
| Export requested by a role with no read access to the underlying register | Denied outright — no partial output granted |

## 4. Audit & Access Log — MVP
Every other component writes to you unconditionally; none read each other's audit entries directly, only through your read path.

### Flow B: Append-Only Audit Write
```
[Entry: atlas_write_audit — from any component]
                 │
                 ▼
[Node 1: Event Capture] ──► Actor, action, target record, timestamp
                 │
                 ▼
[Node 2: Append] ──► Insert-only write to app:audit_log — no UPDATE/
                      DELETE path exists at the permissions layer
                 │
                 ▼
[Output: audit entry, permanent] ──► Retained indefinitely; readable
                                      per the §5 matrix
```

**Structural immutability.** No role, including Admin, holds `UPDATE`/`DELETE` grants on `app:audit_log` in normal operation — enforced at the database/permissions layer, not by convention.

**Read access.** Per §5's "View audit trail" row: Group Insurance, R&C Manager, Treasury, and Auditor hold `R`; Admin holds `A`; Entity Risk Champion has none. Every read is itself an access event and is logged.

**Retention.** §6's audit clock — effectively permanent, never pruned.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| A component fails to call `atlas_write_audit` on a write | Treated as a defect in the calling component, not a tolerated gap |
| Attempted `UPDATE`/`DELETE` against `app:audit_log` | Rejected at the database/permissions layer regardless of caller role, including Admin |
| Read requested by Entity Risk Champion | Denied — §5 grants no audit-trail access to this role |
| Read requested by an unrecognised or unscoped role | Denied by default — least-privilege; no implicit read |
| Log write during a downstream outage (e.g., notification delivery fails) | Audit entry for the attempt is still written |

## 5. Access Control & Role Scoping (PRD §4.1–§4.2)
Reference data binding all five agents — not this agent's own behaviour.

**Personas (PRD §4.1).** Six in scope. Broker (external, V2) is a seventh PRD §4.1 persona outside this matrix — no access to Group data.

| Persona | Primary jobs-to-be-done |
| :--- | :--- |
| Group Insurance Lead | Own the programme; monitor adequacy and cost; configure KPI definitions and thresholds; drive placement strategy |
| R&C Manager | Monitor compliance and coverage gaps; review risk hotspots; export packs for leadership and audit |
| Entity Risk Champion | Upload local policy/broker documents; validate extracted data for their entity; confirm asset values |
| Treasury / Finance | Review premium spend, total cost of risk, and FX-normalised figures; reconcile to GL |
| Internal Auditor | Trace numbers to source documents; review audit trail and access logs |
| System Administrator | Manage users, roles, reference data, integrations, and KPI/score configuration |

**Role-capability matrix (PRD §4.2).** `R` Read · `W` Create/Edit · `V` Validate extractions · `C` Configure · `A` Admin · `—` no access. Always scoped by entity/BU per the user's assignment.

| Capability | Grp Ins | R&C Mgr | Entity Champ | Treasury | Auditor | Admin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| View dashboards & KPIs | R | R | R* | R | R | R |
| Upload documents | W | W | W* | — | — | W |
| Validate extracted data | V | V | V* | — | — | V |
| Edit policy records | W | W | W* | — | — | W |
| Configure KPIs / risk weights | C | C | — | — | — | C |
| Manage users & integrations | — | — | — | — | — | A |
| View audit trail | R | R | — | R | R | A |
| Manage third-party contractual requirements | W | W | W* | R | R | W |
| Manage insurance exclusions | W | W | W* | R | R | W |

**\*** Entity Risk Champion access is restricted to their assigned entity/site only — every `*`-marked cell is entity/site-scoped, not Group-wide, even where the letter grant matches other roles.

**`app:user_scope_registry`** — integration-sourced (Entra ID/SSO), application-scoped, persistent; the authoritative record of each user's role and assigned entity/site, provisioned outside Atlas. Three readers only: the Orchestrator's access gate, and both functions of this agent. No component writes to it.

## 6. Data Lifecycle, Versioning & Retention (PRD §8.1, PRD §13)
Reference governing how every non-reference PRD §8.1 entity is stored, versioned, and retained — underlies `app:policy_registry`, `app:kpi_snapshot_store`, and every other persisted `app:` key.

**Bitemporal, two axes per non-reference record:**
- **Valid time** — the period a fact was true in the real world (a sum insured's effective dates).
- **Transaction time** — when Atlas recorded or corrected that fact (validator confirmation, correction post).

These diverge: a broker's July correction can restate what was true in March. Atlas must answer both "what was true in March" and "what did we believe then, versus now" — the second is what an auditor traces. A mutable row plus change-log answers only the first; the second needs replaying every log entry, fragile around a config-version boundary. `valid_from`/`valid_to`/`recorded_at` as first-class columns make it a direct query.

**Entity lifecycle classification (PRD §8.1).**

| Category | Entities | Governing rule |
| :--- | :--- | :--- |
| Reference | Business Unit/Entity, Site/Location, Carrier/Insurer, Broker, User/Role, Counterparty/Agreement | Low change frequency; audit trail only |
| Versioned | Asset, Policy, Coverage/Line, Premium, ExtractionField, Third-Party Requirement, Policy Exclusion, News/Emerging-Risk Signal | Type-2 SCD — never overwritten, new version per change (FR3.7) |
| Snapshot | KPI / Risk Score Snapshot — Risk Score, Coverage & Ratio KPIs (§7) | Frozen at the config version live when computed; never rewritten (PRD §10.3, FR2.6). Field list: [`CoverageAnalyst.md`](CoverageAnalyst.md) §4 |
| Append-only | Document, FX Rate, News Item/Source | Immutable on ingest; reprocessing (FR3.8) adds a version alongside, never replaces |
| Independent | Claim | Own lifecycle clock, independent of the policy filed against (PRD §7.4) |
| Configuration | Configuration Version — KPI thresholds, risk-score weights, risk-appetite thresholds | Versioned on every change; every snapshot references the version that produced it (PRD §10.3). Field list: [`CoverageAnalyst.md`](CoverageAnalyst.md) §3 |

> **Resolved (sponsor, 21 Jul 2026):** Atlas continues tracking an open claim after the policy it was filed against has lapsed and been superseded. Tracking ends at claim settlement, not at policy expiry — consistent with the claim's own independent lifecycle clock (PRD §7.4).

**Retention clocks.** Four, never conflated — doing so risks early archiving.

| Clock | Duration | Basis |
| :--- | :--- | :--- |
| Renewal-cycle | ~1 policy term (annual typical; multi-year for CAR/EAR) | The placed policy's own inception–expiry window |
| Regulatory-retention | Indefinite (sponsor, 21 Jul 2026 — revisit if a shorter Group policy duration is confirmed) | PRD §13 Group records-retention policy |
| Audit | Effectively permanent | PRD §13 immutable log of every change, validation, export, access |
| Migration | 1 renewal cycle, one-time, per entity | PRD §9.2 Atlas and legacy tracker run concurrently before cutover |

Archiving/purging waits for the longer of renewal-cycle and regulatory-retention; audit never prunes.

**Storage patterns.**

| Pattern | Entities | Mechanics |
| :--- | :--- | :--- |
| Type-2 SCD | Asset, Policy, Coverage, Premium, ExtractionField, Third-Party Requirement, Policy Exclusion | `valid_from`/`valid_to` plus `recorded_at`; current row has open-ended `valid_to`. A correction closes the old row and inserts a new one |
| Point-in-time snapshot | KPI / Risk Score Snapshot, Contract Compliance status | Additive fact table keyed by `(entity_ref, metric_name, as_of_date, config_version_id)`; the FK to Configuration Version is not optional. Recompute inserts, never updates |
| Append-only | Document, FX Rate, News Item/Source, `app:audit_log` | Insert-only, no update path. The audit log is structurally incapable of UPDATE/DELETE — enforced at the DB/permissions layer (§4) |

## 7. MCP Task-Tool Bindings
| Tool | Function | Release | Sole caller | Precondition |
| :--- | :--- | :--- | :--- | :--- |
| `atlas_generate_report` | Reporting & Export | V2 | This agent | On demand or scheduled |
| `atlas_get_lineage` | Reporting & Export (reads) | V2 | Atlas Orchestrator, this agent | Record ID in scope (audit lineage output, or Orchestrator citations) |
| `atlas_write_audit` | Audit & Access Log | **MVP** | Every component | Every write, validation, export, and access event — no exceptions |
