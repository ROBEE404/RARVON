import { tr } from './i18n';
/**
 * Prepares an image for OCR on a canvas: applies the user's rotation, scales
 * it into the size range Tesseract's LSTM models read best (small screenshots
 * are upscaled, huge photos are capped to keep memory in check) and converts
 * to grayscale with a mild contrast stretch, which helps low-contrast photos
 * without destroying thin Arabic strokes the way hard binarization can.
 */
export interface PreprocessOptions {
  rotation?: 0 | 90 | 180 | 270;
  /** Grayscale + contrast stretch (default true). */
  enhance?: boolean;
  /** Detect and correct small skew, up to ±15° (default true). */
  deskew?: boolean;
}

const MIN_LONG_SIDE = 1800;
const MAX_LONG_SIDE = 4000;
const MAX_UPSCALE = 3;

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(tr("This image couldn’t be opened. Try a PNG, JPEG or WebP file."));
  }
}

export function preprocessForOcr(source: ImageBitmap | HTMLCanvasElement, options: PreprocessOptions = {}): HTMLCanvasElement {
  const { rotation = 0, enhance = true, deskew = true } = options;
  const sw = source.width;
  const sh = source.height;
  const long = Math.max(sw, sh);
  let scale = 1;
  if (long < MIN_LONG_SIDE) scale = Math.min(MAX_UPSCALE, MIN_LONG_SIDE / long);
  if (long * scale > MAX_LONG_SIDE) scale = MAX_LONG_SIDE / long;

  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const swap = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (enhance) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const total = d.length / 4;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      d[i] = g;
      sum += g;
    }
    // Light text on a dark background (dark-mode screenshots, slides) is
    // inverted to dark-on-light: measured 48% CER on an Arabic dark-mode
    // screenshot before, the same as light mode (0.5%) after.
    const invert = sum / total < 110;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      if (invert) d[i] = 255 - d[i];
      hist[d[i] | 0]++;
    }
    // Stretch between the 1st and 99th percentile of brightness.
    const cut = total * 0.01;
    let lo = 0;
    for (let seen = hist[0]; lo < 255 && seen < cut; ) seen += hist[++lo];
    let hi = 255;
    for (let seen = hist[255]; hi > 0 && seen < cut; ) seen += hist[--hi];
    // On sparse pages (text under 1% of pixels) the percentiles both land on
    // the background; clamping keeps the stretch from mapping paper to black.
    lo = Math.min(lo, 96);
    hi = Math.max(hi, 160);
    const range = hi - lo;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  if (deskew) {
    const angle = estimateSkewDegrees(canvas);
    if (Math.abs(angle) >= 0.3) return rotateCanvas(canvas, -angle);
  }
  return canvas;
}

function rotateCanvas(src: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180;
  const w = Math.ceil(Math.abs(src.width * Math.cos(rad)) + Math.abs(src.height * Math.sin(rad)));
  const h = Math.ceil(Math.abs(src.width * Math.sin(rad)) + Math.abs(src.height * Math.cos(rad)));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/**
 * Estimates text skew (degrees, positive = clockwise) with a projection
 * profile: dark pixels of a downscaled copy are projected onto the vertical
 * axis at candidate angles, and the angle whose row histogram is "peakiest"
 * (text lines collapse into sharp bands) wins. Measured: a 3° skew took
 * Arabic CER from ~4% to 26% before this correction.
 */
export function estimateSkewDegrees(canvas: HTMLCanvasElement): number {
  const scale = Math.min(1, 1000 / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, w, h);
  const d = sctx.getImageData(0, 0, w, h).data;

  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const threshold = Math.min(160, (sum / (d.length / 4)) * 0.75);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4] < threshold) {
        xs.push(x - w / 2);
        ys.push(y - h / 2);
      }
    }
  }
  if (xs.length < 200) return 0;
  // Cap work on dense images.
  const step = Math.max(1, Math.floor(xs.length / 60000));
  const diag = Math.ceil(Math.hypot(w, h));

  const score = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const bins = new Float64Array(diag + 2);
    for (let i = 0; i < xs.length; i += step) {
      const yr = -xs[i] * sin + ys[i] * cos + diag / 2;
      bins[yr | 0]++;
    }
    let s = 0;
    for (let i = 1; i < bins.length; i++) {
      const diff = bins[i] - bins[i - 1];
      s += diff * diff;
    }
    return s;
  };

  let best = 0;
  let bestScore = score(0);
  for (let a = -15; a <= 15; a += 0.5) {
    const sc = score(a);
    if (sc > bestScore) [best, bestScore] = [a, sc];
  }
  for (let a = best - 0.5; a <= best + 0.5; a += 0.1) {
    const sc = score(a);
    if (sc > bestScore) [best, bestScore] = [a, sc];
  }
  return Math.round(best * 10) / 10;
}
