import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { buildExceptions, describeExceptions } from '../src/app/components/exceptions';
import type { ScoredSite } from '../src/app/layout/filters';
import { FilterProvider } from '../src/app/layout/filters';
import { AppRoutes } from '../src/app/routes';
import { portfolio as seed } from '../src/data/portfolio';
import { m, makePortfolio, makePolicy, makeRequirement, makeSite } from './helpers';

/* --------------------------------------------------------------- fixtures */

const site = makeSite();

const fixtureScored: ScoredSite[] = [
  {
    site,
    score: 70,
    band: 'High',
    drivers: [],
    coverSgd: m(20),
    tivCoverRatio: 0.2,
    gapPct: 80,
    underInsured: true,
    openRequirements: 2,
  },
];

const fixturePortfolio = makePortfolio({
  requirements: [
    makeRequirement({ id: 'req-gap', line: 'Property & BI', peril: 'Fire', requiredLimit: m(200) }),
    makeRequirement({ id: 'req-excluded', line: 'Cyber', peril: 'Ransomware', requiredLimit: m(25) }),
  ],
  exclusions: [
    {
      id: 'exc-test',
      coverageId: 'cov-test',
      siteId: 'site-test',
      line: 'Cyber',
      scope: 'full',
      peril: 'Ransomware',
      clauseRef: 'EXC-1',
      wordingExcerpt: 'Ransomware is excluded.',
    },
  ],
  policies: [makePolicy({ expiry: '2026-12-01' })],
});

/* -------------------------------------------------------- render helpers */

function render(path: string): string {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(FilterProvider, null, createElement(AppRoutes)),
    ),
  );
}

/** Visible text of a render, with tags and React's separator comments removed. */
function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Exception titles in table order: the anchor inside each `sal-exc__title` cell. */
function tableTitles(html: string): string[] {
  const titles: string[] = [];
  let cursor = html.indexOf('class="sal-exc__title"');

  while (cursor !== -1) {
    const anchorStart = html.indexOf('>', html.indexOf('<a', cursor)) + 1;
    const anchorEnd = html.indexOf('</a>', anchorStart);
    titles.push(html.slice(anchorStart, anchorEnd).trim());
    cursor = html.indexOf('class="sal-exc__title"', anchorEnd);
  }

  return titles;
}

function railTitles(html: string): string[] {
  return [...html.matchAll(/<p class="sal-rail__item-title">([^<]*)<\/p>/g)].map((match) =>
    (match[1] ?? '').trim(),
  );
}

function numberFrom(source: string, pattern: RegExp): number {
  const match = source.match(pattern);
  if (match === null) throw new Error(`No match for ${pattern} in: ${source.slice(0, 400)}`);
  return Number(match[1] ?? NaN);
}

/** Every `href` value whose target matches `pattern`, id portion only. */
function anchorIds(html: string, path: string): string[] {
  const pattern = new RegExp(`href="${path}#([^"]+)"`, 'g');
  return [...html.matchAll(pattern)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);
}

/* ------------------------------------------------ builder: one queue, links */

describe('buildExceptions — deep links', () => {
  const rows = buildExceptions(fixturePortfolio, fixtureScored);

  it('emits one row per kind with a stable order', () => {
    expect(rows.map((row) => row.kind)).toEqual([
      'Requirement gap',
      'Renewal',
      'Excluded cover',
      'Under-insured',
    ]);
    expect(buildExceptions(fixturePortfolio, fixtureScored).map((row) => row.id)).toEqual(
      rows.map((row) => row.id),
    );
  });

  it('links a requirement gap to its contract clause, not to the map', () => {
    const gap = rows.find((row) => row.id === 'requirement-req-gap');
    expect(gap?.href).toBe('/contracts#req-gap');
    expect(gap?.target).toBe('record');
  });

  it('links an excluded cover to the exclusion wording that causes it', () => {
    const excluded = rows.find((row) => row.id === 'requirement-req-excluded');
    expect(excluded?.href).toBe('/exclusions#exc-test');
    expect(excluded?.target).toBe('record');
  });

  it('keeps the map where no page owns the row', () => {
    const renewal = rows.find((row) => row.kind === 'Renewal');
    const underInsured = rows.find((row) => row.kind === 'Under-insured');
    expect(renewal?.href).toBe('/map?site=site-test');
    expect(renewal?.target).toBe('map');
    // Coverage has no per-site anchors yet, so the map stays the target.
    expect(underInsured?.href).toBe('/map?site=site-test');
    expect(underInsured?.target).toBe('map');
  });

  it('describes the queue by kind from the rows themselves', () => {
    expect(describeExceptions(rows)).toBe(
      '1 requirement gap + 1 exclusion + 1 renewal + 1 under-insured site',
    );
    expect(describeExceptions([])).toBe('');
  });
});

/* ---------------------------------------------- rendered queue: rail + table */

describe('Overview exception queue', () => {
  const collapsed = render('/');
  const collapsedText = text(collapsed);
  const collapsedTable = tableTitles(collapsed);
  const collapsedRail = railTitles(collapsed);

  it('shows the seed queue, 8 of 13 collapsed', () => {
    // The seed portfolio produces 13 exceptions; the collapsed table budget is 8.
    expect(collapsedTable).toHaveLength(8);
    expect(collapsedText).toContain('Showing the top 8 of 13 highest-priority items.');
  });

  it('rail previews the same ordered queue from 5 rows, not its own list', () => {
    expect(collapsedRail).toHaveLength(5);
    expect(collapsedRail).toEqual(collapsedTable.slice(0, 5));
    expect(collapsedText).toContain('Top 5 of 13 open items.');
  });

  it('rail links to the expanded table instead of the map', () => {
    expect(collapsed).toContain('href="/?all=1"');
    expect(collapsedText).toContain('View all 13');
  });

  it('expands in place to every item, footer copy included', () => {
    const expanded = render('/?all=1');
    const expandedText = text(expanded);
    const expandedTable = tableTitles(expanded);
    const expandedRail = railTitles(expanded);

    expect(expandedTable).toHaveLength(13);
    expect(expandedText).toContain('Showing all 13 open items.');
    expect(expandedText).not.toContain('View all 13');
    expect(expandedText).not.toContain('highest-priority items');
    expect(expandedText).toContain('Show top 8');
    // Same rows, same order: the expanded table is the collapsed table plus the tail.
    expect(expandedTable.slice(0, 8)).toEqual(collapsedTable);
    expect(expandedRail).toEqual(collapsedRail);
  });

  it('links each exception to the record behind it', () => {
    // Every row on screen, so each kind's count is the queue's count.
    const html = render('/?all=1');
    const pageText = text(html);
    const gaps = numberFrom(pageText, /(\d+) requirement gaps? \+/);
    const excluded = numberFrom(pageText, /(\d+) exclusions? \+/);

    const contractIds = anchorIds(html, '/contracts');
    const exclusionIds = anchorIds(html, '/exclusions');
    expect(contractIds).toHaveLength(gaps);
    expect(exclusionIds).toHaveLength(excluded);

    const requirementIds = new Set(seed.requirements.map((requirement) => requirement.id));
    for (const id of contractIds) expect(requirementIds.has(id)).toBe(true);

    const knownExclusions = new Set(seed.exclusions.map((exclusion) => exclusion.id));
    for (const id of exclusionIds) expect(knownExclusions.has(id)).toBe(true);
  });

  it('accounts for the gap between the Open gaps tile and the queue', () => {
    expect(collapsedText).toContain(
      '13 open items: 4 requirement gaps + 3 exclusions + 2 renewals + 4 under-insured sites.',
    );
    expect(collapsedText).toContain('Open gaps counts requirement gaps only');
  });

  it('keeps footer copy matching the rows under a filter', () => {
    const filtered = render('/?gaps=1');
    const filteredText = text(filtered);
    const shown = tableTitles(filtered).length;

    const tableTotal = filteredText.includes('highest-priority items')
      ? numberFrom(filteredText, /top \d+ of (\d+) highest-priority items/)
      : numberFrom(filteredText, /Showing all (\d+) open items/);

    if (filteredText.includes('highest-priority items')) {
      expect(numberFrom(filteredText, /top (\d+) of \d+ highest-priority items/)).toBe(shown);
    } else {
      expect(shown).toBe(tableTotal);
    }
    // The rail's total is the table's total: one builder, one count.
    expect(numberFrom(filteredText, /Top \d+ of (\d+) open items/)).toBe(tableTotal);
  });
});
