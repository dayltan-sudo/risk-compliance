import { Hono } from 'hono';

import { portfolio } from '../src/data/portfolio';
import { isIsoDate } from '../src/engine/dates';
import { groupSummary } from '../src/engine/summary';
import { assistantRoutes } from './routes/assistant';
import { auditRoutes } from './routes/audit';
import { configureDocumentRoutes, documentRoutes } from './routes/documents';
import { exportRoutes } from './routes/export';
import { sessionRoutes } from './routes/session';
import { fixtureExtractionClient } from '../src/ingestion/fixtureClient';

/**
 * Ingestion is wired to the fixture-replay client so the pipeline is
 * demonstrable with no model key and no network. Swapping in the real model is
 * one line: `configureDocumentRoutes(openAiExtractionClient(env))`.
 */
configureDocumentRoutes(fixtureExtractionClient());

/**
 * The API reads the in-memory seed, never the database, so every route works on
 * a fresh clone with no Postgres running. Feature routes live in `routes/` and
 * are mounted here; none of them imports another.
 */
const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, service: 'salus-api', mode: 'seed' }));

app.get('/api/summary', (c) => {
  const requested = c.req.query('asOf');
  const asOf = requested === undefined || requested === '' ? portfolio.config.effectiveFrom : requested;

  if (!isIsoDate(asOf)) {
    return c.json({ error: `asOf must be an ISO date (YYYY-MM-DD), received ${asOf}` }, 400);
  }

  return c.json({
    asOf,
    source: 'seed',
    ...groupSummary(portfolio, asOf),
  });
});

app.route('/', documentRoutes);
app.route('/', assistantRoutes);
app.route('/', auditRoutes);
app.route('/', exportRoutes);
app.route('/', sessionRoutes);

export default app;
