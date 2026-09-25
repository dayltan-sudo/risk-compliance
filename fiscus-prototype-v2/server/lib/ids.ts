export function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Mirrors the prototype's src/store/useStore.ts distinction: `nowDate()` for
// day-granularity fields (Assessment.createdAt/submittedAt, ApprovalDecision.
// timestamp, upload/confirmed dates), `nowStamp()` for the audit log, which
// needs to order multiple same-day actions.
export function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowStamp(): string {
  return new Date().toISOString();
}
