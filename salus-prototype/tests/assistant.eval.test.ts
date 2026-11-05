import { describe, expect, it } from 'vitest';

import type {
  AssistantMessage,
  AssistantModel,
  AssistantToolCall,
} from '../src/assistant/client';
import { AssistantCitationError, runAssistant, type Answer } from '../src/assistant/run';
import type { ToolRecord, ToolRef, ToolSpec } from '../src/assistant/tools';
import { formatSgd } from '../src/engine/requirements';
import { createAssistantRoutes } from '../server/routes/assistant';

/**
 * Twelve-question eval set plus the code-level guards.
 *
 * The fake model is scripted per question: it emits tool calls, then builds
 * its final text from the actual tool results. `cite()` fails the test if the
 * id it wants is not a real ref, so a passing answer is cited against a
 * record the tools actually returned. No network, no model calls.
 */

type ToolContext = {
  records: ToolRecord[];
  refs: ToolRef[];
};

type Script = {
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  final: (context: ToolContext) => string;
};

type AnswerCase = {
  kind: 'answer';
  group: 'answerable' | 'ambiguous';
  question: string;
  page?: string;
  tool: string;
  citedId: string;
  script: Script;
};

type RefuseCase = {
  kind: 'refuse';
  group: 'ambiguous' | 'out-of-scope';
  question: string;
  page?: string;
  script: Script;
};

type EvalCase = AnswerCase | RefuseCase;

function scriptedModel(script: Script): AssistantModel {
  return {
    async complete(
      messages: AssistantMessage[],
    ): Promise<{ text: string; toolCalls: AssistantToolCall[] }> {
      const toolMessages = messages.filter(
        (message): message is Extract<AssistantMessage, { role: 'tool' }> =>
          message.role === 'tool',
      );

      if (toolMessages.length < script.calls.length) {
        const call = script.calls[toolMessages.length];
        if (call === undefined) return { text: '', toolCalls: [] };
        return {
          text: '',
          toolCalls: [
            {
              id: `call-${toolMessages.length + 1}`,
              name: call.name,
              arguments: JSON.stringify(call.args),
            },
          ],
        };
      }

      const records: ToolRecord[] = [];
      const refs: ToolRef[] = [];
      for (const message of toolMessages) {
        const payload = JSON.parse(message.content) as {
          records?: ToolRecord[];
          refs?: ToolRef[];
        };
        if (Array.isArray(payload.records)) records.push(...payload.records);
        if (Array.isArray(payload.refs)) refs.push(...payload.refs);
      }

      return { text: script.final({ records, refs }), toolCalls: [] };
    },
  };
}

function record(context: ToolContext, id: string): ToolRecord {
  const match = context.records.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`tool results did not include record ${id}`);
  return match;
}

function numberField(entry: ToolRecord, key: string): number {
  const value = entry[key];
  if (typeof value !== 'number') throw new Error(`record ${entry.id} has no numeric ${key}`);
  return value;
}

/** Resolve a citation id against the refs a tool actually returned. */
function tag(context: ToolContext, id: string): string {
  const match = context.refs.find((ref) => ref.id.toLowerCase() === id.toLowerCase());
  if (match === undefined) throw new Error(`tool results did not include a ref for ${id}`);
  return `[${match.id}]`;
}

const tivCase: AnswerCase = {
  kind: 'answer',
  group: 'answerable',
  question: 'What is the group TIV?',
  page: 'overview',
  tool: 'getKpis',
  citedId: 'kpi-tiv',
  script: {
    calls: [{ name: 'getKpis', args: {} }],
    final: (context) =>
      `Group TIV is ${formatSgd(numberField(record(context, 'kpi-tiv'), 'value'))} ${tag(context, 'kpi-tiv')}.`,
  },
};

const evalCases: EvalCase[] = [
  tivCase,
  {
    kind: 'answer',
    group: 'answerable',
    question: 'How many contract requirements are open gaps, and how many are at risk?',
    tool: 'getKpis',
    citedId: 'kpi-gaps',
    script: {
      calls: [{ name: 'getKpis', args: {} }],
      final: (context) => {
        const gaps = numberField(record(context, 'kpi-gaps'), 'value');
        const atRisk = numberField(record(context, 'kpi-at-risk'), 'value');
        return `${gaps} contract requirements are open gaps and ${atRisk} are at risk ${tag(context, 'kpi-gaps')} ${tag(context, 'kpi-at-risk')}.`;
      },
    },
  },
  {
    kind: 'answer',
    group: 'answerable',
    question: 'Which tenant requirements are gaps?',
    page: 'contracts',
    tool: 'listRequirements',
    citedId: 'req-04',
    script: {
      calls: [
        {
          name: 'listRequirements',
          args: { status: 'Gap', counterpartyType: 'Customer/Tenant' },
        },
      ],
      final: (context) => {
        const requirement = record(context, 'req-04');
        const placed = numberField(requirement, 'placedLimit');
        const required = numberField(requirement, 'requiredSgd');
        return `The Batam Fabrication Yard cargo requirement is a Gap: ${formatSgd(placed)} placed against ${formatSgd(required)} required ${tag(context, 'req-04')}.`;
      },
    },
  },
  {
    kind: 'answer',
    group: 'answerable',
    question: 'Show me the cyber policies written in Singapore.',
    tool: 'findPolicies',
    citedId: 'pol-19',
    script: {
      calls: [{ name: 'findPolicies', args: { line: 'Cyber', country: 'Singapore' } }],
      final: (context) => {
        const first = context.records[0];
        if (first === undefined) throw new Error('findPolicies returned no records');
        return `${context.records.length} cyber policies are written for Singapore entities, including ${String(first.policyNo)} ${tag(context, 'pol-19')}.`;
      },
    },
  },
  {
    kind: 'answer',
    group: 'answerable',
    question: 'Why is Hai Phong Yard rated Critical?',
    page: 'hotspots',
    tool: 'explainScore',
    citedId: 'score-site-08',
    script: {
      calls: [{ name: 'explainScore', args: { siteId: 'site-08' } }],
      final: (context) => {
        const score = record(context, 'score-site-08');
        const drivers = context.records.filter((entry) => entry.kind === 'driver');
        drivers.sort((left, right) => numberField(right, 'contribution') - numberField(left, 'contribution'));
        const top = drivers[0];
        if (top === undefined) throw new Error('explainScore returned no drivers');
        return `Hai Phong Yard scores ${numberField(score, 'score')} and is rated ${String(score.band)}, driven mainly by ${String(top.driver)} ${tag(context, 'score-site-08')} ${tag(context, top.id)}.`;
      },
    },
  },
  {
    kind: 'answer',
    group: 'answerable',
    question: 'Which policies expire within 30 days?',
    tool: 'listRenewals',
    citedId: 'pol-07',
    script: {
      calls: [{ name: 'listRenewals', args: { withinDays: 30 } }],
      final: (context) => {
        const first = context.records[0];
        if (first === undefined) throw new Error('listRenewals returned no records');
        return `${context.records.length} active policy expires within 30 days: ${String(first.policyNo)} on ${String(first.expiry)} ${tag(context, 'pol-07')}.`;
      },
    },
  },
  {
    kind: 'answer',
    group: 'ambiguous',
    question: 'Is our cyber cover enough?',
    tool: 'listRequirements',
    citedId: 'req-06',
    script: {
      calls: [{ name: 'listRequirements', args: { line: 'Cyber' } }],
      final: (context) => {
        const requirement = record(context, 'req-06');
        return `Not entirely: Singapore DC-4 meets the ransomware limit at ${numberField(requirement, 'ratio')}x but the peril is fully excluded ${tag(context, 'req-06')}.`;
      },
    },
  },
  {
    kind: 'refuse',
    group: 'ambiguous',
    question: 'Are we well insured overall?',
    script: {
      calls: [],
      final: () =>
        'I cannot answer that from the portfolio records: no tool defines what "well insured" means for this group.',
    },
  },
  {
    kind: 'answer',
    group: 'ambiguous',
    question: 'Which site has the worst claims history?',
    tool: 'explainScore',
    citedId: 'driver-site-08-claims',
    script: {
      calls: [{ name: 'explainScore', args: { siteId: 'site-08' } }],
      final: (context) => {
        const driver = record(context, 'driver-site-08-claims');
        return `The strongest claims sub-score is ${numberField(driver, 'subScore')} at Hai Phong Yard ${tag(context, 'driver-site-08-claims')}; no tool ranks claims history across every site, so this is the closest supported answer.`;
      },
    },
  },
  {
    kind: 'refuse',
    group: 'out-of-scope',
    question: 'What will our 2027 renewal premium be?',
    script: {
      calls: [],
      final: () => 'The tools do not contain forecast pricing, so I cannot answer that.',
    },
  },
  {
    kind: 'refuse',
    group: 'out-of-scope',
    question: 'Who is the CEO of Keppel?',
    script: {
      calls: [],
      final: () => 'That is outside the portfolio records, so I cannot answer it.',
    },
  },
  {
    kind: 'refuse',
    group: 'out-of-scope',
    question: 'What is the weather in Singapore tomorrow?',
    script: {
      calls: [],
      final: () => 'That is outside the portfolio records, so I cannot answer it.',
    },
  },
];

describe('assistant eval set', () => {
  for (const entry of evalCases) {
    it(entry.question, async () => {
      const answer = await runAssistant(entry.question, {
        model: scriptedModel(entry.script),
        ...(entry.page === undefined ? {} : { page: entry.page }),
      });

      if (entry.kind === 'refuse') {
        expect(answer.refused).toBe(true);
        expect(answer.citations).toEqual([]);
        expect(answer.text).not.toMatch(/\d/);
      } else {
        expect(answer.refused).toBe(false);
        expect(answer.citations.length).toBeGreaterThan(0);
        expect(
          answer.citations.some(
            (citation) => citation.id.toLowerCase() === entry.citedId.toLowerCase(),
          ),
        ).toBe(true);
        expect(answer.toolsUsed).toContain(entry.tool);
      }

      // The rule, asserted for every case: a figure can never be uncited.
      if (/\d/.test(answer.text)) expect(answer.citations.length).toBeGreaterThan(0);

      console.log(
        `EVAL | ${entry.group.padEnd(11)} | refused=${answer.refused ? 'yes' : 'no '} | citations=${answer.citations.length} | tools=${answer.toolsUsed.join(',') || '-'} | ${entry.question}`,
      );
    });
  }
});

describe('uncited-number guard', () => {
  it('throws when a model claims a figure with no tool call', async () => {
    const model: AssistantModel = {
      async complete() {
        return { text: 'TIV is 3.5 billion', toolCalls: [] };
      },
    };

    await expect(runAssistant('What is the group TIV?', { model })).rejects.toThrow(
      AssistantCitationError,
    );
    await expect(runAssistant('What is the group TIV?', { model })).rejects.toThrow(
      /no resolvable citation/,
    );
  });

  it('throws when a model calls a tool but writes an uncited figure', async () => {
    let calls = 0;
    const model: AssistantModel = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          return {
            text: '',
            toolCalls: [{ id: 'call-1', name: 'getKpis', arguments: '{}' }],
          };
        }
        return { text: 'TIV is 3.5 billion', toolCalls: [] };
      },
    };

    await expect(runAssistant('What is the group TIV?', { model })).rejects.toThrow(
      AssistantCitationError,
    );
  });
});

describe('page bias', () => {
  it('prefers listRequirements on the contracts page', async () => {
    let capturedMessages: AssistantMessage[] = [];
    let capturedTools: ToolSpec[] = [];

    const model: AssistantModel = {
      async complete(messages, tools) {
        capturedMessages = messages;
        capturedTools = tools;
        return { text: 'The records do not contain that.', toolCalls: [] };
      },
    };

    const answer = await runAssistant('Which requirements are gaps?', {
      model,
      page: 'contracts',
    });

    expect(answer.refused).toBe(true);
    expect(capturedMessages[0]?.content).toContain('listRequirements');
    expect(capturedTools[0]?.name).toBe('listRequirements');
  });
});

describe('POST /api/assistant', () => {
  const ask = (question: string) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  it('serves a cited answer from an injected model', async () => {
    const app = createAssistantRoutes({ model: scriptedModel(tivCase.script) });
    const response = await app.request('/api/assistant', ask('What is the group TIV?'));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Answer;
    expect(body.refused).toBe(false);
    expect(body.citations.some((citation) => citation.id === 'kpi-tiv')).toBe(true);
  });

  it('returns 503 when no model is configured', async () => {
    const app = createAssistantRoutes({ model: null });
    const response = await app.request('/api/assistant', ask('What is the group TIV?'));
    expect(response.status).toBe(503);

    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not configured/);
  });

  it('rejects a malformed body', async () => {
    const app = createAssistantRoutes({ model: scriptedModel(tivCase.script) });
    const response = await app.request('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '   ' }),
    });
    expect(response.status).toBe(400);
  });
});
