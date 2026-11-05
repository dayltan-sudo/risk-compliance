import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'questionnaire-route-test-secret-0123456789abcdef';
});

import { ValidationQueue, type QueueItemSummary } from '../src/ingestion/queue';
import {
  captureQuestionnaire,
  HUMAN_ENTERED_CONFIDENCE,
  normalise,
  type Field,
  type QueuedField,
} from '../src/ingestion/validate';
import { BODY_LIMITS } from '../server/middleware/body';
import { auditRoutes } from '../server/routes/audit';
import { createDocumentRoutes } from '../server/routes/documents';
import {
  createQuestionnaireRoutes,
  QUESTIONNAIRE_NOTES_MAX_CHARS,
} from '../server/routes/questionnaire';
import { sessionRoutes } from '../server/routes/session';
import { forgedCookie, json, roleCookie } from './scope-http';

/**
 * FR3.9: a policy captured by hand must be the same record an extraction
 * produces - same queue, same validator, same review and post path, same
 * versioning - with provenance that says a person typed it.
 *
 * Policy PRP-2026-0001 belongs to ent-01 and is written in SGD; PRP-2026-0004
 * belongs to ent-02. The champion's default entity is ent-01.
 */

const OWN_POLICY = 'PRP-2026-0001';
const OTHER_ENTITY_POLICY = 'PRP-2026-0004';
const UNKNOWN_POLICY = 'PRP-0000-9999';

interface QuestionnaireResponse extends QueueItemSummary {
  accepted: Field[];
  queued: QueuedField[];
  rejected: unknown[];
  policy: { id: string; policyNo: string; entityId: string; currency: string };
  notes: string | null;
}

interface Listed {
  total: number;
  documents: Array<{ documentId: string; source: string; entityId: string | null }>;
}

interface Audited {
  events: Array<{ action: string; objectId: string; actor: string; entityId: string | null }>;
}

function build(): Hono {
  const queue = new ValidationQueue();
  const app = new Hono();
  app.route('/', sessionRoutes);
  app.route('/', createDocumentRoutes({ queue }));
  app.route('/', createQuestionnaireRoutes({ queue }));
  app.route('/', auditRoutes);
  return app;
}

const VALID_BODY = {
  policyNo: OWN_POLICY,
  siteName: 'Tuas DC-2',
  sumInsured: 12_000_000,
  currency: 'SGD',
  businessInterruption: 4_000_000,
  deductible: 50_000,
  notes: 'Broker email, 4 Nov 2026. Terms confirmed on the call.',
};

async function capture(
  app: Hono,
  body: unknown = VALID_BODY,
  cookie?: string,
): Promise<Response> {
  return app.request('/api/documents/questionnaire', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function listAs(app: Hono, cookie?: string): Promise<Listed> {
  const response = await app.request('/api/documents', {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return json<Listed>(response);
}

async function auditAs(app: Hono, cookie?: string): Promise<Audited> {
  const response = await app.request('/api/audit?limit=500', {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return json<Audited>(response);
}

describe('captureQuestionnaire', () => {
  it('admits typed answers at confidence 1 without asking for a page or a quote', () => {
    const normalised = captureQuestionnaire('schedule', [
      { key: 'policy_no', value: OWN_POLICY },
      { key: 'sum_insured', value: 'SGD 12,000,000' },
    ]);

    expect(HUMAN_ENTERED_CONFIDENCE).toBe(1);
    expect(normalised.accepted.map((field) => field.key)).toEqual(['policy_no', 'sum_insured']);
    for (const field of normalised.accepted) {
      expect(field.confidence).toBe(HUMAN_ENTERED_CONFIDENCE);
      expect(field.page).toBe(0);
      expect(field.quote).toBe('');
    }
    expect(normalised.queued.some((field) => field.reason === 'missing_citation')).toBe(false);
  });

  it('still queues the mandatory keys a questionnaire cannot know', () => {
    const normalised = captureQuestionnaire('schedule', [
      { key: 'policy_no', value: OWN_POLICY },
      { key: 'sum_insured', value: 'SGD 12,000,000' },
      { key: 'currency', value: 'SGD' },
    ]);

    expect(normalised.queued.map((field) => field.key)).toEqual([
      'insured_entity',
      'carrier',
      'line_of_business',
      'inception',
      'expiry',
      'premium_gross',
    ]);
    expect(normalised.queued.every((field) => field.reason === 'missing_mandatory')).toBe(true);
  });

  it('keeps the document path strict: the same uncited capture is still queued', () => {
    const normalised = normalise(
      {
        documentType: 'schedule',
        fields: [{ key: 'policy_no', value: OWN_POLICY, confidence: 1, page: 0, quote: '' }],
      },
      {},
    );

    expect(normalised.accepted).toEqual([]);
    expect(normalised.queued.find((field) => field.key === 'policy_no')?.reason).toBe(
      'missing_citation',
    );
  });
});

describe('POST /api/documents/questionnaire', () => {
  it('returns 200 with the same draft, confidence and provenance an extraction carries', async () => {
    const response = await capture(build());
    expect(response.status).toBe(200);

    const created = await json<QuestionnaireResponse>(response);
    expect(created).toMatchObject({
      status: 'queued',
      documentType: 'schedule',
      version: 0,
      source: 'questionnaire',
      entityId: null,
      policy: { id: 'pol-01', policyNo: OWN_POLICY, entityId: 'ent-01', currency: 'SGD' },
      notes: VALID_BODY.notes,
    });
    expect(created.name).toContain(OWN_POLICY);

    expect(created.accepted.map((field) => field.key)).toEqual([
      'policy_no',
      'site_name',
      'sum_insured',
      'currency',
      'bi_sum_insured',
      'deductible',
    ]);
    for (const field of created.accepted) {
      expect(field.confidence).toBe(1);
      expect(field.page).toBe(0);
    }
    expect(created.accepted.find((field) => field.key === 'sum_insured')?.value).toBe(
      'SGD 12,000,000',
    );
    expect(created.accepted.find((field) => field.key === 'bi_sum_insured')?.value).toBe(
      'SGD 4,000,000',
    );

    // 3 of the 9 mandatory keys are present, and the other 6 wait for a person.
    expect(created.completeness).toBe(33);
    expect(created.queued).toHaveLength(6);
    expect(created.unconfirmed).toHaveLength(6);
    expect(created.rejected).toEqual([]);
    expect(created.notes).toBe(VALID_BODY.notes);
  });

  it('lands in the same queue listing, marked as a questionnaire', async () => {
    const app = build();
    const created = await json<QuestionnaireResponse>(await capture(app));

    const listed = await listAs(app);
    expect(listed.total).toBe(1);
    expect(listed.documents[0]).toMatchObject({
      documentId: created.documentId,
      source: 'questionnaire',
      entityId: null,
    });

    // Same queue item id: the accept/post routes work on it unchanged.
    const posted = await app.request(`/api/documents/${created.documentId}/post`, { method: 'POST' });
    expect(posted.status).toBe(200);
    const version = await json<{ version: number; fields: Record<string, string> }>(posted);
    expect(version.version).toBe(1);
    expect(version.fields['sum_insured']).toBe('SGD 12,000,000');
  });

  it('accepts a lower-case currency and records the policy spelling', async () => {
    const response = await capture(build(), { ...VALID_BODY, currency: 'sgd' });
    expect(response.status).toBe(200);

    const created = await json<QuestionnaireResponse>(response);
    expect(created.accepted.find((field) => field.key === 'currency')?.value).toBe('SGD');
  });

  it('returns 404 for a policy the portfolio does not hold', async () => {
    const response = await capture(build(), { ...VALID_BODY, policyNo: UNKNOWN_POLICY });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'policy_not_found',
      error: expect.stringContaining(UNKNOWN_POLICY),
    });
  });

  it('returns 400 naming the currency when it disagrees with the policy', async () => {
    const response = await capture(build(), { ...VALID_BODY, currency: 'USD' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      field: 'currency',
      code: 'currency_mismatch',
      error: expect.stringContaining('SGD'),
    });
  });

  it('returns 400 naming the currency when it is not an ISO-4217 code', async () => {
    const response = await capture(build(), { ...VALID_BODY, currency: 'SGDX' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: 'currency' });
  });

  it('returns 400 with the failing field name, not a throw', async () => {
    const app = build();

    const missingPolicy = await capture(app, { ...VALID_BODY, policyNo: '' });
    expect(missingPolicy.status).toBe(400);
    expect(await missingPolicy.json()).toMatchObject({ field: 'policyNo' });

    const missingSite = await capture(app, { ...VALID_BODY, siteName: '   ' });
    expect(missingSite.status).toBe(400);
    expect(await missingSite.json()).toMatchObject({ field: 'siteName' });

    const stringAmount = await capture(app, { ...VALID_BODY, sumInsured: '12000000' });
    expect(stringAmount.status).toBe(400);
    expect(await stringAmount.json()).toMatchObject({ field: 'sumInsured' });

    const negativeAmount = await capture(app, { ...VALID_BODY, sumInsured: -1 });
    expect(negativeAmount.status).toBe(400);
    expect(await negativeAmount.json()).toMatchObject({ field: 'sumInsured' });

    const negativeDeductible = await capture(app, { ...VALID_BODY, deductible: -5 });
    expect(negativeDeductible.status).toBe(400);
    expect(await negativeDeductible.json()).toMatchObject({ field: 'deductible' });

    // Nothing that failed validation reached the queue.
    expect((await listAs(app)).total).toBe(0);
  });

  it('rejects a note over 2,000 characters with 400 and keeps 2,000', async () => {
    const app = build();

    const tooLong = await capture(app, {
      ...VALID_BODY,
      notes: 'n'.repeat(QUESTIONNAIRE_NOTES_MAX_CHARS + 1),
    });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ field: 'notes' });

    const atLimit = await capture(app, {
      ...VALID_BODY,
      notes: 'n'.repeat(QUESTIONNAIRE_NOTES_MAX_CHARS),
    });
    expect(atLimit.status).toBe(200);
  });

  it('refuses an oversized body with 413 before it is parsed', async () => {
    const response = await capture(build(), {
      ...VALID_BODY,
      notes: 'n'.repeat(5 * 1024 * 1024),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ limitBytes: BODY_LIMITS.questionnaire });
  });

  it('keeps a malformed JSON body at 400', async () => {
    const response = await capture(build(), '{');
    expect(response.status).toBe(400);
  });
});

describe('questionnaire scope', () => {
  it('lets a champion capture against a policy in their own entity', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');

    const response = await capture(app, VALID_BODY, champion);
    expect(response.status).toBe(200);
    const created = await json<QuestionnaireResponse>(response);
    expect(created.entityId).toBe('ent-01');

    // The champion sees it; the other entity's session does not.
    expect((await listAs(app, champion)).documents.map((item) => item.documentId)).toEqual([
      created.documentId,
    ]);
    const other = await forgedCookie('Entity Champion', 'ent-02');
    expect(await listAs(app, other)).toEqual({ total: 0, documents: [] });
    const refused = await app.request(`/api/documents/${created.documentId}/post`, {
      method: 'POST',
      headers: { Cookie: other },
    });
    expect(refused.status).toBe(403);
  });

  it('returns 403 for a policy outside the session and 404 for one that does not exist', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');

    const outOfScope = await capture(app, { ...VALID_BODY, policyNo: OTHER_ENTITY_POLICY }, champion);
    expect(outOfScope.status).toBe(403);
    expect(await outOfScope.json()).toMatchObject({ code: 'policy_out_of_scope' });

    const unknown = await capture(app, { ...VALID_BODY, policyNo: UNKNOWN_POLICY }, champion);
    expect(unknown.status).toBe(404);

    expect((await listAs(app, champion)).total).toBe(0);
  });

  it('lets a group session capture against any entity and attributes the record to the group', async () => {
    const app = build();
    const response = await capture(app, { ...VALID_BODY, policyNo: OTHER_ENTITY_POLICY });
    expect(response.status).toBe(200);
    expect(await json<QuestionnaireResponse>(response)).toMatchObject({ entityId: null });
  });
});

describe('questionnaire audit', () => {
  it('records the capture the way the other document events are recorded', async () => {
    const app = build();
    const created = await json<QuestionnaireResponse>(await capture(app));

    const trail = await auditAs(app);
    const event = trail.events.find((candidate) => candidate.objectId === created.documentId);
    expect(event).toMatchObject({
      action: 'document.questionnaire_captured',
      objectId: created.documentId,
      actor: 'Group Insurance',
      entityId: null,
    });
  });

  it('attributes a champion capture to that entity, and hides it from another', async () => {
    const app = build();
    const champion = await roleCookie(app, 'Entity Champion');
    const created = await json<QuestionnaireResponse>(await capture(app, VALID_BODY, champion));

    const own = await auditAs(app, champion);
    expect(own.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'document.questionnaire_captured',
          objectId: created.documentId,
          actor: 'Entity Champion',
          entityId: 'ent-01',
        }),
      ]),
    );

    const other = await auditAs(app, await forgedCookie('Entity Champion', 'ent-02'));
    expect(other.events.some((event) => event.objectId === created.documentId)).toBe(false);
  });
});
