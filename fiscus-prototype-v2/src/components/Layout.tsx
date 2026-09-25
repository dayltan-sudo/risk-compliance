import { useState } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { Badge } from "./Badge.js";
import { Logomark } from "./Logo.js";
import { AgentActivityPanel } from "./AgentActivityPanel.js";
import { SCORECARD_VERSION } from "../data/config.js";
import { api } from "../api/client.js";

export function Layout() {
  const assessmentMatch = useMatch("/assessments/:assessmentId");
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  async function handleLogout() {
    await api.logout();
    window.location.reload();
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-[13.5px] font-medium transition-colors ${
      isActive ? "bg-[var(--accent-tint)] text-[var(--accent-deep)]" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--paper)]"
    }`;

  return (
    <div className="min-h-screen flex">
      {assessmentMatch && (
        <AgentActivityPanel assessmentId={assessmentMatch.params.assessmentId!} expanded={agentPanelOpen} onToggle={() => setAgentPanelOpen((v) => !v)} />
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--card)]/85 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <Logomark />
              <span className="font-serif-heading text-[15px] font-semibold tracking-tight">Fiscus</span>
              <Badge tone="v2" title="Minimum viable product — full production hardening still in progress">
                MVP
              </Badge>
            </div>
            <nav className="flex items-center gap-0.5">
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
              <button onClick={handleLogout} className="text-[13.5px] font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
                Log out
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
          <Outlet />
        </main>
        <footer className="border-t border-[var(--line)] py-4">
          <div className="max-w-6xl mx-auto px-6 text-[11px] font-mono text-[var(--muted)] flex justify-between">
            <span>Scorecard: {SCORECARD_VERSION}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
