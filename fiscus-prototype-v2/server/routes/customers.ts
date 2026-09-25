import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { customers } from "../db/schema.js";
import { nextId } from "../lib/ids.js";
import { requireActor } from "../lib/actor.js";

const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  industry: z.string().trim().min(1),
});

export const customersRoute = new Hono();

customersRoute.post("/", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);

  const parsed = createCustomerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const id = nextId("c");
  const [customer] = await db
    .insert(customers)
    .values({ id, name: parsed.data.name, industry: parsed.data.industry, relationshipOwner: actor })
    .returning();

  return c.json(customer, 201);
});

export default customersRoute;
