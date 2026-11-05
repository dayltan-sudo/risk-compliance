import { describe, expect, it } from 'vitest';

import {
  EMPTY_QUESTIONNAIRE_FORM,
  originLabel,
  questionnaireBody,
  questionnaireComplete,
  type QuestionnaireForm,
} from '../src/app/pages/Documents';

/**
 * The manual capture form is the only place a person's typed figure becomes a
 * request body. These tests pin the two things that would quietly corrupt a
 * record: a blank optional field arriving as 0, and an Origin label that
 * credits a model for a value a human entered.
 */

const FILLED: QuestionnaireForm = {
  policyNo: ' PRP-2026-0001 ',
  siteName: ' Tuas DC-2 ',
  sumInsured: '12000000',
  currency: 'sgd',
  businessInterruption: '',
  deductible: '50000',
  notes: '  Broker email, 4 Nov  ',
};

describe('questionnaireComplete', () => {
  it('requires the policy, the site and the sum insured', () => {
    expect(questionnaireComplete(EMPTY_QUESTIONNAIRE_FORM)).toBe(false);
    expect(questionnaireComplete({ ...EMPTY_QUESTIONNAIRE_FORM, policyNo: 'PRP-2026-0001' })).toBe(
      false,
    );
    expect(questionnaireComplete(FILLED)).toBe(true);
  });

  it('treats whitespace as empty', () => {
    expect(questionnaireComplete({ ...FILLED, siteName: '   ' })).toBe(false);
  });
});

describe('questionnaireBody', () => {
  it('trims text, parses numbers and normalises the currency', () => {
    expect(questionnaireBody(FILLED)).toEqual({
      policyNo: 'PRP-2026-0001',
      siteName: 'Tuas DC-2',
      sumInsured: 12_000_000,
      currency: 'SGD',
      deductible: 50_000,
      notes: 'Broker email, 4 Nov',
    });
  });

  it('omits a blank optional figure rather than sending zero', () => {
    const body = questionnaireBody(FILLED);

    expect('businessInterruption' in body).toBe(false);
    expect(body['deductible']).toBe(50_000);

    const noOptional = questionnaireBody(EMPTY_QUESTIONNAIRE_FORM);
    expect('deductible' in noOptional).toBe(false);
    expect('notes' in noOptional).toBe(false);
  });
});

describe('originLabel', () => {
  it('names a manual capture Questionnaire, never Model or Rules', () => {
    expect(originLabel('questionnaire')).toBe('Questionnaire');
    expect(originLabel('document')).toBe('Document');
  });
});
