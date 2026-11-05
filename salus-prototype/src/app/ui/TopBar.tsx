import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { cn } from './tokens';

export interface BreadcrumbItem {
  label: string;
  /** Given a handler the crumb renders as a button; otherwise as text. */
  onClick?: () => void;
}

export interface ScopeOption {
  id: string;
  label: string;
  /** Renders the active state in accent red instead of ink. */
  accent?: boolean;
}

export interface ScopeControl {
  options: ScopeOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible group name and visible prefix. Defaults to "Scope". */
  label?: string;
}

export interface TopBarProps {
  breadcrumb: BreadcrumbItem[];
  /** Search input slot. Wrap your input in `.sal-topbar__search` styling by
   *  placing it here; the slot itself only positions it. */
  search?: ReactNode;
  /** Filter slot, typically `.sal-filter-pill` buttons. */
  filters?: ReactNode;
  scope?: ScopeControl;
  /** Right-most slot: bell, avatar, primary action. */
  actions?: ReactNode;
  className?: string;
}

export function TopBar({
  breadcrumb,
  search,
  filters,
  scope,
  actions,
  className,
}: TopBarProps) {
  return (
    <header className={cn('sal-topbar', className)}>
      <nav className="sal-topbar__crumbs" aria-label="Breadcrumb">
        {breadcrumb.map((crumb, index) => {
          const current = index === breadcrumb.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <span className="sal-topbar__sep" aria-hidden="true">
                  /
                </span>
              ) : null}
              {current ? (
                <span className="sal-topbar__crumb sal-topbar__crumb--current" aria-current="page">
                  {crumb.label}
                </span>
              ) : crumb.onClick ? (
                <button
                  type="button"
                  className="sal-topbar__crumb sal-topbar__crumb--link"
                  onClick={crumb.onClick}
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="sal-topbar__crumb">{crumb.label}</span>
              )}
            </Fragment>
          );
        })}
      </nav>

      {search ? <div className="sal-topbar__search">{search}</div> : null}

      <div className="sal-topbar__end">
        {filters ? <div className="sal-topbar__filters">{filters}</div> : null}

        {scope ? (
          <div className="sal-seg" role="group" aria-label={scope.label ?? 'Scope'}>
            <span className="sal-seg__label" aria-hidden="true">
              {scope.label ?? 'Scope'}
            </span>
            {scope.options.map((option) => {
              const active = option.id === scope.value;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    'sal-seg__btn',
                    active && 'sal-seg__btn--active',
                    active && option.accent && 'sal-seg__btn--accent',
                  )}
                  aria-pressed={active}
                  onClick={() => scope.onChange(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {actions ? <div className="sal-topbar__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
