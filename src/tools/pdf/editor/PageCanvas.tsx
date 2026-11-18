import { engine } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Annotation, EditorTool, PageInstance, ShapeKind } from './types';
import { NOTE_ICON_PT, UNDERLINE_THICKNESS, newId } from './types';
import { EDITOR_FONT_STACK } from './exportPdf';
import { tr } from '../../../lib/i18n';

export interface ImageAsset {
  dataUrl: string;
  width: number;
  height: number;
}

interface Props {
  srcBytes: ArrayBuffer;
  page: PageInstance;
  annotations: Annotation[];
  zoomMode: 'fit' | 'custom';
  customZoom: number;
  onZoomResolved: (z: number) => void;
  activeTool: EditorTool;
  color: string;
  shapeKind: ShapeKind;
  strokeWidth: number;
  signatureDataUrl: string | null;
  imageAsset: ImageAsset | null;
  onAddAnnotation: (a: Annotation) => void;
  onMoveAnnotation: (id: string, x: number, y: number) => void;
  onUpdateText: (id: string, text: string) => void;
  onDeleteAnnotation: (id: string) => void;
}

interface Box { x: number; y: number; w: number; h: number }

const FIT_PADDING = 48; // px breathing room around the page at 100% fit
const CLICK_THRESHOLD = 0.006; // fractional movement below this counts as a click, not a drag
const RENDER_SCALE = 2; // page bitmap pixels per PDF point

function arrowPoints(x1: number, y1: number, x2: number, y2: number, width: number) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const L = Math.max(width * 4, 8);
  const a = (28 * Math.PI) / 180;
  const wing = (s: number) => `${x2 - L * (ux * Math.cos(a) - s * uy * Math.sin(a))},${y2 - L * (uy * Math.cos(a) + s * ux * Math.sin(a))}`;
  return `${wing(1)} ${x2},${y2} ${wing(-1)}`;
}

export default function PageCanvas({
  srcBytes, page, annotations, zoomMode, customZoom, onZoomResolved, activeTool, color, shapeKind, strokeWidth,
  signatureDataUrl, imageAsset, onAddAnnotation, onMoveAnnotation, onUpdateText, onDeleteAnnotation,
}: Props) {
  const [pageImg, setPageImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fitZoom, setFitZoom] = useState(1);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [dragBox, setDragBox] = useState<Box | null>(null);
  const [dragLine, setDragLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; kind: 'text' | 'note' } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Select tool state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveOffset, setMoveOffset] = useState<{ dx: number; dy: number } | null>(null);
  const movingAnnotation = useRef<Annotation | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageImg(null);
    if (page.blank) {
      const c = document.createElement('canvas');
      c.width = Math.round(page.blank.width * RENDER_SCALE);
      c.height = Math.round(page.blank.height * RENDER_SCALE);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      setPageImg({ url: c.toDataURL('image/png'), w: c.width, h: c.height });
      setLoading(false);
      return;
    }
    engine.pdf.renderPage(srcBytes.slice(0), page.originalIndex + 1, RENDER_SCALE).then((canvas) => {
      if (cancelled) return;
      setPageImg({ url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [srcBytes, page.originalIndex, page.blank]);

  // Selection and open editors shouldn't survive a page switch or tool change.
  useEffect(() => {
    setSelectedId(null);
    setTextEditor(null);
  }, [page.id, activeTool]);

  // Recompute "fit" zoom whenever the available space or the page bitmap changes.
  useEffect(() => {
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl || !pageImg) return;
    const swapped = ((page.extraRotation % 360) + 360) % 360;
    const naturalW = swapped === 90 || swapped === 270 ? pageImg.h : pageImg.w;
    const naturalH = swapped === 90 || swapped === 270 ? pageImg.w : pageImg.h;

    function recompute() {
      const availW = scrollEl!.clientWidth - FIT_PADDING;
      const availH = scrollEl!.clientHeight - FIT_PADDING;
      setFitZoom(Math.max(0.1, Math.min(availW / naturalW, availH / naturalH)));
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [pageImg, page.extraRotation]);

  const effectiveZoom = zoomMode === 'fit' ? fitZoom : customZoom;
  const pxW = (pageImg?.w ?? 1) * effectiveZoom; // page width on screen (unrotated)
  const pxH = (pageImg?.h ?? 1) * effectiveZoom;
  const noteW = pageImg ? (NOTE_ICON_PT * RENDER_SCALE) / pageImg.w : 0.04;
  const noteH = pageImg ? (NOTE_ICON_PT * RENDER_SCALE) / pageImg.h : 0.03;

  useEffect(() => {
    onZoomResolved(effectiveZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveZoom]);

  // Delete/Backspace removes the selected annotation — never while typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedId || textEditor) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteAnnotation(selectedId);
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, textEditor, onDeleteAnnotation]);

  /** Pointer position as a fraction of the (unrotated) page. The page element
   * is CSS-rotated by the editor's extra rotation, so its bounding box is
   * rotated too: undo that rotation around the center before dividing. */
  function getRelative(e: ReactPointerEvent): { x: number; y: number } {
    const box = containerRef.current!.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const rad = (-page.extraRotation * Math.PI) / 180;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return {
      x: Math.min(Math.max(rx / pxW + 0.5, 0), 1),
      y: Math.min(Math.max(ry / pxH + 0.5, 0), 1),
    };
  }

  /** Bounding box of any annotation in page fractions (hit-testing and selection outline). */
  function getBounds(a: Annotation): Box {
    switch (a.type) {
      case 'highlight':
      case 'redact':
      case 'signature':
      case 'image':
      case 'underline':
        return { x: a.x, y: a.y, w: a.w, h: a.h };
      case 'shape': {
        const pad = 0.008;
        const x = Math.min(a.x, a.x + a.w);
        const y = Math.min(a.y, a.y + a.h);
        return { x: x - pad, y: y - pad, w: Math.abs(a.w) + pad * 2, h: Math.abs(a.h) + pad * 2 };
      }
      case 'note':
        return { x: a.x, y: a.y, w: noteW, h: noteH };
      case 'draw': {
        const xs = a.points.map((p) => p.x);
        const ys = a.points.map((p) => p.y);
        return { x: a.x + Math.min(0, ...xs), y: a.y + Math.min(0, ...ys), w: Math.max(0, ...xs) - Math.min(0, ...xs), h: Math.max(0, ...ys) - Math.min(0, ...ys) };
      }
      case 'text': {
        const el = containerRef.current?.querySelector<HTMLElement>(`[data-ann="${a.id}"]`);
        if (el) return { x: a.x, y: a.y, w: el.offsetWidth / pxW, h: el.offsetHeight / pxH };
        return { x: a.x, y: a.y, w: a.text.length * a.size * 0.55 * (pxH / pxW), h: a.size };
      }
    }
  }

  function hitTest(pos: { x: number; y: number }): Annotation | null {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      const b = getBounds(a);
      if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) return a;
    }
    return null;
  }

  function openEditor(a: Annotation & { type: 'text' | 'note' }) {
    setTextEditor({ x: a.x, y: a.y, kind: a.type });
    setTextValue(a.text);
    setEditingId(a.id);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (textEditor) {
      // Clicking the page while a note is open saves it (a text input saves on blur by itself).
      if (textEditor.kind === 'note') commitText();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    const pos = getRelative(e);

    if (activeTool === 'select') {
      e.preventDefault();
      const hit = hitTest(pos);
      if (hit) {
        setSelectedId(hit.id);
        movingAnnotation.current = hit;
        dragStart.current = pos;
        setMoveOffset({ dx: 0, dy: 0 });
      } else {
        setSelectedId(null);
        movingAnnotation.current = null;
      }
      return;
    }

    e.preventDefault();
    if (activeTool === 'text' || activeTool === 'note') {
      setTextEditor({ x: pos.x, y: pos.y, kind: activeTool });
      setTextValue('');
      setEditingId(null);
      return;
    }
    if (activeTool === 'draw') {
      setDrawPoints([{ x: 0, y: 0 }]);
      dragStart.current = pos;
      return;
    }
    dragStart.current = pos;
    if (activeTool === 'shape' && (shapeKind === 'line' || shapeKind === 'arrow')) {
      setDragLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
      return;
    }
    setDragBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragStart.current) return;
    const pos = getRelative(e);

    if (activeTool === 'select' && movingAnnotation.current) {
      setMoveOffset({ dx: pos.x - dragStart.current.x, dy: pos.y - dragStart.current.y });
      return;
    }
    if (activeTool === 'draw' && drawPoints) {
      setDrawPoints((pts) => [...(pts ?? []), { x: pos.x - dragStart.current!.x, y: pos.y - dragStart.current!.y }]);
      return;
    }
    if (dragLine) {
      setDragLine({ ...dragLine, x2: pos.x, y2: pos.y });
      return;
    }
    if (dragBox) {
      setDragBox({
        x: Math.min(dragStart.current.x, pos.x),
        y: Math.min(dragStart.current.y, pos.y),
        w: Math.abs(pos.x - dragStart.current.x),
        h: Math.abs(pos.y - dragStart.current.y),
      });
    }
  }

  /** Height (as a page fraction) that keeps the image's aspect ratio for a given width fraction. */
  function imageHeightFor(wFrac: number, asset: ImageAsset) {
    return wFrac * (pxW / pxH) * (asset.height / asset.width);
  }

  function onPointerUp() {
    if (activeTool === 'select' && movingAnnotation.current && dragStart.current) {
      const moved = movingAnnotation.current;
      const offset = moveOffset ?? { dx: 0, dy: 0 };
      if (Math.hypot(offset.dx, offset.dy) > CLICK_THRESHOLD) {
        onMoveAnnotation(moved.id, moved.x + offset.dx, moved.y + offset.dy);
      } else if (moved.type === 'text' || moved.type === 'note') {
        // A real click (not a drag) re-opens text and notes for editing.
        openEditor(moved);
      }
      movingAnnotation.current = null;
      setMoveOffset(null);
      dragStart.current = null;
      return;
    }

    const base = { id: newId(), pageId: page.id };
    const start = dragStart.current;
    if (activeTool === 'draw' && drawPoints && start && drawPoints.length > 1) {
      onAddAnnotation({ ...base, type: 'draw', x: start.x, y: start.y, points: drawPoints, color, strokeWidth: strokeWidth });
    } else if (dragLine) {
      if (Math.hypot(dragLine.x2 - dragLine.x1, dragLine.y2 - dragLine.y1) > 0.01) {
        onAddAnnotation({ ...base, type: 'shape', kind: shapeKind, x: dragLine.x1, y: dragLine.y1, w: dragLine.x2 - dragLine.x1, h: dragLine.y2 - dragLine.y1, color, strokeWidth });
      }
    } else if (activeTool === 'image' && imageAsset && start) {
      // Drag sets the width (height follows the image's aspect ratio); a plain click places it at a default size.
      const dragged = dragBox && dragBox.w > 0.02;
      const w = dragged ? dragBox!.w : 0.35;
      const h = imageHeightFor(w, imageAsset);
      const x = dragged ? dragBox!.x : Math.min(Math.max(0, start.x - w / 2), Math.max(0, 1 - w));
      const y = dragged ? dragBox!.y : Math.min(Math.max(0, start.y - h / 2), Math.max(0, 1 - h));
      onAddAnnotation({ ...base, type: 'image', x, y, w, h, dataUrl: imageAsset.dataUrl });
    } else if (dragBox && dragBox.w > 0.01 && (dragBox.h > 0.01 || activeTool === 'underline')) {
      if (activeTool === 'highlight') onAddAnnotation({ ...base, type: 'highlight', ...dragBox, color });
      else if (activeTool === 'underline') onAddAnnotation({ ...base, type: 'underline', ...dragBox, h: Math.max(dragBox.h, 0.004), color });
      else if (activeTool === 'redact') onAddAnnotation({ ...base, type: 'redact', ...dragBox });
      else if (activeTool === 'shape') onAddAnnotation({ ...base, type: 'shape', kind: shapeKind, ...dragBox, color, strokeWidth });
      else if (activeTool === 'signature' && signatureDataUrl) onAddAnnotation({ ...base, type: 'signature', ...dragBox, dataUrl: signatureDataUrl });
    }
    dragStart.current = null;
    setDragBox(null);
    setDragLine(null);
    setDrawPoints(null);
  }

  function commitText() {
    if (!textEditor) return;
    const value = textValue.replace(/\s+$/, '');
    if (value.trim()) {
      if (editingId) onUpdateText(editingId, value);
      else if (textEditor.kind === 'note') onAddAnnotation({ id: newId(), pageId: page.id, type: 'note', x: textEditor.x, y: textEditor.y, text: value, color: '#f5c518' });
      else onAddAnnotation({ id: newId(), pageId: page.id, type: 'text', x: textEditor.x, y: textEditor.y, text: value, size: 0.025, color });
    } else if (editingId) {
      // Editing down to an empty string removes it rather than leaving a ghost.
      onDeleteAnnotation(editingId);
    }
    setTextEditor(null);
    setTextValue('');
    setEditingId(null);
  }

  const selectedAnnotation = selectedId ? annotations.find((a) => a.id === selectedId) ?? null : null;
  const selectedBounds = selectedAnnotation ? getBounds(selectedAnnotation) : null;
  const liveOffset = movingAnnotation.current && moveOffset ? moveOffset : null;
  const pct = (n: number) => `${n * 100}%`;
  const strokePx = (frac: number) => Math.max(1.5, frac * pxW);

  return (
    <div ref={scrollAreaRef} className="flex h-full items-center justify-center overflow-auto bg-grid-paper p-6">
      {loading && <p className="text-sm text-ink-3">{tr("Rendering page…")}</p>}
      {pageImg && (
        <div
          ref={containerRef}
          data-testid="editor-page"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className={`relative shrink-0 select-none rounded shadow-lg ${activeTool === 'select' && !movingAnnotation.current ? '' : 'touch-none'}`}
          style={{
            width: pxW,
            height: pxH,
            transform: `rotate(${page.extraRotation}deg)`,
            cursor: activeTool === 'select' ? (selectedAnnotation ? 'grab' : 'default') : 'crosshair',
          }}
        >
          <img src={pageImg.url} alt={tr("Page")} className="pointer-events-none block h-full w-full" draggable={false} />

          {/* Vector overlay for shapes, drawings and underlines, in screen pixels. */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${pxW} ${pxH}`}>
            {annotations.map((a) => {
              const moving = liveOffset && a.id === selectedId;
              const ox = (moving ? liveOffset!.dx : 0) * pxW;
              const oy = (moving ? liveOffset!.dy : 0) * pxH;
              if (a.type === 'draw') {
                const pts = a.points.map((p) => `${(a.x + p.x) * pxW + ox},${(a.y + p.y) * pxH + oy}`).join(' ');
                return <polyline key={a.id} points={pts} fill="none" stroke={a.color} strokeWidth={strokePx(a.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" />;
              }
              if (a.type === 'shape') {
                const [x, y, w, h] = [a.x * pxW + ox, a.y * pxH + oy, a.w * pxW, a.h * pxH];
                const sw = strokePx(a.strokeWidth);
                if (a.kind === 'rect') return <rect key={a.id} x={x} y={y} width={w} height={h} fill="none" stroke={a.color} strokeWidth={sw} />;
                if (a.kind === 'ellipse') return <ellipse key={a.id} cx={x + w / 2} cy={y + h / 2} rx={Math.abs(w / 2)} ry={Math.abs(h / 2)} fill="none" stroke={a.color} strokeWidth={sw} />;
                return (
                  <g key={a.id} stroke={a.color} strokeWidth={sw} strokeLinecap="round" fill="none">
                    <line x1={x} y1={y} x2={x + w} y2={y + h} />
                    {a.kind === 'arrow' && <polyline points={arrowPoints(x, y, x + w, y + h, sw)} strokeLinejoin="round" />}
                  </g>
                );
              }
              if (a.type === 'underline') {
                return <rect key={a.id} x={a.x * pxW + ox} y={(a.y + a.h - UNDERLINE_THICKNESS) * pxH + oy} width={a.w * pxW} height={Math.max(1.5, UNDERLINE_THICKNESS * pxH)} fill={a.color} />;
              }
              return null;
            })}
            {drawPoints && dragStart.current && (
              <polyline
                points={drawPoints.map((p) => `${(dragStart.current!.x + p.x) * pxW},${(dragStart.current!.y + p.y) * pxH}`).join(' ')}
                fill="none" stroke={color} strokeWidth={strokePx(strokeWidth)} strokeLinecap="round" strokeLinejoin="round"
              />
            )}
            {dragLine && (
              <g stroke={color} strokeWidth={strokePx(strokeWidth)} strokeLinecap="round" fill="none">
                <line x1={dragLine.x1 * pxW} y1={dragLine.y1 * pxH} x2={dragLine.x2 * pxW} y2={dragLine.y2 * pxH} />
                {shapeKind === 'arrow' && <polyline points={arrowPoints(dragLine.x1 * pxW, dragLine.y1 * pxH, dragLine.x2 * pxW, dragLine.y2 * pxH, strokePx(strokeWidth))} />}
              </g>
            )}
            {dragBox && activeTool === 'shape' && shapeKind === 'rect' && (
              <rect x={dragBox.x * pxW} y={dragBox.y * pxH} width={dragBox.w * pxW} height={dragBox.h * pxH} fill="none" stroke={color} strokeWidth={strokePx(strokeWidth)} />
            )}
            {dragBox && activeTool === 'shape' && shapeKind === 'ellipse' && (
              <ellipse cx={(dragBox.x + dragBox.w / 2) * pxW} cy={(dragBox.y + dragBox.h / 2) * pxH} rx={(dragBox.w / 2) * pxW} ry={(dragBox.h / 2) * pxH} fill="none" stroke={color} strokeWidth={strokePx(strokeWidth)} />
            )}
            {dragBox && activeTool === 'underline' && (
              <rect x={dragBox.x * pxW} y={(dragBox.y + dragBox.h) * pxH - 2} width={dragBox.w * pxW} height={2} fill={color} />
            )}
          </svg>

          {annotations.map((a) => {
            const moving = liveOffset && a.id === selectedId;
            const dx = moving ? liveOffset!.dx : 0;
            const dy = moving ? liveOffset!.dy : 0;
            const pos = { position: 'absolute' as const, left: pct(a.x + dx), top: pct(a.y + dy) };

            if (a.type === 'text') {
              if (editingId === a.id) return null;
              return (
                <div
                  key={a.id}
                  data-ann={a.id}
                  dir="auto"
                  style={{ ...pos, fontSize: a.size * pxH, lineHeight: 1, color: a.color, whiteSpace: 'pre', fontFamily: EDITOR_FONT_STACK }}
                >
                  {a.text}
                </div>
              );
            }
            if (a.type === 'highlight') return <div key={a.id} style={{ ...pos, width: pct(a.w), height: pct(a.h), background: a.color, opacity: 0.35 }} />;
            if (a.type === 'redact') return <div key={a.id} style={{ ...pos, width: pct(a.w), height: pct(a.h), background: '#000' }} />;
            if (a.type === 'signature' || a.type === 'image') {
              return <img key={a.id} src={a.dataUrl} alt={a.type === 'image' ? tr("Inserted image") : tr("Signature")} draggable={false} style={{ ...pos, width: pct(a.w), height: pct(a.h), objectFit: 'contain' }} />;
            }
            if (a.type === 'note') {
              return (
                <div
                  key={a.id}
                  title={a.text}
                  aria-label={tr("Note: {0}", { 0: a.text })}
                  style={{ ...pos, width: pct(noteW), height: pct(noteH), background: a.color }}
                  className="flex items-center justify-center rounded-sm text-[#5a4300] shadow"
                >
                  <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z" strokeLinejoin="round" /></svg>
                </div>
              );
            }
            return null;
          })}

          {activeTool === 'select' && selectedAnnotation && selectedBounds && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: pct(selectedBounds.x + (liveOffset?.dx ?? 0)),
                  top: pct(selectedBounds.y + (liveOffset?.dy ?? 0)),
                  width: pct(selectedBounds.w),
                  height: pct(selectedBounds.h),
                  outline: '2px dashed var(--color-workshop)',
                  outlineOffset: 3,
                  pointerEvents: 'none',
                }}
              />
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onDeleteAnnotation(selectedAnnotation.id);
                  setSelectedId(null);
                }}
                title={tr("Delete selected annotation")}
                aria-label={tr("Delete selected annotation")}
                className="absolute flex h-6 w-6 items-center justify-center rounded-full border border-line bg-elevated text-warn shadow hover:bg-warn-dim"
                style={{
                  left: `calc(${pct(selectedBounds.x + selectedBounds.w + (liveOffset?.dx ?? 0))} + 4px)`,
                  top: `calc(${pct(selectedBounds.y + (liveOffset?.dy ?? 0))} - 10px)`,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          )}

          {dragBox && (activeTool === 'highlight' || activeTool === 'redact' || activeTool === 'signature') && (
            <div
              style={{
                position: 'absolute', left: pct(dragBox.x), top: pct(dragBox.y), width: pct(dragBox.w), height: pct(dragBox.h),
                background: activeTool === 'redact' ? '#000' : color, opacity: activeTool === 'redact' ? 1 : 0.35,
                border: '1px dashed var(--color-workshop)',
              }}
            />
          )}
          {dragBox && activeTool === 'image' && imageAsset && dragBox.w > 0.02 && (
            <img
              src={imageAsset.dataUrl}
              alt=""
              style={{ position: 'absolute', left: pct(dragBox.x), top: pct(dragBox.y), width: pct(dragBox.w), height: pct(imageHeightFor(dragBox.w, imageAsset)), opacity: 0.6, outline: '1px dashed var(--color-workshop)' }}
            />
          )}

          {textEditor && textEditor.kind === 'text' && (
            <input
              autoFocus
              aria-label={tr("Annotation text")}
              dir="auto"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText();
                if (e.key === 'Escape') {
                  setTextEditor(null);
                  setEditingId(null);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', left: pct(textEditor.x), top: pct(textEditor.y), color, fontSize: 0.025 * pxH, lineHeight: 1,
                fontFamily: EDITOR_FONT_STACK, minWidth: 120,
              }}
              className="bg-paper/90 outline outline-1 outline-workshop"
            />
          )}
          {textEditor && textEditor.kind === 'note' && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              style={{ position: 'absolute', left: pct(textEditor.x), top: pct(textEditor.y), width: 240, zIndex: 5 }}
              className="rounded-md border border-line bg-[#fff8c5] p-2 text-[#2a2200] shadow-lg"
            >
              <textarea
                autoFocus
                aria-label={tr("Note text")}
                dir="auto"
                rows={4}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText();
                  if (e.key === 'Escape') {
                    setTextEditor(null);
                    setEditingId(null);
                  }
                }}
                placeholder={tr("Write a note…")}
                className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#2a2200]/50"
              />
              <div className="mt-1 flex justify-end gap-2 text-xs">
                <button onClick={() => { setTextEditor(null); setEditingId(null); }} className="rounded px-2 py-1 hover:bg-black/5">{tr("Cancel")}</button>
                <button onClick={commitText} className="rounded bg-[#2a2200] px-2 py-1 font-medium text-[#fff8c5]">{tr("Save note")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
