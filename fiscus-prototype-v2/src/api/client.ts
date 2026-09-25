// Thin fetch wrapper for the Hono API under /api (proxied by Vite in dev,
// same-origin in production — see vite.config.ts / vercel.json). The store
// (useStore.ts) is the only consumer; components never import this directly.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  actor?: string;
  body?: unknown; // JSON-serializable, or a FormData instance for uploads
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const isFormData = opts.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: {
      ...(opts.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(opts.actor ? { "X-Actor": opts.actor } : {}),
    },
    body: opts.body === undefined ? undefined : isFormData ? (opts.body as FormData) : JSON.stringify(opts.body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (data && (data.reason ?? data.error)) || res.statusText || "Request failed";
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  login: (password: string) => request<{ ok: boolean }>("/auth/login", { method: "POST", body: { password } }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  session: () => request<{ authenticated: boolean }>("/auth/session"),

  bootstrap: () =>
    request<{
      customers: unknown[];
      assessments: unknown[];
      ratings: unknown[];
      documents: unknown[];
      approvalDecisions: unknown[];
      auditLog: unknown[];
    }>("/bootstrap"),

  createCustomer: (name: string, industry: string, actor: string) => request("/customers", { method: "POST", actor, body: { name, industry } }),

  startAssessment: (customerId: string, division: string, actor: string) => request("/assessments", { method: "POST", actor, body: { customerId, division } }),

  getAssessment: (id: string) => request(`/assessments/${id}`),

  getAgentActivity: (id: string) =>
    request<{ agents: { agentType: "extraction" | "risk_commentary"; status: "idle" | "running" | "done" | "failed"; detail: string | null; updatedAt: string | null }[] }>(
      `/assessments/${id}/agent-activity`,
    ),

  overrideRelationshipType: (id: string, newValue: string, reason: string, actor: string) =>
    request(`/assessments/${id}/relationship-type`, { method: "PATCH", actor, body: { newValue, reason } }),

  submitAssessment: (id: string, actor: string) => request<{ ok: boolean; reason?: string }>(`/assessments/${id}/submit`, { method: "POST", actor, body: {} }),

  decideAssessment: (id: string, action: "Approve" | "Reject" | "Return", comments: string, actor: string) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${id}/decision`, { method: "POST", actor, body: { action, comments } }),

  uploadDocument: (assessmentId: string, form: FormData, actor: string) => request<{ id: string }>(`/assessments/${assessmentId}/documents`, { method: "POST", actor, body: form }),

  bulkConfirmHigh: (assessmentId: string, actor: string) => request<{ ok: boolean; confirmed: number }>(`/assessments/${assessmentId}/bulk-confirm-high`, { method: "POST", actor, body: {} }),

  confirmField: (fieldId: string, value: number | boolean | null | undefined, actor: string) =>
    request<{ ok: boolean }>(`/fields/${fieldId}/confirm`, { method: "POST", actor, body: value === undefined ? {} : { value } }),

  amendField: (fieldId: string, value: number | boolean | null, reason: string, actor: string) =>
    request<{ ok: boolean }>(`/fields/${fieldId}/amend`, { method: "POST", actor, body: { value, reason } }),

  confirmCriterion: (assessmentId: string, criterionNumber: number, values: object, actor: string) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${assessmentId}/criteria/${criterionNumber}/confirm`, { method: "POST", actor, body: values }),

  amendCriterion: (assessmentId: string, criterionNumber: number, values: object, reason: string | undefined, actor: string) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${assessmentId}/criteria/${criterionNumber}/amend`, { method: "POST", actor, body: { ...values, reason } }),
};
