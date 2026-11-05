import { getRequestListener } from '@hono/node-server';
import app from '../server/index';

/**
 * Vercel Node function entry point.
 *
 * Vercel's Node runtime calls the default export as `(req: IncomingMessage,
 * res: ServerResponse)`. `hono/vercel`'s `handle()` is the *edge* adapter —
 * `(req: Request) => app.fetch(req)` — so it hands an IncomingMessage to
 * `app.fetch` and every call fails. `getRequestListener` is the Node adapter:
 * it builds a Request from the incoming stream, runs the app, and writes the
 * Response back onto the response object.
 */
export default getRequestListener(app.fetch);
