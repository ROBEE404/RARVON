import { engine } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

interface Box { x: number; y: number; w: number; h: number }

export default function SignPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagePreview, setPagePreview] = useState<{ url: string; naturalW: number; naturalH: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [box, setBox] = useState<Box>({ x: 40, y: 40, w: 180, h: 70 });
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    try {
      const count = await engine.pdf.pageCount(await f.arrayBuffer());
      setPageCount(count);
      setPageNumber(1);
    } catch {
      setError(tr("Could not read this PDF."));
    }
  }

  useEffect(() => {
    if (!file) return;
    setLoadingPreview(true);
    file.arrayBuffer().then(async (bytes) => {
      try {
        const canvas = await engine.pdf.renderPage(bytes, pageNumber, 1.2);
        setPagePreview({ url: canvas.toDataURL('image/png'), naturalW: canvas.width, naturalH: canvas.height });
      } catch {
        setError(tr("Could not render this page."));
      } finally {
        setLoadingPreview(false);
      }
    });
  }, [file, pageNumber]);

  // --- signature pad drawing ---
  function padPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = padRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startDraw(e: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    e.preventDefault();
    drawing.current = true;
    const ctx = padRef.current!.getContext('2d')!;
    const { x, y } = padPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function moveDraw(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = padRef.current!.getContext('2d')!;
    const { x, y } = padPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#14171c';
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function endDraw() {
    drawing.current = false;
  }
  function clearPad() {
    const canvas = padRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  }
  function useDrawnSignature() {
    setSignatureDataUrl(padRef.current!.toDataURL('image/png'));
  }
  function handleSignatureUpload(files: File[]) {
    const reader = new FileReader();
    reader.onload = () => setSignatureDataUrl(reader.result as string);
    reader.readAsDataURL(files[0]);
  }

  // --- placement drag ---
  function onBoxPointerDown(e: ReactPointerEvent) {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    e.preventDefault();
    const rect = previewContainerRef.current!.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left - box.x, y: e.clientY - rect.top - box.y });
  }
  function onContainerPointerMove(e: ReactPointerEvent) {
    if (!dragOffset || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left - dragOffset.x, 0), rect.width - box.w);
    const y = Math.min(Math.max(e.clientY - rect.top - dragOffset.y, 0), rect.height - box.h);
    setBox((b) => ({ ...b, x, y }));
  }
  function onContainerPointerUp() {
    setDragOffset(null);
  }

  async function apply() {
    if (!file || !signatureDataUrl || !pagePreview || !previewContainerRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      const page = doc.getPage(pageNumber - 1);
      const { width: pdfWidth, height: pdfHeight } = page.getSize();

      const containerBox = previewContainerRef.current.getBoundingClientRect();
      const scaleX = pdfWidth / containerBox.width;
      const scaleY = pdfHeight / containerBox.height;

      const pngBytes = Uint8Array.from(atob(signatureDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(pngBytes);

      const drawW = box.w * scaleX;
      const drawH = box.h * scaleY;
      const drawX = box.x * scaleX;
      // Flip y: canvas/screen y grows downward, PDF y grows upward.
      const drawY = pdfHeight - box.y * scaleY - drawH;

      page.drawImage(pngImage, { x: drawX, y: drawY, width: drawW, height: drawH });

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-signed.pdf` });
    } catch {
      setError(tr("Could not place the signature on this PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropzone accept="application/pdf" onFiles={handleFile} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">{file.name} · {tr(pageCount === 1 ? '{n} page' : '{n} pages', { n: pageCount })}</span>
          <button onClick={() => { setFile(null); setResult(null); setPagePreview(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {file && (
        <>
          <div>
            <h2 className="font-display text-sm font-semibold">{tr("1. Create your signature")}</h2>
            <div className="mt-2 flex gap-1 rounded-md border border-line bg-paper-dim p-1 text-xs font-medium">
              <span className="px-3 py-1.5 text-ink-3">{tr("Draw below, or upload an image instead")}</span>
            </div>
            <canvas
              ref={padRef}
              width={400}
              height={140}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="mt-2 w-full max-w-[400px] touch-none cursor-crosshair rounded-md border border-line bg-white"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={clearPad}>{tr("Clear")}</Button>
              <Button onClick={useDrawnSignature}>{tr("Use this drawing")}</Button>
              <FileDropzone accept="image/png,image/jpeg" onFiles={handleSignatureUpload} label={tr("Or drop a signature image")} />
            </div>
            {signatureDataUrl && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-paper-dim p-2">
                <span className="text-xs text-ink-3">{tr("Signature ready:")}</span>
                <img src={signatureDataUrl} alt={tr("Your signature")} className="h-10 bg-white" />
              </div>
            )}
          </div>

          {signatureDataUrl && (
            <div>
              <h2 className="font-display text-sm font-semibold">{tr("2. Place it on the page")}</h2>
              {pageCount > 1 && (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                  {tr("Page")}
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={pageNumber}
                    onChange={(e) => setPageNumber(Math.min(pageCount, Math.max(1, Number(e.target.value))))}
                    className="w-16 rounded-md border border-line bg-paper px-2 py-1 text-sm"
                  />
                  {tr("of")}{' '}{pageCount}
                </label>
              )}
              {loadingPreview && <p className="mt-2 text-xs text-ink-3">{tr("Rendering page…")}</p>}
              {pagePreview && (
                <div
                  ref={previewContainerRef}
                  onPointerMove={onContainerPointerMove}
                  onPointerUp={onContainerPointerUp}
                  onPointerLeave={onContainerPointerUp}
                  className="relative mt-2 w-full max-w-md select-none overflow-hidden rounded-md border border-line"
                  style={{ aspectRatio: `${pagePreview.naturalW} / ${pagePreview.naturalH}` }}
                >
                  <img src={pagePreview.url} alt={tr("Page {0}", { 0: pageNumber })} className="pointer-events-none block w-full" draggable={false} />
                  <div
                    onPointerDown={onBoxPointerDown}
                    className="absolute touch-none cursor-move border-2 border-workshop bg-white/70"
                    style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  >
                    <img src={signatureDataUrl} alt={tr("Signature preview")} className="pointer-events-none h-full w-full object-contain" />
                  </div>
                </div>
              )}
              <label className="mt-2 flex items-center gap-3 text-xs text-ink-2">
                {tr("Signature size")}
                <input
                  type="range"
                  min={80}
                  max={320}
                  value={box.w}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    setBox((b) => ({ ...b, w, h: Math.round(w * 0.39) }));
                  }}
                />
              </label>
              <Button onClick={apply} disabled={busy} className="mt-2">{busy ? tr("Signing…") : tr("Sign PDF")}</Button>
            </div>
          )}
        </>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
