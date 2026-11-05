import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ActionRail } from '../ui';
import type { ActionItem } from '../ui';
import { buildExceptions } from '../components/exceptions';
import { useFilteredPortfolio } from './filters';
import { AssistantDock } from './AssistantDock';

const RAIL_LIMIT = 9;

/**
 * The persistent right rail: derived action queue on top, assistant dock at the
 * bottom. Every row drills into the site on the map, which is the only
 * site-level page wired in P2; the P3/P4 pages will take over their own rows.
 */
export function RailPanel() {
  const { portfolio, sites } = useFilteredPortfolio();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const exceptions = useMemo(() => buildExceptions(portfolio, sites), [portfolio, sites]);
  const visible = exceptions.slice(0, RAIL_LIMIT);

  const goToSite = (siteId: string) => {
    const next = new URLSearchParams(params);
    next.set('site', siteId);
    navigate(`/map?${next.toString()}`);
  };

  const items: ActionItem[] = visible.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    meta: row.meta,
    onClick: () => goToSite(row.siteId),
  }));

  const footer =
    exceptions.length > visible.length
      ? `Showing ${visible.length} of ${exceptions.length} open items. Open the map to work the queue.`
      : `${exceptions.length} open item${exceptions.length === 1 ? '' : 's'} in this view`;

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
