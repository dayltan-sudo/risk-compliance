import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore, useCurrentUser } from "../store/useStore";
import { assessmentsForCustomer, customerVisibleToUser, isReturnedForRevision } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { AssessmentStateBadge, Badge } from "../components/Badge";
import { formatCurrency, formatDate } from "../utils/format";

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const ratings = useStore((s) => s.ratings);
  const recommendations = useStore((s) => s.recommendations);
  const documents = useStore((s) => s.documents);
  const approvalDecisions = useStore((s) => s.approvalDecisions);
  const createRefreshAssessment = useStore((s) => s.createRefreshAssessment);

  const customer = customers.find((c) => c.id === customerId);
  const custAssessments = useMemo(() => (customerId ? assessmentsForCustomer(assessments, customerId) : []), [assessments, customerId]);
  const custDocs = useMemo(() => documents.filter((d) => d.customerId === customerId), [documents, customerId]);

  if (!customer) return <p>Customer not found.</p>;

  const visible = customerVisibleToUser(user, customer, custAssessments);
  if (!visible) {
    return (
      <Card>
        <p className="text-[var(--crit)]">You don't have access to this customer's assessments (NFR RBAC).</p>
      </Card>
    );
  }

  const canRefresh = user.role === "Analyst"; // FR8.3 rights — role boundary, not per-customer ownership
  const mostRecent = custAssessments[0];

  function refreshFrom(sourceId: string) {
    const id = createRefreshAssessment(customerId!, sourceId);
    navigate(`/assessments/${id}`);
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <SectionHeading eyebrow="FR8.11" title={customer.name} dek={`${customer.industry} · Relationship owner: ${customer.relationshipOwner}`} />
        <div className="flex gap-2">
          <Link to="/">
            <Button variant="secondary">← Directory</Button>
          </Link>
          {canRefresh && custAssessments.length > 0 && (
            <Button onClick={() => refreshFrom(mostRecent.id)} title="FR8.11 → FR8.3: pre-selects this customer and the most recent assessment as refresh source">
              Refresh this customer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <SectionHeading eyebrow="FR8.6" title="Assessment history trend" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Version</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Date</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Grade</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Score</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Limit / Terms</th>
                </tr>
              </thead>
              <tbody>
                {[...custAssessments].reverse().map((a) => {
                  const rating = ratings.find((r) => r.assessmentId === a.id);
                  const rec = recommendations.find((r) => r.assessmentId === a.id);
                  return (
                    <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-2">v{a.version}</td>
                      <td className="py-2">{formatDate(a.createdAt)}</td>
                      <td className="py-2">{rating ? `${rating.grade} — ${rating.band}` : "—"}</td>
                      <td className="py-2">
                        {rating ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[var(--line)] rounded-full overflow-hidden">
                              <div className="h-full bg-[var(--accent)]" style={{ width: `${rating.compositeScore}%` }} />
                            </div>
                            <span className="font-mono text-xs">{rating.compositeScore}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        {a.state === "Approved" && rec ? `${formatCurrency(rec.proposedLimit)} / ${rec.proposedTermsDays}d` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <SectionHeading eyebrow="FR8.5" title="Assessments" dek="Read-only drill-down into any prior assessment's field, ratio, rating, and recommendation state." />
            <ul className="divide-y divide-[var(--line)]">
              {custAssessments.map((a) => {
                const returned = isReturnedForRevision(a, approvalDecisions);
                return (
                  <li key={a.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">v{a.version}</span>
                      <AssessmentStateBadge state={a.state} returned={returned} />
                      <span className="text-xs text-[var(--muted)]">{a.periods.join(", ") || "no periods yet"}</span>
                      {a.sourceAssessmentId && <span className="text-xs text-[var(--muted)] font-mono">refresh of v{custAssessments.find((x) => x.id === a.sourceAssessmentId)?.version}</span>}
                    </div>
                    <div className="flex gap-2">
                      {canRefresh && (
                        <Button variant="ghost" onClick={() => refreshFrom(a.id)}>
                          Refresh from this version
                        </Button>
                      )}
                      <Link to={`/assessments/${a.id}`}>
                        <Button variant="secondary">Open</Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
              {custAssessments.length === 0 && <li className="py-3 text-[var(--muted)]">No assessments yet.</li>}
            </ul>
          </Card>
        </div>

        <Card>
          <SectionHeading eyebrow="FR1.9" title="Documents" dek="Version history and which assessments currently reference each document." />
          <ul className="space-y-3">
            {custDocs.map((d) => (
              <li key={d.id} className="text-sm border-b border-[var(--line)] pb-3 last:border-0">
                <div className="font-medium">{d.fileName}</div>
                <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                  {d.type}{d.period ? ` · ${d.period}` : ""} · v{d.version} · {formatDate(d.uploadDate)} · {d.uploader}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.referencedByAssessmentIds.map((aid) => {
                    const a = custAssessments.find((x) => x.id === aid);
                    return a ? (
                      <Badge key={aid} tone="neutral">
                        v{a.version}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </li>
            ))}
            {custDocs.length === 0 && <li className="text-[var(--muted)] text-sm">No documents uploaded yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
