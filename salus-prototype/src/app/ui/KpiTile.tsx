import type { ReactNode } from 'react';
import { cn } from './tokens';

export type KpiTone = 'default' | 'good' | 'warn' | 'bad' | 'info';
export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaIntent = 'good' | 'bad' | 'neutral';

export interface KpiDelta {
  /** Pre-formatted, e.g. "3.2%" or "12 bps". */
  value: string;
  direction: DeltaDirection;
  /** Whether this movement is good news. Defaults to neutral. */
  intent?: DeltaIntent;
  /** Read out after the value, e.g. "against last quarter". */
  context?: string;
}

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** One line under the value: sample size, as-of date, basis. */
  hint?: string;
  delta?: KpiDelta;
  /** Tooltip text on the small info glyph. Glyph is hidden when omitted. */
  info?: string;
  /** Colours the big number. Defaults to ink. */
  tone?: KpiTone;
  /** Sparkline slot; pass an inline `<svg>` sized to 100% width. */
  sparkline?: ReactNode;
  className?: string;
}

const ARROW: Record<DeltaDirection, string> = {
  up: '\u25B2',
  down: '\u25BC',
  flat: '\u2013',
};

const DIRECTION_LABEL: Record<DeltaDirection, string> = {
  up: 'increase',
  down: 'decrease',
  flat: 'no change',
};

export function KpiTile({
  label,
  value,
  unit,
  hint,
  delta,
  info,
  tone = 'default',
  sparkline,
  className,
}: KpiTileProps) {
  const intent = delta?.intent ?? 'neutral';

  return (
    <div className={cn('sal-kpi', className)}>
      <div className="sal-kpi__top">
        <span className="sal-kpi__label">{label}</span>
        {info ? (
          <span className="sal-kpi__info" role="img" aria-label={info} title={info}>
            i
          </span>
        ) : null}
      </div>

      <div className={cn('sal-kpi__value', tone !== 'default' && `sal-kpi__value--${tone}`)}>
        {value}
        {unit ? <span className="sal-kpi__unit">{unit}</span> : null}
      </div>

      {delta ? (
        <span className={cn('sal-kpi__delta', `sal-kpi__delta--${intent}`)}>
          <span aria-hidden="true">{ARROW[delta.direction]}</span>
          <span>{delta.value}</span>
          <span className="sal-sr-only">{DIRECTION_LABEL[delta.direction]}</span>
          {delta.context ? <span className="sal-sr-only">{delta.context}</span> : null}
        </span>
      ) : null}

      {hint ? <p className="sal-kpi__sub">{hint}</p> : null}

      {sparkline ? <div className="sal-kpi__spark">{sparkline}</div> : null}
    </div>
  );
}
