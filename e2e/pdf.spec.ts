import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { test, expect, upload, download, openTool, makePdf, makeImage, pdfInfo, pdfText, imageSize } from './helpers';

test.describe('PDF tools with real files', () => {
  test('merge combines files in order', async ({ page }) => {
    await openTool(page, '/tools/pdf/merge');
    await upload(page, [await makePdf({ pages: 3, label: 'Alpha' }), await makePdf({ pages: 2, label: 'Beta' })]);
    await page.getByRole('button', { name: 'Merge PDFs' }).click();
    const out = await download(page);
    expect((await pdfInfo(out.buffer)).pageCount).toBe(5);
    const text = await pdfText(out.buffer);
    expect(text[0]).toContain('Alpha 1');
    expect(text[3]).toContain('Beta 1');
  });

  test('split: every page as its own file (ZIP)', async ({ page }) => {
    await openTool(page, '/tools/pdf/split');
    await upload(page, await makePdf({ pages: 3 }));
    await page.getByRole('button', { name: 'Split PDF' }).click();
    const out = await download(page);
    expect(out.name).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(out.buffer);
    const pdfs = Object.keys(zip.files).filter((n) => n.endsWith('.pdf'));
    expect(pdfs).toHaveLength(3);
    for (const name of pdfs) expect((await pdfInfo(Buffer.from(await zip.file(name)!.async('uint8array')))).pageCount).toBe(1);
  });

  test('split: a page range', async ({ page }) => {
    await openTool(page, '/tools/pdf/split');
    await upload(page, await makePdf({ pages: 4 }));
    await page.getByRole('button', { name: 'A page range' }).click();
    await page.getByLabel(/Pages \(e\.g\./).fill('2-3');
    await page.getByRole('button', { name: 'Split PDF' }).click();
    const out = await download(page);
    const text = await pdfText(out.buffer);
    expect(text).toHaveLength(2);
    expect(text[0]).toContain('Page 2');
    expect(text[1]).toContain('Page 3');
  });

  test('extract pages', async ({ page }) => {
    await openTool(page, '/tools/pdf/extract');
    await upload(page, await makePdf({ pages: 4 }));
    await page.locator('main input:not([type])').fill('1, 4');
    await page.getByRole('button', { name: 'Extract pages' }).click();
    const text = await pdfText((await download(page)).buffer);
    expect(text.map((t) => t.trim())).toEqual(['Page 1', 'Page 4']);
  });

  test('delete pages', async ({ page }) => {
    await openTool(page, '/tools/pdf/delete-pages');
    await upload(page, await makePdf({ pages: 4 }));
    await page.getByPlaceholder('e.g. 2, 4-6').fill('2-3');
    await page.getByRole('button', { name: 'Delete pages' }).click();
    const text = await pdfText((await download(page)).buffer);
    expect(text.map((t) => t.trim())).toEqual(['Page 1', 'Page 4']);
  });

  test('rotate all pages', async ({ page }) => {
    await openTool(page, '/tools/pdf/rotate');
    await upload(page, await makePdf({ pages: 2 }));
    await page.getByRole('button', { name: 'Rotate PDF' }).click();
    const info = await pdfInfo((await download(page)).buffer);
    expect(info.pages.map((p) => p.rotation % 180)).toEqual([90, 90]);
  });

  test('compress keeps physical page size, including a rotated page', async ({ page }) => {
    await openTool(page, '/tools/pdf/compress');
    await upload(page, await makePdf({ pages: 3, rotateSecond: true }));
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    const info = await pdfInfo((await download(page)).buffer);
    expect(info.pages.map((p) => [p.w, p.h])).toEqual([[595, 842], [842, 595], [595, 842]]);
  });

  test('PDF to images (ZIP of PNGs at the chosen scale)', async ({ page }) => {
    await openTool(page, '/tools/pdf/to-images');
    await upload(page, await makePdf({ pages: 2 }));
    await page.getByRole('button', { name: 'Convert to images' }).click();
    const out = await download(page);
    const zip = await JSZip.loadAsync(out.buffer);
    const images = Object.keys(zip.files).filter((n) => /\.(png|jpe?g)$/.test(n));
    expect(images).toHaveLength(2);

    // Unpick page 1: only page 2 is saved, as a single JPG.
    await page.getByRole('button', { name: 'Page 1' }).click();
    await page.getByRole('radio', { name: 'JPG' }).click();
    await page.getByRole('button', { name: 'Convert to images' }).click();
    const one = await download(page);
    expect(one.name).toBe('page-page-2.jpg');

    // Formats the browser can't make itself: written by Rarvon's own encoders.
    for (const [label, ext, magic] of [['GIF', 'gif', 'GIF89a'], ['BMP', 'bmp', 'BM'], ['TIFF', 'tif', 'II*']] as const) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await page.getByRole('button', { name: 'Convert to images' }).click();
      const file = await download(page);
      expect(file.name).toBe(`page-page-2.${ext}`);
      expect(file.buffer.subarray(0, magic.length).toString('latin1')).toBe(magic);
    }
    // The sharpness buttons say how big the pictures will be (an A4 page at 2×).
    await expect(page.getByRole('radio', { name: '2×' })).toContainText('1190 × 1684 px');
    const size = await imageSize(page, Buffer.from(await zip.file(images[0])!.async('uint8array')), 'image/png');
    expect(size.width / size.height).toBeCloseTo(595 / 842, 2);
  });

  test('images to PDF: one page per image', async ({ page }) => {
    await openTool(page, '/tools/pdf/from-images');
    await upload(page, [
      await makeImage(page, { width: 1200, height: 800, name: 'a.jpg' }),
      await makeImage(page, { width: 600, height: 900, type: 'image/png', name: 'b.png' }),
    ]);
    await page.getByRole('button', { name: 'Create PDF' }).click();
    const info = await pdfInfo((await download(page)).buffer);
    expect(info.pageCount).toBe(2);
    expect(info.pages[0].w / info.pages[0].h).toBeCloseTo(1.5, 1);
    expect(info.pages[1].w / info.pages[1].h).toBeCloseTo(600 / 900, 1);

    // Move the first picture later: the pages swap.
    await page.getByTestId('page-grid').getByRole('button', { name: 'Move later' }).first().click();
    await page.getByRole('button', { name: 'Create PDF' }).click();
    const swapped = await pdfInfo((await download(page)).buffer);
    expect(swapped.pages[0].w / swapped.pages[0].h).toBeCloseTo(600 / 900, 1);
    expect(swapped.pages[1].w / swapped.pages[1].h).toBeCloseTo(1.5, 1);
  });

  test('metadata: edit title and author', async ({ page }) => {
    await openTool(page, '/tools/pdf/metadata');
    await upload(page, await makePdf({ pages: 1 }));
    await page.getByLabel('Title').fill('Quarterly report');
    await page.getByLabel('Author').fill('Rarvon Tester');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const info = await pdfInfo((await download(page)).buffer);
    expect(info.title).toBe('Quarterly report');
    expect(info.author).toBe('Rarvon Tester');
  });

  test('page numbers are stamped on every page', async ({ page }) => {
    await openTool(page, '/tools/pdf/page-numbers');
    await upload(page, await makePdf({ pages: 3, label: 'Doc' }));
    await page.getByRole('button', { name: 'Add page numbers' }).click();
    const text = await pdfText((await download(page)).buffer);
    text.forEach((t, i) => expect(t).toMatch(new RegExp(`\\b${i + 1}\\b`)));
  });

  test('watermark text appears on every page', async ({ page }) => {
    await openTool(page, '/tools/pdf/watermark');
    await upload(page, await makePdf({ pages: 2 }));
    await page.locator('main input:not([type])').first().fill('DRAFT');
    await page.getByRole('button', { name: 'Add watermark' }).click();
    const text = await pdfText((await download(page)).buffer);
    for (const t of text) expect(t).toContain('DRAFT');
  });

  test('reorder: saving keeps all pages', async ({ page }) => {
    await openTool(page, '/tools/pdf/reorder');
    await upload(page, await makePdf({ pages: 3 }));
    await page.getByRole('button', { name: 'Save reordered PDF' }).click();
    const text = await pdfText((await download(page)).buffer);
    expect(text.map((t) => t.trim())).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  test('sign: draw a signature and place it', async ({ page }) => {
    await openTool(page, '/tools/pdf/sign');
    const src = await makePdf({ pages: 1 });
    await upload(page, src);
    const pad = page.locator('main canvas').first();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 90);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + 90 - Math.sin(i / 2) * 40);
    await page.mouse.up();
    await page.getByRole('button', { name: 'Use this drawing' }).click();
    await expect(page.getByAltText('Signature preview')).toBeVisible();
    await page.getByRole('button', { name: 'Sign PDF' }).click();
    const out = await download(page);
    const doc = await PDFDocument.load(out.buffer);
    expect(doc.getPageCount()).toBe(1);
    expect(out.buffer.length).toBeGreaterThan(src.buffer.length + 500); // an image was embedded
  });
});

test('non-PDF input is rejected with a message, not a crash', async ({ page, consoleErrors }) => {
  await openTool(page, '/tools/pdf/merge');
  const bogus = { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf') };
  const real = await makePdf({ pages: 1 });
  await upload(page, [bogus, real]);
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  await expect(page.getByRole('alert').or(page.locator('main').getByText(/could not|couldn.t|invalid|failed/i)).first()).toBeVisible();
  consoleErrors.length = 0; // a logged parse error is acceptable here; the UI message is what matters
});

// Keeps pdf-lib's font import used for future fixture tweaks without tripping noUnusedLocals.
void StandardFonts;
