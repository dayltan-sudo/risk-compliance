import { NavLink, Outlet } from "react-router-dom";
import { useStore } from "../store/useStore";
import { USERS } from "../data/seed";
import { Badge } from "./Badge";

export function Layout() {
  const currentUserId = useStore((s) => s.currentUserId);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const user = USERS.find((u) => u.id === currentUserId)!;
  const config = useStore((s) => s.config);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-[var(--accent)] text-white" : "text-[var(--ink)] hover:bg-[var(--accent-tint)]"
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="font-serif-heading text-lg font-semibold">Credit Assessment</span>
            <Badge tone="v2" title="Illustrative frontend prototype, mocked data — see PRD v0.10 / Architecture Plan v1.9">
              Prototype
            </Badge>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={navClass} end>
              Customer Directory
            </NavLink>
            <NavLink to="/start" className={navClass}>
              Prepare Assessment
            </NavLink>
            {user.role === "Approver" && (
              <NavLink to="/approvals" className={navClass}>
                Approver Queue
              </NavLink>
            )}
            <NavLink to="/audit" className={navClass}>
              Audit Trail
            </NavLink>
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Signed in as</span>
            <select
              value={currentUserId}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="border border-[var(--line)] rounded-md bg-[var(--card)] px-2 py-1 text-sm font-medium"
            >
              {USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--line)] py-3">
        <div className="max-w-6xl mx-auto px-6 text-[11px] font-mono text-[var(--muted)] flex justify-between">
          <span>Methodology config: {config.version} — PLACEHOLDER, pending client baseline template (PRD §5)</span>
          <span>Derived from Credit_Assessment_PRD_v0.10.md · Agent_Architecture_Plan v1.9</span>
        </div>
      </footer>
    </div>
  );
}
