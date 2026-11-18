import { useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { loadImage, canvasToBlob } from '../../../lib/imageUtils';
import { ResultCard } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function ImageRotate() {
  const [file, setFile] = useState<File | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!file) return;
    try {
      const img = await loadImage(file);
      const swapped = rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = swapped ? img.naturalHeight : img.naturalWidth;
      canvas.height = swapped ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, type, 0.92);
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-rotated.${type === 'image/png' ? 'png' : 'jpg'}` });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rotate this image.');
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="image/*" onFiles={(f) => { setFile(f[0]); setResult(null); }} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3">
          <span className="truncate text-sm">{file.name}</span>
          <button onClick={() => { setFile(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">
            {tr("Remove")}
          </button>
        </div>
      )}

      {file && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRotation((r) => (r + 270) % 360)}>{tr("Rotate left 90°")}</Button>
            <Button variant="secondary" onClick={() => setRotation((r) => (r + 90) % 360)}>{tr("Rotate right 90°")}</Button>
            <Button variant="secondary" onClick={() => setFlipH((v) => !v)}>{tr("Flip horizontal")}</Button>
            <Button variant="secondary" onClick={() => setFlipV((v) => !v)}>{tr("Flip vertical")}</Button>
          </div>
          <p className="text-xs text-ink-3">{tr("Current:")}{' '}{rotation}{tr("° rotation")}{flipH ? tr(", flipped horizontally") : ''}{flipV ? tr(", flipped vertically") : ''}</p>
          <Button onClick={apply}>{tr("Apply and export")}</Button>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
