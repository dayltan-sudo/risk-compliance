import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, FilterProvider, filterPortfolio } from '../src/app/layout/filters';
import { Contracts, emptyStateFor, matchesQuery } from '../src/app/pages/Contracts';
import { AppRoutes } from '../src/app/routes';
import { SessionScopeContext } from '../src/app/components/sessionScope';
import type { ScopedSessionValue } from '../src/app/components/sessionScope';
import type { ScopedPortfolioResponse } from '../src/audit/types';
import { portfolio as seed } from '../src/data/portfolio';

/**
 * The register has to answer a clause-first question without an expand-and-read
 * pass: a clause column, one search box over site / counterparty / clause /
 * policy, `?q=` in the URL, and an empty state that names the real cause.
 *
 * These are SSR renders, so the counts asserted here are the counts a reader
 * sees on first paint of a shared link.
 */

const AS_OF = seed.config.effectiveFrom;

function html(path: string, session: ScopedPortfolioResponse | null = null): string {
  const value: ScopedSessionValue = {
    status: 'ready',
    session,
    refresh: () => undefined,
  };

  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        SessionScopeContext.Provider,
        { value },
        createElement(FilterProvider, null, createElement(Contracts)),
      ),
    ),
  ).replaceAll('<!-- -->', '');
}

/** Rows the reader can see: every register row carries `data-clickable`. */
function rowCount(markup: string): number {
  return (markup.match(/data-clickable="true"/g) ?? []).length;
}

function champion(
  entityId: string,
  entityName: string,
  siteCount: number,
  requirementCount: number,
): ScopedPortfolioResponse {
  return {
    role: 'Entity Champion',
    scope: { kind: 'entity', entityId, entityName, entityIds: [entityId], entityCount: 1 },
    asOf: AS_OF,
    entityCount: 1,
    siteCount,
    policyCount: 0,
    requirementCount,
    group: { entityCount: seed.entities.length, siteCount: seed.sites.length },
    summary: {
      tivSgd: 0,
      insuredSgd: 0,
      adequacyPct: 0,
      openGaps: 0,
      atRisk: 0,
      excluded: 0,
      requirementCounts: { Met: 0, 'At-risk': 0, Gap: 0, Excluded: 0, total: 0 },
    },
  };
}

const total = seed.requirements.length;

describe('(a) the clause is visible without expanding the row', () => {
  it('renders a Clause column with the clause and agreement reference in the row', () => {
    const markup = html('/contracts');

    expect(markup).toContain('>Clause<');
    // Singapore DC-4's clause 8.4 is in the collapsed register, not only in the
    // detail panel.
    expect(rowCount(markup)).toBe(total);
    expect(markup).toContain('Cl. 8.4');
    expect(markup).toContain('LEASE-SGDC-2025-06');
  });

  it('carries the requirement id on the row so /contracts#req-06 can land on it', () => {
    const markup = html('/contracts');

    expect(markup).toContain('id="req-06"');
    expect(markup).not.toContain('data-highlighted="true"');
  });

  it('highlights the row a deep link points at', () => {
    const markup = html('/contracts#req-06');

    expect(markup).toContain('id="req-06"');
    expect(markup).toContain('data-highlighted="true"');
  });
});

describe('(b) search narrows the register and keeps the counts honest', () => {
  it('matches a clause reference written the way a reader would type it', () => {
    const markup = html('/contracts?q=clause%208.4');

    expect(rowCount(markup)).toBe(2);
    expect(markup).toContain('2 shown of 18');
    expect(markup).toContain('LEASE-SGDC-2025-06');
    expect(markup).toContain('LEASE-SYD-2026-01');
    // The tiles still describe the whole scoped register, not the search.
    expect(markup).toContain('18 requirements across');
  });

  it('matches a counterparty', () => {
    const markup = html('/contracts?q=merlion');

    expect(rowCount(markup)).toBe(1);
    expect(markup).toContain('1 shown of 18');
    expect(markup).toContain('Merlion Cloud Services Pte Ltd');
  });

  it('matches a site', () => {
    const markup = html('/contracts?q=singapore%20dc-4');

    expect(rowCount(markup)).toBe(2);
    expect(markup).toContain('Singapore DC-4');
    expect(markup).not.toContain('Frankfurt DC-1');
  });

  it('matches the policy that responds to the requirement', () => {
    const coverage = seed.coverages.find(
      (candidate) => candidate.siteId === 'site-04' && candidate.line === 'Cyber',
    );
    const policy = seed.policies.find((candidate) => candidate.id === coverage?.policyId);
    expect(policy?.policyNo).toBe('CYB-2026-0003');

    const markup = html('/contracts?q=CYB-2026-0003');

    expect(rowCount(markup)).toBe(1);
    expect(markup).toContain('id="req-06"');
  });

  it('matches a coverage id', () => {
    const markup = html('/contracts?q=cov-19');

    expect(rowCount(markup)).toBe(1);
    expect(markup).toContain('id="req-06"');
  });

  it('every token has to land, so a compound query narrows twice', () => {
    const markup = html('/contracts?q=cyber%20merlion');

    expect(rowCount(markup)).toBe(1);
    expect(markup).toContain('id="req-06"');
  });

  it('persists the term in the URL and echoes it in the input', () => {
    const markup = html('/contracts?q=merlion');

    expect(markup).toContain('name="q"');
    expect(markup).toContain('value="merlion"');
  });

  it('combines with the FilterBar entity filter without inventing counts', () => {
    const filtered = filterPortfolio(seed, { ...EMPTY_FILTERS, entityId: 'ent-02' });
    const markup = html('/contracts?entity=ent-02&q=clause%208.4');

    expect(filtered.requirements.length).toBe(3);
    expect(markup).toContain('2 shown of 3');
  });

  it('shows a real empty state with a way back to the full register', () => {
    const markup = html('/contracts?q=zzzz');

    expect(rowCount(markup)).toBe(0);
    expect(markup).toContain('No requirements match');
    expect(markup).toContain('zzzz');
    expect(markup).toContain('0 shown of 18');
    expect(markup).toContain('Clear search');
  });
});

describe('(c) matchesQuery', () => {
  const haystack = 'frankfurt dc-1 rheinmain bank ag fac-fra-2024-09 clause 11.1 cov-01 prp-2026-0001';

  it('is case and token insensitive', () => {
    expect(matchesQuery(haystack, 'RHEINMAIN')).toBe(true);
    expect(matchesQuery(haystack, 'clause 11.1')).toBe(true);
    expect(matchesQuery(haystack, 'cl 11.1')).toBe(true);
    expect(matchesQuery(haystack, 'bank fra')).toBe(true);
  });

  it('rejects a row when any token is missing', () => {
    expect(matchesQuery(haystack, 'rheinmain merlion')).toBe(false);
  });

  it('treats an empty or whitespace query as no filter', () => {
    expect(matchesQuery(haystack, '')).toBe(true);
    expect(matchesQuery(haystack, '   ')).toBe(true);
  });
});

describe('(d) a scoped role narrows the register and says so', () => {
  const scoped = filterPortfolio(seed, { ...EMPTY_FILTERS, entityId: 'ent-01' });
  const session = champion('ent-01', 'Data Centres — Europe', scoped.sites.length, scoped.requirements.length);

  it('has a champion fixture with a strict subset', () => {
    expect(scoped.requirements.length).toBe(4);
    expect(scoped.sites.length).toBe(3);
  });

  it('counts and rows both describe the entity only', () => {
    const markup = html('/contracts', session);

    expect(rowCount(markup)).toBe(4);
    expect(markup).toContain('4 shown of 4');
    expect(markup).toContain('4 requirements across 3 sites');
    expect(markup).toContain('Showing Data Centres — Europe only, because of your role.');
    expect(markup).not.toContain('Singapore DC-4');
  });

  it('search inside a scoped register still reports N of the scoped total', () => {
    const markup = html('/contracts?q=dublin', session);

    expect(rowCount(markup)).toBe(2);
    expect(markup).toContain('2 shown of 4');
  });

  it('names the role, not a filter, when the scoped register is empty', () => {
    const markup = html('/contracts?q=zzzz', session);

    expect(markup).toContain('No requirements match');
    expect(markup).toContain('in Data Centres — Europe');
  });
});

describe('(e) empty-state copy names the cause', () => {
  it('blames the search term when the search missed', () => {
    const state = emptyStateFor({
      query: 'zzzz',
      scopeName: null,
      role: null,
      rowsInScope: 18,
      outOfScope: 0,
      filterLabel: 'All',
    });

    expect(state.title).toContain('No requirements match “zzzz”');
    expect(state.body).toContain('18 requirements');
    expect(state.body).toContain('policy or coverage id');
  });

  it('names the scope and the count outside it when the role empties the page', () => {
    const state = emptyStateFor({
      query: '',
      scopeName: 'Data Centres — Europe',
      role: 'Entity Champion',
      rowsInScope: 0,
      outOfScope: 18,
      filterLabel: 'All',
    });

    expect(state.title).toBe('No requirements in Data Centres — Europe');
    expect(state.body).toContain('You are viewing as Entity Champion');
    expect(state.body).toContain('limits this register to Data Centres — Europe');
    expect(state.body).toContain('18 requirements sit outside that scope');
    expect(state.body).not.toContain('Clear the status filter');
  });

  it('says scope and status both apply when a scoped role has rows but the filter hides them', () => {
    const state = emptyStateFor({
      query: '',
      scopeName: 'Data Centres — Europe',
      role: 'Entity Champion',
      rowsInScope: 4,
      outOfScope: 14,
      filterLabel: 'Gap',
    });

    expect(state.title).toBe('No Gap requirements in Data Centres — Europe');
    expect(state.body).toContain('which limits this register to Data Centres — Europe');
    expect(state.body).toContain('none of them Gap');
  });

  it('keeps a plain status filter honest for a group role', () => {
    const state = emptyStateFor({
      query: '',
      scopeName: null,
      role: null,
      rowsInScope: 18,
      outOfScope: 0,
      filterLabel: 'Excluded',
    });

    expect(state.title).toBe('No requirements in this view');
    expect(state.body).toContain('Clear the status filter to see all 18');
  });
});

describe('(f) the shell still renders with the new chrome', () => {
  it('mounts every route with a Glossary control', () => {
    const markup = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ['/contracts'] },
        createElement(FilterProvider, null, createElement(AppRoutes)),
      ),
    );

    expect(markup).toContain('Glossary');
    expect(markup).toContain('Reading session');
  });
});
