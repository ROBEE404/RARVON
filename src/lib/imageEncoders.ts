/**
 * Encoders for the image formats browsers can't produce themselves: BMP, TIFF
 * and GIF (still or animated). Everything runs on the device; no libraries.
 */

/** BMP: 24-bit, uncompressed, rows stored bottom-up (the classic Windows format). */
export function encodeBmp(img: ImageData): Blob {
  const { width: w, height: h, data } = img;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true); // "BM"
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, rowSize * h, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Flatten transparency onto white.
      const a = data[i + 3] / 255;
      out[o++] = Math.round(data[i + 2] * a + 255 * (1 - a));
      out[o++] = Math.round(data[i + 1] * a + 255 * (1 - a));
      out[o++] = Math.round(data[i] * a + 255 * (1 - a));
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/** TIFF: baseline, uncompressed RGBA in one strip, little-endian. Opens in every image and print program. */
export function encodeTiff(img: ImageData): Blob {
  const { width: w, height: h, data } = img;
  const entries = 12;
  const ifdSize = 2 + entries * 12 + 4;
  const bpsOffset = 8 + ifdSize; // 4 × uint16 bits-per-sample
  const resOffset = bpsOffset + 8; // two rationals (x, y resolution)
  const dataOffset = resOffset + 16;
  const buf = new ArrayBuffer(dataOffset + data.length);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949, true); // "II": little-endian
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, entries, true);
  let p = 10;
  const tag = (id: number, type: number, count: number, value: number) => {
    v.setUint16(p, id, true);
    v.setUint16(p + 2, type, true);
    v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, value, true);
    else v.setUint32(p + 8, value, true);
    p += 12;
  };
  tag(256, 4, 1, w); // width
  tag(257, 4, 1, h); // height
  tag(258, 3, 4, bpsOffset); // 8,8,8,8 bits
  tag(259, 3, 1, 1); // no compression
  tag(262, 3, 1, 2); // RGB
  tag(273, 4, 1, dataOffset); // strip offset
  tag(277, 3, 1, 4); // samples per pixel
  tag(278, 4, 1, h); // rows per strip
  tag(279, 4, 1, data.length); // strip byte count
  tag(282, 5, 1, resOffset); // x resolution
  tag(283, 5, 1, resOffset + 8); // y resolution
  tag(338, 3, 1, 2); // extra sample: unassociated alpha
  v.setUint32(p, 0, true); // no next IFD
  for (let k = 0; k < 4; k++) v.setUint16(bpsOffset + k * 2, 8, true);
  v.setUint32(resOffset, 72, true);
  v.setUint32(resOffset + 4, 1, true);
  v.setUint32(resOffset + 8, 72, true);
  v.setUint32(resOffset + 12, 1, true);
  new Uint8Array(buf, dataOffset).set(data);
  return new Blob([buf], { type: 'image/tiff' });
}

// ---------- GIF ----------

/** A fixed 6×7×6 colour cube (252 colours) plus 4 greys: fast, and good enough for GIF's 256-colour limit. */
const PALETTE = (() => {
  const p: number[] = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) p.push(Math.round((r * 255) / 5), Math.round((g * 255) / 6), Math.round((b * 255) / 5));
  for (const grey of [64, 128, 192, 255]) p.push(grey, grey, grey);
  return new Uint8Array(p);
})();

/** 4×4 ordered dithering, so gradients turn into fine patterns instead of bands. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n / 16 - 0.5));

function toIndexes(img: ImageData): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = BAYER[(y & 3) * 4 + (x & 3)];
      const a = data[i + 3] / 255;
      const ch = (c: number, steps: number) => {
        const flat = data[i + c] * a + 255 * (1 - a);
        return Math.max(0, Math.min(steps, Math.round((flat / 255) * steps + d)));
      };
      out[y * w + x] = ch(0, 5) * 42 + ch(1, 6) * 6 + ch(2, 5);
    }
  }
  return out;
}

/** GIF's LZW compression for one frame of palette indexes. */
function lzw(indexes: Uint8Array, minCode = 8): Uint8Array {
  const clear = 1 << minCode;
  const end = clear + 1;
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  let size = minCode + 1;
  const write = (code: number) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = end + 1;
  write(clear);
  let prefix = indexes[0];
  for (let k = 1; k < indexes.length; k++) {
    const c = indexes[k];
    const key = (prefix << 8) | c;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      write(clear);
      dict = new Map();
      next = end + 1;
      size = minCode + 1;
    }
    prefix = c;
  }
  write(prefix);
  write(end);
  if (bits > 0) out.push(cur & 0xff);
  return new Uint8Array(out);
}

/** Builds a GIF from frames of the same size. `delayMs` is the time each frame shows; 0 frames loop forever. */
export class GifWriter {
  private parts: Uint8Array[] = [];
  private width: number;
  private height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const head = new Uint8Array(13 + PALETTE.length + 19);
    const v = new DataView(head.buffer);
    head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    v.setUint16(6, width, true);
    v.setUint16(8, height, true);
    head[10] = 0xf7; // global colour table, 256 entries
    head.set(PALETTE, 13);
    // Netscape extension: loop forever.
    head.set([0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00], 13 + PALETTE.length);
    this.parts.push(head);
  }

  addFrame(img: ImageData, delayMs: number) {
    const gce = new Uint8Array([0x21, 0xf9, 0x04, 0x00, 0, 0, 0x00, 0x00]);
    const cs = Math.round(delayMs / 10);
    gce[4] = cs & 0xff;
    gce[5] = cs >> 8;
    const desc = new Uint8Array(10);
    const dv = new DataView(desc.buffer);
    desc[0] = 0x2c;
    dv.setUint16(5, this.width, true);
    dv.setUint16(7, this.height, true);
    const data = lzw(toIndexes(img));
    // Image data goes in sub-blocks of at most 255 bytes.
    const blocks: number[] = [8];
    for (let k = 0; k < data.length; k += 255) {
      const chunk = data.subarray(k, k + 255);
      blocks.push(chunk.length, ...chunk);
    }
    blocks.push(0);
    this.parts.push(gce, desc, new Uint8Array(blocks));
  }

  finish(): Blob {
    this.parts.push(new Uint8Array([0x3b]));
    return new Blob(this.parts as BlobPart[], { type: 'image/gif' });
  }
}

/** A single still GIF. */
export function encodeGif(img: ImageData): Blob {
  const gif = new GifWriter(img.width, img.height);
  gif.addFrame(img, 0);
  return gif.finish();
}
