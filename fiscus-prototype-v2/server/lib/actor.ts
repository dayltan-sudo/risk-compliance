import type { Context } from "hono";

/** FR9.1 actor attribution. Set by requireSession from the signed session
 * cookie (the user chosen at login / via the header picker); the client
 * cannot supply or spoof it. */
export function requireActor(c: Context): string | null {
  return c.get("actor") ?? null;
}
