// Renders the full Rarvon logo (mark + RARVON in Syne ExtraBold) to PNG, for
// light and dark backgrounds, transparent. The font is loaded in the headless
// browser only while drawing. Run from the project root:
//   node design/brand/export-wordmark.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'rarvon-final');
const OUT = path.join(DIR, 'png');
const mark = (n) => fs.readFileSync(path.join(DIR, 'svg', `rarvon-mark-for-${n}.svg`), 'utf8').replace('<svg ', '<svg width="112" height="112" ');

(async () => {
  const browser = await chromium.launch();
  for (const scale of [1, 2, 4]) {
    const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 560, height: 128 } });
    for (const [mode, color] of [['light', '#1b1b22'], ['dark', '#f1f0f5']]) {
      await page.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@800&display=block"></head>
<body style="margin:0;background:transparent"><div id="l" style="display:inline-flex;align-items:center;gap:18px;padding:8px">
${mark(mode)}<span style="font:800 58px Syne;letter-spacing:.08em;color:${color};line-height:1">RARVON</span></div></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const ok = await page.evaluate(() => document.fonts.check('800 58px Syne'));
      if (!ok) throw new Error('Syne did not load');
      await page.locator('#l').screenshot({ path: path.join(OUT, `rarvon-logo-for-${mode}@${scale}x.png`), omitBackground: true });
    }
    await page.close();
  }
  await browser.close();
  console.log('Full logos written (light and dark, 1x 2x 4x).');
})();
