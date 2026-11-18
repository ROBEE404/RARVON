import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

type Position = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

export default function PageNumbersTool() {
  const [file, setFile] = useState<File | null>(null);
  const [start, setStart] = useState(1);
  const [format, setFormat] = useState('{n}');
  const [position, setPosition] = useState<Position>('bottom-center');
  const [fontSize, setFontSize] = useState(11);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  function handleFile(files: File[]) {
    setFile(files[0]);
    setResult(null);
    setError(null);
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;

      pages.forEach((page, idx) => {
        const n = start + idx;
        const label = format.replace('{n}', String(n)).replace('{total}', String(total));
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(label, fontSize);
        const margin = 28;

        let x: number;
        if (position.endsWith('center')) x = (width - textWidth) / 2;
        else if (position.endsWith('right')) x = width - textWidth - margin;
        else x = margin;

        const y = position.startsWith('bottom') ? margin : height - margin;

        page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.12) });
      });

      const outBytes = await doc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-numbered.pdf` });
    } catch {
      setError(tr("Could not add page numbers to this PDF."));
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
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-ink-2">
              {tr("Start at")}
              <input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} className="mt-1 block w-20 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-ink-2">
              {tr("Format")}
              <input value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 block w-32 rounded-md border border-line bg-paper px-2 py-1.5 text-sm font-mono" />
            </label>
            <label className="text-xs text-ink-2">
              {tr("Font size")}
              <input type="number" min={6} max={36} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-1 block w-20 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
            </label>
          </div>
          <p className="text-xs text-ink-3">{tr("Use")}{' '}<code className="rounded bg-paper-dim px-1 py-0.5 font-mono">{'{n}'}</code>{' '}{tr("for the number and")}{' '}<code className="rounded bg-paper-dim px-1 py-0.5 font-mono">{'{total}'}</code>{' '}{tr("for the page count, e.g. \"Page")}{' '}{'{n}'}{' '}{tr("of")}{' '}{tr("{total}")}".</p>

          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPosition(p.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${position === p.value ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <ActionBar><Button onClick={apply} disabled={busy}>{busy ? tr("Applying…") : tr("Add page numbers")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
