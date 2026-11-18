import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

interface Meta {
  title: string; author: string; subject: string; keywords: string; creator: string; producer: string;
}

export default function PdfMetadata() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer());
      setMeta({
        title: doc.getTitle() ?? '',
        author: doc.getAuthor() ?? '',
        subject: doc.getSubject() ?? '',
        keywords: (doc.getKeywords() ?? '') as string,
        creator: doc.getCreator() ?? '',
        producer: doc.getProducer() ?? '',
      });
    } catch {
      setError(tr("Could not read this PDF."));
    }
  }

  async function save() {
    if (!file || !meta) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      doc.setTitle(meta.title);
      doc.setAuthor(meta.author);
      doc.setSubject(meta.subject);
      doc.setKeywords(meta.keywords.split(',').map((k) => k.trim()).filter(Boolean));
      doc.setCreator(meta.creator);
      doc.setProducer(meta.producer);
      const bytes = await doc.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const base = file.name.replace(/\.pdf$/i, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-updated.pdf` });
    } catch {
      setError(tr("Could not save metadata to this PDF."));
    } finally {
      setBusy(false);
    }
  }

  const fields: { key: keyof Meta; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'subject', label: 'Subject' },
    { key: 'keywords', label: 'Keywords (comma-separated)' },
    { key: 'creator', label: 'Creator application' },
    { key: 'producer', label: 'Producer' },
  ];

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="application/pdf" onFiles={handleFile} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">{file.name}</span>
          <button onClick={() => { setFile(null); setMeta(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {meta && (
        <div className="space-y-3">
          {fields.map(({ key, label }) => (
            <label key={key} className="block text-xs text-ink-2">
              {label}
              <input
                value={meta[key]}
                onChange={(e) => setMeta((m) => (m ? { ...m, [key]: e.target.value } : m))}
                className="mt-1 block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-workshop"
              />
            </label>
          ))}
          <ActionBar><Button onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save changes")}</Button></ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
