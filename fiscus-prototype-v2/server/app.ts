import { Hono } from "hono";
import { createSessionCookie, clearSessionCookie, requireSession, hasValidSession } from "./lib/auth.js";
import { customersRoute } from "./routes/customers.js";
import { assessmentsRoute } from "./routes/assessments.js";
import { bootstrapRoute } from "./routes/bootstrap.js";
import { documentsRoute } from "./routes/documents.js";
import { fieldsRoute } from "./routes/fields.js";
import { fieldReviewRoute } from "./routes/fieldReview.js";

// Mounted under /api both in local dev (dev-server.ts) and on Vercel
// (vercel.json rewrites /api/* to this handler). Single Hono app so
// middleware — the session-auth gate — lives in exactly one place.
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  const expected = process.env.APP_PASSWORD;
  if (!expected) return c.json({ error: "Server is not configured with APP_PASSWORD" }, 500);
  if (body.password !== expected) return c.json({ error: "Incorrect password" }, 401);
  await createSessionCookie(c);
  return c.json({ ok: true });
});

app.post("/auth/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/auth/session", async (c) => {
  // Cheap probe the frontend uses on load to decide login-screen vs app-shell.
  return c.json({ authenticated: await hasValidSession(c) });
});

// Everything below this line requires a valid session.
app.use("/*", requireSession);

app.route("/bootstrap", bootstrapRoute);
app.route("/customers", customersRoute);
app.route("/assessments", assessmentsRoute);
app.route("/assessments", documentsRoute);
app.route("/assessments", fieldReviewRoute);
app.route("/fields", fieldsRoute);

export default app;
