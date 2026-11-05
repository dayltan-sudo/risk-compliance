import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, afterEach } from 'vitest';

import { AppRoutes } from '../src/app/routes';
import { applyPostedRecords } from '../src/data/overlay';
import { portfolio } from '../src/data/portfolio';
import { groupSummary } from '../src/engine/summary';
import { FilterProvider } from '../src/app/layout/filters';
import { clearPosted, recordPosted } from '../src/app/layout/posted';

/**
 * The demo's central claim, tested through the real screens: posting a validated
 * document changes what the Overview shows.
 *
 * Renders the router twice — once on the seed, once after a post — and compares
 * the adequacy figure in the markup.
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

describe('posted records reach the screens', () => {
  afterEach(() => clearPosted());

  it('raises the adequacy figure on the Overview after a post', () => {
    const beforePct = groupSummary(portfolio, portfolio.config.effectiveFrom).adequacyPct.toFixed(1);
    const before = render('/');
    expect(before).toContain(beforePct);

    const record = {
      documentId: 'slip-hai-phong',
      version: 1,
      fields: { policy_no: 'PRP-2026-0008', sum_insured: 'SGD 80,000,000' },
    };
    recordPosted(record);

    const afterPct = groupSummary(
      applyPostedRecords(portfolio, [record]).portfolio,
      portfolio.config.effectiveFrom,
    ).adequacyPct.toFixed(1);

    const after = render('/');
    expect(after).toContain(afterPct);
    expect(Number(afterPct)).toBeGreaterThan(Number(beforePct));
  });

  it('leaves the Overview unchanged when the posted document matches nothing', () => {
    const before = render('/');
    recordPosted({
      documentId: 'unmatched',
      version: 1,
      fields: { policy_no: 'NO-SUCH-POLICY', sum_insured: 'SGD 1' },
    });
    expect(render('/')).toBe(before);
  });

  it('shows the raised limit on the contracts register', () => {
    recordPosted({
      documentId: 'slip-hai-phong-2',
      version: 1,
      fields: { policy_no: 'PRP-2026-0008', sum_insured: 'SGD 80,000,000' },
    });

    const html = render('/contracts');
    expect(html).toContain('80.0m');
  });
});
