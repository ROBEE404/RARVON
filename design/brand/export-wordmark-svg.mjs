// Builds the full Rarvon logo as SVG with the RARVON letters turned into
// shapes (Syne ExtraBold), so the files look right in any program, with no
// font installed. Run from the project root:
//   node design/brand/export-wordmark-svg.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

const ROOT = process.cwd();
const DIR = join(ROOT, 'design', 'brand', 'rarvon-final', 'svg');
const fontFile = join(ROOT, 'node_modules', '@fontsource', 'syne', 'files', 'syne-latin-800-normal.woff');
const buf = readFileSync(fontFile);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const SIZE = 58; // letter size, same as the PNG logos
const MARK = 112; // raven size
const GAP = 18;
const PAD = 8;
const SPACING = 0.08; // letter spacing, in em

const path = font.getPath('RARVON', 0, 0, SIZE, { letterSpacing: SPACING });
const box = path.getBoundingBox();
const textW = box.x2 - box.x1;
const textH = box.y2 - box.y1;
const W = Math.ceil(PAD + MARK + GAP + textW + PAD);
const H = MARK + PAD * 2;
// Centre the capitals on the raven, like the PNG logos.
const dx = PAD + MARK + GAP - box.x1;
const dy = PAD + MARK / 2 - (box.y1 + textH / 2);
const letters = font.getPath('RARVON', dx, dy, SIZE, { letterSpacing: SPACING }).toPathData(2);

for (const [mode, color] of [['light', '#1b1b22'], ['dark', '#f1f0f5']]) {
  const mark = readFileSync(join(DIR, `rarvon-mark-for-${mode}.svg`), 'utf8')
    .replace('<svg xmlns="http://www.w3.org/2000/svg" ', `<svg x="${PAD}" y="${PAD}" width="${MARK}" height="${MARK}" `);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${mark.trim()}<path d="${letters}" fill="${color}"/></svg>\n`;
  writeFileSync(join(DIR, `rarvon-logo-for-${mode}.svg`), svg);
}
console.log(`Full logos written: ${W} x ${H}`);
