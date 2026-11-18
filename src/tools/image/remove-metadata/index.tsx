import { useState } from 'react';
import exifr from 'exifr';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import SuccessMessage from '../../../components/SuccessMessage';
import { loadImage, canvasToBlob, formatBytes } from '../../../lib/imageUtils';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function RemoveMetadataTool() {
  const [file, setFile] = useState<File | null>(null);
  const [foundCount, setFoundCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    setFoundCount(null);
    try {
      const parsed = await exifr.parse(f, true);
      setFoundCount(parsed ? Object.keys(parsed).length : 0);
    } catch {
      setFoundCount(null);
    }
  }

  async function clean() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await loadImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
      // Re-drawing onto a fresh canvas and re-encoding produces pixel data
      // only — canvas export never carries EXIF/XMP/IPTC metadata, so this
      // strips it by construction rather than trying to edit it in place.
      if (file.type !== 'image/png') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, outType, outType === 'image/jpeg' ? 0.95 : undefined);
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({
        url: URL.createObjectURL(blob),
        name: `${base}-clean.${outType === 'image/png' ? 'png' : 'jpg'}`,
        size: blob.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process this image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="image/*" onFiles={handleFile} hint={tr("JPG or PNG")} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3">
          <span className="truncate text-sm">{file.name} · {formatBytes(file.size)}</span>
          <button onClick={() => { setFile(null); setResult(null); setFoundCount(null); }} className="text-xs font-medium text-workshop hover:underline">
            {tr("Remove")}
          </button>
        </div>
      )}

      {file && foundCount !== null && (
        <p className="text-xs text-ink-3">
          {foundCount > 0 ? tr("Found {0} metadata field{1} to strip.", { 0: foundCount, 1: foundCount !== 1 ? 's' : '' }) : tr("No EXIF metadata was detected — a cleaned copy will still be produced.")}
        </p>
      )}

      {file && (
        <ActionBar><Button onClick={clean} disabled={busy}>{busy ? tr("Cleaning…") : tr("Remove metadata")}</Button></ActionBar>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <div className="space-y-2">
          <SuccessMessage>{tr("Metadata stripped. Your cleaned copy is ready.")}</SuccessMessage>
          <ResultCard url={result.url} filename={result.name}>{result.name} · {formatBytes(result.size)}</ResultCard>
        </div>
      )}
    </div>
  );
}
