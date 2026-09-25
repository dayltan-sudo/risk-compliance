// Vercel Node serverless entry point — the ONLY file under api/, so this is
// the only Serverless Function Vercel creates (every other server file lives
// under ../server/ specifically to stay out of Vercel's per-file function
// auto-detection — Hobby plan caps at 12 functions, and this app has 20+
// implementation files). Every /api/* request is routed here via
// vercel.json's rewrite, then dispatched by the single Hono app in
// server/app.ts. Local dev uses server/dev-server.ts instead (see
// vite.config.ts's proxy).
//
// A named `fetch` export, not `export default` — this runtime's Node
// function convention expects a Web-standard `(Request) => Response`
// handler under a named export (or per-HTTP-method exports); `export
// default` returning a Response is silently dropped (request hangs with no
// response) rather than erroring, which is what `hono/vercel`'s `handle()`
// wrapper produces. Hono's own `app.fetch` already has the exact signature
// this runtime wants, so no adapter is needed.
import { app } from "../server/app.js";

export const config = { runtime: "nodejs" };

export const fetch = app.fetch;
