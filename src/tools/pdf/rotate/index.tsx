import { engine } from '../../../engine';
import { useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { parsePageRange } from '../../../lib/pageRange';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function RotatePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scope, setScope] = useState<'all' | 'range'>('all');
  const [range, setRange] = useState('');
  const [angle, setAngle] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setResult(null);
    setError(null);
    // Only show the page controls once the page count is known, so nothing
    // typed into them can be overwritten by this load finishing.
    try {
      const count = await engine.pdf.pageCount(await f.arrayBuffer());
      setPageCount(count);
      setRange(`1-${count}`);
      setFile(f);
    } catch {
      setFile(null);
      setError(tr("Could not read this PDF. Make sure it is a valid, unencrypted PDF file."));
    }
  }


  async function rotate() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const targets = scope === 'all' ? new Set(doc.getPageIndices().map((i) => i + 1)) : new Set(parsePageRange(range, pageCount));
      doc.getPages().forEach((page, idx) => {
        if (targets.has(idx + 1)) {
          const current = page.getRotation().angle;
          page.setRotation(degrees((current + angle) % 360));
        }
      });
      const outBytes = await doc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-rotated.pdf` });
    } catch {
      setError(tr("Could not rotate this PDF. Make sure it is a valid, unencrypted PDF."));
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
          <span className="truncate">{file.name} · {tr(pageCount === 1 ? '{n} page' : '{n} pages', { n: pageCount })}</span>
          <button onClick={() => { setFile(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {file && (
        <>
          <div className="flex flex-wrap gap-2">
            {[90, 180, 270].map((a) => (
              <button
                key={a}
                onClick={() => setAngle(a)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${angle === a ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2'}`}
              >
                {a}°
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-md border border-line bg-paper-dim p-1 text-xs font-medium">
            <button onClick={() => setScope('all')} className={`flex-1 rounded px-3 py-1.5 ${scope === 'all' ? 'bg-ink text-paper' : 'text-ink-2'}`}>{tr("All pages")}</button>
            <button onClick={() => setScope('range')} className={`flex-1 rounded px-3 py-1.5 ${scope === 'range' ? 'bg-ink text-paper' : 'text-ink-2'}`}>{tr("Specific pages")}</button>
          </div>
          {scope === 'range' && (
            <label className="block text-xs text-ink-2">
              {tr("Pages (e.g. 1-3, 5)")}
              <input value={range} onChange={(e) => setRange(e.target.value)} className="mt-1 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm" />
            </label>
          )}
          <ActionBar><Button onClick={rotate} disabled={busy}>{busy ? tr("Rotating…") : tr("Rotate PDF")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
