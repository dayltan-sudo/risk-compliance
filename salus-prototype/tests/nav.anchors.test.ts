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

/** The rail only, so the narrow-viewport strip cannot satisfy these checks. */
function railHtml(html: string): string {
  const start = html.indexOf('sal-sidebar__nav');
  return html.slice(start, html.indexOf('</aside>', start));
}

function navLinks(html: string): string[] {
  return [...railHtml(html).matchAll(/<a[^>]*class="sal-sidebar__item[^"]*"[^>]*href="([^"]+)"/g)].map(
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
    expect(railHtml(render('/'))).not.toContain('<button class="sal-sidebar__item');
  });

  it('keeps the narrow-viewport strip complete and outside the rail', () => {
    const html = render('/');
    const strip = html.slice(html.indexOf('sal-topnav'));
    const hrefs = [...strip.matchAll(/href="([^"]+)"/g)].map((match) => match[1] as string);
    for (const route of ROUTES) {
      expect(hrefs).toContain(route);
    }
  });

  it('renders the breadcrumb root as a link, not a button', () => {
    const html = render('/contracts');
    expect(html).toMatch(/<a[^>]*class="sal-topbar__crumb[^"]*"[^>]*href="\/"/);
    expect(html).not.toContain('<button type="button" class="sal-topbar__crumb');
  });

  it('marks the current page with aria-current and only that one', () => {
    const nav = railHtml(render('/contracts'));

    const current = [...nav.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map(
      (match) => match[1],
    );
    expect(current).toEqual(['/contracts']);
  });
});
