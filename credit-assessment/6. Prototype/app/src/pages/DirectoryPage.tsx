import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/useStore";
import { assessmentsForCustomerDivision, customerDivisionPairs, mostRecentApprovedClass } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { Badge } from "../components/Badge";
import { formatDate } from "../utils/format";

export function DirectoryPage() {
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const ratings = useStore((s) => s.ratings);

  const rows = useMemo(() => {
    return customerDivisionPairs(assessments)
      .map(({ customerId, division }) => {
        const customer = customers.find((c) => c.id === customerId);
        if (!customer) return null;
        const pairAssessments = assessmentsForCustomerDivision(assessments, customerId, division);
        const recent = pairAssessments[0];
        const approvedRating = mostRecentApprovedClass(assessments, ratings, customerId, division);
        return { customer, division, recent, approvedRating };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.recent.createdAt.localeCompare(a.recent.createdAt));
  }, [customers, assessments, ratings]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <SectionHeading
          eyebrow="FR8.4"
          title="Customer Directory"
          dek="One row per (customer, division) pair with at least one assessment — the same customer appears once per division that has assessed them (FR8.1). Read-only."
        />
        <Link to="/start">
          <Button>Prepare an assessment</Button>
        </Link>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left">
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Customer</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Division</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Most recent assessment</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">State</th>
              <th className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-wide text-[var(--muted)]">Most recent Approved class</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customer, division, recent, approvedRating }) => (
              <tr key={`${customer.id}|${division}`} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--accent-tint)]">
                <td className="px-4 py-3">
                  <Link to={`/customers/${customer.id}?division=${encodeURIComponent(division)}`} className="font-semibold hover:underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{division}</td>
                <td className="px-4 py-3">
                  v{recent.version} — {formatDate(recent.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={recent.state === "Approved" ? "low" : recent.state === "Rejected" ? "crit" : recent.state === "Submitted" ? "med" : "neutral"}>
                    {recent.state}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {approvedRating ? <Badge tone="accent">Class {approvedRating.ratingClass} — {approvedRating.compositeScore}</Badge> : <span className="text-[var(--muted)]">No Approved assessment</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                  No assessments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
