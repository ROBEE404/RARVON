import { engine } from '../../../engine';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

interface PageItem { originalIndex: number; thumb: string }

const CLICK_THRESHOLD_PX = 6;

export default function ReorderPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  // Pointer-Events-based reordering rather than native HTML5 drag-and-drop,
  // since iOS Safari doesn't support HTML5 DnD at all and Android support
  // is inconsistent. Same pattern as the PDF Editor's thumbnail sidebar.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const thumbs = await engine.pdf.thumbnails(await f.arrayBuffer());
      setPages(thumbs.map((thumb, i) => ({ originalIndex: i, thumb })));
    } catch {
      setError(tr("Could not read this PDF."));
    } finally {
      setLoading(false);
    }
  }

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

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest<HTMLElement>('[data-page-index]');
    if (target) {
      const idx = Number(target.dataset.pageIndex);
      if (!Number.isNaN(idx)) setDragOverIndex(idx);
    }
  }

  function onPointerUp(index: number) {
    if (isDragging.current && dragOverIndex !== null && dragOverIndex !== index) {
      setPages((p) => {
        const next = [...p];
        const [moved] = next.splice(index, 1);
        next.splice(dragOverIndex, 0, moved);
        return next;
      });
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
    dragStartPos.current = null;
    isDragging.current = false;
  }

  async function exportPdf() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(bytes);
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, pages.map((p) => p.originalIndex));
      copied.forEach((p) => outDoc.addPage(p));
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-reordered.pdf` });
    } catch {
      setError(tr("Could not reorder this PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="application/pdf" onFiles={handleFile} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">{file.name}</span>
          <button onClick={() => { setFile(null); setPages([]); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {loading && <p className="text-xs text-ink-3">{tr("Rendering pages…")}</p>}

      {pages.length > 0 && (
        <>
          <p className="text-xs text-ink-3">{tr("Drag thumbnails to reorder pages.")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pages.map((p, i) => (
              <div
                key={p.originalIndex}
                data-page-index={i}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(i)}
                className={`select-none rounded-md border p-1.5 ${draggingIndex === i ? 'touch-none cursor-grabbing opacity-50' : 'cursor-grab border-line'} ${dragOverIndex === i && draggingIndex !== i ? 'border-workshop' : 'border-line bg-paper'}`}
              >
                <img src={p.thumb} alt={tr("Page {0}", { 0: p.originalIndex + 1 })} className="pointer-events-none w-full rounded" draggable={false} />
                <p className="mt-1 text-center text-[10px] text-ink-3">{tr("Page")}{' '}{i + 1}{' '}{tr("(was")}{' '}{p.originalIndex + 1})</p>
              </div>
            ))}
          </div>
          <ActionBar><Button onClick={exportPdf} disabled={busy}>{busy ? tr("Saving…") : tr("Save reordered PDF")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
