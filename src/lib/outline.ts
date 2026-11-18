/**
 * Editable outlines for the Background Remover's manual mode (Pen / Lasso).
 *
 * An outline is a list of points with optional Bézier handles. It can be
 * traced from a mask (the AI's selection), drawn by hand, reshaped, turned
 * into a smooth curve, and finally filled into a mask at any resolution.
 * Coordinates are in "work" pixels (the picture scaled to the AI's size).
 */

export interface Vec {
  x: number;
  y: number;
}
export interface OPoint extends Vec {
  /** Handle towards the previous point (absolute position). */
  hin?: Vec;
  /** Handle towards the next point (absolute position). */
  hout?: Vec;
}
export interface Outline {
  id: string;
  points: OPoint[];
  closed: boolean;
  /** A hole cuts out of the outlines around it (e.g. the gap between an arm and the body). */
  hole: boolean;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Tracing a mask ----------

/**
 * Turns a mask (0–255 per pixel) into outlines: one per object (anything at
 * least 5% the size of the largest), plus holes inside them.
 */
export function traceMask(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, stride = 1, threshold = 128): Outline[] {
  // Work on a grid of at most ~1024 px so tracing stays fast.
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 1024));
  const gw = Math.ceil(w / f);
  const gh = Math.ceil(h / f);
  const grid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      for (let y = gy * f; y < Math.min(h, (gy + 1) * f); y++) {
        for (let x = gx * f; x < Math.min(w, (gx + 1) * f); x++) {
          sum += alpha[(y * w + x) * stride];
          n++;
        }
      }
      grid[gy * gw + gx] = n && sum / n >= threshold ? 1 : 0;
    }
  }

  const comps = components(grid, gw, gh, 1);
  if (!comps.length) return [];
  const largest = Math.max(...comps.map((c) => c.area));
  const out: Outline[] = [];
  const eps = Math.max(1.2, Math.hypot(gw, gh) * 0.0025);

  // Background reachable from the border; the rest of the background is holes.
  const outside = floodFromBorder(grid, gw, gh);
  const holeGrid = new Uint8Array(gw * gh);
  for (let i = 0; i < grid.length; i++) holeGrid[i] = grid[i] === 0 && !outside[i] ? 1 : 0;
  const holes = components(holeGrid, gw, gh, 1);

  for (const c of comps) {
    if (c.area < largest * 0.05) continue;
    const pts = traceBoundary(grid, gw, gh, c.start);
    out.push({ id: newId(), closed: true, hole: false, points: simplify(pts, eps).map((p) => ({ x: p.x * f, y: p.y * f })) });
  }
  for (const c of holes) {
    if (c.area < Math.max(40, largest * 0.004)) continue;
    const pts = traceBoundary(holeGrid, gw, gh, c.start);
    if (pts.length < 3) continue;
    out.push({ id: newId(), closed: true, hole: true, points: simplify(pts, eps).map((p) => ({ x: p.x * f, y: p.y * f })) });
  }
  return out;
}

function components(grid: Uint8Array, w: number, h: number, value: number) {
  const seen = new Uint8Array(grid.length);
  const out: { area: number; start: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== value || seen[i]) continue;
    let area = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && grid[p - 1] === value && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && grid[p + 1] === value && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && grid[p - w] === value && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && grid[p + w] === value && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    // `i` is the first pixel in reading order: top-most, then left-most.
    out.push({ area, start: i });
  }
  return out;
}

function floodFromBorder(grid: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(grid.length);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!seen[p] && grid[p] === 0) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  return seen;
}

/**
 * Traces the boundary of the region containing `start` along pixel edges
 * (keeping the region on the right), returning the corner points.
 */
function traceBoundary(grid: Uint8Array, w: number, h: number, start: number): Vec[] {
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 1;
  const sx = start % w;
  const sy = (start - sx) / w;
  let vx = sx;
  let vy = sy;
  let dx = 1;
  let dy = 0;
  const pts: Vec[] = [];
  for (let guard = 0; guard < (w + 1) * (h + 1) * 4; guard++) {
    // The two pixels ahead of the corner, relative to the direction of travel.
    let left: boolean;
    let right: boolean;
    if (dx === 1) { left = fg(vx, vy - 1); right = fg(vx, vy); }
    else if (dx === -1) { left = fg(vx - 1, vy); right = fg(vx - 1, vy - 1); }
    else if (dy === 1) { left = fg(vx, vy); right = fg(vx - 1, vy); }
    else { left = fg(vx - 1, vy - 1); right = fg(vx, vy - 1); }
    if (!right) [dx, dy] = [-dy, dx]; // turn right
    else if (left) [dx, dy] = [dy, -dx]; // turn left
    pts.push({ x: vx, y: vy });
    vx += dx;
    vy += dy;
    if (vx === sx && vy === sy) break;
  }
  // Keep only the corners where the direction changes.
  return pts.filter((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const c = pts[(i + 1) % pts.length];
    return (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x) !== 0;
  });
}

/** Ramer–Douglas–Peucker simplification of a closed polygon. */
export function simplify(pts: Vec[], eps: number): Vec[] {
  if (pts.length < 4) return pts.slice();
  // Split the closed loop at its two farthest-apart points, simplify each half.
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 200))) {
    const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d > best) {
      best = d;
      b = i;
    }
  }
  const half1 = rdp(pts.slice(a, b + 1), eps);
  const half2 = rdp([...pts.slice(b), pts[a]], eps);
  return [...half1.slice(0, -1), ...half2.slice(0, -1)];
}

function rdp(pts: Vec[], eps: number): Vec[] {
  if (pts.length < 3) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let idx = 0;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], first, last);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [first, last];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

function distToSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ---------- Curves ----------

export interface Segment {
  p0: Vec;
  c1: Vec;
  c2: Vec;
  p3: Vec;
  curved: boolean;
}

/**
 * The segments of an outline. Explicit handles make curves; with `smooth` > 0,
 * corners without handles are rounded automatically (Catmull-Rom).
 */
export function segments(o: Outline, smooth = 0): Segment[] {
  const pts = o.points;
  const n = pts.length;
  const out: Segment[] = [];
  const count = o.closed ? n : n - 1;
  const get = (i: number) => pts[((i % n) + n) % n];
  for (let i = 0; i < count; i++) {
    const p0 = get(i);
    const p3 = get(i + 1);
    let c1 = p0.hout;
    let c2 = p3.hin;
    if (!c1 && smooth > 0 && (o.closed || i > 0)) {
      const prev = get(i - 1);
      c1 = { x: p0.x + ((p3.x - prev.x) / 6) * smooth, y: p0.y + ((p3.y - prev.y) / 6) * smooth };
    }
    if (!c2 && smooth > 0 && (o.closed || i + 2 < n)) {
      const next = get(i + 2);
      c2 = { x: p3.x - ((next.x - p0.x) / 6) * smooth, y: p3.y - ((next.y - p0.y) / 6) * smooth };
    }
    out.push({ p0, c1: c1 ?? p0, c2: c2 ?? p3, p3, curved: Boolean(c1 || c2) });
  }
  return out;
}

export function svgPath(o: Outline, smooth = 0): string {
  if (!o.points.length) return '';
  const segs = segments(o, smooth);
  let d = `M${o.points[0].x},${o.points[0].y}`;
  for (const s of segs) d += s.curved ? `C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p3.x},${s.p3.y}` : `L${s.p3.x},${s.p3.y}`;
  return o.closed ? d + 'Z' : d;
}

function addToPath(path: Path2D, o: Outline, smooth: number, scale: number) {
  if (o.points.length < 3) return;
  path.moveTo(o.points[0].x * scale, o.points[0].y * scale);
  for (const s of segments(o, smooth)) {
    if (s.curved) path.bezierCurveTo(s.c1.x * scale, s.c1.y * scale, s.c2.x * scale, s.c2.y * scale, s.p3.x * scale, s.p3.y * scale);
    else path.lineTo(s.p3.x * scale, s.p3.y * scale);
  }
  path.closePath();
}

export function bezierAt(s: Segment, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p3.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p3.y,
  };
}

/** The closest place on the outline's line to `p`: which segment, where on it, and how far. */
export function nearestOnOutline(o: Outline, p: Vec, smooth = 0) {
  let best = { seg: -1, t: 0, dist: Infinity, at: { x: 0, y: 0 } };
  segments(o, smooth).forEach((s, i) => {
    for (let k = 0; k <= 32; k++) {
      const t = k / 32;
      const q = bezierAt(s, t);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best.dist) best = { seg: i, t, dist: d, at: q };
    }
  });
  return best;
}

/** Inserts a point on segment `seg` at `t`, keeping the curve's shape (de Casteljau split). */
export function insertPoint(o: Outline, seg: number, t: number, smooth = 0): Outline {
  const segs = segments(o, smooth);
  const s = segs[seg];
  if (!s) return o;
  const n = o.points.length;
  const pts = o.points.map((p) => ({ ...p }));
  const i0 = seg;
  const i1 = (seg + 1) % n;
  if (!s.curved) {
    const at = { x: s.p0.x + (s.p3.x - s.p0.x) * t, y: s.p0.y + (s.p3.y - s.p0.y) * t };
    pts.splice(i0 + 1, 0, at);
    return { ...o, points: pts };
  }
  const lerp = (a: Vec, b: Vec) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(s.p0, s.c1);
  const b = lerp(s.c1, s.c2);
  const c = lerp(s.c2, s.p3);
  const d = lerp(a, b);
  const e = lerp(b, c);
  const m = lerp(d, e);
  // Pin the curve's current handles on its two ends so the shape doesn't move.
  pts[i0].hout = a;
  pts[i1].hin = c;
  pts.splice(i0 + 1, 0, { x: m.x, y: m.y, hin: d, hout: e });
  return { ...o, points: pts };
}

/** Turns a point into a smooth curve point (with handles) or back into a sharp corner. */
export function toggleCurve(o: Outline, i: number): Outline {
  const pts = o.points.map((p) => ({ ...p }));
  const p = pts[i];
  if (p.hin || p.hout) {
    delete p.hin;
    delete p.hout;
  } else {
    const n = pts.length;
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dx = (next.x - prev.x) / 6;
    const dy = (next.y - prev.y) / 6;
    p.hin = { x: p.x - dx, y: p.y - dy };
    p.hout = { x: p.x + dx, y: p.y + dy };
  }
  return { ...o, points: pts };
}

// ---------- To a mask ----------

export interface OutlineRefine {
  smooth: number;
  /** Pixels (work size); positive grows the selection, negative shrinks it. */
  offset: number;
}

/** Fills the closed outlines into `ctx` (white = keep), at `scale` × work size. */
export function drawOutlineMask(ctx: CanvasRenderingContext2D, outlines: Outline[], r: OutlineRefine, scale = 1) {
  const closed = outlines.filter((o) => o.closed && o.points.length >= 3);
  const outer = new Path2D();
  const holes = new Path2D();
  for (const o of closed) addToPath(o.hole ? holes : outer, o, r.smooth, scale);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fill(outer);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(holes);
  if (r.offset !== 0) {
    ctx.lineWidth = Math.abs(r.offset) * 2 * scale;
    ctx.globalCompositeOperation = r.offset > 0 ? 'source-over' : 'destination-out';
    ctx.stroke(outer);
    ctx.stroke(holes);
  }
  ctx.restore();
}

/** A band of `width` work pixels along every outline's line (for edge refinement). */
export function drawOutlineBand(ctx: CanvasRenderingContext2D, outlines: Outline[], smooth: number, width: number, scale = 1) {
  const path = new Path2D();
  for (const o of outlines) if (o.closed) addToPath(path, o, smooth, scale);
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width * scale;
  ctx.stroke(path);
  ctx.restore();
}

export function hasClosedOutline(outlines: Outline[]) {
  return outlines.some((o) => o.closed && !o.hole && o.points.length >= 3);
}
