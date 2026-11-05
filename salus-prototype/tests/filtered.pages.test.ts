import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from '../src/app/routes';
import { EMPTY_FILTERS, FilterProvider, filterPortfolio } from '../src/app/layout/filters';
import { portfolio as seedPortfolio } from '../src/data/portfolio';
import { groupSummary, requirementSummary, scoreSite } from '../src/engine';

/**
 * Coverage, Hotspots, Contracts and Exclusions must read the filtered
 * portfolio, not the seed. Rendering with `?entity=<id>` has to change the page
 * and the headline counts have to match the engine run on the filtered data.
 */

const PAGES = ['/coverage', '/hotspots', '/contracts', '/exclusions'] as const;

function render(path: string): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

/** Rendered text with React's text-node separators removed. */
function text(path: string): string {
  return render(path).replaceAll('<!-- -->', '');
}

const asOf = seedPortfolio.config.effectiveFrom;

/** An entity that owns some, but not all, of the sites. */
const entity = seedPortfolio.entities.find((candidate) => {
  const owned = seedPortfolio.sites.filter((site) => site.entityId === candidate.id).length;
  return owned > 0 && owned < seedPortfolio.sites.length;
});
if (entity === undefined) throw new Error('seed has no entity with a strict subset of sites');

const entityId = entity.id;
const filtered = filterPortfolio(seedPortfolio, { ...EMPTY_FILTERS, entityId });
const keptNames = filtered.sites.map((site) => site.name);
const outsideNames = seedPortfolio.sites
  .filter((site) => site.entityId !== entityId)
  .map((site) => site.name)
  .filter((name) => !keptNames.some((kept) => kept.includes(name)));

describe('filtered fixtures', () => {
  it('has an entity that splits the portfolio', () => {
    expect(filtered.sites.length).toBeGreaterThan(0);
    expect(filtered.sites.length).toBeLessThan(seedPortfolio.sites.length);
    expect(outsideNames.length).toBeGreaterThan(0);
  });
});

describe('(a) the entity filter changes the page body', () => {
  for (const path of PAGES) {
    it(`${path} differs under ?entity= and drops out-of-scope sites`, () => {
      const all = text(path);
      const scoped = text(`${path}?entity=${entityId}`);

      expect(scoped).not.toBe(all);
      expect(scoped.length).toBeLessThan(all.length);

      for (const name of outsideNames) {
        expect(scoped, `${path} still shows ${name}`).not.toContain(name);
      }
    });
  }
});

describe('(b) page figures use the filtered counts', () => {
  const siteCount = filtered.sites.length;

  it('/coverage counts the filtered sites', () => {
    expect(text(`/coverage?entity=${entityId}`)).toContain(`of ${siteCount} sites are under`);
  });

  it('/hotspots counts the filtered sites', () => {
    expect(text(`/hotspots?entity=${entityId}`)).toContain(`${siteCount} sites scored on the`);
  });

  it('/contracts counts the filtered requirements and sites', () => {
    const total = requirementSummary(filtered, asOf).total;
    expect(text(`/contracts?entity=${entityId}`)).toContain(
      `${total} requirements across ${siteCount} sites`,
    );
  });

  it('/exclusions counts the filtered exclusions', () => {
    expect(text(`/exclusions?entity=${entityId}`)).toContain(
      `${filtered.exclusions.length} exclusions assessed`,
    );
  });
});

describe('(c) a kept site scores the same against the filtered portfolio', () => {
  for (const candidate of seedPortfolio.entities) {
    it(`entity ${candidate.id}`, () => {
      const scoped = filterPortfolio(seedPortfolio, { ...EMPTY_FILTERS, entityId: candidate.id });
      for (const site of scoped.sites) {
        const inScope = scoreSite(site, scoped);
        const inSeed = scoreSite(site, seedPortfolio);
        expect(inScope.score, site.name).toBe(inSeed.score);
        expect(inScope.band, site.name).toBe(inSeed.band);
      }
    });
  }
});

describe('(d) no filter leaves the figures unchanged', () => {
  const unfiltered = filterPortfolio(seedPortfolio, EMPTY_FILTERS);

  it('group summary matches the seed', () => {
    expect(groupSummary(unfiltered)).toEqual(groupSummary(seedPortfolio));
  });

  it('requirement summary matches the seed', () => {
    expect(requirementSummary(unfiltered, asOf)).toEqual(requirementSummary(seedPortfolio, asOf));
  });

  it('pages show the seed site count with no query', () => {
    const total = seedPortfolio.sites.length;
    expect(text('/coverage')).toContain(`of ${total} sites are under`);
    expect(text('/hotspots')).toContain(`${total} sites scored on the`);
    expect(text('/contracts')).toContain(
      `${requirementSummary(seedPortfolio, asOf).total} requirements across ${total} sites`,
    );
    expect(text('/exclusions')).toContain(
      `${seedPortfolio.exclusions.length} exclusions assessed`,
    );
  });
});
