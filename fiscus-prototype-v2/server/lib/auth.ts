import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const COOKIE_NAME = "fiscus_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — single shared-password gate, not per-user identity

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionCookie(c: Context) {
  const token = await new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  setCookie(c, COOKIE_NAME, token, {
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

export async function hasValidSession(c: Context): Promise<boolean> {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

/** Every /api route except /api/auth/* and /api/health requires a valid
 * session cookie — MVP has one authenticated "user type" behind a single
 * shared password (PRD §1's NFR: "Authenticated users only"), not per-user
 * identity. */
export async function requireSession(c: Context, next: Next) {
  if (!(await hasValidSession(c))) return c.json({ error: "Not authenticated" }, 401);
  await next();
}
