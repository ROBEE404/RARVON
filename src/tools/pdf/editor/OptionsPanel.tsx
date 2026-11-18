import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Button from '../../../components/Button';
import FileDropzone from '../../../components/FileDropzone';
import type { EditorTool, ShapeKind } from './types';
import type { ImageAsset } from './PageCanvas';
import { tr } from '../../../lib/i18n';

const COLORS = ['#14171c', '#5b56e8', '#2f8f6e', '#b5601f', '#d92b6c', '#1c7ed6'];

interface Props {
  tool: EditorTool;
  color: string;
  onColorChange: (c: string) => void;
  signatureDataUrl: string | null;
  onSignatureReady: (dataUrl: string) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (k: ShapeKind) => void;
  strokeWidth: number;
  onStrokeWidthChange: (w: number) => void;
  imageAsset: ImageAsset | null;
  onImageAsset: (a: ImageAsset) => void;
  docInfo: {
    fileName: string;
    fileSize: number;
    pageCount: number;
    currentPageNum: number;
    pageWidthPt: number;
    pageHeightPt: number;
  } | null;
}

function formatBytesLocal(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ptToIn(pt: number) {
  return (pt / 72).toFixed(1);
}

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'line', label: 'Line' },
  { value: 'arrow', label: 'Arrow' },
];
const STROKES = [
  { value: 0.002, label: 'Thin' },
  { value: 0.004, label: 'Medium' },
  { value: 0.008, label: 'Thick' },
];
const MAX_IMAGE_SIDE = 2400;

/** Reads an image file into a PNG/JPEG data URL (other formats are converted to PNG; very large images are scaled down). */
async function readImageAsset(file: File): Promise<ImageAsset> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(tr("This image could not be opened.")));
      im.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const isJpeg = file.type === 'image/jpeg';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (isJpeg) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.9), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function OptionsPanel({
  tool, color, onColorChange, signatureDataUrl, onSignatureReady, shapeKind, onShapeKindChange, strokeWidth, onStrokeWidthChange, imageAsset, onImageAsset, docInfo,
}: Props) {
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const r = padRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore — fall back to uncaptured pointer tracking.
    }
    e.preventDefault();
    drawing.current = true;
    const ctx = padRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = padRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#14171c';
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    drawing.current = false;
  }
  function clearPad() {
    const c = padRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }
  function usePad() {
    onSignatureReady(padRef.current!.toDataURL('image/png'));
  }
  function uploadSig(files: File[]) {
    const reader = new FileReader();
    reader.onload = () => onSignatureReady(reader.result as string);
    reader.readAsDataURL(files[0]);
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto border-s border-line bg-paper-dim p-4">
      {(tool === 'text' || tool === 'draw' || tool === 'highlight' || tool === 'underline' || tool === 'shape') && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">{tr("Color")}</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-workshop' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
          {tool === 'shape' && (
            <>
              <p className="mb-2 mt-4 text-xs font-medium text-ink-2">{tr("Shape")}</p>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={tr("Shape")}>
                {SHAPES.map((sh) => (
                  <button
                    key={sh.value}
                    onClick={() => onShapeKindChange(sh.value)}
                    aria-pressed={shapeKind === sh.value}
                    className={`rounded-md border px-2 py-1.5 text-xs ${shapeKind === sh.value ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line bg-paper text-ink-2 hover:border-ink'}`}
                  >
                    {sh.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {(tool === 'shape' || tool === 'draw') && (
            <>
              <p className="mb-2 mt-4 text-xs font-medium text-ink-2">{tr("Line width")}</p>
              <div className="flex gap-1.5" role="group" aria-label={tr("Line width")}>
                {STROKES.map((st) => (
                  <button
                    key={st.label}
                    onClick={() => onStrokeWidthChange(st.value)}
                    aria-pressed={Math.abs(strokeWidth - st.value) < 1e-6}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${Math.abs(strokeWidth - st.value) < 1e-6 ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line bg-paper text-ink-2 hover:border-ink'}`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mt-4 text-xs text-ink-3">
            {tool === 'text' && tr("Click anywhere on the page to type. Arabic and other right-to-left text is supported.")}
            {tool === 'draw' && tr("Click and drag on the page to draw.")}
            {tool === 'highlight' && tr("Drag on the page to draw a highlight box.")}
            {tool === 'underline' && tr("Drag across a line of text to underline it.")}
            {tool === 'shape' && (shapeKind === 'line' || shapeKind === 'arrow' ? tr("Drag from the start point to the end point.") : tr("Drag on the page to draw the shape."))}
          </p>
        </div>
      )}

      {tool === 'image' && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-ink-2">{tr("Add an image")}</p>
          <FileDropzone
            accept="image/*"
            onFiles={(files) => void readImageAsset(files[0]).then(onImageAsset).catch(() => undefined)}
            label={imageAsset ? tr("Choose a different image") : tr("Choose an image")}
            hint={tr("PNG, JPEG, WebP, GIF or SVG")}
          />
          {imageAsset && (
            <div className="rounded-md border border-line bg-paper p-2">
              <p className="mb-1 text-xs text-ink-3">{tr("Ready — click the page to place it, or drag to set its width:")}</p>
              <img src={imageAsset.dataUrl} alt={tr("Image to insert")} className="max-h-24 max-w-full bg-white" />
            </div>
          )}
        </div>
      )}

      {tool === 'note' && (
        <div className="space-y-2 text-xs leading-relaxed text-ink-2">
          <p className="font-medium text-ink">{tr("Click the page to add a sticky note.")}</p>
          <p>
            {tr("Notes are saved as standard PDF comments: they appear as a note icon in Acrobat, browsers and other PDF viewers, and open to show your text. Use the Select tool and click a note to edit it.")}
          </p>
        </div>
      )}

      {tool === 'signature' && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">{tr("Draw your signature")}</p>
          <canvas
            ref={padRef}
            width={220}
            height={100}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full touch-none cursor-crosshair rounded-md border border-line bg-white"
          />
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={clearPad}>{tr("Clear")}</Button>
            <Button onClick={usePad}>{tr("Use drawing")}</Button>
          </div>
          <div className="mt-3">
            <FileDropzone accept="image/png,image/jpeg" onFiles={uploadSig} label={tr("Or drop a signature image")} />
          </div>
          {signatureDataUrl && (
            <div className="mt-3 rounded-md border border-line bg-paper p-2">
              <p className="mb-1 text-xs text-ink-3">{tr("Ready — drag on the page to place it:")}</p>
              <img src={signatureDataUrl} alt={tr("Your signature")} className="h-10 bg-white" />
            </div>
          )}
        </div>
      )}

      {tool === 'redact' && (
        <div className="space-y-2 text-xs leading-relaxed text-ink-2">
          <p className="font-medium text-ink">{tr("Drag on the page to black out an area.")}</p>
          <p>
            {tr("This is real redaction, not a cosmetic overlay: any page you redact is flattened into an image on export, so the covered content can't be recovered by selecting or extracting text — the same guarantee as printing a page, blacking it out, and rescanning it.")}
          </p>
          <p className="text-warn">
            {tr("The trade-off: once a page has a redaction, its whole text becomes non-selectable and non-searchable, not just the blacked-out part. Other pages are unaffected.")}
          </p>
        </div>
      )}

      {tool === 'select' && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">{tr("Document")}</p>
            {docInfo ? (
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-ink-3">{tr("Name")}</dt>
                  <dd className="truncate text-end font-medium" title={docInfo.fileName}>{docInfo.fileName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">{tr("Pages")}</dt>
                  <dd className="font-medium">{docInfo.pageCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">{tr("Current page")}</dt>
                  <dd className="font-medium">{docInfo.currentPageNum}{' '}{tr("of")}{' '}{docInfo.pageCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">{tr("Page size")}</dt>
                  <dd className="font-medium">{ptToIn(docInfo.pageWidthPt)}" × {ptToIn(docInfo.pageHeightPt)}"</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">{tr("File size")}</dt>
                  <dd className="font-medium">{formatBytesLocal(docInfo.fileSize)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-ink-3">{tr("No document loaded.")}</p>
            )}
          </div>
          <div className="border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
            <strong className="font-medium text-ink">{tr("Select")}</strong>{' '}{tr("(this tool) lets you click an existing annotation to select it, drag to move it, press Delete/Backspace or the × button to remove it, or click a text annotation or note again to edit its wording. Pick another tool above to add something new. Page operations — reorder, rotate, insert a blank page, duplicate, delete — are on the thumbnails to the left. Nothing here is uploaded; everything happens in your browser.")}
          </div>
        </div>
      )}
    </div>
  );
}
