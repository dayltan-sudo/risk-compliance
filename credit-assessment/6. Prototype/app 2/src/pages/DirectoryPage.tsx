import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore, useCurrentUser } from "../store/useStore";
import { assessmentsForCustomer, customerVisibleToUser, mostRecentAssessment } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { Badge } from "../components/Badge";
import { formatCurrency, formatDate } from "../utils/format";

export function DirectoryPage() {
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const ratings = useStore((s) => s.ratings);
  const recommendations = useStore((s) => s.recommendations);
  const user = useCurrentUser();

  const rows = useMemo(() => {
    return customers
      .map((c) => {
        const custAssessments = assessmentsForCustomer(assessments, c.id);
        if (custAssessments.length === 0) return null; // FR8.10: no route here for a customer with none
        if (!customerVisibleToUser(user, c, custAssessments)) return null;
        const recent = mostRecentAssessment(assessments, c.id)!;
        const rating = ratings.find((r) => r.assessmentId === recent.id);
        const lastApproved = custAssessments.find((a) => a.state === "Approved");
        const approvedRec = lastApproved ? recommendations.find((r) => r.assessmentId === lastApproved.id) : undefined;
        return { customer: c, recent, rating, approvedRec };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.recent.createdAt.localeCompare(a.recent.createdAt));
  }, [customers, assessments, ratings, recommendations, user]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <SectionHeading
          eyebrow="FR8.10"
          title="Customer Directory"
          dek="Every customer with at least one assessment, scoped to what you can see. Read-only — browsing here takes no action on any assessment."
        />
        <Link to="/start">
          <Button>Prepare an assessment</Button>
        </Link>
      </div>

      {user.role === "Analyst" && (
        <p className="text-xs text-[var(--muted)] mb-4 font-mono">
          Scoped to {user.name}'s own + {user.team} assessments (NFR RBAC). A customer with no assessment isn't listed — start one from{" "}
          <Link to="/start" className="underline text-[var(--accent-deep)]">Prepare Assessment</Link>.
        </p>
      )}
      {user.role === "Auditor" && (
        <p className="text-xs text-[var(--muted)] mb-4 font-mono">
          Scoped to customers with at least one completed (Approved/Rejected) assessment — FR8.10 default scope. Widening to non-completed
          assessments is OPEN in the PRD (§5).
        </p>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Customer</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Industry</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Most recent assessment</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">State</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Rating</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Approved limit / terms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customer, recent, rating, approvedRec }) => (
              <tr key={customer.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--accent-tint)] cursor-pointer">
                <td className="px-4 py-3">
                  <Link to={`/customers/${customer.id}`} className="font-semibold hover:underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{customer.industry}</td>
                <td className="px-4 py-3">
                  v{recent.version} — {formatDate(recent.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={recent.state === "Approved" ? "low" : recent.state === "Rejected" ? "crit" : recent.state === "Submitted" ? "med" : "neutral"}>
                    {recent.state}
                  </Badge>
                </td>
                <td className="px-4 py-3">{rating ? <Badge tone="accent">{rating.grade} — {rating.band}</Badge> : <span className="text-[var(--muted)]">—</span>}</td>
                <td className="px-4 py-3">
                  {approvedRec ? (
                    <span>
                      {formatCurrency(approvedRec.proposedLimit)} / {approvedRec.proposedTermsDays}d
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">No Approved assessment</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No customers visible in this scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
