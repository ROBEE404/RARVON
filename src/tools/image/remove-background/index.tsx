import { engine } from '../../../engine';
import type { BackgroundRemover } from '../../../engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import clsx from 'clsx';
import FileDropzone from '../../../components/FileDropzone';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard } from '../../../components/tool';
import { formatBytes } from '../../../lib/imageUtils';
import { tr } from '../../../lib/i18n';
import type { Outline, Vec } from '../../../lib/outline';
import { drawOutlineBand, drawOutlineMask, hasClosedOutline, insertPoint, nearestOnOutline, newId, simplify, toggleCurve, traceMask } from '../../../lib/outline';
import OutlineLayer from './OutlineLayer';

type Tool = 'select' | 'brush-add' | 'brush-erase' | 'outline';
type Panel = 'auto' | 'select' | 'outline' | 'brush';
const RAIL: { id: Panel; label: string; short: string; icon: string }[] = [
  { id: 'auto', label: 'Automatic', short: 'Auto', icon: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' },
  { id: 'select', label: 'Select by clicking', short: 'Click', icon: 'M5 3l14 8-6 2-2 6z' },
  { id: 'outline', label: 'Manual outline', short: 'Outline', icon: 'M3 21l3-1 11-11-2-2L4 18zM14 6l2-2 4 4-2 2' },
  { id: 'brush', label: 'Fix by hand', short: 'Brush', icon: 'M18 3l3 3-9 9-3-3zM9 12l-4 4a2.5 2.5 0 103 3l4-4' },
];
interface Point { x: number; y: number; positive: boolean }
interface Stroke { erase: boolean; size: number; pts: [number, number][] }
interface Snapshot {
  base: Uint8Array | null;
  points: Point[];
  strokes: Stroke[];
  /** Manual outlines (Pen / Lasso). When one is closed, it decides the cut-out. */
  outlines: Outline[];
  /** False while the outline is being edited (the picture shows dimmed outside it). */
  outlineCut: boolean;
}
const EMPTY: Snapshot = { base: null, points: [], strokes: [], outlines: [], outlineCut: false };
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const COLOURS = ['#ffffff', '#000000', '#f3f4f6', '#fde047', '#f87171', '#60a5fa', '#4ade80'];
const ZOOMS = [1, 1.5, 2, 3, 4];

/** WebGPU with half-precision support, which the high-quality model needs. */
async function detectHqSupport() {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    return Boolean(adapter?.features.has('shader-f16'));
  } catch {
    return false;
  }
}

export default function RemoveBackground() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [work, setWork] = useState<{ w: number; h: number } | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [tool, setTool] = useState<Tool>('select');
  // Layout A: the icon column picks which tool's options the panel shows.
  const [panel, setPanel] = useState<Panel>('auto');
  const [selectAdd, setSelectAdd] = useState(true);
  const [brush, setBrush] = useState(30);
  const [softness, setSoftness] = useState(1);
  const [background, setBackground] = useState<string | null>(null); // null = transparent
  const [crop, setCrop] = useState(false);
  const [padding, setPadding] = useState(20);
  const [showBefore, setShowBefore] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hqSupported, setHqSupported] = useState<boolean | null>(null);
  const [sizes, setSizes] = useState<{ standard: number; hq: number } | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Manual outline
  const [outlineMode, setOutlineMode] = useState<'pen' | 'lasso'>('pen');
  const [nextHole, setNextHole] = useState(false);
  const [selPt, setSelPt] = useState<{ id: string; i: number } | null>(null);
  const [refine, setRefine] = useState({ smooth: 0, offset: 0, hair: false, hairWidth: 12 });
  const [viewScale, setViewScale] = useState(1);
  const [workCursor, setWorkCursor] = useState<Vec | null>(null);

  const remover = useRef<BackgroundRemover | null>(null);
  const imageSent = useRef(false);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const workImgRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<Stroke | null>(null);
  const toolRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void detectHqSupport().then(setHqSupported);
    void Promise.all([engine.ai.downloadStatus('standard'), engine.ai.downloadStatus('hq')])
      .then(([s, h]) => setSizes({ standard: s.missing, hq: h.missing }))
      .catch(() => setSizes(null));
    return () => remover.current?.dispose();
  }, []);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  // ---- Load a picture
  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, engine.ai.workSize / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const wc = document.createElement('canvas');
      wc.width = w;
      wc.height = h;
      wc.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      workImgRef.current = wc;
      const mc = document.createElement('canvas');
      mc.width = w;
      mc.height = h;
      maskRef.current = mc;
      imageSent.current = false;
      past.current = [];
      future.current = [];
      setHist({ undo: 0, redo: 0 });
      setSnap(EMPTY);
      setSelPt(null);
      setImg(bmp);
      setWork({ w, h });
      setFile(f);
      setResult(null);
      setShowBefore(false);
      setZoom(1);
      // Bring the whole work area (tools, picture, output) onto the screen.
      requestAnimationFrame(() => toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setError(tr("“{0}” couldn't be opened as a picture.", { 0: f.name }));
    }
  };

  const reset = () => {
    img?.close();
    setImg(null);
    setFile(null);
    setWork(null);
    setResult(null);
    setSnap(EMPTY);
  };

  // ---- History
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const syncHist = () => setHist({ undo: past.current.length, redo: future.current.length });
  const commit = useCallback((next: Snapshot) => {
    past.current = [...past.current.slice(-50), snapRef.current];
    future.current = [];
    snapRef.current = next;
    setSnap(next);
    setHist({ undo: past.current.length, redo: 0 });
    setResult(null);
  }, []);
  // Live edits while dragging, recorded as one undo step when the drag ends.
  const dragBase = useRef<Snapshot | null>(null);
  const liveSet = (next: Snapshot) => {
    dragBase.current ??= snapRef.current;
    snapRef.current = next;
    setSnap(next);
  };
  const endLive = () => {
    const base = dragBase.current;
    dragBase.current = null;
    if (!base || base === snapRef.current) return;
    past.current = [...past.current.slice(-50), base];
    future.current = [];
    setHist({ undo: past.current.length, redo: 0 });
    setResult(null);
  };
  const withOutline = (s: Snapshot, o: Outline): Snapshot => {
    const exists = s.outlines.some((x) => x.id === o.id);
    return { ...s, outlines: exists ? s.outlines.map((x) => (x.id === o.id ? o : x)) : [...s.outlines, o] };
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snap);
    setSnap(prev);
    syncHist();
    setResult(null);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snap);
    setSnap(next);
    syncHist();
    setResult(null);
  };

  // ---- AI
  const ensureRemover = async () => {
    if (!remover.current) {
      remover.current = await engine.ai.backgroundRemover();
      remover.current.onProgress = (loaded, total) => setProgress(total > 0 && loaded < total ? { loaded, total } : null);
    }
    if (!imageSent.current && workImgRef.current) {
      await remover.current.setImage(await createImageBitmap(workImgRef.current));
      imageSent.current = true;
    }
    return remover.current;
  };

  const run = async (label: string, fn: (r: BackgroundRemover) => Promise<{ mask: Uint8Array }>, then: (mask: Uint8Array) => Snapshot) => {
    setError(null);
    setBusy(label);
    try {
      const r = await ensureRemover();
      const { mask } = await fn(r);
      commit(then(mask));
      void Promise.all([engine.ai.downloadStatus('standard'), engine.ai.downloadStatus('hq')]).then(([s, h]) => setSizes({ standard: s.missing, hq: h.missing })).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const autoQuick = () => run('Finding the main object…', (r) => r.auto(), (mask) => ({ ...EMPTY, base: mask }));
  const autoHq = () => run('Removing the background in high quality…', (r) => r.autoHq(), (mask) => ({ ...EMPTY, base: mask }));

  const addPoint = (p: Point) => {
    const points = [...snap.points, p];
    void run('Selecting…', (r) => r.select(points), (mask) => ({ ...snapRef.current, base: mask, points }));
  };

  // ---- Mask and drawing
  // The AI mask as a canvas (work size), rebuilt only when it changes.
  const baseCanvas = useRef<{ base: Uint8Array; canvas: HTMLCanvasElement } | null>(null);
  const baseToCanvas = (base: Uint8Array) => {
    if (baseCanvas.current?.base === base) return baseCanvas.current.canvas;
    const c = document.createElement('canvas');
    c.width = work!.w;
    c.height = work!.h;
    const data = new ImageData(c.width, c.height);
    for (let i = 0; i < base.length; i++) {
      data.data[i * 4] = 255;
      data.data[i * 4 + 1] = 255;
      data.data[i * 4 + 2] = 255;
      data.data[i * 4 + 3] = base[i];
    }
    c.getContext('2d')!.putImageData(data, 0, 0);
    baseCanvas.current = { base, canvas: c };
    return c;
  };

  /** Draws the final keep-mask into `target` at `scale` × work size (1 for the preview, full size for export). */
  const renderMaskTo = useCallback((target: HTMLCanvasElement, scale: number, s: Snapshot, extraStroke: Stroke | null) => {
    const ctx = target.getContext('2d')!;
    const W = target.width;
    const H = target.height;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (hasClosedOutline(s.outlines)) {
      drawOutlineMask(ctx, s.outlines, refine, scale);
      // Refine hair: inside a thin band along the line, use the AI's soft edge instead.
      if (refine.hair && s.base) {
        const band = document.createElement('canvas');
        band.width = W;
        band.height = H;
        drawOutlineBand(band.getContext('2d')!, s.outlines, refine.smooth, refine.hairWidth, scale);
        const soft = document.createElement('canvas');
        soft.width = W;
        soft.height = H;
        const sc = soft.getContext('2d')!;
        sc.imageSmoothingQuality = 'high';
        sc.drawImage(baseToCanvas(s.base), 0, 0, W, H);
        sc.globalCompositeOperation = 'destination-in';
        sc.drawImage(band, 0, 0);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(band, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(soft, 0, 0);
      }
    } else if (s.base) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(baseToCanvas(s.base), 0, 0, W, H);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
    }
    const strokes = extraStroke ? [...s.strokes, extraStroke] : s.strokes;
    ctx.scale(scale, scale);
    for (const st of strokes) {
      ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = st.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      st.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (st.pts.length === 1) {
        ctx.arc(st.pts[0][0], st.pts[0][1], st.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.stroke();
    }
    ctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refine, work]);

  const renderMask = useCallback(() => {
    const mc = maskRef.current;
    if (!mc || !work) return;
    renderMaskTo(mc, 1, snap, drawing.current);
  }, [snap, work, renderMaskTo]);

  const editingOutline = tool === 'outline' && !snap.outlineCut;

  const choosePanel = (p: Panel) => {
    setPanel(p);
    if (p === 'outline') {
      setTool('outline');
      if (snapRef.current.outlineCut) {
        liveSet({ ...snapRef.current, outlineCut: false });
        endLive();
      }
    } else if (p === 'brush') setTool((t) => (t === 'brush-erase' ? t : 'brush-add'));
    else setTool('select');
  };

  const draw = useCallback(() => {
    const view = viewRef.current;
    const wc = workImgRef.current;
    const mc = maskRef.current;
    if (!view || !wc || !mc) return;
    const ctx = view.getContext('2d')!;
    ctx.clearRect(0, 0, view.width, view.height);
    if (showBefore) {
      ctx.drawImage(wc, 0, 0);
      return;
    }
    if (editingOutline) {
      // While outlining: the whole picture, dimmed outside the outline.
      ctx.drawImage(wc, 0, 0);
      if (hasClosedOutline(snapRef.current.outlines)) {
        const dim = document.createElement('canvas');
        dim.width = view.width;
        dim.height = view.height;
        const dc = dim.getContext('2d')!;
        dc.fillStyle = 'rgba(0,0,0,0.5)';
        dc.fillRect(0, 0, dim.width, dim.height);
        dc.globalCompositeOperation = 'destination-out';
        dc.drawImage(mc, 0, 0);
        ctx.drawImage(dim, 0, 0);
      }
      return;
    }
    composite(ctx, view.width, view.height, wc, mc, softness, background);
  }, [showBefore, softness, background, editingOutline]);

  useEffect(() => {
    renderMask();
    draw();
  }, [renderMask, draw]);

  const hasCutout = Boolean(snap.base) || snap.strokes.length > 0 || hasClosedOutline(snap.outlines);
  const openOutline = snap.outlines.find((o) => !o.closed) ?? null;

  // Points keep the same on-screen size at any zoom.
  useEffect(() => {
    const c = viewRef.current;
    if (!c || !work) return;
    const ro = new ResizeObserver(() => setViewScale(work.w / Math.max(1, c.getBoundingClientRect().width)));
    ro.observe(c);
    return () => ro.disconnect();
  }, [work, zoom]);

  const toWork = (e: { clientX: number; clientY: number }) => {
    const rect = viewRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * work!.w, y: ((e.clientY - rect.top) / rect.height) * work!.h, scale: work!.w / rect.width };
  };

  // ---- Manual outline: drawing and reshaping
  const track = (onMove: (p: Vec, ev: PointerEvent) => void, onUp?: () => void) => {
    const move = (ev: PointerEvent) => onMove(toWork(ev), ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onUp?.();
      endLive();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragPoint = (id: string, i: number, start: Vec) => {
    track((p) => {
      const o = snapRef.current.outlines.find((x) => x.id === id);
      if (!o) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      start = p;
      const pts = o.points.map((q, k) => (k === i ? {
        ...q, x: q.x + dx, y: q.y + dy,
        hin: q.hin && { x: q.hin.x + dx, y: q.hin.y + dy },
        hout: q.hout && { x: q.hout.x + dx, y: q.hout.y + dy },
      } : q));
      liveSet(withOutline(snapRef.current, { ...o, points: pts }));
    });
  };

  // Pen: dragging while placing a point pulls out curve handles.
  const dragNewHandles = (id: string, i: number, start: Vec) => {
    track((p) => {
      if (dist(p, start) < 3 * viewScale) return;
      const o = snapRef.current.outlines.find((x) => x.id === id);
      if (!o) return;
      const pt = o.points[i];
      const pts = o.points.map((q, k) => (k === i ? { ...q, hout: p, hin: { x: 2 * pt.x - p.x, y: 2 * pt.y - p.y } } : q));
      liveSet(withOutline(snapRef.current, { ...o, points: pts }));
    });
  };

  const onOutlineCanvasDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toWork(e);
    const tol = 10 * viewScale;
    const s = snapRef.current;
    if (s.outlineCut) return;
    const open = s.outlines.find((o) => !o.closed);
    if (open) {
      if (open.points.length >= 3 && dist(p, open.points[0]) < tol) {
        commit(withOutline(s, { ...open, closed: true }));
        setSelPt(null);
        return;
      }
      const o = { ...open, points: [...open.points, { x: p.x, y: p.y }] };
      liveSet(withOutline(s, o));
      setSelPt({ id: o.id, i: o.points.length - 1 });
      dragNewHandles(o.id, o.points.length - 1, p);
      return;
    }
    // Click on a line: add a point there and drag it.
    for (const o of s.outlines) {
      const near = nearestOnOutline(o, p, refine.smooth);
      if (near.dist < tol * 0.8) {
        const o2 = insertPoint(o, near.seg, near.t, refine.smooth);
        liveSet(withOutline(s, o2));
        setSelPt({ id: o.id, i: near.seg + 1 });
        dragPoint(o.id, near.seg + 1, p);
        return;
      }
    }
    setSelPt(null);
    if (outlineMode === 'lasso') {
      const id = newId();
      const pts: Vec[] = [{ x: p.x, y: p.y }];
      liveSet(withOutline(s, { id, points: pts, closed: false, hole: nextHole }));
      track(
        (q) => {
          if (dist(q, pts[pts.length - 1]) < 2 * viewScale) return;
          pts.push({ x: q.x, y: q.y });
          liveSet(withOutline(snapRef.current, { id, points: [...pts], closed: false, hole: nextHole }));
        },
        () => {
          const simple = simplify(pts, 1.2 * viewScale);
          const next = simple.length >= 3
            ? withOutline(snapRef.current, { id, points: simple.map((q) => ({ x: q.x, y: q.y })), closed: true, hole: nextHole })
            : { ...snapRef.current, outlines: snapRef.current.outlines.filter((o) => o.id !== id) };
          snapRef.current = next;
          setSnap(next);
          setNextHole(false);
        },
      );
      return;
    }
    // Pen: start a new outline.
    const o: Outline = { id: newId(), points: [{ x: p.x, y: p.y }], closed: false, hole: nextHole };
    liveSet(withOutline(s, o));
    setSelPt({ id: o.id, i: 0 });
    setNextHole(false);
    dragNewHandles(o.id, 0, p);
  };

  const onOutlinePointDown = (e: ReactPointerEvent, id: string, i: number) => {
    e.stopPropagation();
    e.preventDefault();
    const s = snapRef.current;
    const o = s.outlines.find((x) => x.id === id);
    if (!o || s.outlineCut) return;
    if (!o.closed && i === 0 && o.points.length >= 3) {
      commit(withOutline(s, { ...o, closed: true }));
      setSelPt(null);
      return;
    }
    if (e.altKey || e.detail === 2) {
      commit(withOutline(s, toggleCurve(o, i)));
      setSelPt({ id, i });
      return;
    }
    setSelPt({ id, i });
    dragPoint(id, i, toWork(e as unknown as PointerEvent));
  };

  const onOutlineHandleDown = (e: ReactPointerEvent, id: string, i: number, which: 'hin' | 'hout') => {
    e.stopPropagation();
    e.preventDefault();
    track((p, ev) => {
      const o = snapRef.current.outlines.find((x) => x.id === id);
      if (!o) return;
      const pt = o.points[i];
      const other = which === 'hin' ? 'hout' : 'hin';
      // Handles stay mirrored (smooth) unless Alt is held (sharp bend).
      const mirrored = ev.altKey ? pt[other] : { x: 2 * pt.x - p.x, y: 2 * pt.y - p.y };
      const pts = o.points.map((q, k) => (k === i ? { ...q, [which]: p, [other]: mirrored } : q));
      liveSet(withOutline(snapRef.current, { ...o, points: pts }));
    });
  };

  const outlineFromSelection = () => {
    const mc = maskRef.current;
    if (!mc || !work) return;
    // Trace what is selected now (AI selection plus brush), ignoring any old outline.
    const tmp = document.createElement('canvas');
    tmp.width = work.w;
    tmp.height = work.h;
    renderMaskTo(tmp, 1, { ...snapRef.current, outlines: [] }, null);
    const data = tmp.getContext('2d')!.getImageData(0, 0, work.w, work.h).data;
    const alpha = new Uint8Array(work.w * work.h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const outlines = traceMask(alpha, work.w, work.h);
    if (!outlines.length) {
      setError(tr('Nothing is selected yet. Use “Remove background” or click the object first.'));
      return;
    }
    commit({ ...snapRef.current, outlines, strokes: [], outlineCut: false });
    setSelPt(null);
  };

  const deleteSelectedPoint = () => {
    if (!selPt) return;
    const s = snapRef.current;
    const o = s.outlines.find((x) => x.id === selPt.id);
    if (!o) return;
    const pts = o.points.filter((_, k) => k !== selPt.i);
    const next = pts.length < (o.closed ? 3 : 1)
      ? { ...s, outlines: s.outlines.filter((x) => x.id !== o.id) }
      : withOutline(s, { ...o, points: pts });
    commit(next);
    setSelPt(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!work || busy || showBefore) return;
    if (tool === 'outline') {
      if (e.button === 0) onOutlineCanvasDown(e);
      return;
    }
    const { x, y, scale } = toWork(e);
    if (tool === 'select') {
      if (e.button === 2) return; // handled by onContextMenu
      addPoint({ x, y, positive: selectAdd && !e.altKey });
      return;
    }
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = { erase: tool === 'brush-erase', size: brush * scale, pts: [[x, y]] };
    renderMask();
    draw();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = viewRef.current!.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (tool === 'outline') setWorkCursor(toWork(e));
    if (!drawing.current) return;
    const { x, y } = toWork(e);
    drawing.current.pts.push([x, y]);
    renderMask();
    draw();
  };
  const onPointerUp = () => {
    const s = drawing.current;
    if (!s) return;
    drawing.current = null;
    commit({ ...snap, strokes: [...snap.strokes, s] });
  };

  // ---- Keyboard: undo/redo, before/after
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (tool === 'outline' && !mod) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selPt) {
          e.preventDefault();
          deleteSelectedPoint();
          return;
        }
        if (e.key === 'Enter' && openOutline && openOutline.points.length >= 3) {
          e.preventDefault();
          commit(withOutline(snapRef.current, { ...openOutline, closed: true }));
          setSelPt(null);
          return;
        }
        if (e.key === 'Escape') {
          if (openOutline) commit({ ...snapRef.current, outlines: snapRef.current.outlines.filter((o) => o.id !== openOutline.id) });
          setSelPt(null);
          return;
        }
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- Export at full resolution
  const exportPng = async () => {
    if (!img || !work || !maskRef.current || !workImgRef.current) return;
    setBusy(tr("Making the PNG…"));
    try {
      const W = img.width;
      const H = img.height;
      const full = document.createElement('canvas');
      full.width = W;
      full.height = H;
      // The keep-mask is rendered at full size, so outline edges stay sharp.
      const fullMask = document.createElement('canvas');
      fullMask.width = W;
      fullMask.height = H;
      renderMaskTo(fullMask, W / work.w, snapRef.current, null);
      composite(full.getContext('2d')!, W, H, img, fullMask, softness * (W / work.w), background);
      let out = full;
      if (crop) {
        const box = maskBounds(maskRef.current);
        if (box) {
          const s = W / work.w;
          const pad = padding;
          const x = Math.max(0, Math.floor(box.x * s) - pad);
          const y = Math.max(0, Math.floor(box.y * s) - pad);
          const x2 = Math.min(W, Math.ceil((box.x + box.w) * s) + pad);
          const y2 = Math.min(H, Math.ceil((box.y + box.h) * s) + pad);
          out = document.createElement('canvas');
          out.width = x2 - x;
          out.height = y2 - y;
          out.getContext('2d')!.drawImage(full, x, y, x2 - x, y2 - y, 0, 0, x2 - x, y2 - y);
        }
      }
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
      if (!blob) throw new Error(tr("The PNG couldn't be created."));
      const name = `${file!.name.replace(/\.[^.]+$/, '')}-no-background.png`;
      setResult({ url: URL.createObjectURL(blob), name, size: blob.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PNG couldn't be created.");
    } finally {
      setBusy(null);
    }
  };

  const viewSize = useMemo(() => work ?? { w: 1, h: 1 }, [work]);

  if (!file || !img || !work) {
    return (
      <div className="space-y-4">
        <FileDropzone accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif" onFiles={(f) => void handleFile(f)} hint={tr("JPG, PNG or WebP")} />
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <p className="text-sm text-ink-2">
          {tr("Click “Remove background” to cut out the main object automatically, or click the object you want to keep. The first time, Rarvon downloads its AI model once")}
          {sizes ? ` (${formatBytes(sizes.standard)})` : ''}{tr(". After that it works offline.")}
        </p>
      </div>
    );
  }

  const pending = busy !== null;
  const brushCursor = (tool === 'brush-add' || tool === 'brush-erase') && cursor && !showBefore ? brush : null;

  return (
    <div ref={toolRef} className="scroll-mt-20 space-y-4" data-testid="bg-remover">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper-dim px-3 py-2 text-sm">
        <span className="truncate">{file.name} · {img.width}×{img.height} · {formatBytes(file.size)}</span>
        <button onClick={reset} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[52px_230px_minmax(0,1fr)_230px] lg:gap-4">
        {/* Tool icons (a row on phones, a column on wide screens) */}
        <div className="flex gap-1.5 lg:flex-col" role="tablist" aria-label={tr("Cut-out tools")}>
          {RAIL.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={panel === r.id}
              aria-label={tr(r.label)}
              title={tr(r.label)}
              onClick={() => choosePanel(r.id)}
              data-testid={`rail-${r.id}`}
              className={clsx(
                'group relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border transition-all lg:h-[52px] lg:w-[52px] lg:flex-none',
                panel === r.id ? 'border-workshop bg-workshop-dim text-workshop shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-workshop)_15%,transparent)]' : 'border-line bg-elevated text-ink-2 hover:border-ink hover:text-ink',
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={r.icon} /></svg>
              <span className="text-[9px] font-semibold leading-none">{tr(r.short)}</span>
            </button>
          ))}
        </div>

        {/* Options of the chosen tool; Edges pinned at the bottom */}
        <div className="flex min-h-0 flex-col rounded-xl border border-line bg-elevated lg:h-[max(420px,calc(100vh-12rem))]" data-testid="tool-panel">
          <div key={panel} className="tool-panel-in grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto p-3">
            {panel === 'auto' && (
              <>
                <PanelTitle>{tr("Automatic")}</PanelTitle>
                <ActionButton variant="primary" onClick={() => void autoQuick()} disabled={pending} icon="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z">{tr("Remove background")}</ActionButton>
                <ActionButton
                  onClick={() => void autoHq()}
                  disabled={pending || hqSupported === false}
                  title={hqSupported === false ? tr("Needs a graphics card with WebGPU half-precision support") : undefined}
                  icon="M4 17l5-5 4 4 7-8M15 8h5v5"
                >
                  {tr("High quality (hair, fine edges)")}
                </ActionButton>
                <p className="text-[11px] leading-snug text-ink-3">
                  {hqSupported === false
                    ? tr("High quality needs a newer graphics card and browser (WebGPU). Use the brush to fine-tune edges instead.")
                    : sizes && sizes.hq > 0
                      ? tr("High quality downloads {0} once.", { 0: formatBytes(sizes.hq) })
                      : tr("Best for hair, fur and detailed edges.")}
                </p>
              </>
            )}

            {panel === 'select' && (
              <>
                <PanelTitle>{tr("Select by clicking")}</PanelTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionButton active={selectAdd} onClick={() => setSelectAdd(true)} icon="M12 5v14M5 12h14">{tr("+ Add")}</ActionButton>
                  <ActionButton active={!selectAdd} onClick={() => setSelectAdd(false)} icon="M5 12h14">{tr("− Remove")}</ActionButton>
                </div>
                <ActionButton variant="danger" onClick={() => commit({ ...snap, points: [], base: null })} disabled={!snap.points.length} icon="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13">{tr("Clear clicks")}</ActionButton>
                <p className="text-[11px] leading-snug text-ink-3">{tr("Click the object to keep it. Click more parts to add them. Right-click (or choose “− Remove”) to take parts away.")}</p>
              </>
            )}

            {panel === 'outline' && (
              <>
                <PanelTitle>{tr('Manual outline')}</PanelTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionButton active={outlineMode === 'pen'} onClick={() => setOutlineMode('pen')} icon="M3 21l3-1 11-11-2-2L4 18zM14 6l2-2 4 4-2 2">{tr('Pen')}</ActionButton>
                  <ActionButton active={outlineMode === 'lasso'} onClick={() => setOutlineMode('lasso')} icon="M12 4c5 0 8 2.5 8 5.5S16.5 15 12 15c-3 0-5-1-5.5-2.5M7 17a2 2 0 100-4 2 2 0 000 4zM7 17c0 2 1 3 3 4">{tr('Lasso')}</ActionButton>
                </div>
                <ActionButton variant="primary" onClick={outlineFromSelection} disabled={pending || (!snap.base && !snap.strokes.length)} icon="M4 4h6v6H4zM14 14h6v6h-6zM10 7h4a3 3 0 013 3v4" testId="outline-from-selection">
                  {tr('Outline from selection')}
                </ActionButton>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionButton
                    onClick={() => { if (openOutline) { commit(withOutline(snapRef.current, { ...openOutline, closed: true })); setSelPt(null); } }}
                    disabled={!openOutline || openOutline.points.length < 3}
                    icon="M5 12l5 5L20 7"
                  >
                    {tr('Close the shape')}
                  </ActionButton>
                  <ActionButton active={nextHole} onClick={() => setNextHole((v) => !v)} icon="M12 3a9 9 0 100 18 9 9 0 000-18zM12 9a3 3 0 100 6 3 3 0 000-6z">{tr('Add a hole')}</ActionButton>
                  <ActionButton variant="danger" onClick={deleteSelectedPoint} disabled={!selPt} icon="M6 6l12 12M18 6L6 18">{tr('Delete point')}</ActionButton>
                  <ActionButton variant="danger" onClick={() => { commit({ ...snapRef.current, outlines: [], outlineCut: false }); setSelPt(null); }} disabled={!snap.outlines.length} icon="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13">{tr('Clear outline')}</ActionButton>
                </div>
                <p className="text-[11px] leading-snug text-ink-3">
                  {outlineMode === 'pen'
                    ? tr('Click to place points around the object; drag while clicking to curve. Click the first point to close. Click a line to add a point, drag points to reshape, double-click a point to curve it, Delete removes it.')
                    : tr('Drag around the object to draw its shape freely. Then drag points to fix it.')}
                </p>
                {hasClosedOutline(snap.outlines) && (
                  <div className="grid gap-2.5 rounded-lg border border-workshop/30 bg-workshop-dim/40 p-2.5">
                    <PanelTitle>{tr('Refine edges')}</PanelTitle>
                    <Range label={tr('Smooth')} value={refine.smooth} min={0} max={1} step={0.05} onChange={(v) => setRefine((r) => ({ ...r, smooth: v }))} format={(v) => `${Math.round(v * 100)}%`} />
                    <Range label={tr('Move edge')} value={refine.offset} min={-10} max={10} step={0.5} onChange={(v) => setRefine((r) => ({ ...r, offset: v }))} format={(v) => (v > 0 ? `+${v}px` : `${v}px`)} />
                    <label className={clsx('flex items-center gap-2 text-xs', snap.base ? 'cursor-pointer text-ink-2' : 'text-ink-3')}>
                      <input type="checkbox" checked={refine.hair && Boolean(snap.base)} disabled={!snap.base} onChange={(e) => setRefine((r) => ({ ...r, hair: e.target.checked }))} className="accent-[var(--color-workshop)]" />
                      {tr('Refine hair and fine edges')}
                    </label>
                    {refine.hair && snap.base && (
                      <Range label={tr('Edge band')} value={refine.hairWidth} min={4} max={60} step={1} onChange={(v) => setRefine((r) => ({ ...r, hairWidth: v }))} format={(v) => `${v}px`} />
                    )}
                    {!snap.base && <p className="text-[11px] text-ink-3">{tr('Hair refinement uses the AI selection. Run “Remove background” or click the object first.')}</p>}
                    {editingOutline ? (
                      <ActionButton variant="primary" onClick={() => { commit({ ...snapRef.current, outlineCut: true }); setSelPt(null); }} icon="M6 6l12 12M9 6a3 3 0 11-6 0 3 3 0 016 0zM9 18a3 3 0 11-6 0 3 3 0 016 0zM20 4L8.5 15.5" testId="outline-cut">{tr('Cut out')}</ActionButton>
                    ) : (
                      <ActionButton onClick={() => { liveSet({ ...snapRef.current, outlineCut: false }); endLive(); }} icon="M3 21l3-1 11-11-2-2L4 18z">{tr('Edit outline')}</ActionButton>
                    )}
                  </div>
                )}
              </>
            )}

            {panel === 'brush' && (
              <>
                <PanelTitle>{tr("Fix by hand")}</PanelTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionButton active={tool === 'brush-add'} onClick={() => setTool('brush-add')} icon="M12 5v14M5 12h14">{tr("Brush: keep")}</ActionButton>
                  <ActionButton active={tool === 'brush-erase'} onClick={() => setTool('brush-erase')} icon="M5 12h14">{tr("Brush: erase")}</ActionButton>
                </div>
                <Range label={tr("Brush size")} value={brush} min={4} max={150} onChange={setBrush} format={(v) => `${v}px`} />
                <p className="text-[11px] leading-snug text-ink-3">{tr("Paint over the picture to keep or erase parts. Zoom in for small details.")}</p>
              </>
            )}
          </div>

          {/* Always visible */}
          <div className="border-t border-line p-3">
            <Range label={tr("Edge softness")} value={softness} min={0} max={10} step={0.5} onChange={setSoftness} format={(v) => (v === 0 ? tr('Sharp') : `${v}`)} />
          </div>
        </div>

        {/* Canvas */}
        <div className="order-first min-w-0 lg:order-none">
          <div
            className="relative grid max-h-[max(420px,calc(100vh-12rem))] min-h-[320px] place-items-center overflow-auto rounded-xl border border-line"
            style={{ background: 'repeating-conic-gradient(var(--color-paper-dim) 0% 25%, var(--color-elevated) 0% 50%) 50% / 20px 20px' }}
          >
            <div className="relative" style={{ width: `calc(${zoom} * min(100%, calc((max(420px, 100vh - 12rem) - 2px) * ${viewSize.w / viewSize.h})))`, maxWidth: zoom === 1 ? `${viewSize.w}px` : undefined }}>
              <canvas
                ref={viewRef}
                width={viewSize.w}
                height={viewSize.h}
                data-testid="bg-canvas"
                aria-label={showBefore ? tr("Original picture") : tr("Picture with the background removed")}
                className={clsx('block h-auto w-full touch-none', tool === 'select' || tool === 'outline' ? 'cursor-crosshair' : 'cursor-none')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => setCursor(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (tool !== 'select' || pending || showBefore || !work) return;
                  const { x, y } = toWork(e);
                  addPoint({ x, y, positive: false });
                }}
              />
              {!showBefore && tool === 'select' && snap.points.map((p, i) => (
                <span
                  key={i}
                  className={clsx('pointer-events-none absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow', p.positive ? 'bg-signal' : 'bg-warn')}
                  style={{ left: `${(p.x / work.w) * 100}%`, top: `${(p.y / work.h) * 100}%` }}
                  aria-hidden="true"
                >
                  {p.positive ? '+' : '−'}
                </span>
              ))}
              {editingOutline && !showBefore && (
                <OutlineLayer
                  outlines={snap.outlines}
                  w={work.w}
                  h={work.h}
                  scale={viewScale}
                  smooth={refine.smooth}
                  selected={selPt}
                  cursor={workCursor}
                  onPointDown={onOutlinePointDown}
                  onHandleDown={onOutlineHandleDown}
                />
              )}
              {brushCursor && cursor && (
                <span
                  className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                  style={{ width: brushCursor, height: brushCursor, left: cursor.x - brushCursor / 2, top: cursor.y - brushCursor / 2 }}
                  aria-hidden="true"
                />
              )}
            </div>
            {pending && (
              <div className="absolute inset-0 grid place-items-center bg-black/35" role="status">
                <div className="rounded-lg bg-elevated px-4 py-3 text-center text-sm shadow-lg">
                  <span className="mx-auto mb-2 block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-workshop" aria-hidden="true" />
                  {busy}
                  {progress && (
                    <span className="mt-1 block font-mono text-xs text-ink-3">
                      {tr("Downloading the AI model (first time only):")}{' '}{formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <IconBtn label={tr("Undo")} onClick={undo} disabled={!hist.undo || pending} icon="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />
            <IconBtn label={tr("Redo")} onClick={redo} disabled={!hist.redo || pending} icon="M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3" />
            <button
              onClick={() => setShowBefore((v) => !v)}
              aria-pressed={showBefore}
              className={clsx(
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
                showBefore ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink',
              )}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M4 6h5v12H4zM15 6h5v12h-5" /></svg>
              {showBefore ? tr("Show after") : tr("Show before")}
            </button>
            <span className="text-xs text-ink-3">{showBefore ? tr("Showing the original") : editingOutline ? tr("Editing the outline: the dimmed part will be removed") : hasCutout ? tr("Showing the result") : ''}</span>
            <div className="ms-auto flex items-center gap-1">
              <IconBtn label={tr("Zoom out")} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} disabled={zoom === ZOOMS[0]} icon="M5 12h14" />
              <button onClick={() => setZoom(1)} className="min-w-[48px] rounded-md px-2 py-1 font-mono text-xs text-ink-2 hover:bg-paper-dim" title={tr("Fit")}>{Math.round(zoom * 100)}%</button>
              <IconBtn label={tr("Zoom in")} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1]} icon="M12 5v14M5 12h14" />
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {tool === 'select'
              ? tr("Click the object to keep it. Click more parts to add them. Right-click (or choose “− Remove”) to take parts away.")
              : tool === 'outline'
                ? tr("Zoom in for precise points. Enter closes the shape, Esc cancels it, Delete removes the selected point.")
                : tr("Paint over the picture to keep or erase parts. Zoom in for small details.")}
          </p>
        </div>

        {/* Output */}
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Section title={tr("Background")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setBackground(null)}
                aria-pressed={background === null}
                aria-label={tr("Transparent")}
                title={tr("Transparent")}
                className={clsx('h-7 w-7 rounded-full border', background === null ? 'ring-2 ring-workshop ring-offset-1 ring-offset-paper' : 'border-line')}
                style={{ background: 'repeating-conic-gradient(#d4d4d4 0% 25%, #fff 0% 50%) 50% / 8px 8px' }}
              />
              {COLOURS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBackground(c)}
                  aria-pressed={background === c}
                  aria-label={tr("Background {0}", { 0: c })}
                  className={clsx('h-7 w-7 rounded-full border border-line', background === c && 'ring-2 ring-workshop ring-offset-1 ring-offset-paper')}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={background ?? '#ffffff'} onChange={(e) => setBackground(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" aria-label={tr("Custom background colour")} />
            </div>
            <p className="text-[11px] text-ink-3">{background ? tr("Solid colour behind the object.") : tr("Transparent (PNG).")}</p>
          </Section>
          <Section title={tr("Size")}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} className="accent-[var(--color-workshop)]" />
              {tr("Crop to the object")}
            </label>
            {crop && <Range label={tr("Space around it")} value={padding} min={0} max={200} onChange={setPadding} format={(v) => `${v}px`} />}
          </Section>
          <button
            onClick={() => void exportPng()}
            disabled={pending || !hasCutout}
            className="w-full rounded-md bg-ink px-3 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
          >
            {tr("Make PNG")}
          </button>
          {!hasCutout && <p className="text-[11px] text-ink-3">{tr("Remove the background or select an object first.")}</p>}
        </div>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>
          {result.name} · {formatBytes(result.size)}
        </ResultCard>
      )}
    </div>
  );
}

/** Draws the picture keeping only what the mask covers, with optional soft edges and a solid background. */
function composite(ctx: CanvasRenderingContext2D, W: number, H: number, image: CanvasImageSource, mask: HTMLCanvasElement, softness: number, background: string | null) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-in';
  if (softness > 0) ctx.filter = `blur(${softness}px)`;
  ctx.drawImage(mask, 0, 0, W, H);
  ctx.filter = 'none';
  if (background) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Bounding box of the clearly visible (at least half opaque) part of the mask. */
function maskBounds(mask: HTMLCanvasElement) {
  const { width: w, height: h } = mask;
  const data = mask.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x1 = w;
  let y1 = h;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= 128) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{children}</p>;
}

/** Every action in the tool panel is a real, bordered button with an icon. */
function ActionButton({ children, onClick, icon, active, disabled, variant = 'default', title, testId }: {
  children: ReactNode; onClick: () => void; icon: string; active?: boolean; disabled?: boolean; variant?: 'default' | 'primary' | 'danger'; title?: string; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      data-testid={testId}
      className={clsx(
        'flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-center text-xs font-semibold leading-tight transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'border-workshop bg-workshop text-white hover:opacity-90',
        variant === 'danger' && 'border-warn/40 bg-warn-dim text-warn hover:border-warn',
        variant === 'default' && (active ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line bg-paper text-ink hover:border-ink'),
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d={icon} /></svg>
      <span>{children}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-elevated p-3">
      <p className="text-xs font-semibold text-ink-2">{title}</p>
      {children}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] font-medium text-ink-2">
        {label}
        <span className="font-mono text-ink-3">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="w-full accent-[var(--color-workshop)]" />
    </label>
  );
}

function IconBtn({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-2 hover:border-ink hover:text-ink disabled:opacity-40">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
    </button>
  );
}
