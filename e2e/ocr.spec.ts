import type { Page } from '@playwright/test';

/** How long a recognition may take in a busy test run (alone, it takes seconds). */
const OCR_WAIT = 60_000;
import { test, expect, openTool, upload } from './helpers';

/**
 * Image → Text runs real OCR (Tesseract WASM) in the production build. Test
 * images are rendered in the browser with system fonts, optionally degraded
 * (tilt, noise, JPEG) to stand in for screenshots, scans and photos.
 * Thresholds are character error rates measured during development with
 * headroom, so a regression in preprocessing or engine settings fails here.
 */

const ARABIC = [
  'يُعدّ التعليم من أهم ركائز التنمية في المجتمعات الحديثة،',
  'إذ يسهم في بناء الإنسان وتطوير قدراته العلمية والعملية.',
  'وقد شهدت السنوات الأخيرة تطورًا كبيرًا في وسائل التعلّم الإلكتروني؛',
  'فهل نستطيع مواكبة هذا التغيير؟',
];
const MIXED = [
  'يعمل تطبيق Rarvon على متصفح Chrome و Firefox بدون إنترنت.',
  'تم إصدار النسخة 2.1 في شهر March الماضي.',
  'يدعم البرنامج ملفات PDF و PNG و JPEG.',
];
const ENGLISH = ['Invoice 4521 was issued on 12 March 2024.', 'Please contact support for further details.'];

interface RenderOpts {
  lines: string[];
  font?: string;
  size?: number;
  rtl?: boolean;
  rotate?: number;
  noise?: number;
  dark?: boolean;
  jpeg?: number;
  name?: string;
}

async function textImage(page: Page, opts: RenderOpts) {
  const b64 = await page.evaluate(async (o) => {
    const { lines, font = 'Tahoma', size = 28, rtl = true, rotate = 0, noise = 0, dark = false, jpeg } = o;
    const lh = Math.round(size * 1.8);
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 80 + lh * lines.length;
    const x = c.getContext('2d')!;
    x.fillStyle = dark ? '#1d2026' : '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = dark ? '#ece9e1' : '#111111';
    x.direction = rtl ? 'rtl' : 'ltr';
    x.textAlign = rtl ? 'right' : 'left';
    x.textBaseline = 'top';
    x.font = `${size}px "${font}"`;
    lines.forEach((l, i) => x.fillText(l, rtl ? c.width - 40 : 40, 40 + i * lh));

    const rad = (rotate * Math.PI) / 180;
    const W = Math.ceil(Math.abs(c.width * Math.cos(rad)) + Math.abs(c.height * Math.sin(rad)));
    const H = Math.ceil(Math.abs(c.width * Math.sin(rad)) + Math.abs(c.height * Math.cos(rad)));
    const o2 = document.createElement('canvas');
    o2.width = W;
    o2.height = H;
    const y = o2.getContext('2d')!;
    y.fillStyle = dark ? '#1d2026' : '#ece6d8';
    y.fillRect(0, 0, W, H);
    y.translate(W / 2, H / 2);
    y.rotate(rad);
    y.drawImage(c, -c.width / 2, -c.height / 2);
    y.setTransform(1, 0, 0, 1, 0, 0);
    if (noise) {
      const d = y.getImageData(0, 0, W, H);
      let seed = 7;
      for (let i = 0; i < d.data.length; i += 4) {
        seed = (seed * 16807) % 2147483647;
        const n = ((seed / 2147483647) - 0.5) * noise;
        d.data[i] += n;
        d.data[i + 1] += n;
        d.data[i + 2] += n;
      }
      y.putImageData(d, 0, 0);
    }
    const blob: Blob = await new Promise((r) => o2.toBlob((b) => r(b!), jpeg ? 'image/jpeg' : 'image/png', jpeg));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }, opts);
  const jpeg = Boolean(opts.jpeg);
  return { name: opts.name ?? (jpeg ? 'photo.jpg' : 'screenshot.png'), mimeType: jpeg ? 'image/jpeg' : 'image/png', buffer: Buffer.from(b64, 'base64') };
}

function cer(ref: string, out: string) {
  const norm = (s: string) => [...s.replace(/[ً-ْـ]/g, '').replace(/\s+/g, ' ').trim()];
  const a = norm(ref);
  const b = norm(out);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return (prev[b.length] / a.length) * 100;
}

const textarea = (page: Page) => page.getByRole('textbox', { name: 'Extracted text (editable)' });

async function extracted(page: Page) {
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0, { timeout: OCR_WAIT });
  await expect(textarea(page)).not.toHaveValue('', { timeout: OCR_WAIT });
  return textarea(page).inputValue();
}

async function chooseLanguage(page: Page, code: string, withEnglish: boolean) {
  await page.getByLabel('Language of the text').selectOption(code);
  const box = page.getByLabel('Also contains English');
  if (await box.count()) await box.setChecked(withEnglish);
}

test.describe('Image to Text (OCR)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Arabic paragraph screenshot', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'ara', true);
    await upload(page, await textImage(page, { lines: ARABIC }));
    expect(cer(ARABIC.join(' '), await extracted(page))).toBeLessThan(3);
  });

  test('mixed Arabic and English keeps both scripts and per-line direction', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'ara', true);
    await upload(page, await textImage(page, { lines: MIXED, font: 'Segoe UI' }));
    const text = await extracted(page);
    expect(cer(MIXED.join(' '), text)).toBeLessThan(4);
    for (const w of ['Rarvon', 'Chrome', 'Firefox', 'PDF', 'JPEG', 'تطبيق', 'الماضي']) expect(text).toContain(w);
    expect(text).not.toMatch(/[‎‏]/); // no invisible bidi marks in copied text
    expect(await textarea(page).evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('plaintext');
    expect(await textarea(page).getAttribute('dir')).toBe('auto');
  });

  test('tilted, noisy photo (JPEG) is straightened', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'ara', true);
    await upload(page, await textImage(page, { lines: ARABIC, rotate: 4, noise: 50, jpeg: 0.6 }));
    expect(cer(ARABIC.join(' '), await extracted(page))).toBeLessThan(6);
  });

  test('dark-mode screenshot', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'ara', true);
    await upload(page, await textImage(page, { lines: MIXED, font: 'Segoe UI', dark: true }));
    expect(cer(MIXED.join(' '), await extracted(page))).toBeLessThan(5);
  });

  test('sideways image: rotate, then re-run', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'eng', false);
    await upload(page, await textImage(page, { lines: ENGLISH, rtl: false, font: 'Arial', rotate: 90 }));
    await expect(page.getByRole('button', { name: 'Re-run OCR' })).toBeVisible({ timeout: OCR_WAIT });
    await page.getByRole('button', { name: 'Rotate image left' }).click();
    await expect(page.getByText(/Settings changed/)).toBeVisible();
    await page.getByRole('button', { name: 'Re-run OCR' }).click();
    await expect.poll(async () => cer(ENGLISH.join(' '), await textarea(page).inputValue()), { timeout: OCR_WAIT }).toBeLessThan(3);
  });

  test('paste an image with Ctrl+V, then copy, search and download', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'eng', false);
    const img = await textImage(page, { lines: ENGLISH, rtl: false, font: 'Arial' });
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, img.buffer.toString('base64'));
    const text = await extracted(page);
    expect(text).toContain('Invoice 4521');
    await expect(page.getByText(/pasted-image\.png/)).toBeVisible();

    await page.getByRole('button', { name: 'Copy all' }).click();
    const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    expect(lines(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(lines(text));

    await page.getByLabel('Search in extracted text').fill('march');
    await expect(page.getByText('1/1')).toBeVisible();

    await textarea(page).fill('Edited by hand');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .txt' }).click()]);
    expect(dl.suggestedFilename()).toBe('pasted-image.txt');
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(await dl.path(), 'utf8')).toBe('Edited by hand');
  });

  test('works without contacting any other host (local-first)', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(r.url());
    });
    await openTool(page, '/tools/image/to-text');
    await chooseLanguage(page, 'fas', true);
    await upload(page, await textImage(page, { lines: ['این یک متن آزمایشی برای تشخیص نوشتار فارسی است.'] }));
    expect(await extracted(page)).toContain('فارسی');
    expect(external).toEqual([]);
  });

  test('a non-image file is rejected with a message', async ({ page }) => {
    await openTool(page, '/tools/image/to-text');
    await upload(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByRole('alert')).toContainText('isn’t an image');
  });
});
