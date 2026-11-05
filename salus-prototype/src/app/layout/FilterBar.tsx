import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { LINES } from '../../engine';
import type { Line } from '../../engine';
import { formatMoneyCompact } from '../components/format';
import { useFilteredPortfolio } from './filters';
import type { RenewalWindow } from './filters';

const RENEWAL_LABEL: Record<RenewalWindow, string> = {
  30: 'Next 30 days',
  60: 'Next 60 days',
  90: 'Next 90 days',
};

/**
 * Screens whose body does not read the portfolio filters. The audit log comes
 * from `/api/audit`, which takes no filter parameters, so the bar would move
 * nothing on screen while implying it had.
 */
const UNFILTERED_PATHS: ReadonlySet<string> = new Set(['/audit']);

function renewalFromValue(value: string): RenewalWindow | null {
  return value === '30' ? 30 : value === '60' ? 60 : value === '90' ? 90 : null;
}

/**
 * Global filter bar. Every control writes to the URL query string, so the
 * current view can be copied as a link and reproduced on reload.
 */
export function FilterBar() {
  const { filters, setFilters, reset, isFiltered, portfolio, entities, summary, totalSites } =
    useFilteredPortfolio();
  const location = useLocation();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      const node = menuRef.current;
      if (node !== null && node.open && !node.contains(event.target as Node)) {
        node.open = false;
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const activeLines = filters.lines ?? LINES;
  const lineLabel =
    filters.lines === null
      ? 'All lines'
      : filters.lines.length === 0
        ? 'No lines'
        : filters.lines.length === 1
          ? (filters.lines[0] ?? '1 line')
          : `${filters.lines.length} lines`;

  const toggleLine = (line: Line) => {
    const next = activeLines.includes(line)
      ? activeLines.filter((entry) => entry !== line)
      : [...activeLines, line];
    setFilters({ lines: next });
  };

  const copyLink = useCallback(() => {
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  }, []);

  // Every hook above has run. Audit never reads these filters, so the bar is
  // hidden there rather than left as a control with no effect on the page.
  if (UNFILTERED_PATHS.has(location.pathname)) return null;

  return (
    <div className="sal-filters" role="region" aria-label="Portfolio filters">
      <span className="sal-filters__title">Filters</span>

      <details className="sal-menu" ref={menuRef}>
        <summary className="sal-menu__control">
          <span className="sal-field__label">Line</span>
          <span className="sal-menu__value">{lineLabel}</span>
          <span className="sal-menu__chev" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="sal-menu__panel">
          <div className="sal-menu__head">
            <span>Insurance line</span>
            <span className="sal-menu__links">
              <button type="button" onClick={() => setFilters({ lines: null })}>
                All
              </button>
              <button type="button" onClick={() => setFilters({ lines: [] })}>
                None
              </button>
            </span>
          </div>
          <ul className="sal-menu__list">
            {LINES.map((line) => (
              <li key={line}>
                <label className="sal-check">
                  <input
                    type="checkbox"
                    checked={activeLines.includes(line)}
                    onChange={() => toggleLine(line)}
                  />
                  <span>{line}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <label className="sal-field">
        <span className="sal-field__label">Entity</span>
        <select
          className="sal-select"
          value={filters.entityId ?? ''}
          onChange={(event) =>
            setFilters({ entityId: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">All entities</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>

      <label className="sal-field">
        <span className="sal-field__label">Renewals</span>
        <select
          className="sal-select"
          value={filters.renewalWindow === null ? '' : String(filters.renewalWindow)}
          onChange={(event) => setFilters({ renewalWindow: renewalFromValue(event.target.value) })}
        >
          <option value="">Any expiry</option>
          {(Object.keys(RENEWAL_LABEL) as string[]).map((key) => (
            <option key={key} value={key}>
              {RENEWAL_LABEL[Number(key) as RenewalWindow]}
            </option>
          ))}
        </select>
      </label>

      <div className="sal-toggles" role="group" aria-label="Quick filters">
        <button
          type="button"
          className="sal-toggle"
          aria-pressed={filters.gapsOnly}
          onClick={() => setFilters({ gapsOnly: !filters.gapsOnly })}
        >
          Coverage gaps only
        </button>
        <button
          type="button"
          className="sal-toggle"
          aria-pressed={filters.renewalWindow === 90}
          onClick={() => setFilters({ renewalWindow: filters.renewalWindow === 90 ? null : 90 })}
        >
          Expiring in 90 days
        </button>
        <button
          type="button"
          className="sal-toggle"
          aria-pressed={filters.highRiskOnly}
          onClick={() => setFilters({ highRiskOnly: !filters.highRiskOnly })}
        >
          High risk only
        </button>
      </div>

      <span className="sal-filters__spacer" />

      <span className="sal-filters__scope">
        <strong>{portfolio.sites.length}</strong> of {totalSites} sites ·{' '}
        {formatMoneyCompact(summary.tivSgd)} TIV
      </span>

      <button type="button" className="sal-btn sal-btn--ghost sal-btn--sm" onClick={copyLink}>
        {copied ? 'Copied' : 'Copy link'}
      </button>

      <button
        type="button"
        className="sal-btn sal-btn--ghost sal-btn--sm"
        onClick={reset}
        disabled={!isFiltered}
      >
        Reset
      </button>
    </div>
  );
}
