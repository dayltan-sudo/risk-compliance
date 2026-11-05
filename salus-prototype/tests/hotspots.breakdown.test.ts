import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FilterProvider } from '../src/app/layout/filters';
import { DRIVERS, scoreSite } from '../src/engine';
import { AppRoutes } from '../src/app/routes';
import { portfolio } from '../src/data/portfolio';

/**
 * Item 2: the weight sliders could not save, so they are gone. The driver
 * breakdown, which is the part an analyst reads, stays and must still reconcile
 * against the engine.
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

const html = render('/hotspots');

describe('hotspots has no unsaveable weight control', () => {
  it('renders no sliders and no preview copy', () => {
    expect(html).not.toContain('type="range"');
    expect(html).not.toMatch(/weight preview/i);
    expect(html).not.toMatch(/preview only/i);
    expect(html).not.toMatch(/config weights are active/i);
  });

  it('still ranks every site at the dated config weights', () => {
    expect(html).toContain(
      `${portfolio.sites.length} sites scored on the ${DRIVERS.length}-driver model at config ${portfolio.config.effectiveFrom}.`,
    );
  });

  it('keeps the driver breakdown for the selected site', () => {
    // The breakdown card is titled with the site, so the chart and its rows are
    // the stable assertions, not a "Driver breakdown" heading.
    expect(html).toContain('Σ contributions');
    expect(html).toContain('Top driver');
    expect(html).toContain('Driver contributions to a score of');
    for (const driver of ['Coverage gap', 'Nat cat exposure', 'Mandatory line gap']) {
      expect(html).toContain(driver);
    }
    // The Σ line reconciles: the same number appears as the score and as the sum.
    expect(html).toMatch(/Σ contributions<\/span><span class="sal-mono"[^>]*>\d+\.\d\d<!-- --> = <!-- -->\d+\.\d\d/);
  });

  it('shows the score the engine produces, not a reweighted one', () => {
    const scored = portfolio.sites.map((site) => scoreSite(site, portfolio));
    const best = scored.reduce((top, next) => (next.score > top.score ? next : top));
    expect(html).toContain(best.score.toFixed(2));
  });
});
