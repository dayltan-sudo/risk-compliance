import { useEffect, useState } from 'react';

import { AssistantDock } from './AssistantDock';

/**
 * The persistent right rail, which now holds the assistant and nothing else.
 *
 * The rail used to preview the exception queue. Overview renders the same
 * exceptions as its own table, so the preview repeated the page and cost ~296px
 * of a 1440px window while that table truncated. The tables and the exception
 * card are the list; this rail is for the assistant.
 *
 * The rail collapses to a vertical tab. The choice is remembered in
 * `localStorage`, but only the browser render reads it: the server render and
 * the first client render both start open so hydration cannot mismatch.
 */

/** Namespaced so a host page sharing the origin cannot collide with it. */
export const RAIL_STORAGE_KEY = 'salus.assistant-rail.collapsed';

/** The slice of `Storage` this module needs; anything unreadable counts as open. */
export type RailStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Default open on a first visit. Private-mode throws show up as open too. */
export function readRailCollapsed(storage: RailStorage | null | undefined): boolean {
  if (storage === null || storage === undefined) return false;
  try {
    return storage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A failed write only costs the preference, never the current toggle. */
export function writeRailCollapsed(
  storage: RailStorage | null | undefined,
  collapsed: boolean,
): void {
  if (storage === null || storage === undefined) return;
  try {
    storage.setItem(RAIL_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Private mode or a full quota: the rail still opens and closes this session.
  }
}

/** `window.localStorage`, or null in a server render or with storage blocked. */
function browserStorage(): RailStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The visible control: a header button when open, a vertical tab when collapsed. */
export function RailToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        className="sal-rail-tab"
        aria-label="Show assistant"
        aria-expanded={false}
        title="Show assistant"
        onClick={() => onToggle(false)}
      >
        <span className="sal-rail-tab__chev" aria-hidden="true">
          ‹
        </span>
        <span className="sal-rail-tab__label">Assistant</span>
      </button>
    );
  }

  return (
    <div className="sal-rail-head">
      <span className="sal-rail-head__label">Assistant</span>
      <button
        type="button"
        className="sal-rail-head__btn"
        aria-label="Hide assistant"
        aria-expanded
        title="Hide assistant"
        onClick={() => onToggle(true)}
      >
        Hide
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

export function RailPanel() {
  const [collapsed, setCollapsed] = useState(false);

  // Deliberately after mount: reading storage during render would make the
  // server HTML and the first client HTML disagree.
  useEffect(() => {
    setCollapsed(readRailCollapsed(browserStorage()));
  }, []);

  const apply = (next: boolean) => {
    setCollapsed(next);
    writeRailCollapsed(browserStorage(), next);
  };

  return (
    <div className={collapsed ? 'sal-rail-stack sal-rail-stack--collapsed' : 'sal-rail-stack'}>
      <RailToggle collapsed={collapsed} onToggle={apply} />

      {/*
       * `display: contents` keeps the dock a direct flex child of the stack, so
       * the rail lays out exactly as it did when `AssistantDock` was inlined.
       * Collapsing hides it rather than unmounting it: the conversation and any
       * in-flight answer survive the toggle.
       */}
      <div style={collapsed ? { display: 'none' } : { display: 'contents' }}>
        <AssistantDock />
      </div>
    </div>
  );
}
