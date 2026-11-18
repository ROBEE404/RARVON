import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { test, expect, upload, download, openTool, makePdf, imageSize, pdfText } from './helpers';

/** Developer, text and utility tools, plus remaining format/interaction gaps. */

const main = (page: Page) => page.locator('main');
const result = (page: Page) => page.locator('main pre').first();

test.describe('developer tools', () => {
  test('JSON formatter: indent options and parse errors', async ({ page }) => {
    await page.goto('/tools/developer/json-formatter');
    await page.getByLabel('Paste JSON').fill('{"a":1,"b":[true,null,"ü"]}');
    await page.getByRole('button', { name: 'Format' }).click();
    await expect(result(page)).toHaveText('{\n  "a": 1,\n  "b": [\n    true,\n    null,\n    "ü"\n  ]\n}');
    await page.getByLabel('Indent').selectOption({ label: 'Tab' });
    await page.getByRole('button', { name: 'Format' }).click();
    await expect(result(page)).toHaveText('{\n\t"a": 1,\n\t"b": [\n\t\ttrue,\n\t\tnull,\n\t\t"ü"\n\t]\n}');
    await page.getByLabel('Paste JSON').fill('{"a": 1,\n "b": }');
    await page.getByRole('button', { name: 'Format' }).click();
    await expect(page.getByRole('alert')).toContainText("Couldn't parse JSON");
  });

  test('JSON minifier', async ({ page }) => {
    await page.goto('/tools/developer/json-minifier');
    await page.getByLabel('Paste JSON').fill('{\n  "a": 1,\n  "b": [ 2, 3 ]\n}');
    await page.getByRole('button', { name: 'Minify' }).click();
    await expect(result(page)).toHaveText('{"a":1,"b":[2,3]}');
  });

  test('Base64: UTF-8 text round-trip, URL-safe input, binary output', async ({ page }) => {
    await page.goto('/tools/developer/base64');
    const box = page.getByPlaceholder('Text or Base64 to convert');
    await box.fill('مرحبا Rarvon ✓');
    await page.getByRole('button', { name: 'Encode' }).click();
    const encoded = Buffer.from('مرحبا Rarvon ✓').toString('base64');
    await expect(result(page)).toHaveText(encoded);
    await box.fill(encoded);
    await page.getByRole('button', { name: 'Decode' }).click();
    await expect(result(page)).toHaveText('مرحبا Rarvon ✓');
    // URL-safe alphabet, no padding
    await box.fill(Buffer.from('subjects?_d=1&x=~').toString('base64url'));
    await page.getByRole('button', { name: 'Decode' }).click();
    await expect(result(page)).toHaveText('subjects?_d=1&x=~');
    // Binary data (PNG header) is offered as a file instead of an error
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
    await box.fill(png.toString('base64'));
    await page.getByRole('button', { name: 'Decode', exact: true }).click();
    const out = await download(page, 'Download decoded file');
    expect(out.buffer.equals(png)).toBe(true);
    await box.fill('not base64 at all!!');
    await page.getByRole('button', { name: 'Decode', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('valid Base64');
  });

  test('Base64: encode a file', async ({ page }) => {
    await page.goto('/tools/developer/base64');
    await page.getByRole('button', { name: 'file' }).click();
    const data = Buffer.from('hello file');
    await upload(page, { name: 'a.txt', mimeType: 'text/plain', buffer: data });
    const out = await download(page, 'Download .base64.txt');
    expect(out.buffer.toString()).toBe(data.toString('base64'));
  });

  test('URL encoder/decoder', async ({ page }) => {
    await page.goto('/tools/developer/url-encode');
    const box = page.locator('main textarea');
    await box.fill('a b&c=د');
    await page.getByRole('button', { name: 'Encode' }).click();
    await expect(result(page)).toHaveText(encodeURIComponent('a b&c=د'));
    await box.fill('%E0%A4%A');
    await page.getByRole('button', { name: 'Decode' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('UUID generator', async ({ page }) => {
    await page.goto('/tools/developer/uuid');
    await page.locator('main input[type=number]').fill('10');
    await page.getByRole('button', { name: 'Generate' }).click();
    const ids = (await result(page).innerText()).split('\n');
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('hash generator matches Node for text and files', async ({ page }) => {
    await page.goto('/tools/developer/hash');
    const text = 'Rarvon ✓ مرحبا';
    await page.locator('main textarea').fill(text);
    await page.getByRole('button', { name: 'Generate hashes' }).click();
    for (const [algo, node] of [['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-512', 'sha512']] as const) {
      await expect(main(page)).toContainText(createHash(node).update(text).digest('hex'), { useInnerText: true });
      void algo;
    }
    await page.getByRole('button', { name: 'file' }).click();
    const pdf = await makePdf({ pages: 1 });
    await upload(page, pdf);
    await expect(main(page)).toContainText(createHash('sha256').update(pdf.buffer).digest('hex'));
  });

  test('timestamp converter', async ({ page }) => {
    await page.goto('/tools/developer/timestamp');
    await page.locator('main input').first().fill('1700000000');
    await expect(main(page)).toContainText('2023-11-14T22:13:20.000Z');
    await page.locator('main select').selectOption('milliseconds');
    await page.locator('main input').first().fill('1700000000123');
    await expect(main(page)).toContainText('2023-11-14T22:13:20.123Z');
  });

  test('color converter', async ({ page }) => {
    await page.goto('/tools/developer/color');
    await page.getByPlaceholder('#5b56e8').fill('#ff8000');
    await expect(main(page)).toContainText('rgb(255, 128, 0)');
    await expect(main(page)).toContainText('hsl(30, 100%, 50%)');
    await page.getByPlaceholder('#5b56e8').fill('#zzz');
    await expect(main(page)).toContainText('Enter a valid hex color');
  });

  test('JWT decoder', async ({ page }) => {
    await page.goto('/tools/developer/jwt-decoder');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '42', name: 'مستخدم', exp: 1700000000 })}.sig`;
    await page.getByLabel('Paste a JWT').fill(token);
    await expect(main(page)).toContainText('"alg": "HS256"');
    await expect(main(page)).toContainText('"name": "مستخدم"');
    await expect(main(page)).toContainText('Tue, 14 Nov 2023 22:13:20 GMT');
    await page.getByLabel('Paste a JWT').fill('garbage');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('regex tester', async ({ page }) => {
    await page.goto('/tools/developer/regex-tester');
    await expect(main(page)).toContainText('2 matches');
    await page.getByLabel('Pattern').fill('(\\w+)@(\\w+)');
    await expect(main(page)).toContainText('Capture groups');
    await page.getByLabel('Pattern').fill('([a-');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('text tools', () => {
  test('word counter (English and Arabic)', async ({ page }) => {
    await page.goto('/tools/text/word-counter');
    await expect(main(page)).toContainText('0 min');
    await page.locator('main textarea').fill('Hello world. How are you?\n\nمرحبا بالعالم؟ كيف حالك');
    const stat = (label: string) => main(page).locator('div', { has: page.getByText(label, { exact: true }) }).last();
    await expect(stat('Words')).toContainText('9');
    await expect(stat('Sentences')).toContainText('3');
    await expect(stat('Paragraphs')).toContainText('2');
  });

  test('case converter handles accented letters', async ({ page }) => {
    await page.goto('/tools/text/case-converter');
    await page.locator('main textarea').fill('élan vital and café au lait. second sentence');
    const box = (label: string) => main(page).locator('p.min-h-5').nth(['UPPERCASE', 'lowercase', 'Title Case', 'Sentence case', 'camelCase', 'snake_case'].indexOf(label));
    await expect(box('Title Case')).toHaveText('Élan Vital And Café Au Lait. Second Sentence');
    await expect(box('Sentence case')).toHaveText('Élan vital and café au lait. Second sentence');
    await expect(box('camelCase')).toHaveText('élanVitalAndCaféAuLaitSecondSentence');
    await expect(box('snake_case')).toHaveText('élan_vital_and_café_au_lait_second_sentence');
    await expect(box('UPPERCASE')).toHaveText('ÉLAN VITAL AND CAFÉ AU LAIT. SECOND SENTENCE');
  });

  test('text cleaner', async ({ page }) => {
    await page.goto('/tools/text/text-cleaner');
    await page.locator('main textarea').fill('  a   b​ \n\n\n\n  c  ');
    await expect(result(page)).toHaveText('a b\n\nc');
  });

  test('remove duplicate lines', async ({ page }) => {
    await page.goto('/tools/text/dedupe');
    await page.locator('main textarea').fill('apple\nBanana\napple \nbanana\ncherry');
    await page.getByRole('switch', { name: 'Ignore case' }).click();
    await expect(result(page)).toHaveText('apple\nBanana\ncherry');
    await expect(main(page)).toContainText('2 duplicate lines removed');
  });

  test('line sorter uses natural order', async ({ page }) => {
    await page.goto('/tools/text/sort-lines');
    await page.locator('main textarea').fill('item10\nitem2\nItem1\n\nbanana');
    await expect(result(page)).toHaveText('banana\nItem1\nitem2\nitem10');
    await page.getByRole('radio', { name: 'Numeric' }).click();
    await page.locator('main textarea').fill('10\n9.5\n-2\n100');
    await expect(result(page)).toHaveText('-2\n9.5\n10\n100');
  });
});

test.describe('utilities', () => {
  test('QR code encodes the text', async ({ page }) => {
    await page.goto('/tools/utilities/qr');
    await page.getByLabel('Text or URL').fill('https://bench.example/مرحبا');
    const out = await download(page, 'Download PNG');
    expect(out.buffer.subarray(1, 4).toString()).toBe('PNG');
    const size = await imageSize(page, out.buffer, 'image/png');
    expect(size.width).toBe(320);
    // Decode with the browser's BarcodeDetector where available (Chromium on some platforms).
    const decoded = await page.evaluate(async (b64) => {
      const Detector = (globalThis as unknown as { BarcodeDetector?: new (o: object) => { detect(i: ImageBitmapSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!Detector) return null;
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
      try {
        return (await new Detector({ formats: ['qr_code'] }).detect(bmp))[0]?.rawValue ?? '';
      } catch {
        return null;
      }
    }, out.buffer.toString('base64'));
    if (decoded !== null) expect(decoded).toBe('https://bench.example/مرحبا');
  });

  test('password generator follows the settings', async ({ page }) => {
    await page.goto('/tools/utilities/password');
    const pw = page.locator('main p.font-mono');
    await page.locator('main input[type=range]').fill('12');
    await page.getByLabel('Symbols (!@#…)').uncheck();
    for (let i = 0; i < 20; i++) {
      await page.getByRole('button', { name: 'Generate new password' }).click();
      const value = (await pw.innerText()).trim();
      expect(value).toHaveLength(12);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).not.toMatch(/[^A-Za-z0-9]/);
    }
  });

  test('random numbers: range, uniqueness, errors', async ({ page }) => {
    await page.goto('/tools/utilities/random-number');
    const [min, max, count] = [0, 1, 2].map((i) => page.locator('main input[type=number]').nth(i));
    await min.fill('1');
    await max.fill('20');
    await count.fill('20');
    await page.getByLabel('Allow duplicate values').uncheck();
    await page.getByRole('button', { name: 'Generate' }).click();
    const nums = (await main(page).locator('span.font-mono, div > span').allInnerTexts()).map(Number).filter((n) => !Number.isNaN(n));
    const generated = nums.slice(-20);
    expect(new Set(generated).size).toBe(20);
    for (const n of generated) expect(n >= 1 && n <= 20).toBe(true);
    await count.fill('21');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByRole('alert')).toContainText('too small');
  });

  test('File Compressor: renamed entries and compression level', async ({ page }) => {
    await openTool(page, '/tools/utilities/archive');
    const text = { name: 'report.txt', mimeType: 'text/plain', buffer: Buffer.from('lorem ipsum '.repeat(5000)) };
    await upload(page, text);
    await page.getByLabel('Name for report.txt').fill('docs/final.txt');
    await page.getByRole('button', { name: 'Create ZIP' }).click();
    const zip = await JSZip.loadAsync((await download(page)).buffer);
    expect(Object.keys(zip.files)).toContain('docs/final.txt');
    expect(await zip.file('docs/final.txt')!.async('string')).toBe(text.buffer.toString());
  });
});

test.describe('remaining format and interaction gaps', () => {
  test('image converter reads SVG, GIF and BMP and writes AVIF/WebP/PNG/JPEG', async ({ page }) => {
    await openTool(page, '/tools/image/convert');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#3a6"/><text x="10" y="60" font-size="40">Hi</text></svg>');
    await upload(page, { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: svg });
    await page.getByLabel('Output width').fill('400');
    await page.getByLabel('Output height').fill('200');
    await page.getByRole('radio', { name: 'PNG', exact: true }).click();
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    let out = await download(page);
    expect(await imageSize(page, out.buffer, 'image/png')).toEqual({ width: 400, height: 200 });

    // GIF and BMP made by the browser… GIF isn't encodable by canvas, so use tiny handmade files.
    const gif = Buffer.from('R0lGODlhAgACAIAAAP8AAP///ywAAAAAAgACAAACAoRRADs=', 'base64'); // 2×2 red GIF
    const bmp = Buffer.from('Qk1GAAAAAAAAADYAAAAoAAAAAgAAAAIAAAABABgAAAAAABAAAAATCwAAEwsAAAAAAAAAAAAAAAD/AAD/AAAAAP8AAP8AAA==', 'base64'); // 2×2 BMP
    for (const [name, mimeType, buffer] of [['a.gif', 'image/gif', gif], ['b.bmp', 'image/bmp', bmp]] as const) {
      await page.getByRole('button', { name: 'Remove' }).click();
      await upload(page, { name, mimeType, buffer });
      await page.getByRole('radio', { name: 'PNG', exact: true }).click();
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      out = await download(page);
      expect(await imageSize(page, out.buffer, 'image/png'), name).toEqual({ width: 2, height: 2 });
    }
    await expect(page.getByRole('radiogroup', { name: 'Convert to' }).getByRole('radio', { name: 'WebP', exact: true })).toBeVisible();
  });

  test('reorder PDF pages by dragging', async ({ page }) => {
    await openTool(page, '/tools/pdf/reorder');
    await upload(page, await makePdf({ pages: 3 }));
    const items = page.locator('[data-page-index], main li, main [draggable], main .cursor-grab');
    await expect(items.first()).toBeVisible();
    const first = (await items.nth(0).boundingBox())!;
    const third = (await items.nth(2).boundingBox())!;
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(third.x + third.width / 2 + 5, third.y + third.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Save reordered PDF' }).click();
    const text = (await pdfText((await download(page)).buffer)).map((t) => t.trim());
    expect(text).toHaveLength(3);
    expect(text).not.toEqual(['Page 1', 'Page 2', 'Page 3']);
    expect([...text].sort()).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  test('image resize: social preset crops to fill instead of stretching', async ({ page }) => {
    await openTool(page, '/tools/image/resize');
    // Left half red, right half blue, 1600×1200 (4:3).
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 1200;
      const x = c.getContext('2d')!;
      x.fillStyle = '#ff0000';
      x.fillRect(0, 0, 800, 1200);
      x.fillStyle = '#0000ff';
      x.fillRect(800, 0, 800, 1200);
      x.fillStyle = '#00ff00';
      x.fillRect(0, 0, 150, 1200); // green strip that a center crop must remove
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    await upload(page, { name: 'halves.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await page.getByRole('button', { name: 'Advanced' }).click();
    await page.getByRole('button', { name: 'Instagram square' }).click();
    await expect(page.getByLabel('Fit')).toHaveValue('cover');
    await page.getByRole('button', { name: 'Resize image' }).click();
    const out = await download(page, 'Download result');
    const mime = out.name.endsWith('png') ? 'image/png' : out.name.endsWith('webp') ? 'image/webp' : 'image/jpeg';
    expect(await imageSize(page, out.buffer, mime)).toEqual({ width: 1080, height: 1080 });
    const leftPixel = await page.evaluate(async ({ b64, mime }) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: mime }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d')!;
      x.drawImage(bmp, 0, 0);
      return Array.from(x.getImageData(5, 540, 1, 1).data.slice(0, 3));
    }, { b64: out.buffer.toString('base64'), mime });
    // Cropped 4:3 → 1:1 keeps the center: the green strip at the far left is gone, red remains.
    expect(leftPixel[0]).toBeGreaterThan(200);
    expect(leftPixel[1]).toBeLessThan(60);
  });
});
