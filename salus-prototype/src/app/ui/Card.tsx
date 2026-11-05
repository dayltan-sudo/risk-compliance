import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from './tokens';

export interface CardProps {
  /** Rendered as the card heading; also labels the region for screen readers. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Header-right slot: filters, links, a menu button. */
  actions?: ReactNode;
  /** Footer strip under a hairline. Omit for no footer. */
  footer?: ReactNode;
  /** Set false when the body is a flush table or list. Defaults to true. */
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  padded = true,
  children,
  className,
}: CardProps) {
  const generatedId = useId();
  const headingId = title
    ? `sal-card-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`
    : undefined;
  const hasHead = Boolean(title || actions);

  return (
    <section
      className={cn('sal-card', className)}
      aria-labelledby={headingId}
    >
      {hasHead ? (
        <header className="sal-card__head">
          <div>
            {title ? (
              <h2 className="sal-card__title" id={headingId}>
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="sal-card__sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="sal-card__actions">{actions}</div> : null}
        </header>
      ) : null}

      <div className={cn('sal-card__body', !padded && 'sal-card__body--flush')}>{children}</div>

      {footer ? <footer className="sal-card__foot">{footer}</footer> : null}
    </section>
  );
}
