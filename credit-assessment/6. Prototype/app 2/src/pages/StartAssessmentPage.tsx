import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, useCurrentUser } from "../store/useStore";
import { assessmentsForCustomer, customerVisibleToUser } from "../store/selectors";
import { Card, SectionHeading, Button } from "../components/Card";
import { formatDate } from "../utils/format";

export function StartAssessmentPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const createNewAssessment = useStore((s) => s.createNewAssessment);
  const createRefreshAssessment = useStore((s) => s.createRefreshAssessment);
  const createCustomer = useStore((s) => s.createCustomer);

  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return customers
      .filter((c) => c.name.toLowerCase().includes(q))
      .map((c) => ({ customer: c, custAssessments: assessmentsForCustomer(assessments, c.id) }))
      .filter(({ customer, custAssessments }) => customerVisibleToUser(user, customer, custAssessments));
  }, [query, customers, assessments, user]);

  if (user.role !== "Analyst") {
    return (
      <Card>
        <p className="text-[var(--crit)]">Only an Analyst can prepare an assessment (FR8.3). Switch role to Alice Chen or Ben Osei to continue.</p>
      </Card>
    );
  }

  function startNew(customerId: string) {
    const id = createNewAssessment(customerId);
    navigate(`/assessments/${id}`);
  }

  function startRefresh(customerId: string, sourceAssessmentId: string) {
    const id = createRefreshAssessment(customerId, sourceAssessmentId);
    navigate(`/assessments/${id}`);
  }

  function createAndStart() {
    if (!newName.trim()) return;
    const id = createCustomer(newName.trim(), newIndustry.trim() || "Unspecified");
    startNew(id);
  }

  return (
    <div className="max-w-2xl">
      <SectionHeading
        eyebrow="FR8.3"
        title="Prepare Assessment"
        dek="Search for an existing customer — New Assessment if they have no prior assessment, Refresh Assessment if they do — or create a new customer record."
      />

      <Card className="mb-6">
        <label className="block text-sm font-medium mb-2">Search customers</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a customer name…"
          className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]"
        />
        {query.trim() && (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {results.map(({ customer, custAssessments }) => {
              const mostRecent = custAssessments[0];
              return (
                <li key={customer.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-xs text-[var(--muted)]">{customer.industry}</div>
                  </div>
                  {custAssessments.length === 0 ? (
                    <Button onClick={() => startNew(customer.id)}>New Assessment</Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        defaults to v{mostRecent.version} ({formatDate(mostRecent.createdAt)})
                      </span>
                      <Button onClick={() => startRefresh(customer.id, mostRecent.id)}>Refresh Assessment</Button>
                    </div>
                  )}
                </li>
              );
            })}
            {results.length === 0 && <li className="py-3 text-[var(--muted)] text-sm">No matching customers in your scope.</li>}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title="Or create a new customer" />
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Customer name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Industry</label>
            <input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)]" />
          </div>
          <Button onClick={createAndStart} disabled={!newName.trim()}>
            Create customer & start New Assessment
          </Button>
        </div>
      </Card>
    </div>
  );
}
