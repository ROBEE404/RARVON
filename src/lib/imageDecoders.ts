/**
 * Readers for image formats browsers can't open themselves: TIFF, TGA,
 * PPM/PGM/PBM and ICNS. Each returns plain RGBA pixels. No libraries; the
 * only compression they need (Deflate) comes from the browser.
 */

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export class UnsupportedImageError extends Error {}

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Which of these readers handles a file, by name and by its first bytes. */
export function customImageKind(name: string, head: Uint8Array): 'tiff' | 'tga' | 'pnm' | 'icns' | null {
  const e = ext(name);
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 42) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 42)) return 'tiff';
  if (head[0] === 0x69 && head[1] === 0x63 && head[2] === 0x6e && head[3] === 0x73) return 'icns';
  if (head[0] === 0x50 && head[1] >= 0x31 && head[1] <= 0x36 && /^(ppm|pgm|pbm|pnm)$/.test(e)) return 'pnm';
  if (e === 'tga' || e === 'icb' || e === 'vda' || e === 'vst') return 'tga';
  return null;
}

export async function decodeCustomImage(file: File): Promise<Pixels | Blob> {
  const buf = new Uint8Array(await file.arrayBuffer());
  switch (customImageKind(file.name, buf.subarray(0, 8))) {
    case 'tiff': return decodeTiff(buf);
    case 'tga': return decodeTga(buf);
    case 'pnm': return decodePnm(buf);
    case 'icns': return decodeIcns(buf);
    default: throw new UnsupportedImageError('Not a TIFF, TGA, PPM or ICNS file.');
  }
}

// ---------- PPM / PGM / PBM ----------

function decodePnm(b: Uint8Array): Pixels {
  let p = 0;
  const token = () => {
    for (;;) {
      while (p < b.length && /\s/.test(String.fromCharCode(b[p]))) p++;
      if (b[p] === 0x23) { while (p < b.length && b[p] !== 0x0a) p++; continue; } // comment
      break;
    }
    const s = p;
    while (p < b.length && !/\s/.test(String.fromCharCode(b[p]))) p++;
    return String.fromCharCode(...b.subarray(s, p));
  };
  const magic = token();
  const kind = Number(magic[1]);
  const width = Number(token());
  const height = Number(token());
  const max = kind === 1 || kind === 4 ? 1 : Number(token());
  if (!width || !height || !max) throw new UnsupportedImageError('Damaged PPM file.');
  const out = new Uint8ClampedArray(width * height * 4);
  const ascii = kind <= 3;
  const channels = kind === 3 || kind === 6 ? 3 : 1;
  const wide = max > 255;
  if (!ascii) p++; // single whitespace after the header
  let bit = 0;
  const read = (): number => {
    if (ascii) return Number(token());
    if (kind === 4) {
      // 1 bit per pixel, rows padded to whole bytes; 1 = black.
      const v = (b[p] >> (7 - bit)) & 1;
      if (++bit === 8) { bit = 0; p++; }
      return v;
    }
    const v = wide ? (b[p] << 8) | b[p + 1] : b[p];
    p += wide ? 2 : 1;
    return v;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (kind === 1 || kind === 4) {
        const v = read() ? 0 : 255;
        out[o] = out[o + 1] = out[o + 2] = v;
      } else if (channels === 1) {
        out[o] = out[o + 1] = out[o + 2] = (read() * 255) / max;
      } else {
        out[o] = (read() * 255) / max;
        out[o + 1] = (read() * 255) / max;
        out[o + 2] = (read() * 255) / max;
      }
      out[o + 3] = 255;
    }
    if (kind === 4 && bit) { bit = 0; p++; }
  }
  return { width, height, data: out };
}

// ---------- TGA ----------

function decodeTga(b: Uint8Array): Pixels {
  const idLen = b[0];
  const cmapType = b[1];
  const type = b[2];
  const cmapStart = b[3] | (b[4] << 8);
  const cmapLen = b[5] | (b[6] << 8);
  const cmapBits = b[7];
  const width = b[12] | (b[13] << 8);
  const height = b[14] | (b[15] << 8);
  const bpp = b[16];
  const desc = b[17];
  if (![1, 2, 3, 9, 10, 11].includes(type) || !width || !height) throw new UnsupportedImageError('This TGA file uses a kind Rarvon can’t read.');
  let p = 18 + idLen;
  const cmap: number[][] = [];
  if (cmapType === 1) {
    const step = Math.ceil(cmapBits / 8);
    for (let i = 0; i < cmapLen; i++, p += step) cmap[cmapStart + i] = px(b, p, cmapBits);
  }
  const rle = type >= 9;
  const step = Math.ceil(bpp / 8);
  const n = width * height;
  const pixels: number[][] = new Array(n);
  const get = () => {
    const v = type === 1 || type === 9 ? cmap[bpp === 16 ? b[p] | (b[p + 1] << 8) : b[p]] ?? [0, 0, 0, 255] : type === 3 || type === 11 ? [b[p], b[p], b[p], 255] : px(b, p, bpp);
    p += step;
    return v;
  };
  for (let i = 0; i < n;) {
    if (!rle) { pixels[i++] = get(); continue; }
    const h = b[p++];
    const count = (h & 0x7f) + 1;
    if (h & 0x80) {
      const v = get();
      for (let k = 0; k < count && i < n; k++) pixels[i++] = v;
    } else {
      for (let k = 0; k < count && i < n; k++) pixels[i++] = get();
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  const fromTop = (desc & 0x20) !== 0;
  const fromRight = (desc & 0x10) !== 0;
  const alphaBits = desc & 0x0f;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixels[y * width + x];
      const ty = fromTop ? y : height - 1 - y;
      const tx = fromRight ? width - 1 - x : x;
      const o = (ty * width + tx) * 4;
      out[o] = v[0];
      out[o + 1] = v[1];
      out[o + 2] = v[2];
      out[o + 3] = alphaBits || bpp === 32 ? v[3] : 255;
    }
  }
  // Some writers mark alpha but leave it all zero: treat that as opaque.
  if (out.every((v, i) => i % 4 !== 3 || v === 0)) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { width, height, data: out };
}

/** One TGA pixel (stored as BGR(A) or 15/16-bit) as [r, g, b, a]. */
function px(b: Uint8Array, p: number, bits: number): number[] {
  if (bits === 15 || bits === 16) {
    const v = b[p] | (b[p + 1] << 8);
    return [((v >> 10) & 31) * 8.226, ((v >> 5) & 31) * 8.226, (v & 31) * 8.226, bits === 16 && !(v & 0x8000) ? 255 : 255];
  }
  return [b[p + 2], b[p + 1], b[p], bits === 32 ? b[p + 3] : 255];
}

// ---------- ICNS (Mac icons) ----------

/** Takes the largest picture inside the icon (modern ICNS files keep them as PNG). */
function decodeIcns(b: Uint8Array): Blob {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let best: Uint8Array | null = null;
  for (let p = 8; p + 8 <= b.length;) {
    const len = v.getUint32(p + 4);
    if (len < 8) break;
    const body = b.subarray(p + 8, p + len);
    const isPng = body[0] === 0x89 && body[1] === 0x50;
    const isJp2 = body[4] === 0x6a && body[5] === 0x50;
    if (isPng && (!best || body.length > best.length)) best = body;
    if (isJp2 && !best) best = null;
    p += len;
  }
  if (!best) throw new UnsupportedImageError('This icon only has old-style pictures inside that Rarvon can’t read yet.');
  return new Blob([best as BlobPart], { type: 'image/png' });
}

// ---------- TIFF ----------

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unpackBits(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let i = 0;
  let o = 0;
  while (i < src.length && o < size) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) { out.set(src.subarray(i, i + n + 1), o); i += n + 1; o += n + 1; }
    else if (n !== -128) { out.fill(src[i++], o, o + 1 - n); o += 1 - n; }
  }
  return out;
}

/** TIFF's LZW (most-significant bit first, with the "early change" quirk). */
function unLzw(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let o = 0;
  let bitPos = 0;
  let width = 9;
  let dict: Uint8Array[] = [];
  const reset = () => { dict = []; for (let k = 0; k < 256; k++) dict[k] = new Uint8Array([k]); dict[256] = dict[257] = new Uint8Array(); width = 9; };
  const read = () => {
    let code = 0;
    for (let k = 0; k < width; k++) {
      const byte = src[(bitPos >> 3)] ?? 0;
      code = (code << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    return code;
  };
  reset();
  let prev: Uint8Array | null = null;
  while (o < size && bitPos < src.length * 8) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { reset(); prev = null; continue; }
    let entry = dict[code];
    if (!entry) {
      if (!prev) break;
      entry = new Uint8Array(prev.length + 1);
      entry.set(prev);
      entry[prev.length] = prev[0];
    }
    out.set(entry.subarray(0, Math.max(0, size - o)), o);
    o += entry.length;
    if (prev) {
      const add = new Uint8Array(prev.length + 1);
      add.set(prev);
      add[prev.length] = entry[0];
      dict.push(add);
    }
    prev = entry;
    if (dict.length + 1 >= 1 << width && width < 12) width++;
  }
  return out;
}

async function decodeTiff(b: Uint8Array): Promise<Pixels> {
  const le = b[0] === 0x49;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const ifd = u32(4);
  const tags = new Map<number, number[]>();
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    const id = u16(e);
    const type = u16(e + 2);
    const n = u32(e + 4);
    const size = type === 3 ? 2 : type === 4 ? 4 : 1;
    const at = n * size > 4 ? u32(e + 8) : e + 8;
    const vals: number[] = [];
    for (let i = 0; i < Math.min(n, 1 << 16); i++) vals.push(size === 2 ? u16(at + i * 2) : size === 4 ? u32(at + i * 4) : b[at + i]);
    tags.set(id, vals);
  }
  const one = (id: number, d = 0) => tags.get(id)?.[0] ?? d;
  const width = one(256);
  const height = one(257);
  const bits = one(258, 1);
  const compression = one(259, 1);
  const photometric = one(262, 2);
  const spp = one(277, 1);
  const predictor = one(317, 1);
  const planar = one(284, 1);
  if (!width || !height) throw new UnsupportedImageError('Damaged TIFF file.');
  if (bits !== 8 && bits !== 1) throw new UnsupportedImageError('This TIFF uses 16- or 32-bit colour, which Rarvon can’t read yet.');
  if (planar !== 1 || ![1, 5, 8, 32946, 32773].includes(compression) || ![0, 1, 2, 3].includes(photometric)) {
    throw new UnsupportedImageError('This TIFF uses a kind of compression or colour Rarvon can’t read yet (for example JPEG-in-TIFF or CMYK).');
  }
  const tiled = tags.has(322);
  const offsets = tags.get(tiled ? 324 : 273) ?? [];
  const lengths = tags.get(tiled ? 325 : 279) ?? [];
  const tw = tiled ? one(322) : width;
  const th = tiled ? one(323) : one(278, height);
  const rowBytes = Math.ceil((tw * spp * bits) / 8);
  const chunk = async (k: number): Promise<Uint8Array> => {
    const raw = b.subarray(offsets[k], offsets[k] + lengths[k]);
    const size = rowBytes * th;
    let d = compression === 1 ? raw : compression === 5 ? unLzw(raw, size) : compression === 32773 ? unpackBits(raw, size) : await inflate(raw);
    if (predictor === 2 && bits === 8) {
      d = new Uint8Array(d);
      for (let r = 0; r < th; r++) for (let x = spp; x < rowBytes; x++) d[r * rowBytes + x] = (d[r * rowBytes + x] + d[r * rowBytes + x - spp]) & 255;
    }
    return d;
  };
  const cmap = tags.get(320);
  const out = new Uint8ClampedArray(width * height * 4);
  const across = Math.ceil(width / tw);
  for (let k = 0; k < offsets.length; k++) {
    const d = await chunk(k);
    const ox = tiled ? (k % across) * tw : 0;
    const oy = tiled ? Math.floor(k / across) * th : k * th;
    for (let y = 0; y < th && oy + y < height; y++) {
      for (let x = 0; x < tw && ox + x < width; x++) {
        const o = ((oy + y) * width + ox + x) * 4;
        if (bits === 1) {
          const bit = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
          const v = (photometric === 0 ? !bit : bit) ? 255 : 0;
          out[o] = out[o + 1] = out[o + 2] = v;
          out[o + 3] = 255;
          continue;
        }
        const s = y * rowBytes + x * spp;
        if (photometric === 3 && cmap) {
          const n = cmap.length / 3;
          out[o] = cmap[d[s]] >> 8;
          out[o + 1] = cmap[n + d[s]] >> 8;
          out[o + 2] = cmap[2 * n + d[s]] >> 8;
          out[o + 3] = 255;
        } else if (photometric <= 1) {
          const g = photometric === 0 ? 255 - d[s] : d[s];
          out[o] = out[o + 1] = out[o + 2] = g;
          out[o + 3] = spp > 1 ? d[s + 1] : 255;
        } else {
          out[o] = d[s];
          out[o + 1] = d[s + 1];
          out[o + 2] = d[s + 2];
          out[o + 3] = spp > 3 ? d[s + 3] : 255;
        }
      }
    }
  }
  return { width, height, data: out };
}
