import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/app/routes';
import { FilterProvider } from '../src/app/layout/filters';

/**
 * Renders every routed screen to a string. This is the cheapest proof that a
 * page actually mounts with data and does not throw: a broken import or a bad
 * hook shows up here, not in a screenshot.
 */
const screens = [
  { path: '/', heading: 'Group overview' },
  { path: '/map', heading: 'Global map' },
  { path: '/coverage', heading: 'Coverage' },
  { path: '/hotspots', heading: 'Hotspot' },
  { path: '/contracts', heading: 'Contract' },
  { path: '/exclusions', heading: 'Exclusion' },
  { path: '/audit', heading: 'Audit' },
  { path: '/documents', heading: 'Document' },
];

function render(path: string): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

describe('routed screens', () => {
  for (const screen of screens) {
    it(`renders ${screen.path}`, () => {
      const html = render(screen.path);
      expect(html.length).toBeGreaterThan(2000);
      expect(html.toLowerCase()).toContain(screen.heading.toLowerCase());
      expect(html).toContain('Synthetic data');
    });
  }

  it('renders real computed values, not placeholders', () => {
    const html = render('/');
    expect(html).toMatch(/\d+\.\d%/);
    expect(html).toContain('SGD');
  });

  it('shows the Excluded status on the contracts register', () => {
    const html = render('/contracts');
    expect(html).toContain('Excluded');
  });
});
