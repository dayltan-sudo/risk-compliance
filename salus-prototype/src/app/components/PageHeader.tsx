import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}

/** The header contract every Salus page shares. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="sal-page__head">
      <div className="sal-page__heading">
        <p className="sal-eyebrow">{eyebrow}</p>
        <h1 className="sal-page__title">{title}</h1>
        <p className="sal-page__sub">{subtitle}</p>
      </div>
      {actions ? <div className="sal-page__actions">{actions}</div> : null}
    </header>
  );
}
