import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import LazyThumb from './LazyThumb';
import type { PageInstance } from './types';
import { tr } from '../../../lib/i18n';

interface Props {
  srcBytes: ArrayBuffer;
  srcId: string;
  pages: PageInstance[];
  currentPageId: string;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRotate: (id: string) => void;
  onInsertBlank: (afterId: string) => void;
}

const CLICK_THRESHOLD_PX = 6;

export default function ThumbnailSidebar({ srcBytes, srcId, pages, currentPageId, onSelect, onReorder, onDelete, onDuplicate, onRotate, onInsertBlank }: Props) {
  // Reordering is Pointer-Events-based rather than native HTML5 drag-and-drop,
  // since iOS Safari doesn't support HTML5 DnD at all and Android support is
  // inconsistent. This works the same way for mouse, touch, and pen.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  function onPointerDown(e: ReactPointerEvent, index: number) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
    setDraggingIndex(index);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (draggingIndex === null || !dragStartPos.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    if (!isDragging.current && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) {
      isDragging.current = true;
    }
    if (!isDragging.current) return;

    // The pointer is captured by the item that started the drag, so normal
    // hit-testing/bubbling won't tell us what's underneath it anymore —
    // elementFromPoint is what lets us find the item the pointer is
    // currently hovering while a drag is in progress.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest<HTMLElement>('[data-page-index]');
    if (target) {
      const idx = Number(target.dataset.pageIndex);
      if (!Number.isNaN(idx)) setDragOverIndex(idx);
    }
  }

  function onPointerUp(_e: ReactPointerEvent, index: number) {
    if (isDragging.current && dragOverIndex !== null && dragOverIndex !== index) {
      onReorder(index, dragOverIndex);
    } else if (!isDragging.current) {
      onSelect(pages[index].id);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
    dragStartPos.current = null;
    isDragging.current = false;
  }

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      {pages.map((p, i) => (
        <div
          key={p.id}
          data-page-index={i}
          onPointerDown={(e) => onPointerDown(e, i)}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerUp(e, i)}
          className={`group relative cursor-grab select-none rounded-md border-2 p-1.5 transition-colors ${draggingIndex === i ? 'touch-none opacity-50' : ''} ${
            dragOverIndex === i && draggingIndex !== i ? 'border-workshop' : p.id === currentPageId ? 'border-workshop bg-workshop-dim' : 'border-transparent hover:border-line'
          }`}
        >
          <LazyThumb srcBytes={srcBytes} srcId={srcId} originalIndex={p.originalIndex} rotation={p.extraRotation} blank={p.blank} />
          <p className={`mt-1.5 text-center text-xs font-medium ${p.id === currentPageId ? 'text-workshop' : 'text-ink-3'}`}>{i + 1}</p>
          <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRotate(p.id)}
              title={tr("Rotate 90°")} aria-label={tr("Rotate page 90 degrees")}
              className="flex h-6 w-6 items-center justify-center rounded bg-elevated text-ink-2 shadow hover:text-ink"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v6h6M4 10a8 8 0 1015.5-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onInsertBlank(p.id)}
              title={tr("Insert blank page after")} aria-label={tr("Insert blank page after this page")}
              className="flex h-6 w-6 items-center justify-center rounded bg-elevated text-ink-2 shadow hover:text-ink"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3h9l4 4v14H6zM12 10v7M8.5 13.5h7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDuplicate(p.id)}
              title={tr("Duplicate page")} aria-label={tr("Duplicate page")}
              className="flex h-6 w-6 items-center justify-center rounded bg-elevated text-ink-2 shadow hover:text-ink"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M4 16V4h12" /></svg>
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(p.id)}
              title={tr("Delete page")} aria-label={tr("Delete page")}
              className="flex h-6 w-6 items-center justify-center rounded bg-elevated text-warn shadow hover:bg-warn-dim"
              disabled={pages.length <= 1}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
