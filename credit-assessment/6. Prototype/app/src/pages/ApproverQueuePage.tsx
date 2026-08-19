import { Link } from "react-router-dom";
import { useStore, useCurrentUser } from "../store/useStore";
import { Card, SectionHeading, Button } from "../components/Card";
import { formatDate } from "../utils/format";

export function ApproverQueuePage() {
  const user = useCurrentUser();
  const assessments = useStore((s) => s.assessments);
  const customers = useStore((s) => s.customers);
  const ratings = useStore((s) => s.ratings);
  const recommendations = useStore((s) => s.recommendations);

  if (user.role !== "Approver") {
    return (
      <Card>
        <p className="text-[var(--crit)]">Only an Approver can review this queue. Switch role to Priya Nair to continue.</p>
      </Card>
    );
  }

  const submitted = assessments.filter((a) => a.state === "Submitted").sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div>
      <SectionHeading eyebrow="FR7.2" title="Approver Queue" dek="Only a Submitted assessment is visible here. Full extraction, ratio, and rating lineage plus the audit trail are available on open (FR7.3)." />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Customer</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Version</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Prepared by</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]">Rating</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase text-[var(--muted)]"></th>
            </tr>
          </thead>
          <tbody>
            {submitted.map((a) => {
              const customer = customers.find((c) => c.id === a.customerId);
              const rating = ratings.find((r) => r.assessmentId === a.id);
              const rec = recommendations.find((r) => r.assessmentId === a.id);
              const selfPrepared = a.createdBy === user.id;
              return (
                <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 font-semibold">{customer?.name}</td>
                  <td className="px-4 py-3">
                    v{a.version} · {formatDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">{a.createdBy}{selfPrepared && <span className="text-[var(--crit)] text-xs ml-1">(you — FR7.5 blocks deciding this one)</span>}</td>
                  <td className="px-4 py-3">
                    {rating ? `${rating.grade} — proposed ${rec ? `${rec.currency} ${rec.proposedLimit.toLocaleString()}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/assessments/${a.id}`}>
                      <Button variant="secondary">Review</Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {submitted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  Nothing pending approval.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
