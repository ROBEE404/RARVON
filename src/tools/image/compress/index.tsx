import { useEffect, useMemo, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { loadImage, canvasToBlob, formatBytes } from '../../../lib/imageUtils';
import { ActionBar, OptionCards, SizeDelta } from '../../../components/tool';
import { CompressFlow, LevelSlider, MoreOptions } from '../../../components/tool/CompressFlow';
import { tr } from '../../../lib/i18n';

/** Palette sizes for PNG. 0 = lossless re-compression (no colour reduction). */
const PNG_LEVELS = [
  { colors: 256, label: '256 colours', hint: 'usually indistinguishable — best for screenshots, logos, graphics' },
  { colors: 128, label: '128 colours', hint: 'smaller, slight banding in gradients' },
  { colors: 64, label: '64 colours', hint: 'much smaller, visible on photos' },
  { colors: 0, label: 'Lossless', hint: 'same pixels, better compression only' },
];

function quantizePng(rgba: ArrayBuffer, width: number, height: number, colors: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../../lib/pngQuant.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ png?: ArrayBuffer; error?: string }>) => {
      worker.terminate();
      if (e.data.png) resolve(new Blob([e.data.png], { type: 'image/png' }));
      else reject(new Error(e.data.error ?? 'PNG compression failed.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(tr("PNG compression failed.")));
    };
    worker.postMessage({ rgba, width, height, colors }, [rgba]);
  });
}

/** The three simple levels: a JPEG/WebP quality, or a PNG palette size. */
const LEVELS = [
  { value: 0, label: 'Light', hint: 'Looks the same', quality: 0.85, colors: 256 },
  { value: 1, label: 'Balanced', hint: 'Best for most', quality: 0.7, colors: 128 },
  { value: 2, label: 'Strong', hint: 'Smallest file', quality: 0.5, colors: 64 },
];

/** Encodes the picture (at a scale) the way Compress will. */
async function encode(img: HTMLImageElement, scale: number, isPng: boolean, isWebp: boolean, quality: number, colors: number): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: isPng });
  if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
  if (isPng) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { blob: await quantizePng(data.buffer, canvas.width, canvas.height, colors), ext: 'png' };
  }
  // WebP stays WebP (keeps transparency); everything else becomes JPEG.
  const outType = isWebp ? 'image/webp' : 'image/jpeg';
  if (outType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { blob: await canvasToBlob(canvas, outType, quality), ext: isWebp ? 'webp' : 'jpg' };
}

export default function ImageCompress() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(0.7);
  const [colors, setColors] = useState(256);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPng = file?.type === 'image/png' || /\.png$/i.test(file?.name ?? '');
  const isWebp = file?.type === 'image/webp';
  const level = isPng ? LEVELS.find((l) => l.colors === colors)?.value ?? null : LEVELS.find((l) => l.quality === quality)?.value ?? null;
  const pickLevel = (v: number) => {
    const l = LEVELS[v];
    if (isPng) setColors(l.colors);
    else setQuality(l.quality);
    setResult(null);
  };

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    setImg(null);
    if (!file) return;
    let stale = false;
    loadImage(file).then((i) => { if (!stale) setImg(i); }).catch(() => setError(tr('Could not open this image.')));
    return () => { stale = true; };
  }, [file]);

  // Size estimate: compress a copy of at most one megapixel the same way and scale the size up.
  const [estimate, setEstimate] = useState<number | null>(null);
  useEffect(() => {
    setEstimate(null);
    if (!img) return;
    let stale = false;
    const t = window.setTimeout(async () => {
      try {
        const scale = Math.min(1, Math.sqrt(1_000_000 / (img.naturalWidth * img.naturalHeight)));
        const { blob } = await encode(img, scale, isPng, isWebp, quality, colors);
        if (!stale) setEstimate(blob.size / (scale * scale));
      } catch {
        // No estimate; Compress reports errors.
      }
    }, 250);
    return () => { stale = true; window.clearTimeout(t); };
  }, [img, isPng, isWebp, quality, colors]);

  async function compress() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const base = file.name.replace(/\.[^.]+$/, '');
      const { blob, ext } = await encode(img ?? await loadImage(file), 1, isPng, isWebp, quality, colors);
      setResult({ url: URL.createObjectURL(blob), name: `${base}-compressed.${ext}`, size: blob.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compress this image.');
    } finally {
      setBusy(false);
    }
  }

  const smaller = result && file ? result.size < file.size : true;
  const outExt = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
  const remove = () => { setFile(null); setResult(null); setError(null); };
  const thumb = preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : null;

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept="image/*" onFiles={(f) => { setFile(f[0]); setResult(null); setError(null); }} hint={tr("JPG, PNG or WebP")} />}

      {file && (
        <div className="slide-in space-y-4">
          <CompressFlow
            from={{ preview: thumb, name: file.name, detail: formatBytes(file.size), format: '' }}
            to={{
              preview: thumb,
              name: result?.name ?? `${file.name.replace(/\.[^.]+$/, '')}-compressed.${outExt}`,
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></>
                : estimate != null ? tr('about {size}', { size: formatBytes(estimate) }) : '…',
              format: '',
            }}
            before={file.size}
            after={result ? result.size : estimate}
            state={busy ? 'busy' : result ? (smaller ? 'done' : 'warn') : 'idle'}
            onRemove={remove}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result && !smaller && (
            <p className="slide-in text-xs text-ink-2">
              {tr("This image is already well compressed — the result (")}{formatBytes(result.size)}{tr(") isn’t smaller than the original (")}{formatBytes(file.size)}{tr("). Keep your original, or try")}{' '}{isPng ? tr("fewer colours") : tr("a lower quality")}.
            </p>
          )}

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <LevelSlider options={LEVELS} value={level} onChange={pickLevel} disabled={busy} />
            <MoreOptions>
              {isPng ? (
                <div className="grid gap-2">
                  <OptionCards legend={tr("PNG compression")} name="png-colors" disabled={busy} value={colors} onChange={(c) => { setColors(c); setResult(null); }} options={PNG_LEVELS.map((l) => ({ value: l.colors, label: l.label, hint: l.hint }))} />
                  <p className="text-xs text-ink-3">{tr("Transparency is kept. Reducing to a colour palette is how PNGs get dramatically smaller.")}</p>
                </div>
              ) : (
                <label className="grid gap-1.5 text-xs text-ink-2">
                  <span className="flex justify-between"><span>{tr("Quality")}</span><span className="font-mono text-ink">{Math.round(quality * 100)}%</span></span>
                  <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => { setQuality(Number(e.target.value)); setResult(null); }} className="w-full accent-[var(--color-workshop)]" aria-label={tr("Quality")} />
                </label>
              )}
            </MoreOptions>
          </div>

          <ActionBar><Button onClick={compress} disabled={busy} className="sm:ms-auto">{busy ? tr("Compressing…") : tr("Compress")}</Button></ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
