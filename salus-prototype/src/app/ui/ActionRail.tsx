import type { ReactNode } from 'react';
import { Tag } from './Tag';
import { cn, resolveTone } from './tokens';
import type { BandName } from './tokens';

export interface ActionItem {
  id: string;
  title: string;
  /** Drives both the priority dot and the severity tag. */
  severity: BandName;
  /** Mono meta line: due date, owner, reference. */
  meta?: string;
  onClick?: () => void;
}

export interface ActionRailProps {
  title?: string;
  items: ActionItem[];
  /** Overrides the header count; defaults to the number of items. */
  count?: number;
  /** Footer note. Defaults to an open-item count. */
  footer?: ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function ActionRail({
  title = 'Action items',
  items,
  count,
  footer,
  emptyMessage = 'Nothing open. The queue is clear.',
  className,
}: ActionRailProps) {
  const total = count ?? items.length;
  const note = footer ?? `${total} open item${total === 1 ? '' : 's'}`;

  return (
    <section className={cn('sal-rail', className)} aria-label={title}>
      <header className="sal-rail__head">
        <h3 className="sal-rail__title">{title}</h3>
        <span className="sal-rail__count">{total}</span>
      </header>

      {items.length === 0 ? (
        <div className="sal-rail__empty">{emptyMessage}</div>
      ) : (
        <ul className="sal-rail__list">
          {items.map((item) => {
            const tone = resolveTone(item.severity);
            const body = (
              <>
                <span className={cn('sal-rail__dot', `sal-tone--${tone.name}`)} aria-hidden="true" />
                <span className="sal-rail__body">
                  <p className="sal-rail__item-title">{item.title}</p>
                  <span className="sal-rail__meta">
                    <Tag tone={item.severity}>{item.severity}</Tag>
                    {item.meta ? <span>{item.meta}</span> : null}
                  </span>
                </span>
              </>
            );

            return (
              <li className="sal-rail__row" key={item.id}>
                {item.onClick ? (
                  <button
                    type="button"
                    className="sal-rail__item"
                    data-clickable="true"
                    onClick={item.onClick}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="sal-rail__item">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="sal-rail__foot">{note}</footer>
    </section>
  );
}
