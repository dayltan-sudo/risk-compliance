import type { Context } from "hono";

/** No per-user login at MVP (single shared password gates the whole app, per
 * PRD §1: "one authenticated user type... No roles, no permission matrix").
 * The client still labels every action with a chosen name for FR9.1's
 * actor/timestamp attribution — the server just trusts and records it,
 * exactly as the prototype's USERS dropdown did against the in-memory store. */
export function requireActor(c: Context): string | null {
  const actor = c.req.header("x-actor")?.trim();
  return actor && actor.length > 0 ? actor : null;
}
