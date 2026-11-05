import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { ScopedPortfolioResponse } from '../../audit/types';

/**
 * Who the server thinks you are, read once by the shell and shared with the
 * pages through context.
 *
 * Scope is not a client preference: the cookie carries the role, `/api/session`
 * derives the scope, and this module only renders it. Nothing here decides what
 * a role may see.
 *
 * When the read fails, the status is `unavailable` and pages render unscoped
 * rather than guessing a role.
 */

export type ScopeStatus = 'loading' | 'ready' | 'unavailable';

export type ScopedSessionValue = {
  status: ScopeStatus;
  session: ScopedPortfolioResponse | null;
  /** Re-read `/api/session/portfolio`. */
  refresh: () => void;
};

const UNAVAILABLE: ScopedSessionValue = {
  status: 'unavailable',
  session: null,
  refresh: () => undefined,
};

export const SessionScopeContext = createContext<ScopedSessionValue | null>(null);

export function useScopedSession(): ScopedSessionValue {
  return useContext(SessionScopeContext) ?? UNAVAILABLE;
}

async function readSession(signal: AbortSignal): Promise<ScopedPortfolioResponse> {
  const response = await fetch('/api/session/portfolio', { signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as ScopedPortfolioResponse;
}

/**
 * `value` is a test seam: pass a resolved scope and the provider skips the
 * network entirely, which is how the SSR tests exercise a champion's view.
 */
export function SessionScopeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: ScopedSessionValue;
}) {
  const [session, setSession] = useState<ScopedPortfolioResponse | null>(null);
  const [status, setStatus] = useState<ScopeStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (value !== undefined) return;
    const controller = new AbortController();

    readSession(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSession(next);
        setStatus('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSession(null);
        setStatus('unavailable');
      });

    return () => controller.abort();
  }, [attempt, value]);

  const resolved = useMemo<ScopedSessionValue>(
    () => value ?? { status, session, refresh },
    [value, status, session, refresh],
  );

  return (
    <SessionScopeContext.Provider value={resolved}>{children}</SessionScopeContext.Provider>
  );
}

/* ---------------------------------------------------------------- labels */

/** Who you are viewing as, e.g. `Entity Champion · Data Centres — Europe`. */
export function scopeChipText(session: ScopedPortfolioResponse | null): string {
  if (session === null) return 'Scope unavailable';
  if (session.scope.kind !== 'entity') return session.role;
  return `${session.role} · ${session.scope.entityName ?? session.scope.entityId ?? 'Entity'}`;
}

/** The second line of the chip: the scope and how much of the book it holds. */
export function scopeChipDetail(session: ScopedPortfolioResponse | null): string {
  if (session === null) return 'Not read from the session';
  if (session.scope.kind === 'entity') {
    const entity = session.scope.entityName ?? session.scope.entityId ?? 'Entity';
    return `${entity} · ${session.siteCount} of ${session.group.siteCount} sites`;
  }
  return `Group-wide · ${session.group.siteCount} sites`;
}

/** `R&C Manager` gives RC, not RM: initials come from words, not from symbols. */
export function roleInitials(role: string): string {
  const words = role.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return initials === '' ? 'GR' : initials;
}

/* ------------------------------------------------------------------- chip */

export function ScopeChip() {
  const { status, session, refresh } = useScopedSession();

  const entity =
    session !== null && session.scope.kind === 'entity'
      ? (session.scope.entityName ?? session.scope.entityId ?? 'Entity')
      : null;

  const name =
    status === 'loading'
      ? 'Reading session'
      : session === null
        ? 'Scope unavailable'
        : session.role;
  /**
   * Three short lines rather than one long one: the sidebar footer is ~170px
   * wide, and a single "Entity · N of M sites" line orphans the last word.
   */
  const scopeLine =
    status === 'loading'
      ? 'Checking /api/session'
      : session === null
        ? 'Not read from the session'
        : entity !== null
          ? entity
          : `Group-wide · ${session.group.siteCount} sites`;
  const shareLine =
    session !== null && entity !== null
      ? `${session.siteCount} of ${session.group.siteCount} sites`
      : null;
  const initials = session === null ? 'GR' : roleInitials(session.role);

  return (
    <button
      type="button"
      className="sal-user"
      style={chipButtonStyle}
      title={`Viewing as ${scopeChipText(session)}${session === null ? '' : ` (${scopeChipDetail(session)})`}. Click to re-read the scope.`}
      aria-label={`Viewing as ${scopeChipText(session)}. Click to refresh.`}
      onClick={refresh}
    >
      <span className="sal-user__avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="sal-user__body">
        <span className="sal-user__name">{name}</span>
        <span className="sal-user__role">{scopeLine}</span>
        {shareLine === null ? null : (
          <span className="sal-user__role" style={shareLineStyle}>
            {shareLine}
          </span>
        )}
      </span>
    </button>
  );
}

const shareLineStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};

const chipButtonStyle: CSSProperties = {
  width: '100%',
  padding: 0,
  border: 0,
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};
