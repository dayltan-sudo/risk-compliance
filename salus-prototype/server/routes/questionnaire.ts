import { Hono } from 'hono';
import { z } from 'zod';

import type { Session } from '../../src/audit/types';
import { portfolio } from '../../src/data/portfolio';
import type { DocumentType } from '../../src/ingestion/schema';
import {
  QueueError,
  type QueueErrorCode,
  type QueueItemSummary,
  type ValidationQueue,
} from '../../src/ingestion/queue';
import {
  captureQuestionnaire,
  HUMAN_ENTERED_CONFIDENCE,
  type Field,
  type QuestionnaireAnswer,
  type QueuedField,
  type RejectedField,
} from '../../src/ingestion/validate';
import { recordScopedAudit } from '../middleware/audit-scope';
import { BODY_LIMITS, bodyTooLarge, readJsonBody } from '../middleware/body';
import { isInScope, scopeFor } from '../middleware/scope';
import { documentQueue } from './documents';
import { readSession } from './session';

/**
 * FR3.9: capture a policy that has no machine-readable document.
 *
 * A broker sends the terms in an email, or they arrive on a call. There is no
 * slip to parse, but the knowledge still has to reach the portfolio. This route
 * takes the fields a person types and puts them through the same queue, the same
 * validator and the same review-and-post path as an extraction, so a manual
 * record is not a second class of record.
 *
 * Three things it does not do, on purpose:
 * - It does not guess the rest of the policy. Only the fields that were typed
 *   enter the draft at confidence 1; every other mandatory key is queued for a
 *   reviewer, exactly as an incomplete extraction would be.
 * - It does not write its own validator. `captureQuestionnaire` is `normalise`
 *   with the citation rule switched off, because a typed answer has no page.
 * - It does not invent a policy. An unknown policy number is a 404, and a
 *   currency that disagrees with the policy is a 400.
 */

/** A questionnaire restates a policy record, which is what a schedule is. */
export const QUESTIONNAIRE_DOCUMENT_TYPE: DocumentType = 'schedule';

/** Longest free-text note accepted, in characters. */
export const QUESTIONNAIRE_NOTES_MAX_CHARS = 2_000;
/** Longest policy number accepted, in characters. */
export const QUESTIONNAIRE_POLICY_NO_MAX_CHARS = 60;
/** Longest site name accepted, in characters. */
export const QUESTIONNAIRE_SITE_NAME_MAX_CHARS = 200;

export interface QuestionnaireRoutesOptions {
  /** Injected queue, used by tests. Defaults to the document queue the app already mounts. */
  queue?: ValidationQueue;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queueFailure(
  error: unknown,
): { status: 400 | 404 | 409; body: { error: string; code: QueueErrorCode } } | undefined {
  if (!(error instanceof QueueError)) return undefined;
  const status = error.code === 'document_not_found' ? 404 : error.code === 'duplicate_document' ? 409 : 400;
  return { status, body: { error: error.message, code: error.code } };
}

/**
 * An ISO-4217 code as three upper-case letters. Lower-case input is normalised,
 * not rejected: `sgd` is the same currency as `SGD`, and refusing it would be
 * pedantry rather than validation.
 */
const currencySchema = z
  .string({ error: 'currency is required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'currency must be an ISO-4217 code of three letters');

const optionalAmountSchema = z
  .number({ error: 'must be a number' })
  .finite('must be a finite number')
  .nonnegative('must not be negative')
  .optional();

const questionnaireSchema = z.object({
  policyNo: z
    .string({ error: 'policyNo is required' })
    .trim()
    .min(1, 'policyNo is required')
    .max(
      QUESTIONNAIRE_POLICY_NO_MAX_CHARS,
      `policyNo is too long; the limit is ${QUESTIONNAIRE_POLICY_NO_MAX_CHARS} characters`,
    ),
  siteName: z
    .string({ error: 'siteName is required' })
    .trim()
    .min(1, 'siteName is required')
    .max(
      QUESTIONNAIRE_SITE_NAME_MAX_CHARS,
      `siteName is too long; the limit is ${QUESTIONNAIRE_SITE_NAME_MAX_CHARS} characters`,
    ),
  sumInsured: z
    .number({ error: 'sumInsured is required and must be a number' })
    .finite('sumInsured must be a finite number')
    .positive('sumInsured must be greater than zero'),
  currency: currencySchema,
  businessInterruption: optionalAmountSchema,
  deductible: optionalAmountSchema,
  notes: z
    .string({ error: 'notes must be a string' })
    .trim()
    .max(
      QUESTIONNAIRE_NOTES_MAX_CHARS,
      `notes are too long; the limit is ${QUESTIONNAIRE_NOTES_MAX_CHARS} characters`,
    )
    .optional(),
});

/** Grouped decimal, so the stored value reads like a slip's figure. */
const AMOUNT_FORMAT = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 });

function money(value: number, currency: string): string {
  return `${currency} ${AMOUNT_FORMAT.format(value)}`;
}

function randomDocumentId(): string {
  return `doc-${crypto.randomUUID()}`;
}

export interface QuestionnaireResponse extends QueueItemSummary {
  accepted: Field[];
  queued: QueuedField[];
  rejected: RejectedField[];
  policy: { id: string; policyNo: string; entityId: string; currency: string };
  /** The free-text note from the capture, echoed so the reviewer sees it. */
  notes: string | null;
}

export function createQuestionnaireRoutes(options: QuestionnaireRoutesOptions = {}): Hono {
  const queue = options.queue ?? documentQueue;
  const app = new Hono();

  app.post('/api/documents/questionnaire', async (c) => {
    const read = await readJsonBody(c, BODY_LIMITS.questionnaire);
    if (read.kind === 'too_large') return bodyTooLarge(c, read.limitBytes);

    const parsed = questionnaireSchema.safeParse(read.body);
    if (!parsed.success) {
      // Name the field that failed so the form can point at it, rather than
      // reporting "invalid body" and making the person hunt.
      const issue = parsed.error.issues[0];
      const field = issue === undefined ? 'body' : String(issue.path[0] ?? 'body');
      return c.json(
        {
          error: issue === undefined ? 'invalid request body' : `${field}: ${issue.message}`,
          field,
          issues: parsed.error.issues,
        },
        400,
      );
    }

    const body = parsed.data;

    // Lookup before scope: an unknown policy is a missing record (404), not a
    // permission problem (403). The comparison is case-insensitive but the
    // record keeps the policy's own spelling.
    const wantedPolicyNo = body.policyNo.toUpperCase();
    const policy = portfolio.policies.find(
      (candidate) => candidate.policyNo.toUpperCase() === wantedPolicyNo,
    );
    if (policy === undefined) {
      return c.json(
        {
          error: `no policy with number "${body.policyNo}" in the portfolio`,
          code: 'policy_not_found' as const,
        },
        404,
      );
    }

    if (body.currency !== policy.currency) {
      return c.json(
        {
          error: `currency must match the policy: ${policy.policyNo} is written in ${policy.currency}`,
          field: 'currency',
          code: 'currency_mismatch' as const,
        },
        400,
      );
    }

    const session: Session = await readSession(c);
    if (!isInScope(scopeFor(portfolio, session), policy.entityId)) {
      return c.json(
        {
          error: 'policy is outside the scope of this session',
          code: 'policy_out_of_scope' as const,
        },
        403,
      );
    }

    const answers: QuestionnaireAnswer[] = [
      { key: 'policy_no', value: policy.policyNo },
      { key: 'site_name', value: body.siteName },
      { key: 'sum_insured', value: money(body.sumInsured, policy.currency) },
      { key: 'currency', value: body.currency },
    ];
    if (body.businessInterruption !== undefined) {
      answers.push({
        key: 'bi_sum_insured',
        value: money(body.businessInterruption, policy.currency),
      });
    }
    if (body.deductible !== undefined) {
      answers.push({ key: 'deductible', value: money(body.deductible, policy.currency) });
    }

    const normalised = captureQuestionnaire(QUESTIONNAIRE_DOCUMENT_TYPE, answers);
    const documentId = randomDocumentId();
    const notes = body.notes === undefined || body.notes === '' ? null : body.notes;

    let item: QueueItemSummary;
    try {
      item = queue.enqueue({
        documentId,
        name: `Questionnaire · ${policy.policyNo} · ${body.siteName}`,
        normalised,
        source: 'questionnaire',
        entityId: session.entityId,
      });
    } catch (error) {
      const failure = queueFailure(error);
      if (failure !== undefined) return c.json(failure.body, failure.status);
      throw error;
    }

    try {
      recordScopedAudit(
        {
          actor: session.role,
          action: 'document.questionnaire_captured',
          objectType: 'policy',
          objectId: documentId,
          before: null,
          after: {
            documentId,
            source: 'questionnaire',
            policyId: policy.id,
            policyNo: policy.policyNo,
            siteName: body.siteName,
            confidence: HUMAN_ENTERED_CONFIDENCE,
            fields: Object.fromEntries(answers.map((answer) => [answer.key, answer.value])),
            unconfirmed: item.unconfirmed,
            notes,
          },
        },
        session.entityId,
      );
    } catch (error) {
      // The record is already queued; an audit write failure must not pretend
      // the capture did not happen. Surface it instead of swallowing it.
      return c.json(
        {
          error: `capture was queued as ${documentId} but the audit event could not be recorded`,
          detail: messageOf(error),
          documentId,
        },
        500,
      );
    }

    const response: QuestionnaireResponse = {
      ...item,
      accepted: normalised.accepted,
      queued: normalised.queued,
      rejected: normalised.rejected,
      policy: {
        id: policy.id,
        policyNo: policy.policyNo,
        entityId: policy.entityId,
        currency: policy.currency,
      },
      notes,
    };

    // 200, not 201: the resource the caller asked for is the queue entry they
    // will now review, and the manual path is a capture rather than a creation
    // of a new addressable document.
    return c.json(response, 200);
  });

  return app;
}

/** Sub-app for the orchestrator to mount next to the upload routes. */
export const questionnaireRoutes = createQuestionnaireRoutes();
