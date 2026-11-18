import { engine } from '../../../engine';
import { useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { CompressFlow, DocTile, LevelSlider, MoreOptions } from '../../../components/tool/CompressFlow';
import { tr } from '../../../lib/i18n';

/** Simple levels: the image quality and resolution each page is redrawn at. */
const LEVELS = [
  { value: 0, label: 'Light', hint: 'Looks the same', quality: 0.8, scale: 1.5 },
  { value: 1, label: 'Balanced', hint: 'Best for most', quality: 0.6, scale: 1.2 },
  { value: 2, label: 'Strong', hint: 'Smallest file', quality: 0.4, scale: 1 },
];

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(0.6);
  const [scale, setScale] = useState(1.2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);

  // A small picture of the first page for the cards.
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    setCover(null);
    if (!file) return;
    let stale = false;
    (async () => {
      try {
        const pdf = await engine.pdf.open(await file.arrayBuffer());
        try {
          const { canvas } = await pdf.renderPage(1, 0.4);
          if (!stale) setCover(canvas.toDataURL('image/jpeg', 0.8));
        } finally {
          void pdf.destroy();
        }
      } catch {
        // Keep the plain document icon.
      }
    })();
    return () => { stale = true; };
  }, [file]);

  const level = LEVELS.find((l) => l.quality === quality && l.scale === scale)?.value ?? null;

  function handleFile(files: File[]) {
    setFile(files[0]);
    setResult(null);
    setError(null);
  }

  async function compress() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const bytes = await file.arrayBuffer();
      const pdf = await engine.pdf.open(bytes.slice(0));
      const outDoc = await PDFDocument.create();

      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const { canvas, widthPt, heightPt } = await pdf.renderPage(i, scale);
          const jpegBlob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))), 'image/jpeg', quality),
          );
          const jpegImage = await outDoc.embedJpg(new Uint8Array(await jpegBlob.arrayBuffer()));
          // Keep the original physical page size (in points); the scale
          // setting only controls how many pixels the page image gets.
          const page = outDoc.addPage([widthPt, heightPt]);
          page.drawImage(jpegImage, { x: 0, y: 0, width: widthPt, height: heightPt });
          canvas.width = 0; // release the canvas backing store early on long documents
          setProgress(Math.round((i / pdf.numPages) * 100));
        }
      } finally {
        void pdf.destroy();
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-compressed.pdf`, size: blob.size });
    } catch {
      setError(tr("Could not compress this PDF. Make sure it is a valid, unencrypted PDF."));
    } finally {
      setBusy(false);
    }
  }

  const smaller = result && file ? result.size < file.size : true;
  const remove = () => { setFile(null); setResult(null); setError(null); };
  const coverImg = (tone: 'workshop' | 'signal') => (cover ? <img src={cover} alt="" className="h-full w-full bg-white object-cover object-top" /> : <DocTile kind="pdf" tone={tone} />);
  const pick = (v: number) => { setQuality(LEVELS[v].quality); setScale(LEVELS[v].scale); setResult(null); };

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept="application/pdf" onFiles={handleFile} />}

      {file && (
        <div className="slide-in space-y-4">
          <CompressFlow
            from={{ preview: coverImg('workshop'), name: file.name, detail: formatBytes(file.size), format: '' }}
            to={{
              preview: coverImg(result && smaller ? 'signal' : 'workshop'),
              name: result?.name ?? `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`,
              detail: result ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></> : tr('Size shown after compressing'),
              format: '',
            }}
            before={file.size}
            after={result ? result.size : null}
            state={busy ? 'busy' : result ? (smaller ? 'done' : 'warn') : 'idle'}
            progress={busy ? progress / 100 : undefined}
            onRemove={remove}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result && !smaller && (
            <p className="slide-in text-xs text-ink-2">
              {tr("The result isn’t smaller than your original, so you’re better off keeping the original. This method works best on scanned or image-heavy PDFs; text-only documents are usually already compact. Lowering quality or resolution may help.")}
            </p>
          )}

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <LevelSlider options={LEVELS} value={level} onChange={pick} disabled={busy} />
            <MoreOptions>
              <label className="grid gap-1.5 text-xs text-ink-2">
                <span className="flex justify-between"><span>{tr("Image quality")}</span><span className="font-mono text-ink">{Math.round(quality * 100)}%</span></span>
                <input type="range" min={0.3} max={0.95} step={0.05} value={quality} onChange={(e) => { setQuality(Number(e.target.value)); setResult(null); }} className="w-full accent-[var(--color-workshop)]" />
              </label>
              <label className="grid gap-1.5 text-xs text-ink-2">
                <span className="flex justify-between"><span>{tr("Resolution")}</span><span className="font-mono text-ink">{scale.toFixed(1)}×</span></span>
                <input type="range" min={0.7} max={2} step={0.1} value={scale} onChange={(e) => { setScale(Number(e.target.value)); setResult(null); }} className="w-full accent-[var(--color-workshop)]" />
              </label>
              <p className="text-xs text-ink-3">{tr("Each page is redrawn as a picture, which shrinks scanned and image-heavy PDFs the most. Text can no longer be selected afterwards.")}</p>
            </MoreOptions>
          </div>

          <ActionBar><Button onClick={compress} disabled={busy} className="sm:ms-auto">{busy ? tr("Compressing…") : tr("Compress PDF")}</Button></ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
