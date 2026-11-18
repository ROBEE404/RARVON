import { getSupportedEncodeFormats } from '../lib/imageFormatSupport';
import type { ImageFormatOption } from '../lib/imageFormatSupport';

/** Formats Rarvon writes itself (the browser can't), listed after the ones the browser makes. */
export const BENCH_FORMATS: ImageFormatOption[] = [
  { mime: 'image/gif', label: 'GIF', extension: 'gif' },
  { mime: 'image/bmp', label: 'BMP', extension: 'bmp' },
  { mime: 'image/tiff', label: 'TIFF', extension: 'tif' },
  { mime: 'image/x-icon', label: 'ICO', extension: 'ico' },
  { mime: 'image/icns', label: 'ICNS', extension: 'icns' },
  { mime: 'image/vnd.adobe.photoshop', label: 'PSD', extension: 'psd' },
  { mime: 'application/postscript+eps', label: 'EPS', extension: 'eps' },
  { mime: 'application/postscript', label: 'PS', extension: 'ps' },
  { mime: 'application/vnd.oasis.opendocument.graphics', label: 'ODG', extension: 'odg' },
];

/** Every format the browser engine can save a picture as: the browser's own first, then Rarvon's. */
export function imageOutputFormats(): ImageFormatOption[] {
  return [...getSupportedEncodeFormats(), ...BENCH_FORMATS];
}
