import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ActionRail } from '../ui';
import type { ActionItem } from '../ui';
import { buildExceptions } from '../components/exceptions';
import type { ExceptionRow } from '../components/exceptions';
import { useFilteredPortfolio } from './filters';
import { AssistantDock } from './AssistantDock';

/** Preview budget only. The total always comes from `buildExceptions`. */
const RAIL_LIMIT = 5;

/**
 * Mirrors the query keys `parseFilters` reads, so "view all" opens the
 * overview in the same scope the reader is in without dragging along unrelated
 * params such as `site` or `all`.
 */
const FILTER_KEYS = ['line', 'entity', 'renew', 'gaps', 'risk'] as const;

/**
 * The persistent right rail: a short preview of the same ordered queue the
 * Overview table renders, then the assistant dock. Rows drill into the record
 * behind the exception; the remainder of the queue is one link away.
 */
export function RailPanel() {
  const { portfolio, sites } = useFilteredPortfolio();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const exceptions = useMemo(() => buildExceptions(portfolio, sites), [portfolio, sites]);
  const visible = exceptions.slice(0, RAIL_LIMIT);

  const goToRow = (row: ExceptionRow) => {
    if (row.target === 'record') {
      navigate(row.href);
      return;
    }
    // Map targets keep the current filter scope; record links do not.
    const next = new URLSearchParams(params);
    next.set('site', row.siteId);
    navigate(`/map?${next.toString()}`);
  };

  const items: ActionItem[] = visible.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    meta: row.meta,
    onClick: () => goToRow(row),
  }));

  const scoped = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null) scoped.set(key, value);
  }
  scoped.set('all', '1');
  const allHref = `/?${scoped.toString()}`;

  const footer =
    exceptions.length > visible.length ? (
      <>
        Top {visible.length} of {exceptions.length} open items.{' '}
        {params.get('all') === '1' ? null : (
          <Link to={allHref} style={linkStyle}>
            View all {exceptions.length}
          </Link>
        )}
      </>
    ) : (
      `${exceptions.length} open item${exceptions.length === 1 ? '' : 's'} in this view`
    );

  return (
    <div className="sal-rail-stack">
      <ActionRail
        title="Action items"
        items={items}
        count={exceptions.length}
        footer={footer}
        emptyMessage="Nothing open in this view."
      />
      <AssistantDock />
    </div>
  );
}

const linkStyle = {
  color: 'var(--crimson-deep)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
} as const;
