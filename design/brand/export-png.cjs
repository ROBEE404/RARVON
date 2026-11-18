// Renders the Rarvon logo SVGs to PNG at every size apps and browsers use,
// and packs a Windows .ico. Run from the project root:
//   node design/brand/export-png.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'rarvon-final');
const SVG = path.join(DIR, 'svg');
const PNG = path.join(DIR, 'png');

const JOBS = [
  ['rarvon-app-icon', [16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024]],
  ['rarvon-app-icon-maskable', [192, 512]],
  ['rarvon-mark-for-dark', [32, 64, 128, 256, 512, 1024]],
  ['rarvon-mark-for-light', [32, 64, 128, 256, 512, 1024]],
];

(async () => {
  fs.mkdirSync(PNG, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, sizes] of JOBS) {
    const svg = fs.readFileSync(path.join(SVG, `${name}.svg`), 'utf8');
    for (const s of sizes) {
      await page.setViewportSize({ width: s, height: s });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
      await page.screenshot({ path: path.join(PNG, `${name}-${s}.png`), omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
    }
  }
  await browser.close();

  // Windows .ico: PNG images inside (supported since Vista), 16–256 px.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => fs.readFileSync(path.join(PNG, `rarvon-app-icon-${s}.png`)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s % 256, e);
    header.writeUInt8(s % 256, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  fs.writeFileSync(path.join(DIR, 'rarvon.ico'), Buffer.concat([header, ...images]));
  console.log(`${fs.readdirSync(PNG).length} PNGs and rarvon.ico written to ${DIR}`);
})();
