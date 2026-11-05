/**
 * The assistant's single dependency on a model.
 *
 * `AssistantModel` is deliberately narrow so tests can drive the tool loop
 * with a scripted fake. `openAiAssistantModel` is a plain OpenAI-compatible
 * chat-completions client with function/tool calling; configuration is passed
 * in by the caller and this module never reads `process.env`.
 */
import type { ToolSpec } from './tools';

export type AssistantToolCall = {
  id: string;
  name: string;
  /** JSON text as returned by the provider. Never trusted as an object. */
  arguments: string;
};

export type AssistantMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AssistantToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type AssistantCompletion = {
  text: string;
  toolCalls: AssistantToolCall[];
};

export interface AssistantModel {
  complete(messages: AssistantMessage[], tools: ToolSpec[]): Promise<AssistantCompletion>;
}

export interface OpenAiAssistantModelConfig {
  /** OpenAI-compatible base URL, or a full chat-completions URL. */
  baseUrl: string;
  /** Sent as a bearer token when non-empty. Local servers may not need one. */
  apiKey: string;
  model: string;
}

const ERROR_DETAIL_LIMIT = 400;

function snippet(value: string, limit = ERROR_DETAIL_LIMIT): string {
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}...`;
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed === '') throw new Error('openAiAssistantModel: baseUrl is required');
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

function toOpenAiMessage(message: AssistantMessage): Record<string, unknown> {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      if (message.toolCalls === undefined || message.toolCalls.length === 0) {
        return { role: 'assistant', content: message.content };
      }
      return {
        role: 'assistant',
        content: message.content === '' ? null : message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
  }
}

function firstChoice(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('assistant response was not a JSON object');
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('assistant response did not contain a choices array');
  }
  const first: unknown = choices[0];
  if (typeof first !== 'object' || first === null) {
    throw new Error('assistant response did not contain a message object');
  }
  return first as Record<string, unknown>;
}

/** Pull `choices[0].message.content`, tolerating null and content-part arrays. */
function messageText(payload: unknown): string {
  const first = firstChoice(payload);
  const message = first.message;
  if (typeof message !== 'object' || message === null) {
    throw new Error('assistant response did not contain choices[0].message');
  }

  const content = (message as { content?: unknown }).content;
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null) {
          const text = (part as { text?: unknown }).text;
          if (typeof text === 'string') return text;
        }
        return '';
      })
      .join('');
  }
  throw new Error('assistant response content was not text');
}

function messageToolCalls(payload: unknown, nextId: () => string): AssistantToolCall[] {
  const first = firstChoice(payload);
  const message = first.message;
  if (typeof message !== 'object' || message === null) {
    throw new Error('assistant response did not contain choices[0].message');
  }

  const rawCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (rawCalls === undefined || rawCalls === null) return [];
  if (!Array.isArray(rawCalls)) throw new Error('assistant response tool_calls was not an array');

  return rawCalls.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('assistant response contained a malformed tool call');
    }
    const record = entry as { id?: unknown; function?: unknown };
    const fn =
      typeof record.function === 'object' && record.function !== null
        ? (record.function as { name?: unknown; arguments?: unknown })
        : undefined;
    const name = fn?.name;
    if (typeof name !== 'string' || name === '') {
      throw new Error('assistant response contained a tool call without a function name');
    }

    const rawArguments = fn?.arguments;
    const argumentsText =
      typeof rawArguments === 'string'
        ? rawArguments
        : rawArguments === undefined || rawArguments === null
          ? '{}'
          : JSON.stringify(rawArguments);

    return {
      id: typeof record.id === 'string' && record.id !== '' ? record.id : nextId(),
      name,
      arguments: argumentsText,
    };
  });
}

/**
 * Calls `/chat/completions` with function/tool calling. Returns the model's
 * text and any requested tool calls; nothing here executes a tool.
 */
export function openAiAssistantModel(env: OpenAiAssistantModelConfig): AssistantModel {
  const url = chatCompletionsUrl(env.baseUrl);
  const model = env.model.trim();
  if (model === '') throw new Error('openAiAssistantModel: model is required');

  let syntheticId = 0;
  const nextId = (): string => {
    syntheticId += 1;
    return `call-${syntheticId}`;
  };

  return {
    async complete(messages: AssistantMessage[], tools: ToolSpec[]): Promise<AssistantCompletion> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (env.apiKey.trim() !== '') headers['authorization'] = `Bearer ${env.apiKey.trim()}`;

      const body: Record<string, unknown> = {
        model,
        temperature: 0,
        messages: messages.map(toOpenAiMessage),
      };
      if (tools.length > 0) {
        body.tools = tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        }));
        body.tool_choice = 'auto';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `assistant request failed with HTTP ${response.status}${detail === '' ? '' : `: ${snippet(detail)}`}`,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('assistant response body was not valid JSON');
      }

      return {
        text: messageText(payload),
        toolCalls: messageToolCalls(payload, nextId),
      };
    },
  };
}
