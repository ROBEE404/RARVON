import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { canvasToBlob } from '../../../lib/imageUtils';
import { ResultCard } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

interface Rect { x: number; y: number; w: number; h: number }

export default function ImageCrop() {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string>('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setImgUrl(URL.createObjectURL(f));
    setRect(null);
    setResult(null);
    setError(null);
  }

  function getRelativePos(e: ReactPointerEvent) {
    const box = containerRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 0), box.width);
    const y = Math.min(Math.max(e.clientY - box.top, 0), box.height);
    return { x, y, box };
  }

  function onPointerDown(e: ReactPointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    e.preventDefault();
    const { x, y } = getRelativePos(e);
    setDragStart({ x, y });
    setRect({ x, y, w: 0, h: 0 });
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!dragStart) return;
    const { x, y } = getRelativePos(e);
    setRect({
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      w: Math.abs(x - dragStart.x),
      h: Math.abs(y - dragStart.y),
    });
  }
  function onPointerUp() {
    setDragStart(null);
  }

  async function crop() {
    if (!file || !rect || !imgRef.current || !containerRef.current) return;
    try {
      const box = containerRef.current.getBoundingClientRect();
      const scaleX = natural.w / box.width;
      const scaleY = natural.h / box.height;
      const sx = rect.x * scaleX, sy = rect.y * scaleY, sw = rect.w * scaleX, sh = rect.h * scaleY;
      if (sw < 1 || sh < 1) {
        setError(tr("Drag a selection on the image first."));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, type, 0.92);
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-cropped.${type === 'image/png' ? 'png' : 'jpg'}` });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not crop this image.');
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="image/*" onFiles={handleFile} />
      ) : (
        <>
          <div
            ref={containerRef}
            className="relative w-fit touch-none cursor-crosshair select-none overflow-hidden rounded-md border border-line"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <img
              ref={imgRef}
              src={imgUrl}
              alt={tr("To crop")}
              className="block max-h-[420px] max-w-full"
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              draggable={false}
            />
            {rect && (
              <div
                className="absolute border-2 border-workshop bg-workshop/10"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              />
            )}
          </div>
          <p className="text-xs text-ink-3">{tr("Drag on the image to select the region to keep.")}</p>
          <div className="flex gap-2">
            <Button onClick={crop} disabled={!rect || rect.w < 4}>{tr("Crop")}</Button>
            <Button variant="secondary" onClick={() => { setFile(null); setImgUrl(''); setRect(null); setResult(null); }}>
              {tr("Choose a different image")}
            </Button>
          </div>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
