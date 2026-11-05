import { useMemo } from 'react';

import {
  DEFAULT_DOT_RADIUS,
  sampleWorldDots,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  type Point,
} from './geo';

export interface WorldDotsProps {
  /** Rendered width in CSS pixels; height follows the 2:1 viewBox. */
  width?: number;
  className?: string;
  /** Pre-computed dots in viewBox space. Sampled on first render when omitted. */
  dots?: readonly Point[];
}

/** Matches the prototype's `rgba(255, 255, 255, 0.34)` on a dark panel. */
const DOT_OPACITY = 0.34;

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * One zero-length subpath per dot (`M x y h0`). With `stroke-linecap="round"`
 * each subpath paints a single round cap, so the whole field is one <path>
 * instead of thousands of <circle> nodes.
 */
function dotsToPath(dots: readonly Point[]): string {
  return dots.map((dot) => `M${formatCoordinate(dot.x)} ${formatCoordinate(dot.y)}h0`).join('');
}

/**
 * Dot-matrix world map: land silhouettes sampled into a grid of dots.
 *
 * Purely presentational. Colour the dots with the CSS `color` property; the
 * geometry is fixed to the shared 1000 × 500 viewBox.
 */
export function WorldDots({ width = VIEWBOX_WIDTH, className, dots }: WorldDotsProps) {
  const field = useMemo(() => dots ?? sampleWorldDots(), [dots]);
  const path = useMemo(() => dotsToPath(field), [field]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={width}
      height={(width * VIEWBOX_HEIGHT) / VIEWBOX_WIDTH}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Dot-matrix world map"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={DEFAULT_DOT_RADIUS * 2}
        strokeLinecap="round"
        strokeOpacity={DOT_OPACITY}
      />
    </svg>
  );
}

export default WorldDots;
