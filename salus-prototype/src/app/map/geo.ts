/**
 * Equirectangular geometry for the dot-matrix world map.
 *
 * Everything is expressed in a normalised `0..1000 × 0..500` viewBox space so
 * the dot field, markers and any future overlays can share one coordinate
 * system. No DOM, no React.
 *
 * Coastlines come from Natural Earth 110m (`world-atlas`, decoded with
 * `topojson-client`), so the landmass is real rather than hand-drawn. The rings
 * are projected once and sampled with a scanline fill: at the default pitch
 * that is ~250k segment tests, a few milliseconds, where a per-point
 * `geoContains` cost 18 seconds for the same field.
 *
 * The coarse `LAND_POLYGONS` set in `world.ts` is still accepted as an explicit
 * `polygons` option for fast synthetic tests, but it is no longer the default.
 */

import { feature } from 'topojson-client';

import landTopology from 'world-atlas/land-110m.json';
import type { LonLatPolygon } from './world';

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
  /** Land rings to sample, in lon/lat degrees. Defaults to Natural Earth 110m. */
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

/** Inverse of `project`: viewBox space back to lon/lat degrees. */
export function unproject(point: Point): [number, number] {
  return [(point.x / VIEWBOX_WIDTH) * 360 - 180, 90 - (point.y / VIEWBOX_HEIGHT) * 180];
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

interface LandTopology {
  objects: { land: unknown };
}

type LinearRing = ReadonlyArray<readonly [number, number]>;

/** The shapes `topojson-client` can return for a decoded object. */
interface DecodedShape {
  type: string;
  coordinates?: unknown;
  geometry?: DecodedShape;
  features?: DecodedShape[];
}

type DecodedTopology = DecodedShape;

/**
 * Natural Earth 110m land, decoded to rings in lon/lat.
 *
 * The topology import is untyped JSON, so it is narrowed at this one boundary
 * rather than leaking `any` through the module.
 */
function landRings(): LinearRing[] {
  const topology = landTopology as unknown as Parameters<typeof feature>[0];
  const geometry = (landTopology as unknown as LandTopology).objects.land as Parameters<typeof feature>[1];
  const decoded = feature(topology, geometry) as unknown as DecodedTopology;

  const features =
    decoded.type === 'FeatureCollection' ? (decoded.features ?? []) : (decoded.features ?? [decoded]);

  const rings: LinearRing[] = [];
  for (const entry of features) {
    const shape = entry.geometry ?? entry;
    if (shape.type === 'Polygon' && Array.isArray(shape.coordinates)) {
      for (const ring of shape.coordinates) {
        if (Array.isArray(ring) && ring.length >= 3) rings.push(ring as LinearRing);
      }
    } else if (shape.type === 'MultiPolygon' && Array.isArray(shape.coordinates)) {
      for (const polygon of shape.coordinates) {
        if (!Array.isArray(polygon)) continue;
        for (const ring of polygon) {
          if (Array.isArray(ring) && ring.length >= 3) rings.push(ring as LinearRing);
        }
      }
    }
  }

  return rings;
}

/** Projected land rings, computed once per process. */
let projectedLand: Point[][] | null = null;

function projectedLandRings(): Point[][] {
  if (projectedLand === null) {
    projectedLand = landRings().map((ring) =>
      ring.map(([lon, lat]) => project(lon as number, lat as number)),
    );
  }
  return projectedLand;
}

/**
 * X coordinates where the horizontal line at `y` crosses the land boundary.
 * Sorted ascending; the even-odd rule then decides inside/outside.
 */
function crossingsAt(rings: readonly Point[][], y: number): number[] {
  const crossings: number[] = [];

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const current = ring[i];
      const previous = ring[j];
      if (current === undefined || previous === undefined) continue;

      if (current.y > y !== previous.y > y) {
        const t = (y - current.y) / (previous.y - current.y);
        crossings.push(current.x + t * (previous.x - current.x));
      }
    }
  }

  crossings.sort((a, b) => a - b);
  return crossings;
}

/** True when the coordinate falls on land, per Natural Earth 110m. */
export function isOnLand(lon: number, lat: number): boolean {
  const point = project(lon, lat);
  return pointInPoly(
    point,
    projectedLandRings().find((ring) => pointInPoly(point, ring)) ?? [],
  );
}

function boundsOf(polygon: readonly Point[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Sample a square grid across the viewBox and keep the points that fall on land.
 *
 * Returns viewBox coordinates, ordered by row then column. The result is a pure
 * function of the options, so repeated calls produce identical arrays.
 *
 * Pass `polygons` to sample a coarse ring set instead of Natural Earth; the
 * fast unit tests use that path.
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

  const columns = Math.max(0, Math.ceil((VIEWBOX_WIDTH - offset) / dotStep));
  const rows = Math.max(0, Math.ceil((VIEWBOX_HEIGHT - offset) / dotStep));
  const dots: Point[] = [];

  if (options.polygons !== undefined) {
    const shapes = options.polygons.map((polygon) => {
      const points = projectPolygon(polygon);
      return { points, bounds: boundsOf(points) };
    });

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

  const rings = projectedLandRings();
  for (let row = 0; row < rows; row += 1) {
    const y = offset + row * dotStep;
    const crossings = crossingsAt(rings, y);

    let crossingIndex = 0;
    let inside = false;

    for (let column = 0; column < columns; column += 1) {
      const x = offset + column * dotStep;

      while (crossingIndex < crossings.length && (crossings[crossingIndex] as number) <= x) {
        inside = !inside;
        crossingIndex += 1;
      }

      if (inside) dots.push({ x, y });
    }
  }

  return dots;
}
