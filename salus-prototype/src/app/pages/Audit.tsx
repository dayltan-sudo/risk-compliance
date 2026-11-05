import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import {
  ROLES,
  type AuditEvent,
  type AuditListResponse,
  type Role,
  type ScopedPortfolioResponse,
  type SessionResponse,
} from '../../audit/types';
import { PageHeader } from '../components/PageHeader';
import { Card, DataTable, Tag } from '../ui';
import type { Column } from '../ui';

/**
 * P7 governance screen.
 *
 * This is the only page allowed to call `/api`: the audit log and the scoped
 * portfolio are server reads, and the role switcher has to prove that the
 * server, not the browser, decides what the session can see.
 *
 * The page holds no derived business values. Counts come from
 * `/api/session/portfolio`, events from `/api/audit`.
 */

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `${response.status} ${response.statusText}${detail === '' ? '' : `: ${detail}`}`,
    );
  }
  return (await response.json()) as T;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const AUDIT_TIME = new Intl.DateTimeFormat('en-SG', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Singapore',
});

function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : AUDIT_TIME.format(date);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : stableValue(value);
  return text.length > 64 ? `${text.slice(0, 61)}…` : text;
}

type DiffEntry = { key: string; before: string; after: string };

/** Field-level comparison, with nested values compared by serialised form. */
function diffEntries(before: unknown, after: unknown): DiffEntry[] {
  if (!isPlainRecord(before) && !isPlainRecord(after)) {
    if (Object.is(before, after)) return [];
    return [{ key: 'value', before: compact(before), after: compact(after) }];
  }

  const beforeRecord = isPlainRecord(before) ? before : {};
  const afterRecord = isPlainRecord(after) ? after : {};
  const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]));
  const entries: DiffEntry[] = [];

  for (const key of keys) {
    const prior = beforeRecord[key];
    const next = afterRecord[key];

    if (Object.is(prior, next)) continue;
    if (isPlainRecord(prior) && isPlainRecord(next) && stableValue(prior) === stableValue(next)) {
      continue;
    }

    entries.push({ key, before: compact(prior), after: compact(next) });
  }

  return entries;
}

function AuditDiff({ event }: { event: AuditEvent }) {
  const entries = diffEntries(event.before, event.after);

  if (entries.length === 0) {
    return <span style={mutedStyle}>No field change</span>;
  }

  const visible = entries.slice(0, 4);

  return (
    <span style={diffStyle}>
      {visible.map((entry) => (
        <span key={entry.key} style={diffRowStyle}>
          <span style={diffKeyStyle}>{entry.key}</span>
          <span style={diffBeforeStyle}>{entry.before}</span>
          <span aria-hidden="true" style={arrowStyle}>
            →
          </span>
          <span style={diffAfterStyle}>{entry.after}</span>
        </span>
      ))}
      {entries.length > visible.length ? (
        <span style={mutedStyle}>+{entries.length - visible.length} more</span>
      ) : null}
    </span>
  );
}

const columns: Array<Column<AuditEvent>> = [
  {
    key: 'at',
    header: 'Time',
    width: '132px',
    render: (event) => (
      <time dateTime={event.at} title={event.at} style={timeStyle}>
        {formatAuditTime(event.at)}
      </time>
    ),
  },
  {
    key: 'actor',
    header: 'Actor',
    width: '22%',
    render: (event) => <span>{event.actor}</span>,
  },
  {
    key: 'action',
    header: 'Action',
    width: '18%',
    render: (event) => (
      <span className="sal-mono" style={actionStyle}>
        {event.action}
      </span>
    ),
  },
  {
    key: 'object',
    header: 'Object',
    width: '16%',
    render: (event) => (
      <span>
        <span className="sal-mono">{event.objectId}</span>
        <span style={objectTypeStyle}>{event.objectType}</span>
      </span>
    ),
  },
  {
    key: 'diff',
    header: 'Before → after',
    render: (event) => <AuditDiff event={event} />,
  },
];

export function AuditPage(): JSX.Element {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [scoped, setScoped] = useState<ScopedPortfolioResponse | null>(null);
  const [audit, setAudit] = useState<AuditListResponse | null>(null);
  const [pending, setPending] = useState<Role | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScope = useCallback(async (signal?: AbortSignal) => {
    const init = signal === undefined ? undefined : { signal };
    const [nextSession, nextScoped] = await Promise.all([
      fetchJson<SessionResponse>('/api/session', init),
      fetchJson<ScopedPortfolioResponse>('/api/session/portfolio', init),
    ]);

    if (signal?.aborted) return;

    setSession(nextSession);
    setScoped(nextScoped);
  }, []);

  const loadAudit = useCallback(async (signal?: AbortSignal) => {
    const init = signal === undefined ? undefined : { signal };
    const nextAudit = await fetchJson<AuditListResponse>('/api/audit', init);

    if (signal?.aborted) return;

    setAudit(nextAudit);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(messageOf(cause));
    };

    // Independent reads: a failing audit endpoint must not stop the scope
    // control from rendering, and vice versa.
    void loadScope(controller.signal).catch(fail);
    void loadAudit(controller.signal).catch(fail);

    return () => controller.abort();
  }, [loadScope, loadAudit]);

  const applyRole = async (role: Role) => {
    if (pending !== null) return;
    setPending(role);
    setError(null);
    try {
      await fetchJson<SessionResponse>('/api/session/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      // Both reads start; a failed audit does not cancel the scope update.
      await Promise.all([loadScope(), loadAudit()]);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  };

  const resetRole = async () => {
    if (pending !== null) return;
    setPending('reset');
    setError(null);
    try {
      await fetchJson<SessionResponse>('/api/session/reset', { method: 'POST' });
      await Promise.all([loadScope(), loadAudit()]);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  };

  const entityCount = scoped?.entityCount ?? session?.scope.entityCount ?? null;
  const groupEntityCount = scoped?.group.entityCount ?? null;
  const scopeKind = scoped?.scope.kind ?? session?.scope.kind ?? null;

  return (
    <div className="sal-page">
      <PageHeader
        eyebrow="Governance · P7"
        title="Audit trail and role scope"
        subtitle="Every change appends a row: who, what, which record, and the before and after. Switch role to watch the server narrow the book, including the CSV export."
        actions={
          <button
            type="button"
            className="sal-btn"
            onClick={() => void resetRole()}
            disabled={pending !== null}
          >
            Reset to Group Insurance
          </button>
        }
      />

      <Card
        title="Session scope"
        subtitle="The signed cookie carries the role; the API decides what the role can see."
        actions={
          <Tag tone={scopeKind === 'entity' ? 'accent' : 'neutral'}>
            {scopeKind === 'entity' ? 'Entity scope' : 'Group scope'}
          </Tag>
        }
      >
        <div style={switcherRowStyle}>
          <div className="sal-seg" role="group" aria-label="Demo role">
            {ROLES.map((role) => {
              const active = session?.role === role;
              return (
                <button
                  key={role}
                  type="button"
                  className={active ? 'sal-seg__btn sal-seg__btn--active' : 'sal-seg__btn'}
                  aria-pressed={active}
                  disabled={pending !== null}
                  onClick={() => void applyRole(role)}
                >
                  {role}
                </button>
              );
            })}
          </div>

          <p style={scopeLineStyle} aria-live="polite">
            Seeing <strong style={scopeCountStyle}>{entityCount ?? '—'}</strong> of{' '}
            <strong style={scopeCountStyle}>{groupEntityCount ?? '—'}</strong> entities
            {scoped?.scope.entityName ? (
              <span style={scopeEntityStyle}> · {scoped.scope.entityName}</span>
            ) : null}
          </p>
        </div>

        {error !== null ? (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        ) : null}

        <p style={scopeNoteStyle}>
          {scoped === null
            ? 'Loading the scoped portfolio…'
            : scoped.scope.kind === 'entity'
              ? `${scoped.siteCount} sites, ${scoped.policyCount} policies and ${scoped.requirementCount} requirements in scope. Group totals are ${scoped.group.siteCount} sites.`
              : `${scoped.siteCount} sites, ${scoped.policyCount} policies and ${scoped.requirementCount} requirements across the group.`}
        </p>
      </Card>

      <Card
        title="Audit trail"
        subtitle="Newest first. Append-only: there is no edit or delete endpoint."
        padded={false}
        footer="In-memory demo store. Eight seeded events plus anything this session changes; a restart clears it."
      >
        <DataTable
          columns={columns}
          rows={audit?.events ?? []}
          rowKey={(event) => event.id}
          dense
          caption="Audit events with time, actor, action, object and before-to-after field changes"
          emptyTitle={audit === null ? 'Loading audit trail' : 'No audit events'}
          emptyHint={audit === null ? 'Reading /api/audit.' : 'Nothing has been recorded yet.'}
        />
      </Card>

      <p className="sal-page__foot">
        Role scope and the audit log are enforced by the API. The browser only renders what the
        server returns.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ styles */

const switcherRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 'var(--space-lg)',
};

const scopeLineStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '.02em',
  color: 'var(--muted)',
};

const scopeCountStyle: CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 'var(--weight-semibold)',
};

const scopeEntityStyle: CSSProperties = {
  color: 'var(--crimson-deep)',
};

const scopeNoteStyle: CSSProperties = {
  marginTop: 'var(--space-lg)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 'var(--leading-relaxed)',
  color: 'var(--muted)',
};

const errorStyle: CSSProperties = {
  marginTop: 'var(--space-lg)',
  padding: 'var(--space-sm) var(--space-lg)',
  background: 'var(--crimson-tint)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--crimson-deeper)',
  fontSize: 'var(--text-body-sm)',
};

const timeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  whiteSpace: 'nowrap',
  color: 'var(--muted)',
};

const actionStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
};

const objectTypeStyle: CSSProperties = {
  display: 'block',
  marginTop: '1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const diffStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro)',
  lineHeight: 'var(--leading-snug)',
};

const diffRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 'var(--space-xxs)',
};

const diffKeyStyle: CSSProperties = {
  minWidth: '58px',
  color: 'var(--dusk-dim)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
};

const diffBeforeStyle: CSSProperties = {
  color: 'var(--muted)',
  textDecoration: 'line-through',
};

const arrowStyle: CSSProperties = {
  color: 'var(--dusk)',
};

const diffAfterStyle: CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 'var(--weight-semibold)',
};

const mutedStyle: CSSProperties = {
  color: 'var(--muted)',
};
