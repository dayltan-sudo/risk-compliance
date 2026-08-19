# Workflow Specification: Audit & Access Log

> **Infra, Guardrail — a day-one NFR, not a release-tagged feature.** A logging interceptor every write passes through, not a "workflow" in the business sense. It is the record of last resort if any other component's own versioning is ever questioned.
>
> **Companion docs:** what it guarantees for every other component — [`../c. State/Atlas - Data Lifecycle & Versioning Reference.md`](../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md). State schema — [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Read-access scoping — [`../d. Reference/Atlas Reference - RBAC & Access Scoping.md`](../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md).

## 1. Core Mandate & Operational Objectives
You are an immutable, time-stamped log of every data change, validation action, export, and access event across Atlas (§13). Every other component writes to you via `atlas_write_audit` — no exceptions, no component decides for itself whether an event is worth logging. You have no judgement to exercise: you record what happened, when, and by whom.

**Capabilities:** accept an append-only audit entry from any component; enforce no `UPDATE`/`DELETE` path at the database/permissions layer, not merely by convention; serve read queries scoped to §4.2's broader-than-Auditors access list.

## 2. State Management
Full schema: [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). You are the sole owner of `app:audit_log`. Every component — Intake & Classification, Field Extraction & Validation Routing, Enrichment & Posting, all three Engines, Alerts & Notification, Reporting & Export, Config Change-Control, the News & Sector Intelligence Agent, and the Orchestrator's access gate — writes to you; none of them read each other's audit entries directly, only through your read path.

## 3. Structural Immutability
Append-only is not a policy on top of a mutable table — it is enforced at the database/permissions layer: no role, including Admin, holds `UPDATE` or `DELETE` grants on `app:audit_log` in normal operation. This is deliberate: FR3.7's "never silently overwrite" and §10.3's point-in-time snapshot guarantee both rely on versioning happening correctly in each individual component; this log is what remains true even if one of those components' own versioning logic is ever wrong or disputed. It does not depend on any other component's correctness to hold.

## 4. Deterministic Execution Flow
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
                                      per §5's access scope
```

## 5. Read Access (§4.2) — Broader Than Auditors Alone
Read access is not Auditor-exclusive:

| Role | Access |
| :--- | :--- |
| Group Insurance | Read |
| R&C Manager | Read |
| Treasury | Read |
| Auditor | Read |
| Admin | Full access |
| Entity Risk Champion | None |

Every read is itself an access event and is logged by this same component — reading the audit trail generates an audit trail entry.

## 6. Retention
Retained indefinitely under normal operation (§13) — the audit clock, unlike the renewal-cycle and regulatory-retention clocks that govern other state categories, does not prune during normal operation at all (§04, State Design doc). Nothing is purged from `app:audit_log` short of a formal records-disposal process outside Atlas's own normal operation.

## 7. MCP Task-Tool Bindings
| Tool | Sole caller | Precondition |
| :--- | :--- | :--- |
| `atlas_write_audit` | Every component | Every write, validation, export, and access event — no exceptions |

## 8. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| A component fails to call `atlas_write_audit` on a write | Treated as a defect in the calling component, not a tolerated gap — every write path is expected to log unconditionally |
| Attempted `UPDATE`/`DELETE` against `app:audit_log` | Rejected at the database/permissions layer regardless of caller role, including Admin |
| Read requested by Entity Risk Champion | Denied — §4.2 grants no audit-trail access to this role |
| Read requested by an unrecognised or unscoped role | Denied by default — least-privilege; no implicit read |
| Log write during a downstream outage (e.g., notification delivery fails) | Audit entry for the attempt is still written; the log is independent of whether the logged action itself succeeded |
