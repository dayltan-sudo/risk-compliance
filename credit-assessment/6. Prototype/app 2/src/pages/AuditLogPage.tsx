import { useMemo, useState } from "react";
import { useStore, useCurrentUser } from "../store/useStore";
import { auditLogVisibleToUser } from "../store/selectors";
import { Card, SectionHeading } from "../components/Card";
import { formatDate } from "../utils/format";

export function AuditLogPage() {
  const user = useCurrentUser();
  const auditLog = useStore((s) => s.auditLog);
  const assessments = useStore((s) => s.assessments);
  const customers = useStore((s) => s.customers);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => auditLogVisibleToUser(user, auditLog, assessments, customers), [user, auditLog, assessments, customers]);
  const filtered = useMemo(() => {
    if (!filter.trim()) return visible;
    const q = filter.toLowerCase();
    return visible.filter((e) => e.action.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q));
  }, [visible, filter]);

  const sorted = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div>
      <SectionHeading
        eyebrow="FR9"
        title="Audit Trail"
        dek="Immutable, append-only (FR9.2). Every extraction confidence score, confirm/amend action, computation, and approval decision is logged with actor, timestamp, and before/after value (FR9.1)."
      />
      {user.role === "Analyst" && (
        <p className="text-xs text-[var(--muted)] mb-4 font-mono">
          FR9.3 leaves Analyst read access to their own assessments' entries OPEN — this prototype resolves it as "yes, scoped to what you can
          see" rather than leaving the screen empty.
        </p>
      )}
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by action, entity type, or actor…"
        className="w-full max-w-md border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)] mb-4"
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
                  No entries in scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
