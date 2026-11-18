import { engine, UnsupportedImageError, isSvg, guessSvgDimensions } from '../../../engine';
import type { ImageFormatOption } from '../../../engine';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { ConvertFlow, FormatPills } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';

const INPUT_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/x-icon': 'ICO',
  'image/vnd.microsoft.icon': 'ICO',
  'image/tiff': 'TIFF',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/svg+xml': 'SVG',
  'image/x-tga': 'TGA',
  'image/x-portable-pixmap': 'PPM',
};
const EXTENSION_LABELS: Record<string, string> = {
  jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF',
  bmp: 'BMP', ico: 'ICO', tif: 'TIFF', tiff: 'TIFF', heic: 'HEIC', heif: 'HEIF', svg: 'SVG',
  jfif: 'JPEG', tga: 'TGA', ppm: 'PPM', pgm: 'PGM', pbm: 'PBM', pnm: 'PNM', icns: 'ICNS',
};

function detectLabel(file: File): string {
  if (INPUT_LABELS[file.type]) return INPUT_LABELS[file.type];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_LABELS[ext] ?? (file.type || ext.toUpperCase() || 'Unknown');
}

function decodeFailureMessage(file: File): string {
  const label = detectLabel(file).toLowerCase();
  if (label.includes('heic') || label.includes('heif')) {
    return 'This browser can\u2019t open HEIC/HEIF photos. Safari can display many HEIC files directly; Chrome and Firefox generally can\u2019t decode HEIC at all. Try exporting to JPEG from your device\u2019s Photos app first.';
  }
  return 'This browser couldn\u2019t open this image. It may be corrupted or use a format this browser can\u2019t decode.';
}

/** What each output is good for, shown under its name. */
const FORMAT_HINTS: Record<string, string> = {
  'image/jpeg': 'Small, for photos',
  'image/png': 'Lossless, keeps transparency',
  'image/webp': 'Small, for websites',
  'image/avif': 'Smallest, newest',
  'image/gif': 'Simple pictures, 256 colours',
  'image/bmp': 'Uncompressed, for old programs',
  'image/tiff': 'For printing and scanning',
  'image/x-icon': 'Windows and website icons',
  'image/icns': 'Mac app icons',
  'image/vnd.adobe.photoshop': 'Opens in Photoshop',
  'application/postscript+eps': 'For print and design programs',
  'application/postscript': 'A printable page',
  'application/vnd.oasis.opendocument.graphics': 'Opens in LibreOffice Draw',
};

/** Icons always hold the same set of sizes, so their size doesn't scale with the picture. */
const fixedSize = (mime: string) => mime === 'image/x-icon' || mime === 'image/icns';


/** Draws the picture onto a canvas at the given scale. */
async function drawImage(src: string, width: number, height: number, scale: number, mime: string) {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(tr("Could not re-read this image for conversion.")));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const usesQuality = (mime: string) => mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/avif';

interface Decoded {
  file: File;
  label: string;
  previewUrl: string;
  width: number;
  height: number;
  isSvgInput: boolean;
  isAnimatedGif: boolean;
}

export default function ImageConvert() {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [target, setTarget] = useState<ImageFormatOption | null>(null);
  const [quality, setQuality] = useState(0.92);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const encodeFormats = engine.image.outputFormats();
  // Everything except the format the picture already is.
  const outputOptions = decoded ? encodeFormats.filter((f) => f.mime !== decoded.file.type && f.label !== decoded.label) : encodeFormats;

  useEffect(() => {
    if (outputOptions.length && (!target || !outputOptions.some((o) => o.mime === target.mime))) {
      setTarget(outputOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded]);

  async function handleFile(files: File[]) {
    const file = files[0];
    setResult(null);
    setConvertError(null);
    setDecodeError(null);
    setDecoded(null);

    const label = detectLabel(file);
    const svgInput = isSvg(file);

    try {
      if (svgInput) {
        const { width, height } = await guessSvgDimensions(file);
        setDecoded({ file, label, previewUrl: URL.createObjectURL(file), width, height, isSvgInput: true, isAnimatedGif: false });
      } else if (await engine.image.needsReader(file)) {
        const { url, width, height } = await engine.image.open(file);
        setDecoded({ file, label, previewUrl: url, width, height, isSvgInput: false, isAnimatedGif: false });
      } else {
        const { image, url } = await engine.image.load(file);
        setDecoded({
          file,
          label,
          previewUrl: url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          isSvgInput: false,
          isAnimatedGif: file.type === 'image/gif',
        });
      }
    } catch (e) {
      setDecodeError(e instanceof UnsupportedImageError ? tr(e.message) : decodeFailureMessage(file));
    }
  }

  // A quick size estimate: encode a copy of at most one megapixel and scale the size up.
  const [estimate, setEstimate] = useState<number | null>(null);
  useEffect(() => {
    setEstimate(null);
    if (!decoded || !target) return;
    let stale = false;
    const t = window.setTimeout(async () => {
      try {
        const pixels = decoded.width * decoded.height;
        const scale = fixedSize(target.mime) ? 1 : Math.min(1, Math.sqrt(1_000_000 / pixels));
        const canvas = await drawImage(decoded.previewUrl, decoded.width, decoded.height, scale, target.mime);
        const blob = await engine.image.encode(canvas, target.mime, quality);
        if (!stale) setEstimate(blob.size / (scale * scale));
      } catch {
        // No estimate; the conversion itself reports errors.
      }
    }, 250);
    return () => { stale = true; window.clearTimeout(t); };
  }, [decoded, target, quality]);

  async function convert() {
    if (!decoded || !target) return;
    setBusy(true);
    setConvertError(null);
    try {
      const canvas = await drawImage(decoded.previewUrl, decoded.width, decoded.height, 1, target.mime);
      const blob = await engine.image.encode(canvas, target.mime, quality);
      const base = decoded.file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}.${target.extension}`, size: blob.size });
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : tr('Could not convert this image.'));
    } finally {
      setBusy(false);
    }
  }

  const lossy = target ? usesQuality(target.mime) : false;
  const base = decoded ? decoded.file.name.replace(/\.[^.]+$/, '') : '';
  const thumb = decoded ? (
    <img src={decoded.previewUrl} alt="" className="h-full w-full object-cover" />
  ) : null;

  return (
    <div className="space-y-4">
      {!decoded && !decodeError && (
        <FileDropzone
          accept="image/*,.heic,.heif,.tif,.tiff,.ico,.icns,.tga,.ppm,.pgm,.pbm,.pnm,.jfif"
          onFiles={handleFile}
          hint={tr("JPG, PNG, WebP, GIF, BMP, ICO, SVG, TIFF, TGA, PPM, ICNS — plus AVIF or HEIC where your browser can open them")}
        />
      )}

      {decodeError && (
        <div className="space-y-3">
          <ErrorMessage>{decodeError}</ErrorMessage>
          <Button variant="secondary" onClick={() => setDecodeError(null)}>{tr("Try a different file")}</Button>
        </div>
      )}

      {decoded && (
        <div className="slide-in space-y-4">
          <ConvertFlow
            from={{ preview: thumb, name: decoded.file.name, detail: `${formatBytes(decoded.file.size)} · ${decoded.width}×${decoded.height}`, format: decoded.label }}
            to={{
              preview: <div className={clsx('h-full w-full', target?.mime === 'image/jpeg' && 'bg-white')}>{thumb}</div>,
              name: result?.name ?? (target ? `${base}.${target.extension}` : base),
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={decoded.file.size} after={result.size} /></>
                : estimate != null ? tr('about {size}', { size: formatBytes(estimate) }) : '…',
              format: target?.label ?? '',
            }}
            state={busy ? 'busy' : result ? 'done' : 'idle'}
            onRemove={() => { setDecoded(null); setResult(null); }}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />

          {decoded.isAnimatedGif && (
            <p className="text-xs text-ink-3">{tr("If this GIF is animated, only its first frame will be converted — canvas-based conversion can't preserve animation.")}</p>
          )}

          {outputOptions.length === 0 ? (
            <ErrorMessage>{tr("This browser doesn't support encoding to any image format from this tool. Try a recent version of Chrome, Firefox, Edge or Safari.")}</ErrorMessage>
          ) : (
            <div className="grid gap-4 rounded-xl border border-line bg-elevated p-3 sm:p-4">
              <div>
                <p className="mb-2 text-xs font-medium text-ink-2">{tr("Convert to")}</p>
                <FormatPills
                  options={outputOptions.map((f) => ({ value: f.mime, label: f.label, hint: FORMAT_HINTS[f.mime] }))}
                  value={target?.mime ?? null}
                  onChange={(mime) => { setTarget(outputOptions.find((o) => o.mime === mime) ?? null); setResult(null); }}
                  disabled={busy}
                />
              </div>

              {decoded.isSvgInput && (
                <div className="slide-in flex flex-wrap items-end gap-3">
                  <label className="text-xs text-ink-2">
                    {tr("Output width")}
                    <input
                      type="number" min={1} value={decoded.width}
                      onChange={(e) => { setResult(null); setDecoded((d) => (d ? { ...d, width: Math.max(1, Number(e.target.value)) } : d)); }}
                      className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-ink-2">
                    {tr("Output height")}
                    <input
                      type="number" min={1} value={decoded.height}
                      onChange={(e) => { setResult(null); setDecoded((d) => (d ? { ...d, height: Math.max(1, Number(e.target.value)) } : d)); }}
                      className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
                    />
                  </label>
                  <p className="pb-2 text-xs text-ink-3">{tr("SVG has no fixed pixel size — pick the resolution to render at.")}</p>
                </div>
              )}

              {lossy && (
                <label key={target?.mime} className="slide-in grid gap-1.5 text-xs text-ink-2">
                  <span className="flex justify-between">
                    <span>{tr("Quality")}</span>
                    <span className="font-mono text-ink">{Math.round(quality * 100)}%</span>
                  </span>
                  <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => { setQuality(Number(e.target.value)); setResult(null); }} className="w-full accent-[var(--color-workshop)]" />
                  <span className="flex justify-between text-[11px] text-ink-3"><span>{tr("Smaller file")}</span><span>{tr("Better picture")}</span></span>
                </label>
              )}
            </div>
          )}

          {outputOptions.length > 0 && (
            <ActionBar>
              <Button onClick={convert} disabled={busy || !target} className="sm:ms-auto">
                {busy ? tr("Converting…") : tr("Convert")}
              </Button>
            </ActionBar>
          )}
        </div>
      )}

      {convertError && <ErrorMessage>{convertError}</ErrorMessage>}
    </div>
  );
}
