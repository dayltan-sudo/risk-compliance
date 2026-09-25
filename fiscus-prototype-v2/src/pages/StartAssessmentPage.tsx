import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store/useStore.js";
import { openAssessmentForPair } from "../store/selectors.js";
import { Card, SectionHeading, Button } from "../components/Card.js";
import { DIVISIONS } from "../data/config.js";
import { formatDate } from "../utils/format.js";

export function StartAssessmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const customers = useStore((s) => s.customers);
  const assessments = useStore((s) => s.assessments);
  const startAssessment = useStore((s) => s.startAssessment);
  const createCustomer = useStore((s) => s.createCustomer);

  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(searchParams.get("customerId") ?? "");
  const [division, setDivision] = useState(searchParams.get("division") ?? DIVISIONS[0]);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, customers]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const openExisting = selectedCustomerId ? openAssessmentForPair(assessments, selectedCustomerId, division) : undefined;

  async function begin(customerId: string) {
    const id = await startAssessment(customerId, division);
    navigate(`/assessments/${id}`);
  }

  async function createAndStart() {
    if (!newName.trim()) return;
    const id = await createCustomer(newName.trim(), newIndustry.trim() || "Unspecified");
    await begin(id);
  }

  return (
    <div className="max-w-2xl">
      <SectionHeading
        title="Prepare Assessment"
        dek="Search for an existing customer, or create a new one — then select the division conducting the assessment. A (customer, division) pair with an open Draft or Submitted assessment resumes it rather than starting a second."
      />

      <Card className="mb-6">
        <label className="block text-sm font-medium mb-2">Division conducting the assessment</label>
        <select value={division} onChange={(e) => setDivision(e.target.value)} className="w-full field mb-4">
          {DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium mb-2">Search customers</label>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedCustomerId("");
          }}
          placeholder="Start typing a customer name…"
          className="w-full field"
        />
        {query.trim() && (
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {results.map((customer) => {
              const existing = openAssessmentForPair(assessments, customer.id, division);
              return (
                <li key={customer.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-xs text-[var(--muted)]">{customer.industry}</div>
                  </div>
                  <Button onClick={() => begin(customer.id)}>
                    {existing ? `Resume v${existing.version} (${existing.state})` : "New Assessment"}
                  </Button>
                </li>
              );
            })}
            {results.length === 0 && <li className="py-3 text-[var(--muted)] text-sm">No matching customers.</li>}
          </ul>
        )}
        {selectedCustomer && (
          <div className="mt-4 border-t border-[var(--line)] pt-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{selectedCustomer.name}</div>
              {openExisting && (
                <div className="text-xs text-[var(--muted)]">
                  Open {openExisting.state} v{openExisting.version} exists for {division} ({formatDate(openExisting.createdAt)}) — resumes automatically.
                </div>
              )}
            </div>
            <Button onClick={() => begin(selectedCustomer.id)}>{openExisting ? "Resume" : "Start"}</Button>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeading title="Or create a new customer" />
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Customer name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Industry</label>
            <input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} className="w-full field" />
          </div>
          <Button onClick={createAndStart} disabled={!newName.trim()}>
            Create customer & start New Assessment
          </Button>
        </div>
      </Card>
    </div>
  );
}
