import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/app/routes';
import { FilterProvider } from '../src/app/layout/filters';

/**
 * The sidebar was a list of buttons, so navigation had no URL a user could copy,
 * middle-click or open in a new tab. These tests hold the anchor behaviour: the
 * hrefs must be the real routes, the current page must carry aria-current, and
 * nothing may go back to being a button.
 */
function render(path: string): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

const ROUTES = ['/', '/map', '/coverage', '/hotspots', '/contracts', '/exclusions', '/renewals', '/documents', '/report', '/audit'];

function navLinks(html: string): string[] {
  const nav = html.slice(html.indexOf('sal-sidebar__nav'));
  return [...nav.matchAll(/<a[^>]*class="sal-sidebar__item[^"]*"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1] as string,
  );
}

describe('sidebar navigation', () => {
  it('renders every destination as an anchor with its real href', () => {
    const hrefs = navLinks(render('/'));
    for (const route of ROUTES) {
      expect(hrefs).toContain(route);
    }
  });

  it('does not render nav items as buttons any more', () => {
    const html = render('/');
    const nav = html.slice(html.indexOf('sal-sidebar__nav'));
    expect(nav).not.toContain('<button class="sal-sidebar__item');
  });

  it('marks the current page with aria-current and only that one', () => {
    const html = render('/contracts');
    const nav = html.slice(html.indexOf('sal-sidebar__nav'));

    const current = [...nav.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map(
      (match) => match[1],
    );
    expect(current).toEqual(['/contracts']);
  });
});
