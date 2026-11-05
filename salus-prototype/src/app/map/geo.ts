/**
 * Equirectangular geometry for the dot-matrix world map.
 *
 * Everything is expressed in a normalised `0..1000 × 0..500` viewBox space so
 * the dot field, markers and any future overlays can share one coordinate
 * system. No DOM, no React, no dependencies.
 */

import { LAND_POLYGONS, type LonLatPolygon } from './world';

/** Width of the normalised viewBox the map is drawn in. */
export const VIEWBOX_WIDTH = 1000;

/** Height of the normalised viewBox the map is drawn in. */
export const VIEWBOX_HEIGHT = 500;

/** Default grid pitch, in viewBox units. Smaller values give a denser field. */
export const DEFAULT_DOT_STEP = 8;

/** Default dot radius, in viewBox units, tuned for a step of 8. */
export const DEFAULT_DOT_RADIUS = 1.3;

/** A point in viewBox space. */
export interface Point {
  x: number;
  y: number;
}

export interface SampleWorldDotsOptions {
  /** Grid pitch in viewBox units. Defaults to `DEFAULT_DOT_STEP`. */
  dotStep?: number;
  /** Land rings to sample, in lon/lat degrees. Defaults to `LAND_POLYGONS`. */
  polygons?: readonly LonLatPolygon[];
  /**
   * Coordinate of the first sample. Defaults to half a step so samples sit at
   * the centre of each grid cell. Must be in `[0, dotStep)`.
   */
  offset?: number;
}

/**
 * Project lon/lat degrees to viewBox space (plate carrée / equirectangular).
 *
 * The antimeridian maps to the left and right edges (`-180 → x 0`,
 * `180 → x 1000`) and the equator to the vertical centre (`0 → y 250`).
 */
export function project(lon: number, lat: number): Point {
  return {
    x: ((lon + 180) / 360) * VIEWBOX_WIDTH,
    y: ((90 - lat) / 180) * VIEWBOX_HEIGHT,
  };
}

/** Project a lon/lat ring into viewBox space. */
export function projectPolygon(polygon: LonLatPolygon): Point[] {
  return polygon.map(([lon, lat]) => project(lon, lat));
}

/**
 * Even-odd ray cast: true when `point` falls inside the closed ring `polygon`.
 *
 * Works for concave rings. Points lying exactly on an edge are not guaranteed
 * to classify either way; the dot grid is offset off the cell boundary and the
 * outlines are coarse, so in practice this only matters for deliberate probes.
 */
export function pointInPoly(point: Point, polygon: readonly Point[]): boolean {
  const { x, y } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    if (!current || !previous) continue;

    const xi = current.x;
    const yi = current.y;
    const xj = previous.x;
    const yj = previous.y;
    const crossesRay = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crossesRay) inside = !inside;
  }

  return inside;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(polygon: readonly Point[]): Bounds {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const point of polygon) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }

  return bounds;
}

/**
 * Sample a square grid across the viewBox and keep the points that fall on land.
 *
 * Returns viewBox coordinates, ordered by row then column. The result is a pure
 * function of the options, so repeated calls produce identical arrays.
 */
export function sampleWorldDots(options: SampleWorldDotsOptions = {}): Point[] {
  const dotStep = options.dotStep ?? DEFAULT_DOT_STEP;
  const offset = options.offset ?? dotStep / 2;

  if (!Number.isFinite(dotStep) || dotStep <= 0) {
    throw new RangeError(`dotStep must be a finite positive number, received ${dotStep}`);
  }
  if (!Number.isFinite(offset) || offset < 0 || offset >= dotStep) {
    throw new RangeError(`offset must be in [0, dotStep), received ${offset}`);
  }

  const shapes = (options.polygons ?? LAND_POLYGONS).map((polygon) => {
    const points = projectPolygon(polygon);
    return { points, bounds: boundsOf(points) };
  });

  const columns = Math.max(0, Math.ceil((VIEWBOX_WIDTH - offset) / dotStep));
  const rows = Math.max(0, Math.ceil((VIEWBOX_HEIGHT - offset) / dotStep));
  const dots: Point[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = offset + row * dotStep;

    for (let column = 0; column < columns; column += 1) {
      const x = offset + column * dotStep;
      const point = { x, y };

      for (const shape of shapes) {
        const { bounds } = shape;
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;

        if (pointInPoly(point, shape.points)) {
          dots.push(point);
          break;
        }
      }
    }
  }

  return dots;
}
