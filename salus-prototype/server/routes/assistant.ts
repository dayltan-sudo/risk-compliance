import { Hono } from 'hono';
import { z } from 'zod';

import { openAiAssistantModel, type AssistantModel } from '../../src/assistant/client';
import { AssistantCitationError, runAssistant, type Answer } from '../../src/assistant/run';
import { portfolio } from '../../src/data/portfolio';
import { BODY_LIMITS, bodyTooLarge, readJsonBody } from '../middleware/body';
import { scopeFor } from '../middleware/scope';
import { readSession } from './session';

/**
 * P6 assistant route.
 *
 * Mount this sub-app at the root: it owns `/api/assistant`. Model resolution
 * happens per request, in this file only, so the orchestrator can mount the
 * sub-app before deciding how it is configured:
 *
 *   1. an explicitly injected model (tests, fixtures),
 *   2. a model set through `configureAssistantRoutes`,
 *   3. `SALUS_ASSISTANT_BASE_URL` + `SALUS_ASSISTANT_MODEL` in the environment.
 *
 * With none of those present the route returns 503. It never fakes an answer.
 *
 * Scope: the assistant's tools read the group portfolio directly, so a scoped
 * session (an Entity Champion) is refused with 403 rather than answered with
 * group figures. Lifting that needs the tools to take a scoped portfolio.
 */

export interface AssistantRoutesOptions {
  /**
   * Injected model. Pass `null` to disable both the configured model and the
   * environment fallback, which is how tests assert the 503 path without
   * depending on the host environment.
   */
  model?: AssistantModel | null;
}

const askSchema = z.object({
  question: z.string().trim().min(1, 'question is required').max(2000, 'question is too long'),
  page: z.string().trim().max(80).optional(),
});

let configuredModel: AssistantModel | undefined;

/** Set or clear the model used by the default route instance. */
export function configureAssistantRoutes(model: AssistantModel | undefined): void {
  configuredModel = model;
}

/**
 * The only place `process.env` is read for the assistant. A partially
 * configured environment is treated as unconfigured rather than guessed at.
 */
function modelFromEnv(): AssistantModel | undefined {
  const baseUrl = (process.env['SALUS_ASSISTANT_BASE_URL'] ?? '').trim();
  const model = (process.env['SALUS_ASSISTANT_MODEL'] ?? '').trim();
  if (baseUrl === '' || model === '') return undefined;
  const apiKey = (process.env['SALUS_ASSISTANT_API_KEY'] ?? '').trim();
  return openAiAssistantModel({ baseUrl, apiKey, model });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAssistantRoutes(options: AssistantRoutesOptions = {}): Hono {
  const app = new Hono();
  const explicit = options.model;

  app.post('/api/assistant', async (c) => {
    const session = await readSession(c);
    if (scopeFor(portfolio, session).kind !== 'group') {
      return c.json(
        {
          error:
            'the assistant answers from group-wide figures and is not available to a scoped session',
          code: 'assistant_group_only',
        },
        403,
      );
    }

    // The raw body is size-checked before it is parsed, so an oversized
    // question never reaches JSON.parse. The 2,000-character question limit is
    // applied by the schema below, and a body that fits but holds a longer
    // question is a 400.
    const read = await readJsonBody(c, BODY_LIMITS.assistantAsk);
    if (read.kind === 'too_large') return bodyTooLarge(c, read.limitBytes);

    const parsed = askSchema.safeParse(read.body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid request body; expected { question: string, page?: string }',
          issues: parsed.error.issues,
        },
        400,
      );
    }

    const model =
      explicit === null ? undefined : explicit ?? configuredModel ?? modelFromEnv();
    if (model === undefined) {
      return c.json(
        {
          error:
            'assistant model is not configured; set SALUS_ASSISTANT_BASE_URL and SALUS_ASSISTANT_MODEL (and SALUS_ASSISTANT_API_KEY if the provider requires one)',
        },
        503,
      );
    }

    try {
      const answer: Answer = await runAssistant(parsed.data.question, {
        model,
        ...(parsed.data.page === undefined ? {} : { page: parsed.data.page }),
      });
      return c.json(answer);
    } catch (error) {
      if (error instanceof AssistantCitationError) {
        return c.json(
          { error: 'assistant produced an uncited figure; answer blocked', detail: error.message },
          502,
        );
      }
      return c.json({ error: 'assistant request failed', detail: messageOf(error) }, 502);
    }
  });

  return app;
}

/** Sub-app for the orchestrator to mount. Resolves its model per request. */
export const assistantRoutes = createAssistantRoutes();
