import { describe, expect, it } from 'vitest';

import type { AssistantMessage, AssistantModel, AssistantToolCall } from '../src/assistant/client';
import { AssistantCitationError, runAssistant } from '../src/assistant/run';

/**
 * Figure-level guard tests.
 *
 * The guard is per sentence, not per answer: a citation at the end of an answer
 * must not license a figure at the start, and a figure has to be spelled in a
 * way the check can see. Each case below was an escape found in review.
 */

/** Calls getKpis once, then returns whatever final text the case supplies. */
function modelReturning(finalText: string): AssistantModel {
  let calls = 0;
  return {
    async complete(): Promise<{ text: string; toolCalls: AssistantToolCall[] }> {
      calls += 1;
      if (calls === 1) {
        return {
          text: '',
          toolCalls: [{ id: 'call-1', name: 'getKpis', arguments: '{}' }],
        };
      }
      return { text: finalText, toolCalls: [] };
    },
  };
}

async function run(finalText: string): Promise<string> {
  const answer = await runAssistant('What is the group TIV?', {
    model: modelReturning(finalText),
  });
  return answer.text;
}

describe('assistant figure guard', () => {
  it('accepts a figure in a sentence that carries its own citation', async () => {
    const text = 'The group TIV is SGD 3.576bn [kpi-tiv]. Adequacy sits at 90.03% [kpi-adequacy].';
    await expect(run(text)).resolves.toBe(text);
  });

  it('rejects a figure in an earlier sentence licensed only by a later citation', async () => {
    const text = 'Adequacy is 61.2%. Group TIV is SGD 9,999,999,999 [kpi-tiv].';
    await expect(run(text)).rejects.toBeInstanceOf(AssistantCitationError);
  });

  // Known limitation, kept as an executable record of it: the guard binds a
  // figure to a sentence and to a resolvable citation, but does not reconcile
  // the figure against that record's value. Closing it needs each ref to carry
  // its value and a tolerant numeric match (SGD 3.58bn == 3.576e9).
  it.fails('rejects a sentence whose only citation is for a different record', async () => {
    const text = 'Adequacy is 61.2% [kpi-tiv].';
    await expect(run(text)).rejects.toBeInstanceOf(AssistantCitationError);
  });

  it('sees fullwidth digits', async () => {
    const text = 'Adequacy is ４２ percent with no source.';
    await expect(run(text)).rejects.toBeInstanceOf(AssistantCitationError);
  });

  it('treats a magnitude word as a figure', async () => {
    const text = 'Exposure runs to three billion dollars with no source.';
    await expect(run(text)).rejects.toBeInstanceOf(AssistantCitationError);
  });

  it('does not require a citation for prose with no figure at all', async () => {
    const text = 'The portfolio holds several sites across the region.';
    await expect(run(text)).resolves.toBe(text);
  });

  it('reports how many sentences are uncited', async () => {
    const text = 'TIV is SGD 1bn. Loss ratio is 42%. Deductible is 90 days [kpi-tiv].';
    await expect(run(text)).rejects.toThrow(/2 such sentence/);
  });
});
