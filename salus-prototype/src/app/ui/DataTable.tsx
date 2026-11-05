import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './tokens';

export type CellAlign = 'left' | 'right' | 'center';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface Column<T> {
  /** Property name on the row, and the identity of the column. */
  key: string;
  header: ReactNode;
  /** Custom cell renderer. Falls back to `row[key]`. */
  render?: (row: T, index: number) => ReactNode;
  /** Right-aligns and switches the cell to tabular mono. */
  numeric?: boolean;
  align?: CellAlign;
  /** CSS width for the column, e.g. "120px" or "18%". */
  width?: string;
  /** Shows the sort affordance. Requires `onSort`. */
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  /** Row to highlight; compared against `rowKey`. */
  selectedKey?: string | null;
  sort?: SortState | null;
  onSort?: (key: string) => void;
  /** Empty-state heading. Defaults to "No records". */
  emptyTitle?: string;
  emptyHint?: string;
  /** Replaces the default empty state entirely. */
  empty?: ReactNode;
  /** Tighter row padding. */
  dense?: boolean;
  /** Accessible caption, rendered off-screen. */
  caption?: string;
  className?: string;
}

const SORT_MARK: Record<SortDirection, string> = {
  asc: '\u25B2',
  desc: '\u25BC',
};

function alignClass<T>(column: Column<T>): string | undefined {
  if (column.numeric || column.align === 'right') return 'sal-table__cell--right';
  if (column.align === 'center') return 'sal-table__cell--center';
  return undefined;
}

function cellValue<T>(row: T, column: Column<T>, index: number): ReactNode {
  if (column.render) return column.render(row, index);
  return (row as Record<string, unknown>)[column.key] as ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  sort,
  onSort,
  emptyTitle = 'No records',
  emptyHint,
  empty,
  dense = false,
  caption,
  className,
}: DataTableProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T, index: number) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row, index);
    }
  };

  return (
    <div className={cn('sal-table-wrap', className)}>
      <table className={cn('sal-table', dense && 'sal-table--dense')}>
        {caption ? <caption className="sal-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.key === column.key ? sort.direction : null;
              const align = alignClass(column);
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={align}
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                >
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      className="sal-table__sort"
                      onClick={() => onSort(column.key)}
                    >
                      {column.header}
                      <span className="sal-table__sort-mark" aria-hidden="true">
                        {sorted ? SORT_MARK[sorted] : '\u2195'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="sal-table__empty" colSpan={columns.length}>
                {empty ?? (
                  <>
                    <span className="sal-table__empty-title">{emptyTitle}</span>
                    {emptyHint ? <span>{emptyHint}</span> : null}
                  </>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key = rowKey(row, index);
              const selected = selectedKey != null && selectedKey === key;
              return (
                <tr
                  key={key}
                  data-selected={selected ? 'true' : undefined}
                  data-clickable={onRowClick ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  onKeyDown={(event) => handleKeyDown(event, row, index)}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        alignClass(column),
                        column.numeric && 'sal-table__num',
                      )}
                    >
                      {cellValue(row, column, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
