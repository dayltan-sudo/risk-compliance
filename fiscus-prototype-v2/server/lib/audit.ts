import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { nextId, nowStamp } from "./ids.js";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  actor: string;
  action: string;
  beforeValue?: string | null;
  afterValue?: string | null;
}

/** FR9.1/FR9.2 — every module, every write, no exceptions. Append-only: no
 * update/delete path exists anywhere in this codebase for audit_log. */
export async function writeAudit(entry: AuditEntry) {
  await db.insert(auditLog).values({
    id: nextId("audit"),
    entityType: entry.entityType,
    entityId: entry.entityId,
    actor: entry.actor,
    action: entry.action,
    beforeValue: entry.beforeValue ?? null,
    afterValue: entry.afterValue ?? null,
    timestamp: nowStamp(),
  });
}
