import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const COOKIE_NAME = "fiscus_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — shared-password gate; the chosen user is attribution, not authentication

declare module "hono" {
  interface ContextVariableMap {
    actor: string;
  }
}

export interface SessionUser {
  userId: string;
  actor: string;
}

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ role: "user", userId: user.userId, actor: user.actor })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function createSessionCookie(c: Context, user: SessionUser) {
  setCookie(c, COOKIE_NAME, await signSession(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

/** Null for a missing/invalid/expired token, and for a pre-actor token minted
 * before sessions carried a user — those must sign in again. */
export async function readSession(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.actor !== "string" || !payload.actor || typeof payload.userId !== "string") return null;
    return { userId: payload.userId, actor: payload.actor };
  } catch {
    return null;
  }
}

/** Every /api route except /api/auth/* and /api/health requires a valid
 * session cookie. The audit actor is taken from the signed session — never
 * from a client-supplied header. */
export async function requireSession(c: Context, next: Next) {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Not authenticated" }, 401);
  c.set("actor", session.actor);
  await next();
}
