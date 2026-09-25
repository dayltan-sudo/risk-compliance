import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";

export type AgentStatus = "idle" | "running" | "done" | "failed";
export type AgentType = "extraction" | "risk_commentary";

export interface AgentRow {
  agentType: AgentType;
  status: AgentStatus;
  detail: string | null;
  updatedAt: string | null;
}

// Shared by AgentActivityPanel (the assessment-wide sidebar) and
// DocumentUploadPanel (an inline "extracting…" indicator right where the
// upload happened) — both just want the same live-polled status rows.
export function useAgentActivity(assessmentId: string): AgentRow[] | null {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { agents: rows } = await api.getAgentActivity(assessmentId);
        if (!cancelled) setAgents(rows);
      } catch {
        // best-effort UI only — a failed poll just leaves the last known state
      }
    }
    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [assessmentId]);

  return agents;
}
