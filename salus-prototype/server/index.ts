import { Hono } from 'hono';

import { portfolio } from '../src/data/portfolio';
import { isIsoDate } from '../src/engine/dates';
import { groupSummary } from '../src/engine/summary';
import { assistantRoutes } from './routes/assistant';
import { auditRoutes } from './routes/audit';
import { configureDocumentRoutes, documentQueue, documentRoutes } from './routes/documents';
import { createUploadRoutes } from './routes/upload';
import { questionnaireRoutes } from './routes/questionnaire';
import { exportRoutes } from './routes/export';
import { readSession, sessionRoutes } from './routes/session';
import { scopeFor, scopedPortfolio } from './middleware/scope';
import { fixtureExtractionClient } from '../src/ingestion/fixtureClient';
import { openAiExtractionClient, type ExtractionClient } from '../src/ingestion/client';

/**
 * Extraction has two paths and they are deliberately separate.
 *
 * - A configured model (`SALUS_EXTRACTION_BASE_URL`, `_MODEL`, `_API_KEY`) reads
 *   real uploads. Values live in the environment, never in this file.
 * - Without it, `/api/documents` replays checked-in fixtures (the demo path for
 *   saved examples) and `/api/documents/upload` falls back to deterministic
 *   label matching over the parsed text, reporting `source: "rules"` so nobody
 *   mistakes it for a model read.
 */
function extractionClientFromEnv(): ExtractionClient | undefined {
  const baseUrl = (process.env['SALUS_EXTRACTION_BASE_URL'] ?? '').trim();
  const model = (process.env['SALUS_EXTRACTION_MODEL'] ?? '').trim();
  const apiKey = process.env['SALUS_EXTRACTION_API_KEY'] ?? '';

  if (baseUrl === '' || model === '') return undefined;
  return openAiExtractionClient({ baseUrl, model, apiKey });
}

const modelClient = extractionClientFromEnv();

configureDocumentRoutes(modelClient ?? fixtureExtractionClient());

/**
 * The API reads the in-memory seed, never the database, so every route works on
 * a fresh clone with no Postgres running. Feature routes live in `routes/` and
 * are mounted here; none of them imports another.
 */
const app = new Hono();

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'salus-api',
    mode: 'seed',
    extraction: modelClient === undefined ? 'rules-and-fixtures' : 'model',
  }),
);

/**
 * The roll-up of the book the session may see. A group role gets the whole
 * portfolio (the same object, so the figures are unchanged); an Entity
 * Champion gets their own entity's figures.
 */
app.get('/api/summary', async (c) => {
  const requested = c.req.query('asOf');
  const asOf = requested === undefined || requested === '' ? portfolio.config.effectiveFrom : requested;

  if (!isIsoDate(asOf)) {
    return c.json({ error: `asOf must be an ISO date (YYYY-MM-DD), received ${asOf}` }, 400);
  }

  const session = await readSession(c);

  return c.json({
    asOf,
    source: 'seed',
    role: session.role,
    scope: scopeFor(portfolio, session),
    ...groupSummary(scopedPortfolio(portfolio, session), asOf),
  });
});

app.route('/', documentRoutes);
app.route(
  '/',
  // Uploads never use the fixture client: a real file has no fixture id, so the
  // honest choices are a model or the rules path, not a replay.
  createUploadRoutes({ queue: documentQueue, resolveClient: () => modelClient }),
);
// The manual path: no file, no model, the same queue and the same validator.
app.route('/', questionnaireRoutes);
app.route('/', assistantRoutes);
app.route('/', auditRoutes);
app.route('/', exportRoutes);
app.route('/', sessionRoutes);

export default app;
