export interface ImageFormatOption {
  mime: string;
  label: string;
  extension: string;
}

const ENCODE_CANDIDATES: ImageFormatOption[] = [
  { mime: 'image/png', label: 'PNG', extension: 'png' },
  { mime: 'image/jpeg', label: 'JPEG', extension: 'jpg' },
  { mime: 'image/webp', label: 'WebP', extension: 'webp' },
  { mime: 'image/avif', label: 'AVIF', extension: 'avif' },
];

let cachedEncodeSupport: ImageFormatOption[] | null = null;

/**
 * Tests actual canvas encode support per format rather than assuming it from
 * the browser name/version. The standard feature-detection technique: ask
 * the canvas to encode to a given MIME type, and check whether the returned
 * data URL actually starts with that MIME type — unsupported formats
 * silently fall back to PNG instead of throwing, so string-checking the
 * result is the only reliable signal.
 */
export function getSupportedEncodeFormats(): ImageFormatOption[] {
  if (cachedEncodeSupport) return cachedEncodeSupport;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  cachedEncodeSupport = ENCODE_CANDIDATES.filter((f) => {
    if (f.mime === 'image/png' || f.mime === 'image/jpeg') return true; // universally supported, no need to test
    try {
      return canvas.toDataURL(f.mime).startsWith(`data:${f.mime}`);
    } catch {
      return false;
    }
  });
  return cachedEncodeSupport;
}

/**
 * Attempts to actually decode a file as an image, rather than trusting its
 * declared MIME type or extension. This is how we honestly find out whether
 * a given browser can open a GIF/BMP/ICO/TIFF/HEIC file, instead of
 * pre-declaring support tables that would be wrong on some browser/OS combo.
 */
export function tryDecodeImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ image: img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unsupported'));
    };
    img.src = url;
  });
}

export function isSvg(file: File): boolean {
  return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
}

/** Best-effort intrinsic size from an SVG's width/height or viewBox — SVGs don't have "real" pixel dimensions, so this is a starting point for the user to adjust, not a guarantee. */
export async function guessSvgDimensions(file: File): Promise<{ width: number; height: number }> {
  const text = await file.text();
  const widthMatch = text.match(/width=["']?([\d.]+)/);
  const heightMatch = text.match(/height=["']?([\d.]+)/);
  if (widthMatch && heightMatch) {
    return { width: Math.round(Number(widthMatch[1])), height: Math.round(Number(heightMatch[1])) };
  }
  const viewBoxMatch = text.match(/viewBox=["']?[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/);
  if (viewBoxMatch) {
    return { width: Math.round(Number(viewBoxMatch[1])), height: Math.round(Number(viewBoxMatch[2])) };
  }
  return { width: 1024, height: 1024 };
}
