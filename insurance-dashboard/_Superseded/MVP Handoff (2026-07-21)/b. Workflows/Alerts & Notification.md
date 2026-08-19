# Workflow Specification: Alerts & Notification

> **Workflow, MVP\*.** A rules engine — trigger-table lookup plus recipient/channel routing. No judgement calls, no LLM. The component ships at MVP; not every trigger row it evaluates does — see §3.
>
> **Companion docs:** trigger table — [`../d. Reference/Atlas Reference - Alert Triggers.md`](../d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md). State schema — [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Feeds — Reporting & Export.

## 1. Core Mandate & Operational Objectives
You evaluate the §12.1 trigger table against current state and route each fired trigger to its default recipients over the recipient's configured channel (in-app, email, Microsoft Teams — configurable per alert and per user, §12.2). You do not decide *whether* something is wrong — the upstream engines already decided that; you decide *who hears about it and how*.

**Capabilities:** evaluate each of the nine §12.1 trigger conditions against `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:news_signals`, and `app:validation_queue`; resolve recipients per trigger's default list, adjusted by `user:notification_preferences`; dispatch on the recipient's configured channel(s).

## 2. State Management
Full schema: [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Reads `app:alert_trigger_table` (configured, §12.1) and `user:notification_preferences` (channel choice per alert/user). Writes an `atlas_write_audit` entry for every raised alert — no read of any register counts as a side effect worth logging beyond that.

## 3. Trigger Table & Release Traceability
§12.1's trigger table carries **no per-row MoSCoW/release tags** — the PRD's release columns exist only at the FR level (§6). Only three of the nine triggers trace directly to a numbered FR; the rest carry a release because the sponsor assigned one directly (21 Jul 2026), not because a PRD requirement was located for them:

| Trigger | Traces to | Release |
| :--- | :--- | :--- |
| Contractual requirement gap | FR7.5 | Must/MVP |
| Exclusion conflict | FR9.5 | Must/MVP |
| Emerging risk / appetite breach | FR6.8 | Must/**V2** |
| Renewal due, low-confidence extraction | *(no FR trace — sponsor decision)* | **MVP** |
| Coverage gap, carrier downgrade, aggregate erosion, new high-risk hotspot | *(no FR trace — sponsor decision)* | **V2** |

Full row-by-row detail (condition + default recipients for all nine, plus alert #3's confidence-confirm cross-reference): [`../d. Reference/Atlas Reference - Alert Triggers.md`](../d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md). Practical read: the component and its MVP triggers (FR-traced or sponsor-assigned) ship at MVP; the emerging-risk trigger cannot fire before FR6.8 exists in V2, since it depends on `app:news_signals` being populated by the News & Sector Intelligence Agent; the four sponsor-assigned V2 triggers wait on their own underlying engines regardless of this table.

## 4. Deterministic Execution Flow
```
[Entry: state-change event or scheduled sweep]
                 │
                 ▼
[Node 1: Trigger Evaluation] ──► Checks each row in app:alert_trigger_table
                                  against current register/snapshot state
                 │
                 ▼
[Node 2: Recipient Resolution] ──► Trigger's default recipient list,
                                    adjusted by user:notification_preferences
                 │
                 ▼
[Node 3: Channel Routing] ──► In-app / email / Teams per recipient config
                 │
                 ▼
[Output: atlas_raise_alert] ──► Dispatches; writes audit entry
```

## 5. Channels & Configuration
Three channels: in-app, email, Microsoft Teams — configurable per alert type and per user via `user:notification_preferences`. A user can, for example, take renewal-due alerts in-app only but require email + Teams for exclusion conflicts. Default recipients (§12.1) are the floor, not a ceiling — `user:notification_preferences` can add recipients but does not remove a trigger's mandatory default (e.g., Group Insurance always receives a coverage-gap alert regardless of individual preference overrides).

## 6. MCP Task-Tool Bindings
| Tool | Sole caller | Precondition |
| :--- | :--- | :--- |
| `atlas_raise_alert` | Alerts & Notification | Trigger row in `app:alert_trigger_table` evaluated true |
| `atlas_write_audit` | Every component | Every raised alert |

## 7. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| Recipient has no configured channel | Falls back to in-app only; flagged for admin follow-up |
| Trigger source register unavailable (e.g., `app:news_signals` empty pre-V2) | Trigger silently does not fire — not an error, just no data to evaluate |
| Duplicate trigger fire on the same underlying condition | Suppressed — one alert per open condition, not one per evaluation cycle |
| Teams/email delivery fails | In-app notification still lands; delivery failure logged, not retried indefinitely |
| Emerging-risk trigger fires pre-V2 (config error) | Rejected — FR6.8 precondition unmet; logged as a configuration fault, not delivered |
