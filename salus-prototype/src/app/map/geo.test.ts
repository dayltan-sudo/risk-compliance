import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DOT_STEP,
  pointInPoly,
  project,
  projectPolygon,
  sampleWorldDots,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  type Point,
} from './geo';
import { LAND_POLYGONS } from './world';

const projectedLand = LAND_POLYGONS.map(projectPolygon);

/** Ring order follows `LAND_POLYGONS` in world.ts. */
const NORTH_AMERICA = 0;
const EURASIA = 3;
const AFRICA = 10;

function ringAt(index: number): readonly Point[] {
  const ring = projectedLand[index];
  if (!ring) throw new Error(`no land ring at index ${index}`);
  return ring;
}

function isOnLand(point: Point): boolean {
  return projectedLand.some((ring) => pointInPoly(point, ring));
}

const square: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

/** Concave L: (3, 3) sits inside the bounding box but outside the shape. */
const lShape: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: 4 },
  { x: 0, y: 4 },
];

describe('pointInPoly', () => {
  it('returns true for a point inside a polygon and false outside it', () => {
    expect(pointInPoly({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPoly({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPoly({ x: -1, y: 5 }, square)).toBe(false);
    expect(pointInPoly({ x: 5, y: 12 }, square)).toBe(false);
  });

  it('handles concave polygons rather than just their bounding box', () => {
    expect(pointInPoly({ x: 0.5, y: 3 }, lShape)).toBe(true);
    expect(pointInPoly({ x: 3, y: 3 }, lShape)).toBe(false);
  });

  it('returns true for points inside real land rings', () => {
    expect(pointInPoly(project(20, 0), ringAt(AFRICA))).toBe(true);
    expect(pointInPoly(project(100, 50), ringAt(EURASIA))).toBe(true);
    expect(pointInPoly(project(-100, 40), ringAt(NORTH_AMERICA))).toBe(true);
  });

  it('returns false for points in the ocean', () => {
    const pacific = project(-140, 0);
    const midAtlantic = project(-30, 40);

    expect(pointInPoly(pacific, ringAt(AFRICA))).toBe(false);
    expect(isOnLand(pacific)).toBe(false);
    expect(isOnLand(midAtlantic)).toBe(false);
  });
});

describe('project', () => {
  it('maps the antimeridian to both edges of the viewBox', () => {
    expect(project(-180, 0)).toEqual({ x: 0, y: VIEWBOX_HEIGHT / 2 });
    expect(project(180, 0)).toEqual({ x: VIEWBOX_WIDTH, y: VIEWBOX_HEIGHT / 2 });
  });

  it('maps the equator and prime meridian to the centre', () => {
    expect(project(0, 0)).toEqual({ x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 });
    expect(project(90, 0)).toEqual({ x: 750, y: 250 });
    expect(project(-90, 0)).toEqual({ x: 250, y: 250 });
  });

  it('maps the poles to the top and bottom edges', () => {
    expect(project(0, 90)).toEqual({ x: VIEWBOX_WIDTH / 2, y: 0 });
    expect(project(0, -90)).toEqual({ x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT });
  });

  it('is linear in longitude and inverted in latitude', () => {
    expect(project(0, 45).y).toBeLessThan(project(0, 0).y);
    expect(project(10, 0).x).toBeGreaterThan(project(0, 0).x);
  });
});

describe('sampleWorldDots', () => {
  it('returns a non-empty field that stays inside the viewBox', () => {
    const dots = sampleWorldDots();

    expect(dots.length).toBeGreaterThan(1500);

    const outside = dots.filter(
      (dot) => dot.x < 0 || dot.x > VIEWBOX_WIDTH || dot.y < 0 || dot.y > VIEWBOX_HEIGHT,
    );
    expect(outside).toEqual([]);
  });

  it('only keeps dots that fall on land', () => {
    const offLand = sampleWorldDots().filter((dot) => !isOnLand(dot));
    expect(offLand).toEqual([]);
  });

  it('is deterministic between calls', () => {
    const first = sampleWorldDots();
    const second = sampleWorldDots();

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('lays dots on the default grid pitch', () => {
    const offset = DEFAULT_DOT_STEP / 2;
    const misaligned = sampleWorldDots().filter(
      (dot) => (dot.x - offset) % DEFAULT_DOT_STEP !== 0 || (dot.y - offset) % DEFAULT_DOT_STEP !== 0,
    );

    expect(misaligned).toEqual([]);
  });

  it('honours a coarser dotStep', () => {
    const fine = sampleWorldDots({ dotStep: 8 });
    const coarse = sampleWorldDots({ dotStep: 16 });

    expect(coarse.length).toBeGreaterThan(0);
    expect(coarse.length).toBeLessThan(fine.length);
  });

  it('samples only the polygons it is given', () => {
    const box = [
      [
        [-10, 0],
        [10, 0],
        [10, 20],
        [-10, 20],
      ],
    ] as const;
    const dots = sampleWorldDots({ polygons: box, dotStep: 4 });
    const corners = projectPolygon(box[0]);
    const left = Math.min(...corners.map((corner) => corner.x));
    const right = Math.max(...corners.map((corner) => corner.x));
    const top = Math.min(...corners.map((corner) => corner.y));
    const bottom = Math.max(...corners.map((corner) => corner.y));

    expect(dots.length).toBeGreaterThan(0);
    expect(dots.filter((dot) => dot.x < left || dot.x > right || dot.y < top || dot.y > bottom)).toEqual([]);
  });

  it('rejects a non-positive dotStep', () => {
    expect(() => sampleWorldDots({ dotStep: 0 })).toThrow(RangeError);
    expect(() => sampleWorldDots({ dotStep: -4 })).toThrow(RangeError);
  });
});
