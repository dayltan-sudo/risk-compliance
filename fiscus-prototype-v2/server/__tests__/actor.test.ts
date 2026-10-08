import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { app } from "../app.js";
import { call, cookieFor, seedAssessment } from "./fixtures.js";
import { auditLog, extractedFields } from "../db/schema.js";

function cookieFrom(res: Response) {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

// P0 #8 — the audit actor comes from the signed session, never a client header.
describe("session-bound actor", () => {
  it("login requires a known user and records their display name in the session", async () => {
    const login = (userId?: string, password = process.env.APP_PASSWORD) =>
      app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, userId }) });

    expect((await login(undefined)).status).toBe(400);
    expect((await login("u-nobody")).status).toBe(400);
    expect((await login("u-ben", "wrong")).status).toBe(401);

    const ok = await login("u-ben");
    expect(ok.status).toBe(200);
    const session = await app.request("/api/auth/session", { headers: { cookie: cookieFrom(ok) } });
    expect(await session.json()).toEqual({ authenticated: true, userId: "u-ben" });
  });

  it("ignores a spoofed X-Actor header; the audit row carries the session's actor", async () => {
    await seedAssessment({ id: "a1" });
    const res = await call("POST", "/fields/f-a1-FY2026-Sales/confirm", {}, { actor: "Ben Osei", userId: "u-ben", headers: { "x-actor": "Mallory" } });
    expect(res.status).toBe(200);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, "f-a1-FY2026-Sales"));
    expect(rows.map((r) => r.actor)).toEqual(["Ben Osei"]);
    expect((await db.select().from(extractedFields).where(eq(extractedFields.id, "f-a1-FY2026-Sales")))[0].status).toBe("Confirmed");
  });

  it("rejects a request with no session, and a header alone is not a session", async () => {
    const res = await app.request("/api/fields/x/confirm", { method: "POST", headers: { "x-actor": "Alice Chen", "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("rejects a legacy session token that carries no actor", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const res = await app.request("/api/bootstrap", { headers: { cookie: `fiscus_session=${legacy}` } });
    expect(res.status).toBe(401);
  });

  it("switching user re-signs the session so later actions are attributed to them", async () => {
    await seedAssessment({ id: "a1" });
    const sw = await app.request("/api/auth/actor", {
      method: "POST",
      headers: { cookie: await cookieFor("Alice Chen", "u-alice"), "content-type": "application/json" },
      body: JSON.stringify({ userId: "u-priya" }),
    });
    expect(sw.status).toBe(200);

    const res = await app.request("/api/fields/f-a1-FY2026-Sales/confirm", {
      method: "POST",
      headers: { cookie: cookieFrom(sw), "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, "f-a1-FY2026-Sales"));
    expect(rows[0].actor).toBe("Priya Nair");

    const bad = await app.request("/api/auth/actor", {
      method: "POST",
      headers: { cookie: await cookieFor(), "content-type": "application/json" },
      body: JSON.stringify({ userId: "u-nobody" }),
    });
    expect(bad.status).toBe(400);
  });
});
