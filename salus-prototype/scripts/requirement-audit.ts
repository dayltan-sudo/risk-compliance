import { portfolio } from "../src/data/portfolio";
import { requirementStatus } from "../src/engine/requirements";

const p = portfolio as any;
for (const req of p.requirements) {
  const r = requirementStatus(req, p);
  console.log(
    [req.id, req.line, req.counterpartyType, r.status, r.ratio.toFixed(2), (r.note ?? "").slice(0, 90)].join(" | ")
  );
}
