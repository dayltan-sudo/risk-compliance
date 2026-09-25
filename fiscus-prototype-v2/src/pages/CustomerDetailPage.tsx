import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../store/useStore.js";
import { assessmentsForCustomerDivision, isReturnedForRevision } from "../store/selectors.js";
import { Card, SectionHeading, Button } from "../components/Card.js";
import { AssessmentStateBadge, Badge } from "../components/Badge.js";
import { formatDate } from "../utils/format.js";

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const ratings = useStore((s) => s.ratings);
  const documents = useStore((s) => s.documents);
  const approvalDecisions = useStore((s) => s.approvalDecisions);

  const customer = customers.find((c) => c.id === customerId);
  const divisions = useMemo(
    () => Array.from(new Set(assessments.filter((a) => a.customerId === customerId).map((a) => a.division))),
    [assessments, customerId],
  );
  const division = searchParams.get("division") ?? divisions[0];

  const custAssessments = useMemo(
    () => (customerId && division ? assessmentsForCustomerDivision(assessments, customerId, division) : []),
    [assessments, customerId, division],
  );
  const custDocs = useMemo(() => documents.filter((d) => custAssessments.some((a) => a.id === d.assessmentId)), [documents, custAssessments]);

  if (!customer) return <p>Customer not found.</p>;
  if (!division) {
    return (
      <Card>
        <p className="text-[var(--muted)]">No assessments yet for this customer.</p>
      </Card>
    );
  }

  function switchDivision(d: string) {
    navigate(`/customers/${customerId}?division=${encodeURIComponent(d)}`);
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <SectionHeading title={customer.name} dek={`${customer.industry} · Relationship owner: ${customer.relationshipOwner}`} />
        <div className="flex gap-2">
          <Link to="/">
            <Button variant="secondary">← Directory</Button>
          </Link>
          <Link to={`/start?customerId=${customerId}&division=${encodeURIComponent(division)}`}>
            <Button title="Pre-selects this customer and division">New assessment for this customer</Button>
          </Link>
        </div>
      </div>

      {divisions.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-mono uppercase text-[var(--muted)]">Division</span>
          {divisions.map((d) => (
            <button
              key={d}
              onClick={() => switchDivision(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${d === division ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent-deep)]" : "border-[var(--line)] text-[var(--muted)]"}`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <SectionHeading title="Assessment history" dek={`Read-only drill-down into any prior assessment for ${division}.`} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Version</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Date</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Class</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase text-[var(--muted)]">Composite</th>
                </tr>
              </thead>
              <tbody>
                {[...custAssessments].reverse().map((a) => {
                  const rating = ratings.find((r) => r.assessmentId === a.id);
                  return (
                    <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-2">v{a.version}</td>
                      <td className="py-2">{formatDate(a.createdAt)}</td>
                      <td className="py-2">{rating ? `${rating.ratingClass}` : "—"}</td>
                      <td className="py-2">
                        {rating ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[var(--line)] rounded-full overflow-hidden">
                              <div className="h-full bg-[var(--accent)]" style={{ width: `${((rating.compositeScore - 100) / 200) * 100}%` }} />
                            </div>
                            <span className="font-mono text-xs">{rating.compositeScore}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card>
            <SectionHeading title="Assessments" dek="Read-only drill-down into any prior assessment's field, integrity-check, ratio, rating, and commentary state." />
            <ul className="divide-y divide-[var(--line)]">
              {custAssessments.map((a) => {
                const returned = isReturnedForRevision(a, approvalDecisions);
                return (
                  <li key={a.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">v{a.version}</span>
                      <AssessmentStateBadge state={a.state} returned={returned} />
                      <Badge tone="neutral">{a.relationshipType}</Badge>
                      <span className="text-xs text-[var(--muted)]">{a.periods.join(", ") || "no periods yet"}</span>
                    </div>
                    <Link to={`/assessments/${a.id}`}>
                      <Button variant="secondary">Open</Button>
                    </Link>
                  </li>
                );
              })}
              {custAssessments.length === 0 && <li className="py-3 text-[var(--muted)]">No assessments yet.</li>}
            </ul>
          </Card>
        </div>

        <Card>
          <SectionHeading title="Documents" dek="Uploaded per assessment — never shared across assessments." />
          <ul className="space-y-3">
            {custDocs.map((d) => (
              <li key={d.id} className="text-sm border-b border-[var(--line)] pb-3 last:border-0">
                <div className="font-medium">{d.fileName}</div>
                <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                  {d.type}{d.period ? ` · ${d.period}` : ""} · v{d.version} · {formatDate(d.uploadDate)} · {d.uploader}
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
