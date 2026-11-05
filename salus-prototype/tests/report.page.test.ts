import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { buildExceptions } from '../src/app/components/exceptions';
import { formatDate, formatMoneyCompact } from '../src/app/components/format';
import { useFilteredPortfolio } from '../src/app/layout/filters';
import type { FilteredPortfolioValue } from '../src/app/layout/filters';
import { FilterProvider } from '../src/app/layout/filters';
import { estimatePrintPages } from '../src/app/pages/Report';
import { AppRoutes } from '../src/app/routes';
import { portfolio as seed } from '../src/data/portfolio';
import { daysBetween, groupSummary } from '../src/engine';

/**
 * SSR proof for the board summary pack.
 *
 * The page's claim is that its figures are the app's figures: the assertions
 * below derive every expected number from the engine (or from `/api/summary`
 * itself) rather than hard-coding values, so a regression shows up here as a
 * mismatch, not as a stale fixture that still passes.
 */

const view: { current: FilteredPortfolioValue | null } = { current: null };

/** Captures the same view the page reads, without duplicating its selectors. */
function Probe() {
  view.current = useFilteredPortfolio();
  return null;
}

function readView(path: string): FilteredPortfolioValue {
  view.current = null;
  renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(Probe)),
    ),
  );
  if (view.current === null) throw new Error('probe did not render');
  return view.current;
}

function render(path: string): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

describe('/report board summary', () => {
  it('renders the route with its header block', () => {
    const html = render('/report');

    expect(html.length).toBeGreaterThan(4000);
    expect(html).toContain('Portfolio position for renewal review');
    expect(html).toContain('Group insurance programme');
    expect(html).toContain('Scope');
    expect(html).toContain('Group-wide');
    expect(html).toContain(formatDate(seed.config.effectiveFrom));
    expect(html).toContain('Print / save as PDF');
  });

  it('shows the group roll-up the API returns, not a placeholder', async () => {
    const { default: app } = await import('../server/index');
    const response = await app.request('/api/summary');
    expect(response.status).toBe(200);
    const api = (await response.json()) as { tivSgd: number; adequacyPct: number; openGaps: number; atRisk: number; excluded: number };

    const summary = groupSummary(seed);
    // The group role sees the whole book, so the API and the seed roll-up agree.
    expect(api.tivSgd).toBe(summary.tivSgd);
    expect(api.adequacyPct).toBe(summary.adequacyPct);

    const html = render('/report');
    expect(html).toContain(formatMoneyCompact(summary.tivSgd));
    expect(html).toContain(`${summary.adequacyPct.toFixed(1)}`);
    expect(html).toContain('Total insured value');
    expect(html).toContain('Coverage adequacy');
    expect(html).toContain('Open gaps');
    expect(html).toContain('At-risk');
    expect(html).toContain('Excluded');
    expect(html).toContain('data-report-kpis');
  });

  it('lists the five largest exceptions, with clause where one exists', () => {
    const current = readView('/report');
    const portfolio = current.portfolio;
    const expected = [...buildExceptions(portfolio, current.sites)]
      .sort((a, b) => b.valueSgd - a.valueSgd || a.id.localeCompare(b.id))
      .slice(0, 5);

    const html = render('/report');
    expect(html.match(/data-report-exception=/g)?.length ?? 0).toBe(5);

    for (const row of expected) {
      expect(html).toContain(row.siteName);
      expect(html).toContain(formatMoneyCompact(row.valueSgd));
      const requirement = row.id.startsWith('requirement-')
        ? portfolio.requirements.find((entry) => entry.id === row.id.slice('requirement-'.length))
        : undefined;
      if (requirement !== undefined) expect(html).toContain(requirement.clauseRef);
    }

    // Order is by value at stake, so the biggest row is rendered first.
    const first = expected[0];
    const second = expected[1];
    if (first !== undefined && second !== undefined) {
      expect(html.indexOf(first.siteName)).toBeLessThan(html.indexOf(second.siteName));
    }
  });

  it('lists every active policy expiring inside 90 days', () => {
    const portfolio = readView('/report').portfolio;
    const asOf = portfolio.config.effectiveFrom;
    const expected = portfolio.policies
      .filter((policy) => policy.status === 'Active')
      .map((policy) => ({ policy, daysLeft: daysBetween(asOf, policy.expiry) }))
      .filter((entry) => entry.daysLeft > 0 && entry.daysLeft <= 90);

    const html = render('/report');
    expect(html.match(/data-report-renewal=/g)?.length ?? 0).toBe(expected.length);

    for (const { policy } of expected) {
      expect(html).toContain(policy.policyNo);
      expect(html).toContain(formatDate(policy.expiry));
    }
  });

  it('prints its own provenance', () => {
    const html = render('/report');

    expect(html).toContain('Synthetic data');
    expect(html).toContain('Valuation date');
    expect(html).toContain('Generated');
    expect(html).toMatch(/\d{2}:\d{2} SGT/);
    expect(html).toContain('data-report-scope');
    expect(html).toContain('the print dialog');
  });

  it('says the page count is not measured where there is no layout', () => {
    const html = render('/report');
    expect(html).toContain('data-report-pages');
    expect(html).toContain('Not measured');
    expect(estimatePrintPages(null)).toBeNull();
  });

  it('names the entity scope when the entity filter is active', () => {
    const filtered = readView('/report?entity=ent-03');
    const entity = seed.entities.find((candidate) => candidate.id === 'ent-03');
    expect(entity).toBeDefined();

    const html = render('/report?entity=ent-03');
    expect(html).toContain(`${entity?.name} · ${filtered.portfolio.sites.length} sites`);
    expect(html).toContain(formatMoneyCompact(groupSummary(filtered.portfolio).tivSgd));
  });

  it('refuses to render zero when the scope holds no sites', () => {
    // `line=` with no value parses as an explicit empty line selection.
    const html = render('/report?line=');
    expect(html).toContain('Figures unavailable');
    expect(html).toContain('no sites fall inside the current filter');
  });
});
