import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FilterProvider } from '../src/app/layout/filters';
import { FIXTURES } from '../src/app/pages/Documents';
import { AppRoutes } from '../src/app/routes';

/**
 * Item 3: the five saved examples sit behind one collapsed disclosure, below
 * the real upload zone. The dropzone is the first interactive thing in the
 * card, and each card still selects, then Load document, then Extract fields.
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

const html = render('/documents');

/** Rendered text with React's text-node separators removed. */
function text(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('the saved examples disclosure', () => {
  it('collapses the five examples behind one summary', () => {
    const summaryIndex = html.indexOf('Try a sample document');
    expect(summaryIndex).toBeGreaterThan(-1);

    const detailsStart = html.lastIndexOf('<details', summaryIndex);
    const summaryEnd = html.indexOf('</summary>', summaryIndex);
    const summary = html.slice(detailsStart, summaryEnd);
    expect(text(summary)).toContain(`${FIXTURES.length} saved examples`);

    // Closed on first paint: no `open` attribute before the summary.
    expect(summary).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it('puts the upload zone before the disclosure', () => {
    const chooseFile = html.indexOf('Choose file');
    const detailsStart = html.lastIndexOf('<details', html.indexOf('Try a sample document'));
    const firstFixture = html.indexOf(FIXTURES[0]?.title ?? 'Cyber liability slip');

    expect(chooseFile).toBeGreaterThan(-1);
    expect(chooseFile).toBeLessThan(detailsStart);
    expect(detailsStart).toBeLessThan(firstFixture);
  });

  it('renders all five cards inside the disclosure, not above it', () => {
    const summaryIndex = html.indexOf('Try a sample document');
    const detailsStart = html.lastIndexOf('<details', summaryIndex);
    const detailsEnd = html.indexOf('</details>', summaryIndex);
    const inside = html.slice(detailsStart, detailsEnd);

    for (const fixture of FIXTURES) {
      expect(inside).toContain(fixture.title);
      expect(inside).toContain(fixture.file);
      expect(html.indexOf(fixture.title)).toBeGreaterThan(detailsStart);
    }
  });

  it('keeps select → Load document → Extract fields intact', () => {
    const summaryIndex = html.indexOf('Try a sample document');
    const inside = html.slice(
      html.lastIndexOf('<details', summaryIndex),
      html.indexOf('</details>', summaryIndex),
    );
    const sampleButtons = [...inside.matchAll(/aria-pressed="(true|false)"/g)].map((m) => m[1]);
    expect(sampleButtons).toHaveLength(FIXTURES.length);
    // The default fixture is still selected, so Load document starts enabled.
    expect(sampleButtons.filter((value) => value === 'true')).toHaveLength(1);

    expect(html).toContain('Load document');
    expect(html).toContain('Extract fields');
  });
});
