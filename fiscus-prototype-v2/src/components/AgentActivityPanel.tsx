import { useAgentActivity, type AgentStatus, type AgentType } from "../hooks/useAgentActivity.js";

const AGENT_LABELS: Record<AgentType, string> = {
  extraction: "Statement Extraction",
  risk_commentary: "Risk Commentary",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "bg-[var(--muted)]",
  running: "bg-[var(--accent)] animate-pulse",
  done: "bg-[var(--low)]",
  failed: "bg-[var(--crit)]",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  running: "Running…",
  done: "Done",
  failed: "Failed",
};

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

// The two real model surfaces (Extraction, Risk Commentary) are quick,
// synchronous calls inside one HTTP request — there is no background job
// queue and no token stream to show. This polls a lightweight status row
// per agent (see server/lib/agentActivity.ts) so the workspace can show
// "running" while a request is in flight, nothing more.
//
// Rendered as a permanent flex sibling of the app shell (see Layout.tsx),
// not a fixed/absolute overlay — collapsing or expanding it resizes this
// column, so it can never sit on top of the page content next to it.
export function AgentActivityPanel({
  assessmentId,
  expanded,
  onToggle,
}: {
  assessmentId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const agents = useAgentActivity(assessmentId);

  const anyRunning = agents?.some((a) => a.status === "running") ?? false;

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        title="Show agent activity"
        className="sticky top-0 h-screen shrink-0 w-11 flex flex-col items-center gap-2 pt-5 border-r border-[var(--line)] bg-[var(--card)] hover:bg-[var(--paper)] transition-colors"
      >
        {anyRunning && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
        <span className="text-[10px] font-mono font-bold text-[var(--muted)] [writing-mode:vertical-rl] rotate-180">AGENTS</span>
      </button>
    );
  }

  return (
    <div className="sticky top-0 h-screen shrink-0 w-72 flex flex-col border-r border-[var(--line)] bg-[var(--card)] overflow-y-auto">
      <button
        onClick={onToggle}
        title="Hide agent activity"
        className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-[var(--line)] hover:bg-[var(--paper)] transition-colors"
      >
        <span className="text-[10.5px] font-mono font-bold text-[var(--muted)] uppercase tracking-wide">Model Agents</span>
        <span className="text-[var(--muted)] text-xs">✕</span>
      </button>
      <div className="flex flex-col gap-4 p-4">
        {(agents ?? []).map((a) => (
          <div key={a.agentType}>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[a.status]}`} />
              <span className="text-sm font-medium">{AGENT_LABELS[a.agentType]}</span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-0.5 ml-4">
              {STATUS_LABEL[a.status]}
              {a.updatedAt && a.status !== "idle" ? ` · ${timeAgo(a.updatedAt)}` : ""}
            </p>
            {a.detail && a.status !== "idle" && <p className="text-[11px] text-[var(--ink)] mt-1 ml-4 leading-snug">{a.detail}</p>}
          </div>
        ))}
        {agents === null && <p className="text-xs text-[var(--muted)]">Loading…</p>}
      </div>
    </div>
  );
}
