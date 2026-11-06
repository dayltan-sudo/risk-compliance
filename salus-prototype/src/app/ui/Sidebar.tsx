import { Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './tokens';

export type SidebarBadgeTone = 'default' | 'risk';

export interface SidebarItem {
  /** Stable id used for the active check and `onNavigate`. */
  id: string;
  label: string;
  /** Decorative glyph; sized and dimmed by the rail. */
  icon?: ReactNode;
  /** Optional count badge on the right of the item. */
  count?: number;
  /**
   * Destination. When present the item renders as a real anchor, so it can be
   * opened in a new tab, copied as a link and announced as a link.
   */
  href?: string;
  badgeTone?: SidebarBadgeTone;
}

export interface SidebarSection {
  id: string;
  /** Small uppercase heading above the group. Omit for the first group. */
  label?: string;
  items: SidebarItem[];
}

export interface SidebarBrand {
  title: string;
  subtitle?: string;
  /** Replaces the default shield glyph inside the brand mark. */
  mark?: ReactNode;
}

export interface SidebarProps {
  brand?: SidebarBrand;
  sections: SidebarSection[];
  /** Item id rendered as current. */
  activeId?: string;
  onNavigate?: (item: SidebarItem) => void;
  /** Pinned to the bottom of the rail, e.g. the signed-in user. */
  footer?: ReactNode;
  className?: string;
}

/** Lucide shield, at the 1.75 stroke the rest of the shell uses. */
function DefaultMark() {
  return <Shield size={18} strokeWidth={1.75} aria-hidden />;
}

export function Sidebar({
  brand,
  sections,
  activeId,
  onNavigate,
  footer,
  className,
}: SidebarProps) {
  return (
    <aside className={cn('sal-sidebar', className)} aria-label="Primary">
      {brand ? (
        <div className="sal-sidebar__brand">
          <span className="sal-sidebar__mark" aria-hidden="true">
            {brand.mark ?? <DefaultMark />}
          </span>
          <span>
            <span className="sal-sidebar__title">{brand.title}</span>
            {brand.subtitle ? <span className="sal-sidebar__sub">{brand.subtitle}</span> : null}
          </span>
        </div>
      ) : null}

      <nav className="sal-sidebar__nav">
        {sections.map((section) => (
          <div className="sal-sidebar__section" key={section.id}>
            {section.label ? (
              <p className="sal-sidebar__section-label">{section.label}</p>
            ) : null}
            <ul className="sal-sidebar__list">
              {section.items.map((item) => {
                const active = item.id === activeId;
                const className = cn('sal-sidebar__item', active && 'sal-sidebar__item--active');
                const contents = (
                  <>
                    {item.icon ? (
                      <span className="sal-sidebar__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="sal-sidebar__label">{item.label}</span>
                    {typeof item.count === 'number' ? (
                      <span
                        className={cn(
                          'sal-sidebar__badge',
                          item.badgeTone === 'risk' && 'sal-sidebar__badge--risk',
                        )}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </>
                );

                if (item.href !== undefined) {
                  return (
                    <li key={item.id}>
                      <a
                        className={className}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={(event) => {
                          // Modified clicks belong to the browser: opening a new
                          // tab must not be swallowed by the client router.
                          if (onNavigate === undefined) return;
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey ||
                            event.button !== 0
                          ) {
                            return;
                          }
                          event.preventDefault();
                          onNavigate(item);
                        }}
                      >
                        {contents}
                      </a>
                    </li>
                  );
                }

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={className}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate ? () => onNavigate(item) : undefined}
                    >
                      {contents}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer ? <div className="sal-sidebar__footer">{footer}</div> : null}
    </aside>
  );
}
