import { handle } from 'hono/vercel';
import app from '../server/index';

/**
 * Vercel Node function entry point.
 *
 * `handle(app)` is the Node-runtime adapter. A bare `export default app` is an
 * edge-runtime shape and would fail on the Node function; this still default-
 * exports the one Hono app.
 */
export default handle(app);
