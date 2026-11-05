import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  GLOSSARY,
  GlossaryDrawer,
  GlossaryTerm,
  glossaryEntry,
} from '../src/app/components/Glossary';
import {
  ScopeChip,
  SessionScopeContext,
  roleInitials,
  scopeChipDetail,
  scopeChipText,
} from '../src/app/components/sessionScope';
import type { ScopedSessionValue } from '../src/app/components/sessionScope';
import type { ScopedPortfolioResponse } from '../src/audit/types';
import { portfolio as seed } from '../src/data/portfolio';

/**
 * The shell has to say who you are viewing as, and the vocabulary the screens
 * use has to be defined somewhere a non-specialist can reach.
 */

const AS_OF = seed.config.effectiveFrom;

function group(): ScopedPortfolioResponse {
  return {
    role: 'Group Insurance',
    scope: {
      kind: 'group',
      entityId: null,
      entityName: null,
      entityIds: seed.entities.map((entity) => entity.id),
      entityCount: seed.entities.length,
    },
    asOf: AS_OF,
    entityCount: seed.entities.length,
    siteCount: seed.sites.length,
    policyCount: seed.policies.length,
    requirementCount: seed.requirements.length,
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

function champion(): ScopedPortfolioResponse {
  return {
    ...group(),
    role: 'Entity Champion',
    scope: {
      kind: 'entity',
      entityId: 'ent-01',
      entityName: 'Data Centres — Europe',
      entityIds: ['ent-01'],
      entityCount: 1,
    },
    entityCount: 1,
    siteCount: 3,
    requirementCount: 4,
  };
}

function chip(session: ScopedPortfolioResponse | null): string {
  const value: ScopedSessionValue = { status: 'ready', session, refresh: () => undefined };
  return renderToString(
    createElement(SessionScopeContext.Provider, { value }, createElement(ScopeChip)),
  ).replaceAll('<!-- -->', '');
}

describe('(a) the scope chip names who you are viewing as', () => {
  it('says Group Insurance for a group role', () => {
    expect(scopeChipText(group())).toBe('Group Insurance');
    expect(scopeChipDetail(group())).toBe(`Group-wide · ${seed.sites.length} sites`);
  });

  it('says the role and the entity for a champion', () => {
    expect(scopeChipText(champion())).toBe('Entity Champion · Data Centres — Europe');
    expect(scopeChipDetail(champion())).toBe(
      `Data Centres — Europe · 3 of ${seed.sites.length} sites`,
    );
  });

  it('mounts the group chip with the role and the book it covers', () => {
    const markup = chip(group());

    expect(markup).toContain('Group Insurance');
    expect(markup).toContain(`Group-wide · ${seed.sites.length} sites`);
    expect(markup).toContain('Viewing as Group Insurance');
    expect(markup).not.toContain('Demo workspace');
  });

  it('mounts the champion chip with the entity and its share of the sites', () => {
    const markup = chip(champion());

    expect(markup).toContain('Entity Champion');
    expect(markup).toContain('Data Centres — Europe');
    expect(markup).toContain(`3 of ${seed.sites.length} sites`);
    expect(markup).toContain('Viewing as Entity Champion · Data Centres — Europe');
  });

  it('does not invent a role when the session could not be read', () => {
    expect(scopeChipText(null)).toBe('Scope unavailable');
    expect(chip(null)).toContain('Scope unavailable');
  });

  it('derives avatar initials from the role', () => {
    expect(roleInitials('Group Insurance')).toBe('GI');
    expect(roleInitials('R&C Manager')).toBe('RC');
    expect(roleInitials('Entity Champion')).toBe('EC');
    expect(roleInitials('Auditor')).toBe('A');
  });
});

describe('(b) the glossary defines the vocabulary the screens use', () => {
  const required = [
    'TIV',
    'ITV',
    'PML',
    'Sum insured',
    'Occurrence limit',
    'Aggregate limit',
    'Deductible / excess',
    'Sub-limit',
    'Placement %',
    'Exclusion override',
    'Requirement status',
  ];

  it('has an entry for every term the review flagged', () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    for (const term of required) {
      expect(terms, `missing ${term}`).toContain(term);
    }
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(10);
  });

  it('uses unique ids and one readable sentence each', () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of GLOSSARY) {
      expect(entry.body.length, entry.term).toBeGreaterThan(40);
      expect(entry.body.trim().endsWith('.'), entry.term).toBe(true);
      // One sentence: no internal full stops followed by a capital.
      expect(entry.body.slice(0, -1)).not.toMatch(/\.\s+[A-Z]/);
    }
  });

  it('does not define a term using the term itself', () => {
    for (const entry of GLOSSARY) {
      const body = entry.body.toLowerCase();
      const head = entry.term.toLowerCase().split(/[\s/]+/)[0];
      if (head === undefined || head.length < 4) continue;
      const occurrences = body.split(head).length - 1;
      expect(occurrences, `${entry.term} repeats itself`).toBeLessThanOrEqual(1);
    }
  });

  it('resolves entries by id', () => {
    expect(glossaryEntry('tiv')?.term).toBe('TIV');
    expect(glossaryEntry('nothing')).toBeUndefined();
  });

  it('renders the drawer with every entry, marking the linked one', () => {
    const markup = renderToString(
      createElement(GlossaryDrawer, { isOpen: true, activeId: 'placement', onClose: () => undefined }),
    );

    for (const entry of GLOSSARY) {
      expect(markup, entry.term).toContain(entry.term);
      expect(markup).toContain(`id="glossary-${entry.id}"`);
    }
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('Close');
  });

  it('renders nothing when closed', () => {
    const markup = renderToString(
      createElement(GlossaryDrawer, { isOpen: false, activeId: null, onClose: () => undefined }),
    );
    expect(markup).toBe('');
  });

  it('renders a term that opens its own entry', () => {
    const markup = renderToString(createElement(GlossaryTerm, { id: 'tiv', children: 'TIV' }));

    expect(markup).toContain('Glossary: TIV');
    expect(markup).toContain('>TIV<');
  });
});
