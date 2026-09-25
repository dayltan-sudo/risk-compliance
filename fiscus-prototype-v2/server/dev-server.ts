import { config } from "dotenv";
// .env holds hand-set local-only vars (APP_PASSWORD, SESSION_SECRET,
// API_PORT); .env.local is Vercel-managed (`vercel env pull`) and gets
// overwritten wholesale on every pull, so it never carries the former.
config({ path: ".env" });
config({ path: ".env.local" });
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.API_PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Fiscus API dev server listening on http://localhost:${info.port}`);
});
