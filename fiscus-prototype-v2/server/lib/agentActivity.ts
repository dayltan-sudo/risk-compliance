import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { agentActivity } from "../db/schema.js";
import { nextId, nowStamp } from "./ids.js";

export type AgentType = "extraction" | "risk_commentary";
export type AgentStatus = "idle" | "running" | "done" | "failed";

// UI-only status feed — always the current state per (assessment, agent),
// upserted in place. Never throws: a status-tracking failure must not break
// the extraction/commentary call it's tracking.
export async function setAgentStatus(assessmentId: string, agentType: AgentType, status: AgentStatus, detail: string | null): Promise<void> {
  try {
    await db
      .insert(agentActivity)
      .values({ id: nextId("agent"), assessmentId, agentType, status, detail, updatedAt: nowStamp() })
      .onConflictDoUpdate({
        target: [agentActivity.assessmentId, agentActivity.agentType],
        set: { status, detail, updatedAt: nowStamp() },
      });
  } catch {
    // best-effort only
  }
}

export async function getAgentActivity(assessmentId: string) {
  const rows = await db.select().from(agentActivity).where(eq(agentActivity.assessmentId, assessmentId));
  const byType = new Map(rows.map((r) => [r.agentType, r]));
  const agentTypes: AgentType[] = ["extraction", "risk_commentary"];
  return agentTypes.map((agentType) => {
    const row = byType.get(agentType);
    return {
      agentType,
      status: (row?.status ?? "idle") as AgentStatus,
      detail: row?.detail ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}
