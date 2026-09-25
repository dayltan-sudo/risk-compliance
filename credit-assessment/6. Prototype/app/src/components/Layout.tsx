import { NavLink, Outlet } from "react-router-dom";
import { useStore, resetPrototypeData } from "../store/useStore";
import { USERS } from "../data/seed";
import { Badge } from "./Badge";
import { SCORECARD_VERSION } from "../data/config";

export function Layout() {
  const currentUserId = useStore((s) => s.currentUserId);
  const setCurrentUser = useStore((s) => s.setCurrentUser);

  function handleReset() {
    if (window.confirm("Reset this browser's prototype data back to the seed scenarios? Anything entered in this session will be lost.")) {
      resetPrototypeData();
    }
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-[var(--accent)] text-white" : "text-[var(--ink)] hover:bg-[var(--accent-tint)]"
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="font-serif-heading text-lg font-semibold">Fiscus</span>
            <Badge tone="v2" title="Illustrative frontend prototype, mocked data — see Credit_Assessment_PRD_MVP.md v1.2-MVP">
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
                  {u.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleReset}
              title="Clears this browser's persisted prototype data and reloads the seed scenarios"
              className="text-xs text-[var(--muted)] hover:text-[var(--crit)] hover:underline"
            >
              Reset data
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--line)] py-3">
        <div className="max-w-6xl mx-auto px-6 text-[11px] font-mono text-[var(--muted)] flex justify-between">
          <span>Scorecard: {SCORECARD_VERSION} — methodology closed by Baseline_Scorecard_Extract_v1.2.md</span>
          <span>Derived from Credit_Assessment_PRD_MVP.md (v1.2-MVP)</span>
        </div>
      </footer>
    </div>
  );
}
