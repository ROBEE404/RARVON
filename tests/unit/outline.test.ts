import { describe, expect, it } from 'vitest';
import { traceMask, simplify, insertPoint, nearestOnOutline, segments, bezierAt, toggleCurve, hasClosedOutline } from '../../src/lib/outline';
import type { Outline } from '../../src/lib/outline';

function mask(w: number, h: number, inside: (x: number, y: number) => boolean) {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = inside(x, y) ? 255 : 0;
  return a;
}

describe('tracing a mask into an outline', () => {
  it('a rectangle becomes four corner points', () => {
    const out = traceMask(mask(100, 80, (x, y) => x >= 20 && x < 70 && y >= 10 && y < 60), 100, 80);
    expect(out).toHaveLength(1);
    expect(out[0].hole).toBe(false);
    expect(out[0].points).toHaveLength(4);
    const xs = out[0].points.map((p) => p.x).sort((a, b) => a - b);
    const ys = out[0].points.map((p) => p.y).sort((a, b) => a - b);
    expect([xs[0], xs[3], ys[0], ys[3]]).toEqual([20, 70, 10, 60]);
  });

  it('a ring gives an outline and a hole', () => {
    const out = traceMask(mask(120, 120, (x, y) => {
      const d = Math.hypot(x - 60, y - 60);
      return d < 50 && d > 22;
    }), 120, 120);
    expect(out.filter((o) => !o.hole)).toHaveLength(1);
    expect(out.filter((o) => o.hole)).toHaveLength(1);
    // A circle is simplified to a manageable number of points.
    expect(out[0].points.length).toBeGreaterThan(8);
    expect(out[0].points.length).toBeLessThan(80);
  });

  it('two objects give two outlines; specks are ignored', () => {
    const out = traceMask(mask(200, 100, (x, y) => (x > 10 && x < 80 && y > 10 && y < 90) || (x > 120 && x < 190 && y > 10 && y < 90) || (x === 100 && y === 50)), 200, 100);
    expect(out.filter((o) => !o.hole)).toHaveLength(2);
  });

  it('an empty mask gives nothing', () => {
    expect(traceMask(new Uint8Array(50 * 50), 50, 50)).toEqual([]);
  });
});

describe('editing an outline', () => {
  const square: Outline = { id: 's', closed: true, hole: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };

  it('finds the nearest place on the line and inserts a point there', () => {
    const near = nearestOnOutline(square, { x: 50, y: 3 });
    expect(near.seg).toBe(0);
    expect(near.dist).toBeCloseTo(3, 0);
    const o = insertPoint(square, near.seg, near.t);
    expect(o.points).toHaveLength(5);
    expect(o.points[1]).toMatchObject({ x: 50, y: 0 });
  });

  it('inserting on a curve keeps its shape', () => {
    const curved = toggleCurve(square, 1);
    const before = bezierAt(segments(curved)[0], 0.5);
    const after = insertPoint(curved, 0, 0.5);
    expect(after.points[1].x).toBeCloseTo(before.x, 5);
    expect(after.points[1].y).toBeCloseTo(before.y, 5);
  });

  it('toggling a point makes it curved and back to a corner', () => {
    const c = toggleCurve(square, 2);
    expect(c.points[2].hin).toBeTruthy();
    expect(toggleCurve(c, 2).points[2].hin).toBeUndefined();
  });

  it('simplify drops points that sit on a straight line', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const pts = simplify([...line, { x: 49, y: 30 }, { x: 0, y: 30 }], 1);
    expect(pts.length).toBeLessThanOrEqual(5);
  });

  it('only closed, non-hole outlines with 3+ points count as a selection', () => {
    expect(hasClosedOutline([square])).toBe(true);
    expect(hasClosedOutline([{ ...square, closed: false }])).toBe(false);
    expect(hasClosedOutline([{ ...square, hole: true }])).toBe(false);
  });
});
