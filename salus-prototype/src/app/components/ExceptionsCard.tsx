import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card, DataTable, Tag } from '../ui';
import type { Column } from '../ui';
import type { ExceptionRow } from './exceptions';
import { formatMoneyCompact } from './format';

export interface ExceptionsCardProps {
  rows: readonly ExceptionRow[];
  /** Collapsed row budget. Ignored when `expanded` is true. */
  limit?: number;
  /** True when the reader has asked for the whole queue, usually from `?all=1`. */
  expanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  onSelect: (row: ExceptionRow) => void;
  title?: string;
  subtitle?: ReactNode;
  emptyHint?: string;
}

export function ExceptionsCard({
  rows,
  limit = 8,
  expanded = false,
  onToggleExpanded,
  onSelect,
  title = 'Exceptions',
  subtitle,
  emptyHint,
}: ExceptionsCardProps) {
  const total = rows.length;
  const visible = expanded ? rows : rows.slice(0, limit);
  const canExpand = total > limit;

  const columns: Array<Column<ExceptionRow>> = [
    {
      key: 'title',
      header: 'Exception',
      render: (row) => (
        <span className="sal-exc__title">
          {/* A real anchor, so the row can be opened in a new tab or copied. */}
          <Link to={row.href} style={linkStyle} onClick={(event) => event.stopPropagation()}>
            {row.title}
          </Link>
          <span className="sal-exc__kind">
            {row.kind} · {row.entityName}
          </span>
        </span>
      ),
    },
    { key: 'siteName', header: 'Site', width: '150px' },
    {
      key: 'severity',
      header: 'Severity',
      width: '96px',
      render: (row) => <Tag tone={row.severity}>{row.severity}</Tag>,
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (row) => <span className="sal-exc__detail">{row.detail}</span>,
    },
    {
      key: 'valueSgd',
      header: 'Value at stake',
      numeric: true,
      width: '128px',
      render: (row) => formatMoneyCompact(row.valueSgd),
    },
  ];

  // The footer states exactly what is on screen; `visible.length` is the only
  // number it uses for the shown side, so it cannot drift from the table.
  const footer =
    total === 0 ? undefined : (
      <div style={footerStyle}>
        <span data-testid="exceptions-footer-count">
          {expanded || !canExpand
            ? `Showing all ${total} open item${total === 1 ? '' : 's'}.`
            : `Showing the top ${visible.length} of ${total} highest-priority items.`}
        </span>
        {canExpand && onToggleExpanded ? (
          <button
            type="button"
            className="sal-btn sal-btn--ghost sal-btn--sm"
            aria-expanded={expanded}
            onClick={() => onToggleExpanded(!expanded)}
          >
            {expanded ? `Show top ${limit}` : `View all ${total}`}
          </button>
        ) : null}
      </div>
    );

  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={<Tag tone={total > 0 ? 'accent' : 'low'}>{total} open</Tag>}
      padded={false}
      footer={footer}
    >
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        onRowClick={onSelect}
        dense
        caption={`Open exceptions in the current portfolio view (${visible.length} of ${total} shown)`}
        emptyTitle="No exceptions in this view"
        emptyHint={emptyHint}
      />
    </Card>
  );
}

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 'var(--space-md)',
} as const;

const linkStyle = {
  color: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: 'var(--dusk)',
  textUnderlineOffset: '3px',
} as const;
