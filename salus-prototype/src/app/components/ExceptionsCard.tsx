import type { ReactNode } from 'react';

import { Card, DataTable, Tag } from '../ui';
import type { Column } from '../ui';
import type { ExceptionRow } from './exceptions';
import { formatMoneyCompact } from './format';

export interface ExceptionsCardProps {
  rows: readonly ExceptionRow[];
  limit?: number;
  onSelect: (row: ExceptionRow) => void;
  title?: string;
  subtitle?: ReactNode;
  emptyHint?: string;
}

export function ExceptionsCard({
  rows,
  limit = 8,
  onSelect,
  title = 'Exceptions',
  subtitle,
  emptyHint,
}: ExceptionsCardProps) {
  const visible = rows.slice(0, limit);

  const columns: Array<Column<ExceptionRow>> = [
    {
      key: 'title',
      header: 'Exception',
      render: (row) => (
        <span className="sal-exc__title">
          {row.title}
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

  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={<Tag tone={rows.length > 0 ? 'accent' : 'low'}>{rows.length} open</Tag>}
      padded={false}
      footer={
        rows.length > visible.length
          ? `Showing the ${visible.length} highest-priority items of ${rows.length}. Select a row to open the site on the map.`
          : undefined
      }
    >
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        onRowClick={onSelect}
        dense
        caption="Open exceptions in the current portfolio view"
        emptyTitle="No exceptions in this view"
        emptyHint={emptyHint}
      />
    </Card>
  );
}
