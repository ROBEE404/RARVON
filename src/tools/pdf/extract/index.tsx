import { engine } from '../../../engine';
import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { parsePageRange } from '../../../lib/pageRange';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function ExtractPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [range, setRange] = useState('');
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
      setRange('');
      setFile(f);
    } catch {
      setFile(null);
      setError(tr("Could not read this PDF. Make sure it is a valid, unencrypted PDF file."));
    }
  }


  async function extract() {
    if (!file) return;
    const pages = parsePageRange(range, pageCount);
    if (!pages.length) {
      setError(tr("Enter at least one valid page number."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(bytes);
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, pages.map((p) => p - 1));
      copied.forEach((p) => outDoc.addPage(p));
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-extracted.pdf` });
    } catch {
      setError(tr("Could not extract pages from this PDF."));
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
          <label className="block text-xs text-ink-2">
            {tr("Pages to extract (e.g. 1-3, 5)")}
            <input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`1-${pageCount}`} className="mt-1 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm" />
          </label>
          <ActionBar><Button onClick={extract} disabled={busy || !range.trim()}>{busy ? tr("Extracting…") : tr("Extract pages")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
