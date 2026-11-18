/**
 * Savers for icon, PostScript, Photoshop and OpenDocument files: ICO, ICNS,
 * EPS, PS, PSD and ODG. All written here, no libraries (ODG uses JSZip, which
 * Rarvon already has).
 */

/** The picture scaled into a square of `size` pixels (kept in proportion, centred, transparent around). */
function squareCanvas(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const s = Math.min(size / src.width, size / src.height);
  const w = Math.round(src.width * s);
  const h = Math.round(src.height * s);
  g.drawImage(src, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  return c;
}

function bytesOf(c: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : reject(new Error('Encoding failed'))), type, quality));
}

/** ICO: Windows icon with 16, 32, 48, 64, 128 and 256 px versions (each stored as PNG). */
export async function encodeIco(src: HTMLCanvasElement): Promise<Blob> {
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map((s) => bytesOf(squareCanvas(src, s), 'image/png')));
  const head = new Uint8Array(6 + sizes.length * 16);
  const v = new DataView(head.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, sizes.length, true);
  let offset = head.length;
  sizes.forEach((s, k) => {
    const e = 6 + k * 16;
    head[e] = s === 256 ? 0 : s; // 0 means 256
    head[e + 1] = s === 256 ? 0 : s;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, pngs[k].length, true);
    v.setUint32(e + 12, offset, true);
    offset += pngs[k].length;
  });
  return new Blob([head, ...pngs] as BlobPart[], { type: 'image/x-icon' });
}

/** ICNS: Mac icon with 16 to 1024 px versions (each stored as PNG). */
export async function encodeIcns(src: HTMLCanvasElement): Promise<Blob> {
  const types: [string, number][] = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]];
  const parts: Uint8Array[] = [];
  let total = 8;
  for (const [type, size] of types) {
    const png = await bytesOf(squareCanvas(src, size), 'image/png');
    const h = new Uint8Array(8);
    for (let k = 0; k < 4; k++) h[k] = type.charCodeAt(k);
    new DataView(h.buffer).setUint32(4, png.length + 8);
    parts.push(h, png);
    total += png.length + 8;
  }
  const head = new Uint8Array(8);
  head.set([0x69, 0x63, 0x6e, 0x73]); // "icns"
  new DataView(head.buffer).setUint32(4, total);
  return new Blob([head, ...parts] as BlobPart[], { type: 'image/icns' });
}

/** ASCII85: the text encoding PostScript uses for binary data. */
function ascii85(data: Uint8Array): string {
  const out: string[] = [];
  let line = 0;
  const push = (s: string) => {
    out.push(s);
    line += s.length;
    if (line >= 72) {
      out.push('\n');
      line = 0;
    }
  };
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.min(4, data.length - i);
    let v = 0;
    for (let k = 0; k < 4; k++) v = v * 256 + (k < n ? data[i + k] : 0);
    if (v === 0 && n === 4) {
      push('z');
      continue;
    }
    const c: string[] = [];
    for (let k = 0; k < 5; k++) {
      c.unshift(String.fromCharCode((v % 85) + 33));
      v = Math.floor(v / 85);
    }
    push(c.slice(0, n + 1).join(''));
  }
  return out.join('') + '~>';
}

/**
 * EPS or PS: the picture as PostScript, with the JPEG embedded as-is. EPS has
 * a tight bounding box for placing into documents; PS is a printable page the
 * size of the picture.
 */
export async function encodePostScript(src: HTMLCanvasElement, eps: boolean): Promise<Blob> {
  const flat = document.createElement('canvas');
  flat.width = src.width;
  flat.height = src.height;
  const g = flat.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, flat.width, flat.height);
  g.drawImage(src, 0, 0);
  const jpeg = await bytesOf(flat, 'image/jpeg', 0.92);
  const { width: w, height: h } = flat;
  const header = eps
    ? `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${w} ${h}\n%%HiResBoundingBox: 0 0 ${w} ${h}\n`
    : `%!PS-Adobe-3.0\n%%BoundingBox: 0 0 ${w} ${h}\n%%Pages: 1\n`;
  const body = [
    header,
    '%%Creator: Rarvon\n%%LanguageLevel: 2\n%%EndComments\n',
    eps ? '' : `%%Page: 1 1\n<< /PageSize [${w} ${h}] >> setpagedevice\n`,
    'gsave\n',
    `${w} ${h} scale\n`,
    '/DeviceRGB setcolorspace\n',
    `<< /ImageType 1 /Width ${w} /Height ${h} /BitsPerComponent 8 /Decode [0 1 0 1 0 1]`,
    ` /ImageMatrix [${w} 0 0 -${h} 0 ${h}] /DataSource currentfile /ASCII85Decode filter /DCTDecode filter >> image\n`,
    ascii85(jpeg),
    '\ngrestore\n',
    eps ? '' : 'showpage\n',
    '%%EOF\n',
  ].join('');
  return new Blob([body], { type: 'application/postscript' });
}

/** PSD: a Photoshop file holding the picture as one flattened image (RGB with transparency). */
export function encodePsd(img: ImageData): Blob {
  const { width: w, height: h, data } = img;
  const n = w * h;
  // Header (26) + empty colour-mode data, image resources and layer info (3 × 4) + compression (2).
  const head = new Uint8Array(26 + 12 + 2);
  const v = new DataView(head.buffer);
  head.set([0x38, 0x42, 0x50, 0x53]); // "8BPS"
  v.setUint16(4, 1); // version 1
  v.setUint16(12, 4); // channels: R, G, B, A
  v.setUint32(14, h);
  v.setUint32(18, w);
  v.setUint16(22, 8); // bits per channel
  v.setUint16(24, 3); // RGB
  v.setUint16(38, 0); // raw image data
  const planes = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    planes[i] = data[i * 4];
    planes[n + i] = data[i * 4 + 1];
    planes[2 * n + i] = data[i * 4 + 2];
    planes[3 * n + i] = data[i * 4 + 3];
  }
  return new Blob([head, planes] as BlobPart[], { type: 'image/vnd.adobe.photoshop' });
}

/** ODG: a LibreOffice Draw document with the picture on a page of its own size. */
export async function encodeOdg(src: HTMLCanvasElement): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const png = await bytesOf(src, 'image/png');
  // Page size in centimetres at 96 dpi.
  const cm = (px: number) => `${((px / 96) * 2.54).toFixed(3)}cm`;
  const W = cm(src.width);
  const H = cm(src.height);
  const ns = [
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
    'xmlns:xlink="http://www.w3.org/1999/xlink"',
  ].join(' ');
  const zip = new JSZip();
  // The first entry must be the uncompressed mimetype.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.graphics', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
    ' <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.graphics"/>',
    ' <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
    ' <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
    ' <manifest:file-entry manifest:full-path="Pictures/picture.png" manifest:media-type="image/png"/>',
    '</manifest:manifest>',
  ].join('\n'));
  zip.file('styles.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<office:document-styles ${ns} office:version="1.2">`,
    ' <office:automatic-styles>',
    `  <style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${W}" fo:page-height="${H}"/></style:page-layout>`,
    ' </office:automatic-styles>',
    ' <office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles>',
    '</office:document-styles>',
  ].join('\n'));
  zip.file('content.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<office:document-content ${ns} office:version="1.2">`,
    ' <office:body><office:drawing>',
    '  <draw:page draw:name="page1" draw:master-page-name="Default">',
    `   <draw:frame svg:x="0cm" svg:y="0cm" svg:width="${W}" svg:height="${H}"><draw:image xlink:href="Pictures/picture.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`,
    '  </draw:page>',
    ' </office:drawing></office:body>',
    '</office:document-content>',
  ].join('\n'));
  zip.file('Pictures/picture.png', png);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.graphics' });
}
