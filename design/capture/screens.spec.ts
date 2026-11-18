import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test as base, expect, upload, makePdf, makeImage, makeWebm, makeWav } from '../../e2e/helpers';

/**
 * Photographs Rarvon's real screens for the design map (design/README.md).
 * Each picture is saved with a small JSON note: which flow it belongs to, its
 * title, its variant, and the arrows that leave it (labelled with the button
 * that leads to the next screen). `node design/build-map.mjs` turns them into
 * the canvas and the Figma pack.
 */

const OUT = join(process.cwd(), 'design', 'screens');
mkdirSync(OUT, { recursive: true });

const SITE = 'http://localhost:4321';
const DEMO = 'http://localhost:5180'; // the website with a (pretend) app download link
const APP = 'http://127.0.0.1:47821'; // Rarvon for desktop (the Rarvon Engine with FFmpeg)

type Variant = 'desktop' | 'phone' | 'arabic' | 'app' | 'download-on';
type Theme = 'light' | 'dark';

/** Every screen is taken twice: the "light" and "dark" projects in playwright.design.config.ts. */
const test = base.extend<{ theme: Theme }>({ theme: ['light', { option: true }] });
let THEME: Theme = 'light';
interface Arrow { to: string; label: string }
interface Shot { flow: string; title: string; variant?: Variant; arrows?: Arrow[]; note?: string; full?: boolean }

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const MAX_HEIGHT = 2400;

async function shot(page: Page, id: string, s: Shot) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(350);
  const vp = page.viewportSize()!;
  const full = s.full !== false;
  const docH = full ? await page.evaluate(() => document.documentElement.scrollHeight) : vp.height;
  const height = Math.min(docH, MAX_HEIGHT);
  // Dark screens get their own id, and so do the screens their arrows point to.
  const dark = THEME === 'dark';
  const fid = dark ? `${id}-dark` : id;
  await page.screenshot({
    path: join(OUT, `${fid}.png`),
    fullPage: full,
    clip: { x: 0, y: 0, width: vp.width, height },
    animations: 'disabled',
    caret: 'hide',
  });
  const arrows = (s.arrows ?? []).map((a) => ({ ...a, to: dark ? `${a.to}-dark` : a.to }));
  writeFileSync(join(OUT, `${fid}.json`), JSON.stringify({ variant: 'desktop', ...s, id: fid, base: id, theme: THEME, arrows, width: vp.width, height, url: page.url() }, null, 1));
}

async function prefs(page: Page, site: string, o: { lang?: 'ar' | 'en' }) {
  await page.goto(site + '/');
  await page.evaluate(({ theme, lang }) => {
    localStorage.setItem('bench-theme', theme);
    localStorage.setItem('bench-lang', lang ?? 'en');
  }, { theme: THEME, lang: o.lang });
}

async function textImage(page: Page) {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 420;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.font = '44px Arial';
    ['Invoice 2041 — Rarvon Supplies', 'Total due: 1,250.00 EUR', 'Paid by bank transfer on 3 May'].forEach((l, i) => g.fillText(l, 60, 110 + i * 100));
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'invoice.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

const SAMPLE_TEXT = 'Rarvon is a free toolbox for everyday files.\nIt runs on your device, so nothing is uploaded.\n\nNo ads. No account. Just the tools.';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: DESKTOP, serviceWorkers: 'block' });

test.beforeEach(async ({ page, theme }) => {
  THEME = theme;
  await prefs(page, SITE, {});
});

test('finding tools', async ({ page }) => {
  await page.goto(SITE + '/');
  await shot(page, 'home', { flow: 'finding', title: 'Home', arrows: [
    { to: 'search', label: 'Search box or Ctrl+K' }, { to: 'menu', label: 'All tools' }, { to: 'category-pdf', label: 'A category card' },
    { to: 'action-convert', label: 'All Convert tools' }, { to: 'convert-image-empty', label: 'A tool name' }, { to: 'about', label: 'About (top bar)' },
    { to: 'support', label: 'Support Rarvon' },
  ] });
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search tools' }).getByRole('textbox').fill('merge');
  await shot(page, 'search', { flow: 'finding', title: 'Search', full: false, arrows: [{ to: 'merge-empty', label: 'Enter on Merge PDF' }] });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'All tools' }).click();
  await shot(page, 'menu', { flow: 'finding', title: 'All tools menu', full: false, arrows: [{ to: 'category-pdf', label: 'PDF' }, { to: 'all-tools', label: 'Browse all tools' }] });
  await page.goto(SITE + '/tools/pdf');
  await shot(page, 'category-pdf', { flow: 'finding', title: 'Category: PDF', arrows: [{ to: 'merge-empty', label: 'Merge PDF' }, { to: 'editor-empty', label: 'PDF Editor' }] });
  await page.goto(SITE + '/convert');
  await shot(page, 'action-convert', { flow: 'finding', title: 'Convert hub', arrows: [{ to: 'convert-image-empty', label: 'Image Converter' }] });
  await page.goto(SITE + '/tools');
  await shot(page, 'all-tools', { flow: 'finding', title: 'All tools page' });
});

test('from → to converters', async ({ page }) => {
  await page.goto(SITE + '/tools/image/convert');
  await shot(page, 'convert-image-empty', { flow: 'convert', title: 'Image Converter: empty', arrows: [{ to: 'convert-image-loaded', label: 'Choose file or drop' }] });
  await upload(page, await makeImage(page, { width: 900, height: 600, name: 'holiday.png' }));
  await page.getByRole('radio', { name: 'WebP', exact: true }).click();
  await shot(page, 'convert-image-loaded', { flow: 'convert', title: 'Image Converter: file loaded', arrows: [{ to: 'convert-image-done', label: 'Convert' }] });
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.getByRole('button', { name: /Download/ }).first()).toBeVisible();
  await shot(page, 'convert-image-done', { flow: 'convert', title: 'Image Converter: done', arrows: [{ to: 'compress-image-loaded', label: 'Continue with: Image Compressor' }],
    note: 'Download saves the file. "Continue with" opens another tool with the result already loaded.' });

  await page.goto(SITE + '/tools/video/convert');
  await upload(page, await makeWebm(page, 3));
  await expect(page.getByRole('button', { name: /^Convert to/ })).toBeVisible();
  await shot(page, 'convert-video-loaded', { flow: 'convert', title: 'Video Converter: file loaded', note: 'Shows the browser-limits card: this tool is experimental on the website.' });

  await page.goto(SITE + '/tools/audio/convert');
  await upload(page, makeWav(3));
  await shot(page, 'convert-audio-loaded', { flow: 'convert', title: 'Audio Converter: file loaded' });
});

test('compressors', async ({ page }) => {
  await page.goto(SITE + '/tools/image/compress');
  await shot(page, 'compress-image-empty', { flow: 'compress', title: 'Image Compressor: empty', arrows: [{ to: 'compress-image-loaded', label: 'Choose file or drop' }] });
  await upload(page, await makeImage(page, { width: 1600, height: 1200, type: 'image/jpeg', name: 'photo.jpg' }));
  await expect(page.getByTestId('savings-ring')).toHaveAttribute('aria-label', /smaller/);
  await shot(page, 'compress-image-loaded', { flow: 'compress', title: 'Image Compressor: estimate', arrows: [{ to: 'compress-image-done', label: 'Compress' }], note: 'The ring estimates the saving before anything runs.' });
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(page.getByRole('button', { name: /Download/ }).first()).toBeVisible();
  await shot(page, 'compress-image-done', { flow: 'compress', title: 'Image Compressor: done' });

  await page.goto(SITE + '/tools/pdf/compress');
  await upload(page, await makePdf({ pages: 3 }));
  await page.waitForTimeout(800);
  await shot(page, 'compress-pdf-loaded', { flow: 'compress', title: 'Compress PDF: file loaded' });
});

test('PDF page tools', async ({ page }) => {
  await page.goto(SITE + '/tools/pdf/merge');
  await shot(page, 'merge-empty', { flow: 'pdf-pages', title: 'Merge PDF: empty', arrows: [{ to: 'merge-loaded', label: 'Choose files or drop' }] });
  await upload(page, [await makePdf({ pages: 3, label: 'Report' }), await makePdf({ pages: 2, label: 'Appendix' })]);
  await page.waitForTimeout(1200);
  await shot(page, 'merge-loaded', { flow: 'pdf-pages', title: 'Merge PDF: files loaded', arrows: [{ to: 'merge-done', label: 'Merge PDFs' }], note: 'Drag files to change the order.' });
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  await expect(page.getByRole('button', { name: /Download/ }).first()).toBeVisible();
  await shot(page, 'merge-done', { flow: 'pdf-pages', title: 'Merge PDF: done' });

  await page.goto(SITE + '/tools/pdf/rotate');
  await upload(page, await makePdf({ pages: 4 }));
  await page.waitForTimeout(1500);
  await shot(page, 'rotate-loaded', { flow: 'pdf-pages', title: 'Rotate PDF: page grid', note: 'The same page grid serves Rotate, Delete, Extract and Reorder.' });
});

test('PDF Editor', async ({ page }) => {
  await page.goto(SITE + '/tools/pdf/editor');
  await shot(page, 'editor-empty', { flow: 'pdf-editor', title: 'PDF Editor: empty', arrows: [{ to: 'editor-loaded', label: 'Choose a PDF' }] });
  await upload(page, await makePdf({ pages: 2, label: 'Contract' }));
  await expect(page.getByAltText('Page', { exact: true })).toBeVisible();
  await shot(page, 'editor-loaded', { flow: 'pdf-editor', title: 'PDF Editor: editing', full: false, note: 'Toolbar: select, text, draw, highlight, shapes, image, comment, sign, redact.' });
});

test('image editing', async ({ page }) => {
  await page.goto(SITE + '/tools/image/resize');
  await upload(page, await makeImage(page, { width: 1200, height: 800, name: 'banner.png' }));
  await page.waitForTimeout(600);
  await shot(page, 'resize-loaded', { flow: 'image-edit', title: 'Image Resizer' });
  await page.goto(SITE + '/tools/image/crop');
  await upload(page, await makeImage(page, { width: 1200, height: 800, name: 'banner.png' }));
  await expect(page.getByAltText('To crop')).toBeVisible();
  await shot(page, 'crop-loaded', { flow: 'image-edit', title: 'Image Cropper' });
});

test('AI tools', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(SITE + '/tools/image/remove-background');
  await shot(page, 'bg-empty', { flow: 'ai', title: 'Background Remover: empty', arrows: [{ to: 'bg-loaded', label: 'Choose a picture' }] });
  await upload(page, await makeImage(page, { width: 900, height: 700, name: 'product.png' }));
  await page.waitForTimeout(1200);
  await shot(page, 'bg-loaded', { flow: 'ai', title: 'Background Remover: picture loaded', note: 'Remove background downloads the AI model once, then runs on the device.' });
  await page.goto(SITE + '/tools/image/to-text');
  await shot(page, 'ocr-empty', { flow: 'ai', title: 'Image to Text: empty', arrows: [{ to: 'ocr-done', label: 'Choose a picture' }] });
  await upload(page, await textImage(page));
  await expect(page.getByRole('textbox', { name: 'Extracted text (editable)' })).not.toHaveValue('', { timeout: 90_000 });
  await shot(page, 'ocr-done', { flow: 'ai', title: 'Image to Text: text found' });
});

test('video and audio editing', async ({ page }) => {
  await page.goto(SITE + '/tools/video/trim');
  await upload(page, await makeWebm(page, 4));
  await expect(page.getByRole('button', { name: 'Trim video' })).toBeVisible();
  await shot(page, 'trim-video-loaded', { flow: 'media-edit', title: 'Trim Video' });
  await page.goto(SITE + '/tools/audio/trim');
  await upload(page, makeWav(4));
  await page.waitForTimeout(800);
  await shot(page, 'trim-audio-loaded', { flow: 'media-edit', title: 'Trim Audio' });
});

test('Video Editor', async ({ page }) => {
  await page.goto(SITE + '/tools/video/editor');
  await shot(page, 'video-editor-start', { flow: 'video-editor', title: 'Video Editor: projects', arrows: [{ to: 'video-editor-timeline', label: 'New project → Create project' }] });
  await page.getByRole('button', { name: /New project/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New video project' });
  await dialog.getByLabel('Project name').fill('Summer trip');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('video-editor')).toBeVisible();
  await page.getByTestId('editor-import').setInputFiles([await makeWebm(page, 4), await makeImage(page, { width: 1280, height: 720, name: 'title.png' })]);
  await expect(page.getByTestId('media-item')).toHaveCount(2);
  for (const b of await page.getByRole('button', { name: /^Add .* to the timeline$/ }).all()) await b.click();
  await page.waitForTimeout(800);
  await shot(page, 'video-editor-timeline', { flow: 'video-editor', title: 'Video Editor: timeline', full: false });
});

test('text and developer tools', async ({ page }) => {
  await page.goto(SITE + '/tools/text/word-counter');
  await page.locator('main textarea').fill(SAMPLE_TEXT);
  await shot(page, 'word-counter', { flow: 'text', title: 'Word Counter' });
  await page.goto(SITE + '/tools/text/case-converter');
  await page.locator('main textarea').first().fill(SAMPLE_TEXT);
  await shot(page, 'case-converter', { flow: 'text', title: 'Case Converter' });
  await page.goto(SITE + '/tools/developer/json-formatter');
  await page.getByLabel('Paste JSON').fill('{"name":"Rarvon","tools":53,"free":true,"tags":["pdf","image","video"]}');
  await page.getByRole('button', { name: 'Format' }).click();
  await shot(page, 'json-formatter', { flow: 'developer', title: 'JSON Formatter' });
  await page.goto(SITE + '/tools/developer/regex-tester');
  await shot(page, 'regex-tester', { flow: 'developer', title: 'Regex Tester' });
});

test('utilities', async ({ page }) => {
  await page.goto(SITE + '/tools/utilities/qr');
  await page.getByLabel('Text or URL').fill('https://github.com/ROBEE404');
  await shot(page, 'qr', { flow: 'utilities', title: 'QR Code Generator' });
  await page.goto(SITE + '/tools/utilities/password');
  await shot(page, 'password', { flow: 'utilities', title: 'Password Generator' });
  await page.goto(SITE + '/tools/utilities/archive');
  await upload(page, [await makePdf({ pages: 1 }), await makeImage(page, { name: 'photo.png' })]);
  await page.waitForTimeout(600);
  await shot(page, 'archive-loaded', { flow: 'utilities', title: 'File Compressor (ZIP)' });
});

test('information pages and feedback', async ({ page }) => {
  for (const [id, path, title] of [['about', '/about', 'About'], ['privacy', '/privacy', 'Privacy'], ['support', '/support', 'Support Rarvon'], ['credits', '/credits', 'Credits and licenses'], ['app-coming', '/app', 'Rarvon for desktop: coming soon'], ['not-found', '/no-such-page', 'Page not found']] as const) {
    await page.goto(SITE + path);
    await shot(page, id, { flow: 'info', title, note: id === 'app-coming' ? 'What /app shows until a download link is set.' : undefined });
  }
  await page.goto(SITE + '/tools/image/convert');
  await page.getByTestId('tool-feedback').scrollIntoViewIfNeeded();
  await page.getByTestId('tool-feedback').getByRole('button', { name: 'Report a bug' }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await shot(page, 'feedback', { flow: 'feedback', title: 'Report a bug pop-up', full: false, note: 'On every tool page and the About page. Opens GitHub, or email when one is set.' });
});

test('phone screens', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(SITE + '/');
  await shot(page, 'phone-home', { flow: 'finding', title: 'Home', variant: 'phone', arrows: [{ to: 'phone-menu', label: 'All tools' }] });
  await page.getByRole('button', { name: 'All tools' }).click();
  await shot(page, 'phone-menu', { flow: 'finding', title: 'All tools menu', variant: 'phone', full: false });
  await page.goto(SITE + '/tools/image/convert');
  await upload(page, await makeImage(page, { width: 900, height: 600, name: 'holiday.png' }));
  await shot(page, 'phone-convert-image-loaded', { flow: 'convert', title: 'Image Converter: file loaded', variant: 'phone' });
  await page.goto(SITE + '/tools/pdf/merge');
  await upload(page, [await makePdf({ pages: 2 }), await makePdf({ pages: 1 })]);
  await page.waitForTimeout(1000);
  await shot(page, 'phone-merge-loaded', { flow: 'pdf-pages', title: 'Merge PDF: files loaded', variant: 'phone' });
  await page.goto(SITE + '/tools/text/word-counter');
  await page.locator('main textarea').fill(SAMPLE_TEXT);
  await shot(page, 'phone-word-counter', { flow: 'text', title: 'Word Counter', variant: 'phone' });
  await page.goto(SITE + '/about');
  await shot(page, 'phone-about', { flow: 'info', title: 'About', variant: 'phone' });
});

test('Arabic', async ({ page }) => {
  await prefs(page, SITE, { lang: 'ar' });
  await page.goto(SITE + '/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, 'ar-home', { flow: 'finding', title: 'Home', variant: 'arabic' });
  await page.getByRole('button', { name: 'كل الأدوات' }).click().catch(() => undefined);
  await shot(page, 'ar-menu', { flow: 'finding', title: 'All tools menu', variant: 'arabic', full: false });
  await page.goto(SITE + '/tools/image/convert');
  await upload(page, await makeImage(page, { width: 900, height: 600, name: 'holiday.png' }));
  await shot(page, 'ar-convert-image-loaded', { flow: 'convert', title: 'Image Converter: file loaded', variant: 'arabic' });
  await page.goto(SITE + '/tools/pdf/merge');
  await upload(page, [await makePdf({ pages: 2 }), await makePdf({ pages: 1 })]);
  await page.waitForTimeout(1000);
  await shot(page, 'ar-merge-loaded', { flow: 'pdf-pages', title: 'Merge PDF: files loaded', variant: 'arabic' });
  await page.goto(SITE + '/tools/text/word-counter');
  await page.locator('main textarea').fill('بنش صندوق أدوات مجاني لملفاتك اليومية.\nيعمل على جهازك، فلا يُرفع أي شيء.');
  await shot(page, 'ar-word-counter', { flow: 'text', title: 'Word Counter', variant: 'arabic' });
  await page.goto(SITE + '/about');
  await shot(page, 'ar-about', { flow: 'info', title: 'About', variant: 'arabic' });
});

test('with the download link set', async ({ page }) => {
  await prefs(page, DEMO, {});
  await page.goto(DEMO + '/');
  await expect(page.getByTestId('app-button')).toBeVisible();
  await shot(page, 'dl-home', { flow: 'download', title: 'Home: App button and app card', variant: 'download-on', arrows: [{ to: 'dl-app', label: '⬇ App, or Get the app' }] });
  await page.goto(DEMO + '/tools/video/convert');
  await shot(page, 'dl-video-tool', { flow: 'download', title: 'Video tool: browser vs app card', variant: 'download-on', arrows: [{ to: 'dl-app', label: 'Get the app' }] });
  await page.goto(DEMO + '/app');
  await shot(page, 'dl-app', { flow: 'download', title: 'Download page (/app)', variant: 'download-on', note: 'Download for Windows goes to the installer on GitHub Releases.' });
});

test('Rarvon for desktop', async ({ page }) => {
  await prefs(page, APP, {});
  await page.goto(APP + '/');
  await expect.poll(() => page.evaluate(() => Boolean(window.__BENCH_APP__?.ffmpeg))).toBe(true);
  await shot(page, 'app-home', { flow: 'app', title: 'Home in the app', variant: 'app', note: 'No download links inside the app; video tools lose their Beta tag.', arrows: [{ to: 'app-convert-done', label: 'Video Converter' }] });
  await page.goto(APP + '/tools/video/convert');
  await upload(page, { name: 'holiday-2009.avi', mimeType: 'video/x-msvideo', buffer: await aviClip() });
  await page.getByRole('radio', { name: 'MP4', exact: true }).click();
  await page.getByRole('button', { name: 'Convert to MP4' }).click();
  await expect(page.getByRole('button', { name: /Download/ }).first()).toBeVisible({ timeout: 60_000 });
  await shot(page, 'app-convert-done', { flow: 'app', title: 'Video Converter in the app: AVI → MP4', variant: 'app', note: 'FFmpeg on the computer: any size, AVI/WMV/… accepted, previews drawn by the engine, app wording.' });
});

async function aviClip() {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const path = join(OUT, '..', 'holiday.avi');
  const ff = join(process.cwd(), 'desktop', 'bench-engine', 'ffmpeg', 'ffmpeg.exe');
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25:d=8', '-f', 'lavfi', '-i', 'sine=d=8', '-shortest', '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'libmp3lame', path]);
  return readFileSync(path);
}
