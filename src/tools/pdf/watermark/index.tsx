import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function WatermarkTool() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [opacity, setOpacity] = useState(0.2);
  const [angle, setAngle] = useState(45);
  const [fontSize, setFontSize] = useState(60);
  const [repeat, setRepeat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  function handleFile(files: File[]) {
    setFile(files[0]);
    setResult(null);
    setError(null);
  }

  async function apply() {
    if (!file || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      doc.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const color = rgb(0.35, 0.35, 0.4);

        if (!repeat) {
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: fontSize,
            font,
            color,
            opacity,
            rotate: degrees(angle),
          });
          return;
        }

        const stepX = textWidth + 80;
        const stepY = fontSize + 90;
        for (let y = -height; y < height * 2; y += stepY) {
          for (let x = -width; x < width * 2; x += stepX) {
            page.drawText(text, { x, y, size: fontSize, font, color, opacity, rotate: degrees(angle) });
          }
        }
      });

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-watermarked.pdf` });
    } catch {
      setError(tr("Could not add a watermark to this PDF."));
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
          <button onClick={() => { setFile(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {file && (
        <>
          <label className="block text-xs text-ink-2">
            {tr("Watermark text")}
            <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="text-xs text-ink-2">
              {tr("Opacity")}
              <input type="range" min={0.05} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mt-2 block w-full" />
              <span className="text-ink-3">{Math.round(opacity * 100)}%</span>
            </label>
            <label className="text-xs text-ink-2">
              {tr("Angle")}
              <input type="range" min={0} max={90} step={5} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="mt-2 block w-full" />
              <span className="text-ink-3">{angle}°</span>
            </label>
            <label className="text-xs text-ink-2">
              {tr("Size")}
              <input type="range" min={20} max={120} step={5} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-2 block w-full" />
              <span className="text-ink-3">{fontSize}{tr("px")}</span>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            {tr("Tile across the whole page (otherwise centered once)")}
          </label>

          <ActionBar><Button onClick={apply} disabled={busy || !text.trim()}>{busy ? tr("Applying…") : tr("Add watermark")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
