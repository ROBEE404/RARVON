/**
 * The browser engine's image formats: what the browser decodes and encodes
 * itself, plus the formats Rarvon reads and writes with its own code.
 */
import { canvasToBlob } from '../lib/imageUtils';
import { encodeBmp, encodeGif, encodeTiff } from '../lib/imageEncoders';
import { encodeIco, encodeIcns, encodeOdg, encodePostScript, encodePsd } from '../lib/documentEncoders';
import { customImageKind, decodeCustomImage } from '../lib/imageDecoders';


const usesQuality = (mime: string) => mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/avif';

export async function encodeImage(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  const pixels = () => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  switch (mime) {
    case 'image/gif': return encodeGif(pixels());
    case 'image/bmp': return encodeBmp(pixels());
    case 'image/tiff': return encodeTiff(pixels());
    case 'image/x-icon': return encodeIco(canvas);
    case 'image/icns': return encodeIcns(canvas);
    case 'image/vnd.adobe.photoshop': return encodePsd(pixels());
    case 'application/postscript+eps': return encodePostScript(canvas, true);
    case 'application/postscript': return encodePostScript(canvas, false);
    case 'application/vnd.oasis.opendocument.graphics': return encodeOdg(canvas);
    default: return canvasToBlob(canvas, mime, usesQuality(mime) ? quality : undefined);
  }
}

/** True when the browser can't open this file but Rarvon's own readers can (TIFF, TGA, PPM, ICNS). */
export async function needsBenchReader(file: File): Promise<boolean> {
  return customImageKind(file.name, new Uint8Array(await file.slice(0, 8).arrayBuffer())) !== null;
}

/** Opens a file with Rarvon's own readers, as a PNG picture the rest of the tool can use. */
export async function openWithBench(file: File): Promise<{ url: string; width: number; height: number }> {
  const out = await decodeCustomImage(file);
  if (out instanceof Blob) {
    const bmp = await createImageBitmap(out);
    return { url: URL.createObjectURL(out), width: bmp.width, height: bmp.height };
  }
  const c = document.createElement('canvas');
  c.width = out.width;
  c.height = out.height;
  c.getContext('2d')!.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  const png = await canvasToBlob(c, 'image/png');
  return { url: URL.createObjectURL(png), width: out.width, height: out.height };
}

