import { useCallback, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import DownloadButton from '../../../components/DownloadButton';
import ErrorMessage from '../../../components/ErrorMessage';
import ProgressBar from '../../../components/ProgressBar';
import EditorToolbar from './Toolbar';
import ThumbnailSidebar from './ThumbnailSidebar';
import PageCanvas from './PageCanvas';
import OptionsPanel from './OptionsPanel';
import EditorErrorBoundary from './EditorErrorBoundary';
import { exportEditedPdf } from './exportPdf';
import type { ImageAsset } from './PageCanvas';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans-arabic/400.css';
import { newId } from './types';
import type { Annotation, EditorSnapshot, EditorTool, PageInstance, ShapeKind } from './types';
import { tr } from '../../../lib/i18n';

export default function PdfEditor() {
  return (
    <EditorErrorBoundary>
      <PdfEditorInner />
    </EditorErrorBoundary>
  );
}

function PdfEditorInner() {
  const [file, setFile] = useState<File | null>(null);
  const [srcBytes, setSrcBytes] = useState<ArrayBuffer | null>(null);
  const [srcId, setSrcId] = useState('');
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pages, setPages] = useState<PageInstance[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPageId, setCurrentPageId] = useState('');

  const [tool, setTool] = useState<EditorTool>('select');
  const [color, setColor] = useState('#14171c');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
  const [strokeWidth, setStrokeWidth] = useState(0.004);
  const [imageAsset, setImageAsset] = useState<ImageAsset | null>(null);

  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [resolvedZoom, setResolvedZoom] = useState(1);

  const [showThumbsMobile, setShowThumbsMobile] = useState(false);
  const [showOptionsMobile, setShowOptionsMobile] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const [, forceRender] = useState(0);

  function pushHistory() {
    undoStack.current.push({ pages, annotations });
    redoStack.current = [];
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({ pages, annotations });
    setPages(prev.pages);
    setAnnotations(prev.annotations);
    forceRender((n) => n + 1);
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ pages, annotations });
    setPages(next.pages);
    setAnnotations(next.annotations);
    forceRender((n) => n + 1);
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    setLoadError(null);
    setResult(null);
    try {
      const bytes = await f.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const count = doc.getPageCount();
      // Displayed size: crop box, with the page's own rotation applied.
      const sizes = doc.getPages().map((p) => {
        const box = p.getCropBox();
        const r = ((p.getRotation().angle % 360) + 360) % 360;
        return r === 90 || r === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
      });
      const initialPages: PageInstance[] = Array.from({ length: count }, (_, i) => ({ id: newId(), originalIndex: i, extraRotation: 0 }));
      setFile(f);
      setSrcBytes(bytes);
      setSrcId(newId());
      setPageSizes(sizes);
      setPages(initialPages);
      setAnnotations([]);
      setCurrentPageId(initialPages[0].id);
      setZoomMode('fit');
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      setLoadError('Could not open this PDF. It may be corrupted, password-protected, or not a valid PDF.');
    }
  }

  const addAnnotation = useCallback((a: Annotation) => {
    pushHistory();
    setAnnotations((prev) => [...prev, a]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, annotations]);

  const moveAnnotation = useCallback((id: string, x: number, y: number) => {
    pushHistory();
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, x, y } : a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, annotations]);

  const updateText = useCallback((id: string, text: string) => {
    pushHistory();
    setAnnotations((prev) => prev.map((a) => (a.id === id && (a.type === 'text' || a.type === 'note') ? { ...a, text } : a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, annotations]);

  const deleteAnnotation = useCallback((id: string) => {
    pushHistory();
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, annotations]);

  function reorderPages(from: number, to: number) {
    pushHistory();
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function deletePage(id: string) {
    if (pages.length <= 1) return;
    pushHistory();
    setPages((prev) => prev.filter((p) => p.id !== id));
    setAnnotations((prev) => prev.filter((a) => a.pageId !== id));
    if (currentPageId === id) {
      const remaining = pages.filter((p) => p.id !== id);
      if (remaining[0]) setCurrentPageId(remaining[0].id);
    }
  }
  function duplicatePage(id: string) {
    pushHistory();
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const copy: PageInstance = { ...prev[idx], id: newId() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }
  function insertBlankPage(afterId: string) {
    const idx = pages.findIndex((p) => p.id === afterId);
    if (idx === -1) return;
    pushHistory();
    const ref = pages[idx];
    // Same size and orientation as the page it follows (A4 if unknown).
    const size = ref.blank ?? pageSizes[ref.originalIndex] ?? { width: 595.28, height: 841.89 };
    const blank: PageInstance = { id: newId(), originalIndex: -1, extraRotation: 0, blank: { width: size.width, height: size.height } };
    setPages((prev) => {
      const next = [...prev];
      next.splice(prev.findIndex((p) => p.id === afterId) + 1, 0, blank);
      return next;
    });
    setCurrentPageId(blank.id);
  }
  function rotatePage(id: string) {
    pushHistory();
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, extraRotation: (p.extraRotation + 90) % 360 } : p)));
  }

  function stepZoom(delta: number) {
    setZoomMode('custom');
    setCustomZoom(Math.max(0.1, Math.min(4, resolvedZoom + delta)));
  }

  async function handleExport() {
    if (!srcBytes || !file) return;
    setExporting(true);
    setExportError(null);
    setExportProgress(0);
    try {
      const bytes = await exportEditedPdf(srcBytes, pages, annotations, setExportProgress);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-edited.pdf` });
    } catch (e) {
      console.warn('PDF export failed', e);
      setExportError('Could not export this PDF. Try undoing your most recent change and exporting again.');
    } finally {
      setExporting(false);
    }
  }

  if (!file || !srcBytes) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-3xl space-y-4">
          <FileDropzone accept="application/pdf" onFiles={handleFile} hint={tr("Opens entirely in your browser — nothing is uploaded")} />
          {loadError && <ErrorMessage>{loadError}</ErrorMessage>}
        </div>
      </div>
    );
  }

  const currentPage = pages.find((p) => p.id === currentPageId) ?? pages[0];
  const currentIndex = pages.findIndex((p) => p.id === currentPage?.id);
  const currentAnnotations = annotations.filter((a) => a.pageId === currentPage?.id);
  const currentSize = currentPage ? currentPage.blank ?? pageSizes[currentPage.originalIndex] : undefined;

  return (
    <div data-workspace className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span className="truncate">{file.name} · {tr(pages.length === 1 ? '{n} page' : '{n} pages', { n: pages.length })}{' '}{tr("· processed locally, not uploaded")}</span>
        <div className="flex gap-2 md:hidden">
          <button onClick={() => setShowThumbsMobile((v) => !v)} className="rounded border border-line px-2 py-1">{tr("Pages")}</button>
          <button onClick={() => setShowOptionsMobile((v) => !v)} className="rounded border border-line px-2 py-1">{tr("Options")}</button>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border border-line" style={{ height: 'calc(100vh - 175px)', minHeight: 560 }}>
        <EditorToolbar
          active={tool}
          onChange={setTool}
          onUndo={undo}
          onRedo={redo}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
          zoomMode={zoomMode}
          zoomPercent={resolvedZoom}
          onZoomStep={stepZoom}
          onFit={() => setZoomMode('fit')}
          currentPageNum={currentIndex + 1}
          totalPages={pages.length}
          onExport={handleExport}
          exporting={exporting}
        />
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-40 shrink-0 border-e border-line md:block lg:w-48">
            {currentPage && (
              <ThumbnailSidebar
                srcBytes={srcBytes}
                srcId={srcId}
                pages={pages}
                currentPageId={currentPage.id}
                onSelect={setCurrentPageId}
                onReorder={reorderPages}
                onDelete={deletePage}
                onDuplicate={duplicatePage}
                onRotate={rotatePage}
                onInsertBlank={insertBlankPage}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {currentPage && (
              <PageCanvas
                srcBytes={srcBytes}
                page={currentPage}
                annotations={currentAnnotations}
                zoomMode={zoomMode}
                customZoom={customZoom}
                onZoomResolved={setResolvedZoom}
                activeTool={tool}
                color={color}
                shapeKind={shapeKind}
                strokeWidth={strokeWidth}
                signatureDataUrl={signatureDataUrl}
                imageAsset={imageAsset}
                onAddAnnotation={addAnnotation}
                onMoveAnnotation={moveAnnotation}
                onUpdateText={updateText}
                onDeleteAnnotation={deleteAnnotation}
              />
            )}
          </div>

          <div className="hidden w-60 shrink-0 md:block lg:w-64">
            <OptionsPanel
              tool={tool}
              color={color}
              onColorChange={setColor}
              signatureDataUrl={signatureDataUrl}
              onSignatureReady={setSignatureDataUrl}
              shapeKind={shapeKind}
              onShapeKindChange={setShapeKind}
              strokeWidth={strokeWidth}
              onStrokeWidthChange={setStrokeWidth}
              imageAsset={imageAsset}
              onImageAsset={setImageAsset}
              docInfo={currentSize ? {
                fileName: file.name,
                fileSize: file.size,
                pageCount: pages.length,
                currentPageNum: currentIndex + 1,
                pageWidthPt: currentSize.width,
                pageHeightPt: currentSize.height,
              } : null}
            />
          </div>
        </div>
      </div>

      {/* Mobile drawers */}
      {showThumbsMobile && currentPage && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-64 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line p-2">
              <span className="text-xs font-medium">{tr("Pages")}</span>
              <button onClick={() => setShowThumbsMobile(false)} className="text-xs">{tr("Close")}</button>
            </div>
            <ThumbnailSidebar
              srcBytes={srcBytes}
              srcId={srcId}
              pages={pages}
              currentPageId={currentPage.id}
              onSelect={(id) => { setCurrentPageId(id); setShowThumbsMobile(false); }}
              onReorder={reorderPages}
              onDelete={deletePage}
              onDuplicate={duplicatePage}
              onRotate={rotatePage}
                onInsertBlank={insertBlankPage}
            />
          </div>
          <div className="flex-1 bg-ink/40" onClick={() => setShowThumbsMobile(false)} />
        </div>
      )}
      {showOptionsMobile && (
        <div className="fixed inset-0 z-40 flex justify-end md:hidden">
          <div className="flex-1 bg-ink/40" onClick={() => setShowOptionsMobile(false)} />
          <div className="w-64 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line p-2">
              <span className="text-xs font-medium">{tr("Options")}</span>
              <button onClick={() => setShowOptionsMobile(false)} className="text-xs">{tr("Close")}</button>
            </div>
            <OptionsPanel
              tool={tool}
              color={color}
              onColorChange={setColor}
              signatureDataUrl={signatureDataUrl}
              onSignatureReady={setSignatureDataUrl}
              shapeKind={shapeKind}
              onShapeKindChange={setShapeKind}
              strokeWidth={strokeWidth}
              onStrokeWidthChange={setStrokeWidth}
              imageAsset={imageAsset}
              onImageAsset={setImageAsset}
              docInfo={currentSize ? {
                fileName: file.name,
                fileSize: file.size,
                pageCount: pages.length,
                currentPageNum: currentIndex + 1,
                pageWidthPt: currentSize.width,
                pageHeightPt: currentSize.height,
              } : null}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-ink-3">
        {tr("\"Add/Edit Annotations\" (this editor) draws new content on top of your PDF — it doesn't rewrite the original text underneath, which real PDF text editing would require and isn't supported yet.")}
      </p>

      {exporting && <ProgressBar value={exportProgress * 100} label={tr("Building PDF")} />}
      {exportError && <ErrorMessage>{exportError}</ErrorMessage>}
      {result && (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3">
          <span className="text-sm">{result.name}</span>
          <DownloadButton url={result.url} filename={result.name} />
        </div>
      )}
    </div>
  );
}
