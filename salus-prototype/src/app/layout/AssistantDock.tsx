import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { AnswerBody } from '../components/AnswerBody';
import type { CitationLike } from '../components/citations';
import { Tag } from '../ui';

/** The 200 body of `POST /api/assistant`. */
type AssistantAnswer = {
  text: string;
  citations: CitationLike[];
  toolsUsed: string[];
  refused: boolean;
};

/** The three states the task requires to be distinct, plus honest fallbacks. */
type Failure =
  | { kind: 'not-configured' }
  | { kind: 'scoped' }
  | { kind: 'uncited' }
  | { kind: 'network' }
  | { kind: 'rejected'; detail: string }
  | { kind: 'server'; detail: string }
  | { kind: 'unreadable' };

type Message =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'answer'; answer: AssistantAnswer }
  | { id: number; role: 'failure'; failure: Failure };

type PageKey =
  | 'overview'
  | 'map'
  | 'coverage'
  | 'hotspots'
  | 'contracts'
  | 'exclusions'
  | 'audit';

const PAGE_BY_PATH: Record<string, PageKey> = {
  '/': 'overview',
  '/map': 'map',
  '/coverage': 'coverage',
  '/hotspots': 'hotspots',
  '/contracts': 'contracts',
  '/exclusions': 'exclusions',
  '/audit': 'audit',
};

/** Three starting questions per screen, biased to the tools that page owns. */
const SUGGESTED_PROMPTS: Record<PageKey, readonly [string, string, string]> = {
  overview: [
    'What is group coverage adequacy, and which entity pulls it down?',
    'Rank the sites with the most uninsured value.',
    'How many contract gaps are open, and where are they?',
  ],
  map: [
    'Which countries carry the highest uninsured value?',
    'Why is the top hotspot rated that band?',
    'Which site on the map should I look at first?',
  ],
  coverage: [
    'Which line has the widest gap between TIV and insured value?',
    'Where does the per-occurrence limit fall short of the PML?',
    'Which policies expire in the next 60 days?',
  ],
  hotspots: [
    "What drives the highest-scoring site's band?",
    'Rank hotspots by uninsured value, not score.',
    'Which sites are close to moving up a band?',
  ],
  contracts: [
    'Which requirements are gaps, and who are the counterparties?',
    'Which requirements are excluded by policy wording?',
    'What is the value at stake in the open gaps?',
  ],
  exclusions: [
    'Which exclusions decide the most requirement failures?',
    'Which lines are excluded most often?',
    'Which exclusion should be escalated first?',
  ],
  audit: [
    'Which portfolio records underpin the group KPIs?',
    'Trace the open contract gaps back to their sites.',
    'Which policies are expiring within 90 days?',
  ],
};

function pageForPath(pathname: string): PageKey {
  const normalised = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return PAGE_BY_PATH[normalised] ?? 'overview';
}

function isCitation(value: unknown): value is CitationLike {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['type'] === 'string' &&
    typeof record['id'] === 'string' &&
    typeof record['label'] === 'string'
  );
}

function isAssistantAnswer(value: unknown): value is AssistantAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['text'] === 'string' &&
    Array.isArray(record['citations']) &&
    record['citations'].every(isCitation) &&
    Array.isArray(record['toolsUsed']) &&
    record['toolsUsed'].every((tool) => typeof tool === 'string') &&
    typeof record['refused'] === 'boolean'
  );
}

type FailureBody = { error: string; detail: string };

async function readFailureBody(response: Response): Promise<FailureBody> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      const error = typeof record['error'] === 'string' ? record['error'] : '';
      const detail = typeof record['detail'] === 'string' ? record['detail'] : '';
      if (error !== '' || detail !== '') return { error, detail };
    }
  } catch {
    // Non-JSON body; fall through to the status line.
  }
  return { error: `${response.status} ${response.statusText}`.trim(), detail: '' };
}

function isUncitedFailure(body: FailureBody): boolean {
  const text = `${body.error} ${body.detail}`.toLowerCase();
  return text.includes('uncited figure') || text.includes('no resolvable citation');
}

function failureDetail(body: FailureBody): string {
  return [body.error, body.detail].filter((part) => part !== '').join(': ');
}

function failureCopy(failure: Failure): { label: string; detail: string } {
  switch (failure.kind) {
    case 'not-configured':
      return {
        label: 'Not configured',
        detail: 'Assistant is not configured in this build; set the model keys to enable it',
      };
    case 'scoped':
      return {
        label: 'Group scope only',
        detail:
          'The assistant answers across the whole group in this build. Switch the role back to Group Insurance to ask it; entity-scoped answers are not wired yet.',
      };
    case 'uncited':
      return {
        label: 'Citation check failed',
        detail: 'Answer blocked: it contained a figure with no source',
      };
    case 'network':
      return {
        label: 'Connection failed',
        detail: 'Could not reach the assistant. Check that the API is running, then retry.',
      };
    case 'rejected':
      return {
        label: 'Request rejected',
        detail: failure.detail === '' ? 'The assistant rejected the request.' : failure.detail,
      };
    case 'server':
      return {
        label: 'Request failed',
        detail:
          failure.detail === '' ? 'The assistant could not complete the request.' : failure.detail,
      };
    case 'unreadable':
      return {
        label: 'Unreadable response',
        detail: 'The assistant returned a response this build could not read.',
      };
  }
}

function FailureBlock({ failure }: { failure: Failure }) {
  const copy = failureCopy(failure);
  const accent = failure.kind === 'not-configured' ? 'var(--dusk)' : 'var(--crimson)';
  return (
    <div role="alert" style={{ ...FAILURE, borderLeftColor: accent }}>
      <p style={FAILURE_LABEL}>{copy.label}</p>
      <p style={FAILURE_DETAIL}>{copy.detail}</p>
    </div>
  );
}

function ToolFooter({ tools }: { tools: readonly string[] }) {
  return (
    <p style={TOOL_FOOT}>
      {tools.length === 0 ? 'No data tools called' : `Tools used: ${tools.join(', ')}`}
    </p>
  );
}

const MESSAGE_LIST: CSSProperties = {
  listStyle: 'none',
  margin: 'var(--space-sm) 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-md)',
  maxHeight: 320,
  overflowY: 'auto',
};

const MESSAGE_ITEM: CSSProperties = { minWidth: 0 };

const USER_BUBBLE: CSSProperties = {
  margin: '0 0 0 auto',
  width: 'fit-content',
  maxWidth: '92%',
  padding: '6px 9px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--ink-800)',
  color: 'var(--parchment)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-snug)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const REFUSAL: CSSProperties = {
  margin: 0,
  color: 'var(--dusk)',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--leading-normal)',
};

const TOOL_FOOT: CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--dusk)',
  overflowWrap: 'anywhere',
};

const FAILURE: CSSProperties = {
  paddingLeft: 8,
  borderLeft: '2px solid var(--line)',
};

const FAILURE_LABEL: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--dusk)',
};

const FAILURE_DETAIL: CSSProperties = {
  margin: '2px 0 0',
  color: 'var(--card)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-normal)',
};

const PENDING: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.03em',
  color: 'var(--dusk)',
};

const SUGGESTION_LIST: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 6,
};

const SUGGESTION: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--ink-800)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--ink-850)',
  color: 'var(--parchment)',
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-snug)',
  textAlign: 'left',
  cursor: 'pointer',
};

const COMPOSER: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-sm)',
  marginTop: 'var(--space-sm)',
};

const INPUT: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 40,
  maxHeight: 120,
  padding: '8px 10px',
  border: '1px solid var(--ink-800)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--ink-850)',
  color: 'var(--card)',
  colorScheme: 'dark',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-snug)',
  resize: 'vertical',
};

const SEND: CSSProperties = {
  flex: 'none',
  padding: '9px 14px',
  border: '1px solid var(--crimson-deep)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--crimson-deep)',
  color: 'var(--card)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
};

const SEND_DISABLED: CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

const HINT: CSSProperties = {
  marginTop: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  color: 'var(--dusk)',
};

export function AssistantDock() {
  const location = useLocation();
  const page = pageForPath(location.pathname);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);
  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);

  const ask = async (question: string): Promise<void> => {
    const trimmed = question.trim();
    if (trimmed === '' || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setDraft('');

    const questionId = nextId.current++;
    setMessages((previous) => [
      ...previous,
      { id: questionId, role: 'user', text: trimmed },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    const appendFailure = (failure: Failure): void => {
      const id = nextId.current++;
      setMessages((previous) => [...previous, { id, role: 'failure', failure }]);
    };

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, page }),
        signal: controller.signal,
      });

      if (response.ok) {
        const payload: unknown = await response.json().catch(() => undefined);
        if (!isAssistantAnswer(payload)) {
          appendFailure({ kind: 'unreadable' });
          return;
        }
        const id = nextId.current++;
        setMessages((previous) => [...previous, { id, role: 'answer', answer: payload }]);
        return;
      }

      const body = await readFailureBody(response);
      if (response.status === 503) {
        appendFailure({ kind: 'not-configured' });
      } else if (response.status === 403) {
        // A scoped role is refused by the API rather than answered with
        // group-wide figures, so the dock says so instead of showing an error.
        appendFailure({ kind: 'scoped' });
      } else if (response.status === 502 && isUncitedFailure(body)) {
        appendFailure({ kind: 'uncited' });
      } else if (response.status === 400) {
        appendFailure({ kind: 'rejected', detail: body.error });
      } else {
        appendFailure({ kind: 'server', detail: failureDetail(body) });
      }
    } catch {
      if (controller.signal.aborted) return;
      appendFailure({ kind: 'network' });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      busyRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void ask(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void ask(draft);
  };

  const sendDisabled = busy || draft.trim() === '';

  return (
    <section className="sal-dock" aria-label="Salus Assistant">
      <header className="sal-dock__head">
        <span className="sal-dock__mark" aria-hidden="true">
          ◇
        </span>
        <h3 className="sal-dock__title">Salus Assistant</h3>
        <Tag tone="accent">Live API</Tag>
      </header>

      {messages.length === 0 ? (
        <div>
          <p className="sal-dock__label" style={{ marginTop: 0 }}>
            Suggested for this view
          </p>
          <div style={SUGGESTION_LIST}>
            {SUGGESTED_PROMPTS[page].map((prompt) => (
              <button
                key={prompt}
                type="button"
                style={SUGGESTION}
                onClick={() => {
                  setDraft(prompt);
                  inputRef.current?.focus();
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol ref={listRef} style={MESSAGE_LIST} aria-label="Conversation" aria-live="polite">
          {messages.map((message) => (
            <li key={message.id} style={MESSAGE_ITEM}>
              {message.role === 'user' ? (
                <p style={USER_BUBBLE}>{message.text}</p>
              ) : message.role === 'failure' ? (
                <FailureBlock failure={message.failure} />
              ) : message.answer.refused ? (
                <div>
                  <p style={REFUSAL}>I can't answer that from the portfolio data</p>
                  <ToolFooter tools={message.answer.toolsUsed} />
                </div>
              ) : (
                <div>
                  <AnswerBody text={message.answer.text} citations={message.answer.citations} />
                  <ToolFooter tools={message.answer.toolsUsed} />
                </div>
              )}
            </li>
          ))}
          {busy ? <li style={PENDING}>Checking the portfolio…</li> : null}
        </ol>
      )}

      <form style={COMPOSER} onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          rows={2}
          aria-label="Question for the Salus Assistant"
          placeholder="Ask about this view…"
          style={{ ...INPUT, opacity: busy ? 0.6 : 1 }}
        />
        <button
          type="submit"
          disabled={sendDisabled}
          style={sendDisabled ? { ...SEND, ...SEND_DISABLED } : SEND}
        >
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <p style={HINT}>Enter sends · Shift+Enter for a new line</p>
    </section>
  );
}
