import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function MergePdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  function addFiles(newFiles: File[]) {
    setFiles((f) => [...f, ...newFiles.filter((n) => n.type === 'application/pdf')]);
    setResult(null);
  }

  function move(index: number, dir: -1 | 1) {
    setFiles((f) => {
      const next = [...f];
      const target = index + dir;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setFiles((f) => f.filter((_, i) => i !== index));
  }

  async function merge() {
    if (files.length < 2) {
      setError(tr("Add at least two PDFs to merge."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outDoc = await PDFDocument.create();
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(bytes);
        const pages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((p) => outDoc.addPage(p));
      }
      const bytes = await outDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      setResult({ url: URL.createObjectURL(blob), name: 'merged.pdf' });
    } catch {
      setError(tr("Could not merge these PDFs. Make sure each file is a valid, unencrypted PDF."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <FileDropzone accept="application/pdf" multiple onFiles={addFiles} label={tr("Drop PDFs here, or click to browse")} hint={tr("Add two or more files")} />

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-paper-dim p-2.5 text-sm">
              <span className="truncate">{i + 1}. {f.name} · {formatBytes(f.size)}</span>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1.5 py-1 text-xs hover:bg-paper disabled:opacity-30" aria-label={tr("Move up")}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === files.length - 1} className="rounded px-1.5 py-1 text-xs hover:bg-paper disabled:opacity-30" aria-label={tr("Move down")}>↓</button>
                <button onClick={() => remove(i)} className="rounded px-1.5 py-1 text-xs text-warn hover:bg-paper" aria-label={tr("Remove")}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActionBar><Button onClick={merge} disabled={files.length < 2 || busy}>{busy ? tr("Merging…") : tr("Merge PDFs")}</Button></ActionBar>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
