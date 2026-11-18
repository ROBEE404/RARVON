import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { test, expect, upload, download, openTool, imageSize } from './helpers';
import type { UploadFile } from './helpers';

/** ZIP Extractor, PNG compression and PDF to Text. */

// "ملف" in Windows-1256, as old Windows ZIP tools store names.
const CP1256_NAME = Buffer.from([0xe3, 0xe1, 0xdd, 0x2e, 0x74, 0x78, 0x74]); // ملف.txt

async function makeZip(): Promise<UploadFile> {
  const zip = new JSZip();
  zip.file('readme.txt', 'hello from the root');
  zip.file('docs/نص عربي.txt', 'محتوى عربي');
  zip.file('docs/deep/data.json', '{"ok":true}');
  zip.file('__MACOSX/._readme.txt', 'junk');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Report inside a zip', { x: 50, y: 700, size: 20, font });
  zip.file('report.pdf', await pdf.save());
  zip.file('LEGACY_NAME', 'windows name');
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    // Store one name in a legacy code page, without the UTF-8 flag.
    encodeFileName: (name: string) => (name === 'LEGACY_NAME' ? CP1256_NAME : Buffer.from(name, 'utf8')),
  } as unknown as JSZip.JSZipGeneratorOptions<'nodebuffer'>);
  return { name: 'bundle.zip', mimeType: 'application/zip', buffer };
}

test.describe('ZIP Extractor', () => {
  test('lists files, downloads one, decodes legacy Arabic names', async ({ page }) => {
    await openTool(page, '/tools/utilities/unzip');
    await upload(page, await makeZip());
    const list = page.getByRole('list', { name: 'Files in the archive' });
    await expect(list.getByRole('listitem')).toHaveCount(5); // __MACOSX skipped
    await expect(list).toContainText('نص عربي.txt');
    await expect(list).toContainText('docs/deep/');
    // Legacy-encoded name: pick Arabic and it reads correctly.
    await page.getByLabel('File name encoding').selectOption('windows-1256');
    await expect(list).toContainText('ملف.txt');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download docs/نص عربي.txt' }).click()]);
    expect(dl.suggestedFilename()).toBe('نص عربي.txt');
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(await dl.path(), 'utf8')).toBe('محتوى عربي');
  });

  test('extract all into a folder keeps the structure', async ({ page }) => {
    // Stand in for the folder picker with the origin-private file system.
    await page.addInitScript(() => {
      (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = () => navigator.storage.getDirectory();
    });
    await openTool(page, '/tools/utilities/unzip');
    await upload(page, await makeZip());
    await page.getByRole('button', { name: 'Extract all to a folder…' }).click();
    await expect(page.getByRole('status')).toContainText('Extracted 5 files');
    const content = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const docs = await root.getDirectoryHandle('docs');
      const deep = await docs.getDirectoryHandle('deep');
      return (await (await deep.getFileHandle('data.json')).getFile()).text();
    });
    expect(content).toBe('{"ok":true}');
  });

  test('a PDF inside the ZIP opens straight in PDF to Text', async ({ page }) => {
    await openTool(page, '/tools/utilities/unzip');
    await upload(page, await makeZip());
    await page.getByRole('listitem').filter({ hasText: 'report.pdf' }).getByRole('button', { name: 'PDF to Text' }).click();
    await expect(page).toHaveURL(/\/tools\/pdf\/to-text/);
    await page.getByRole('button', { name: 'Use this file' }).click();
    await expect(page.getByRole('textbox', { name: 'Extracted text (editable)' })).toHaveValue(/Report inside a zip/);
  });

  test('rejects files that are not ZIPs', async ({ page }) => {
    await openTool(page, '/tools/utilities/unzip');
    await upload(page, { name: 'fake.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
    await expect(page.getByRole('alert')).toContainText('couldn’t be opened as a ZIP');
  });
});

test.describe('PNG compression', () => {
  test('palette reduction shrinks a PNG and keeps size and transparency', async ({ page }) => {
    await openTool(page, '/tools/image/compress');
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 800;
      const x = c.getContext('2d')!;
      // Screenshot-like content with a gradient, plus a transparent corner.
      const g = x.createLinearGradient(0, 0, 1200, 0);
      g.addColorStop(0, '#e8f0ff');
      g.addColorStop(1, '#5b56e8');
      x.fillStyle = g;
      x.fillRect(0, 0, 1200, 800);
      x.fillStyle = '#14171c';
      x.font = '28px sans-serif';
      for (let i = 0; i < 18; i++) x.fillText('Settings · Notifications · Privacy · Account ' + i, 40, 60 + i * 40);
      x.clearRect(0, 0, 100, 100);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    const src = { name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
    await upload(page, src);
    await page.getByText('More options').click();
    await expect(page.getByText('PNG compression')).toBeVisible();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    const out = await download(page);
    expect(out.name).toBe('screenshot-compressed.png');
    expect(out.buffer.length).toBeLessThan(src.buffer.length * 0.6);
    expect(await imageSize(page, out.buffer, 'image/png')).toEqual({ width: 1200, height: 800 });
    const alpha = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext('2d')!;
      x.drawImage(bmp, 0, 0);
      return [x.getImageData(10, 10, 1, 1).data[3], x.getImageData(600, 400, 1, 1).data[3]];
    }, out.buffer.toString('base64'));
    expect(alpha).toEqual([0, 255]);
  });

  test('WebP stays WebP', async ({ page }) => {
    await openTool(page, '/tools/image/compress');
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 600;
      const x = c.getContext('2d')!;
      // Photo-like: smooth gradient plus fine noise (flat shapes would be stored losslessly and tiny).
      const img = x.createImageData(800, 600);
      for (let i = 0; i < img.data.length; i += 4) {
        const p = i / 4;
        const n = (Math.sin(p * 12.9898) * 43758.5453) % 1;
        img.data[i] = 120 + 80 * Math.sin((p % 800) / 90) + n * 30;
        img.data[i + 1] = 100 + 60 * Math.cos(p / 800 / 70) + n * 30;
        img.data[i + 2] = 150 + n * 40;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/webp', 0.95));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    await upload(page, { name: 'art.webp', mimeType: 'image/webp', buffer: Buffer.from(b64, 'base64') });
    await page.getByRole('radio', { name: /^Strong —/ }).click();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    const out = await download(page);
    expect(out.name).toBe('art-compressed.webp');
    expect(out.buffer.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(await imageSize(page, out.buffer, 'image/webp')).toEqual({ width: 800, height: 600 });
  });
});

test.describe('PDF to Text', () => {
  test('keeps lines, paragraphs and page separators', async ({ page }) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage([595, 842]);
    p1.drawText('Quarterly report', { x: 50, y: 780, size: 22, font });
    p1.drawText('First line of the first paragraph.', { x: 50, y: 730, size: 12, font });
    p1.drawText('Second line of the first paragraph.', { x: 50, y: 715, size: 12, font });
    p1.drawText('A new paragraph starts here.', { x: 50, y: 670, size: 12, font });
    const p2 = doc.addPage([595, 842]);
    p2.drawText('Page two text.', { x: 50, y: 780, size: 12, font });
    await openTool(page, '/tools/pdf/to-text');
    await upload(page, { name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
    const box = page.getByRole('textbox', { name: 'Extracted text (editable)' });
    await expect(box).toHaveValue(
      '--- Page 1 ---\nQuarterly report\n\nFirst line of the first paragraph.\nSecond line of the first paragraph.\n\nA new paragraph starts here.\n\n--- Page 2 ---\nPage two text.',
    );
    await page.getByLabel('Page separators').uncheck();
    await expect(box).toHaveValue(/^Quarterly report/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .txt' }).click()]);
    expect(dl.suggestedFilename()).toBe('report.txt');
  });

  test('scanned pages are read with OCR', async ({ page }) => {
    await page.goto('/tools/pdf/to-text');
    // Render an English text image in the browser, then wrap it in a PDF with no text layer.
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1240;
      c.height = 600;
      const x = c.getContext('2d')!;
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#111';
      x.font = '44px Arial';
      x.fillText('Invoice number 4521 was paid', 60, 200);
      x.fillText('Thank you for your business', 60, 300);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    });
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(Buffer.from(png, 'base64'));
    doc.addPage([595, 288]).drawImage(img, { x: 0, y: 0, width: 595, height: 288 });
    await upload(page, { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
    await expect(page.getByText(/no text layer/)).toBeVisible();
    await page.getByLabel('Language').selectOption('eng');
    await page.getByRole('button', { name: 'Read scanned pages with OCR' }).click();
    const box = page.getByRole('textbox', { name: 'Extracted text (editable)' });
    await expect(box).toHaveValue(/Invoice number 4521 was paid/, { timeout: 60_000 });
    await expect(box).toHaveValue(/Thank you for your business/);
  });
});
