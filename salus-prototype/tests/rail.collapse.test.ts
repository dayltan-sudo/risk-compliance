import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { FilterProvider } from '../src/app/layout/filters';
import {
  RAIL_STORAGE_KEY,
  RailToggle,
  readRailCollapsed,
  writeRailCollapsed,
} from '../src/app/layout/RailPanel';
import type { RailStorage } from '../src/app/layout/RailPanel';
import { AppRoutes } from '../src/app/routes';

/**
 * Item 1: the rail is the assistant only, and it collapses to a tab whose
 * choice survives a reload. The preference must never be read during a server
 * render, or the client's first render would disagree with the HTML.
 */

function fakeStorage(initial: Record<string, string> = {}): RailStorage & {
  calls: Array<[string, string | null]>;
} {
  const data = new Map(Object.entries(initial));
  const calls: Array<[string, string | null]> = [];

  return {
    calls,
    getItem(key: string) {
      calls.push(['get', data.get(key) ?? null]);
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      calls.push(['set', value]);
      data.set(key, value);
    },
  };
}

function renderToggle(collapsed: boolean): string {
  return renderToString(createElement(RailToggle, { collapsed, onToggle: () => undefined }));
}

describe('rail preference storage', () => {
  it('uses a namespaced key', () => {
    expect(RAIL_STORAGE_KEY.startsWith('salus.')).toBe(true);
  });

  it('defaults to open on a first visit', () => {
    expect(readRailCollapsed(fakeStorage())).toBe(false);
  });

  it('round-trips the collapsed choice', () => {
    const storage = fakeStorage();
    writeRailCollapsed(storage, true);
    expect(readRailCollapsed(storage)).toBe(true);
    writeRailCollapsed(storage, false);
    expect(readRailCollapsed(storage)).toBe(false);
  });

  it('treats unreadable or absent storage as open instead of throwing', () => {
    const blocked: RailStorage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
    };

    expect(readRailCollapsed(blocked)).toBe(false);
    expect(() => writeRailCollapsed(blocked, true)).not.toThrow();
    expect(readRailCollapsed(null)).toBe(false);
    expect(() => writeRailCollapsed(undefined, true)).not.toThrow();
  });
});

describe('the toggle control', () => {
  it('offers a named "Hide assistant" button when open', () => {
    const html = renderToggle(false);
    expect(html).toContain('aria-label="Hide assistant"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('sal-rail-tab');
  });

  it('collapses to a vertical tab named "Show assistant"', () => {
    const html = renderToggle(true);
    expect(html).toContain('aria-label="Show assistant"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('sal-rail-tab');
    expect(html).not.toContain('aria-label="Hide assistant"');
  });
});

describe('the rendered rail', () => {
  function render(path: string): string {
    return renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(FilterProvider, null, createElement(AppRoutes)),
      ),
    );
  }

  it('opens by default, holds the assistant and no exception list', () => {
    const html = render('/');

    expect(html).toContain('Salus Assistant');
    expect(html).toContain('aria-label="Hide assistant"');
    expect(html).not.toContain('Action items');
    expect(html).not.toContain('sal-rail__item-title');
  });

  it('does not read localStorage while rendering on the server', () => {
    const storage = fakeStorage();
    const getItem = vi.spyOn(storage, 'getItem');
    const hadWindow = 'window' in globalThis;
    const previous = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    try {
      const html = render('/');
      expect(html).toContain('Salus Assistant');
      expect(getItem).not.toHaveBeenCalled();
    } finally {
      if (hadWindow) {
        (globalThis as { window?: unknown }).window = previous;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
    }
  });
});
