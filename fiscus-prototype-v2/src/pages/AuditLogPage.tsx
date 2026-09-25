import { useMemo, useState } from "react";
import { useStore } from "../store/useStore.js";
import { Card, SectionHeading } from "../components/Card.js";
import { formatDate } from "../utils/format.js";
import type { AuditLogEntry } from "../types.js";

export function AuditLogPage() {
  const auditLog = useStore((s) => s.auditLog);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return auditLog;
    const q = filter.toLowerCase();
    return auditLog.filter((e: AuditLogEntry) => e.action.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q));
  }, [auditLog, filter]);

  const sorted = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div>
      <SectionHeading
        title="Audit Trail"
        dek="Immutable, append-only. Every extraction confidence score, confirm/amend action, computation, and approval decision is logged with actor, timestamp, and before/after value. No per-role restriction at MVP."
      />
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by action, entity type, or actor…"
        className="w-full max-w-md field mb-4"
      />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">When</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Actor</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Entity</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Action</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Before → After</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-2 text-xs font-mono whitespace-nowrap">{formatDate(e.timestamp)}</td>
                <td className="px-4 py-2 text-xs">{e.actor}</td>
                <td className="px-4 py-2 text-xs font-mono">{e.entityType}</td>
                <td className="px-4 py-2">{e.action}</td>
                <td className="px-4 py-2 text-xs text-[var(--muted)] font-mono">
                  {e.beforeValue ?? "—"} → {e.afterValue ?? "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
