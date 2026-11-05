/**
 * The assistant run loop.
 *
 * 1. The model sees the question, the page hint and the tool catalogue.
 * 2. It may request up to four rounds of tool calls.
 * 3. Answers are composed from tool results only, and every inline citation
 *    must resolve to a ref those results returned.
 *
 * The citation rule is enforced here, not in the prompt: if the final text
 * contains a digit and no citation resolves, the run throws. An uncited number
 * is a bug, not a style problem.
 */
import type { AssistantMessage, AssistantModel } from './client';
import { SYSTEM_PROMPT } from './prompt';
import {
  runAssistantTool,
  toolCatalog,
  ToolError,
  type ToolName,
  type ToolRef,
  type ToolSpec,
} from './tools';

export type Citation = ToolRef;

export type Answer = {
  text: string;
  citations: Citation[];
  toolsUsed: string[];
  refused: boolean;
};

export type RunAssistantOptions = {
  model: AssistantModel;
  /** Current app page, e.g. `contracts`. Biases which tool is suggested first. */
  page?: string;
};

export class AssistantCitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantCitationError';
  }
}

const MAX_ITERATIONS = 4;

type PagePreference = {
  tool: ToolName;
  view: string;
  /** Used to match the app's route names and URL paths without a router. */
  aliases: string[];
};

const PAGE_PREFERENCES: PagePreference[] = [
  {
    tool: 'listRequirements',
    view: 'the contract requirements table',
    aliases: ['contracts', 'contract-requirements', 'requirements'],
  },
  {
    tool: 'getKpis',
    view: 'the Group Overview',
    aliases: ['overview', 'coverage', 'group-overview'],
  },
  {
    tool: 'explainScore',
    view: 'the risk hotspots view',
    aliases: ['hotspots', 'map', 'risk-hotspots', 'global-map'],
  },
  {
    tool: 'listRequirements',
    view: 'the insurance exclusions view',
    aliases: ['exclusions'],
  },
];

export function pageToolBias(page?: string): { tool: ToolName; hint: string } | null {
  if (page === undefined) return null;
  const needle = page.trim().toLowerCase();
  if (needle === '') return null;

  for (const preference of PAGE_PREFERENCES) {
    if (!preference.aliases.includes(needle)) continue;
    return {
      tool: preference.tool,
      hint: `Page context: the user is viewing ${preference.view}. When the question fits this view, prefer the ${preference.tool} tool over the other tools.`,
    };
  }
  return null;
}

function orderedTools(tools: ToolSpec[], preferred: ToolName | undefined): ToolSpec[] {
  if (preferred === undefined) return tools;
  const first = tools.filter((tool) => tool.name === preferred);
  const rest = tools.filter((tool) => tool.name !== preferred);
  return [...first, ...rest];
}

function refKey(ref: ToolRef): string {
  return `${ref.type}:${ref.id}`;
}

function parseArguments(raw: string): unknown {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ToolError(`arguments were not valid JSON: ${raw.slice(0, 120)}`);
  }
}

const CITATION_PATTERN = /\[([A-Za-z0-9][A-Za-z0-9_.:-]*)\]/g;

/**
 * Citations are the refs whose ids actually appear inline in the answer. This
 * is stricter than "the tool ran": a model that calls a tool and then writes
 * an uncited figure is not credited with a citation.
 */
function citationsInText(text: string, refs: Map<string, ToolRef>): ToolRef[] {
  const byLowerId = new Map<string, ToolRef[]>();
  for (const ref of refs.values()) {
    const key = ref.id.toLowerCase();
    const list = byLowerId.get(key);
    if (list === undefined) byLowerId.set(key, [ref]);
    else list.push(ref);
  }

  const seen = new Set<string>();
  const citations: ToolRef[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = match[1];
    if (id === undefined) continue;
    for (const ref of byLowerId.get(id.toLowerCase()) ?? []) {
      const key = refKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push(ref);
    }
  }
  return citations;
}

function textSnippet(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length <= 120 ? singleLine : `${singleLine.slice(0, 120)}...`;
}

/**
 * Run one question through the tool loop. Throws `AssistantCitationError`
 * when the answer contains a digit and no citation resolves to a tool ref.
 */
export async function runAssistant(
  question: string,
  options: RunAssistantOptions,
): Promise<Answer> {
  const trimmed = question.trim();
  if (trimmed === '') throw new Error('runAssistant: question is required');

  const bias = pageToolBias(options.page);
  const system =
    bias === null ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\n${bias.hint}`;
  const tools = orderedTools(toolCatalog(), bias?.tool);

  const messages: AssistantMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: trimmed },
  ];

  const refs = new Map<string, ToolRef>();
  const toolsUsed: string[] = [];
  let finalText: string | null = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const completion = await options.model.complete(messages, tools);
    const text = completion.text.trim();

    if (completion.toolCalls.length === 0) {
      finalText = text;
      break;
    }

    messages.push({
      role: 'assistant',
      content: completion.text,
      toolCalls: completion.toolCalls,
    });

    for (const call of completion.toolCalls) {
      try {
        const result = runAssistantTool(call.name, parseArguments(call.arguments));
        if (!toolsUsed.includes(result.tool)) toolsUsed.push(result.tool);
        for (const ref of result.refs) refs.set(refKey(ref), ref);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify({ error: message }),
        });
      }
    }
  }

  if (finalText === null) {
    throw new Error(
      `runAssistant: model did not produce a final answer within ${MAX_ITERATIONS} tool-calling iterations`,
    );
  }

  const citations = citationsInText(finalText, refs);

  if (/\d/.test(finalText) && citations.length === 0) {
    throw new AssistantCitationError(
      `assistant answer contains a numeric claim with no resolvable citation: ${textSnippet(finalText)}`,
    );
  }

  return {
    text: finalText,
    citations,
    toolsUsed,
    refused: citations.length === 0,
  };
}
