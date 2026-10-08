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
  body?: unknown; // JSON-serializable, or a FormData instance for uploads
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const isFormData = opts.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: {
      ...(opts.body && !isFormData ? { "Content-Type": "application/json" } : {}),
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
  login: (password: string, userId: string) => request<{ ok: boolean }>("/auth/login", { method: "POST", body: { password, userId } }),
  setActor: (userId: string) => request<{ ok: boolean }>("/auth/actor", { method: "POST", body: { userId } }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  session: () => request<{ authenticated: boolean; userId: string | null }>("/auth/session"),

  bootstrap: () =>
    request<{
      customers: unknown[];
      assessments: unknown[];
      ratings: unknown[];
      documents: unknown[];
      approvalDecisions: unknown[];
      auditLog: unknown[];
    }>("/bootstrap"),

  createCustomer: (name: string, industry: string) => request("/customers", { method: "POST", body: { name, industry } }),

  startAssessment: (customerId: string, division: string) => request("/assessments", { method: "POST", body: { customerId, division } }),

  getAssessment: (id: string) => request(`/assessments/${id}`),

  getAgentActivity: (id: string) =>
    request<{ agents: { agentType: "extraction" | "risk_commentary"; status: "idle" | "running" | "done" | "failed"; detail: string | null; updatedAt: string | null }[] }>(
      `/assessments/${id}/agent-activity`,
    ),

  overrideRelationshipType: (id: string, newValue: string, reason: string) =>
    request(`/assessments/${id}/relationship-type`, { method: "PATCH", body: { newValue, reason } }),

  submitAssessment: (id: string) => request<{ ok: boolean; reason?: string }>(`/assessments/${id}/submit`, { method: "POST", body: {} }),

  decideAssessment: (id: string, action: "Approve" | "Reject" | "Return", comments: string) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${id}/decision`, { method: "POST", body: { action, comments } }),

  uploadDocument: (assessmentId: string, form: FormData) => request<{ id: string }>(`/assessments/${assessmentId}/documents`, { method: "POST", body: form }),

  bulkConfirmHigh: (assessmentId: string) => request<{ ok: boolean; confirmed: number }>(`/assessments/${assessmentId}/bulk-confirm-high`, { method: "POST", body: {} }),

  confirmField: (fieldId: string, value: number | boolean | null | undefined) =>
    request<{ ok: boolean }>(`/fields/${fieldId}/confirm`, { method: "POST", body: value === undefined ? {} : { value } }),

  amendField: (fieldId: string, value: number | boolean | null, reason: string) =>
    request<{ ok: boolean }>(`/fields/${fieldId}/amend`, { method: "POST", body: { value, reason } }),

  confirmCriterion: (assessmentId: string, criterionNumber: number, values: object) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${assessmentId}/criteria/${criterionNumber}/confirm`, { method: "POST", body: values }),

  amendCriterion: (assessmentId: string, criterionNumber: number, values: object, reason: string | undefined) =>
    request<{ ok: boolean; reason?: string }>(`/assessments/${assessmentId}/criteria/${criterionNumber}/amend`, { method: "POST", body: { ...values, reason } }),
};
