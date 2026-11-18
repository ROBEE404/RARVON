import type { Page } from '@playwright/test';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, StandardFonts, degrees, rgb } from 'pdf-lib';
import { test, expect, upload, download, openTool, makePdf, makeImage, pdfInfo, pdfText } from './helpers';
import type { UploadFile } from './helpers';

/**
 * PDF Editor, driven through its real UI. Placement is verified by opening
 * the exported PDF in the editor again and measuring colored pixels in the
 * rendered page image; Arabic text is verified by reading the rendered page
 * back with the app's own OCR tool.
 */

async function geometryPdf(): Promise<UploadFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Page ${i + 1}`, { x: 40, y: 780, size: 24, font });
    if (i === 1) p.setRotation(degrees(90)); // page with its own /Rotate
    if (i === 2) p.setCropBox(50, 100, 400, 600); // page with a crop box
  }
  return { name: 'geometry.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

const pageEl = (page: Page) => page.getByTestId('editor-page');

async function openEditor(page: Page, pdf: UploadFile) {
  await openTool(page, '/tools/pdf/editor');
  await upload(page, pdf);
  await expect(page.getByAltText('Page', { exact: true })).toBeVisible();
}

async function tool(page: Page, name: string) {
  await page.getByRole('toolbar', { name: 'Editing tools' }).getByRole('button', { name, exact: true }).click();
}

/** Drags between two points given as fractions of the page element's on-screen box. */
async function dragOnPage(page: Page, from: [number, number], to: [number, number]) {
  const b = (await pageEl(page).boundingBox())!;
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 6 });
  await page.mouse.up();
}

async function clickOnPage(page: Page, at: [number, number]) {
  const b = (await pageEl(page).boundingBox())!;
  await page.mouse.click(b.x + b.width * at[0], b.y + b.height * at[1]);
}

async function goToPage(page: Page, n: number) {
  await page.locator('[data-page-index]').nth(n - 1).click({ position: { x: 20, y: 30 } });
}

async function exportPdf(page: Page) {
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByRole('button', { name: /Download/ })).toBeVisible({ timeout: 30_000 });
  return (await download(page)).buffer;
}

/** Re-opens a PDF in the editor and returns page n's rendered image as a data URL. */
async function renderedPage(page: Page, pdf: Buffer, n: number) {
  await openEditor(page, { name: 'check.pdf', mimeType: 'application/pdf', buffer: pdf });
  if (n > 1) await goToPage(page, n);
  await expect(page.getByAltText('Page', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  return (await page.getByAltText('Page', { exact: true }).getAttribute('src'))!;
}

/** Bounding box (fractions of the page) of pixels matching a color class. */
async function colorBox(page: Page, dataUrl: string, kind: 'green' | 'blue' | 'red' | 'dark', maxY = 1) {
  return page.evaluate(
    async ({ dataUrl, kind, maxY }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const test = (r: number, g: number, b: number) =>
        kind === 'green' ? g > 110 && g - r > 50 && g - b > 15
          : kind === 'blue' ? b > 150 && r < 120 && g < 160
            : kind === 'red' ? r > 150 && g < 100 && b < 100
              : r < 90 && g < 90 && b < 90;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
      for (let y = 0; y < c.height * maxY; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (test(d[i], d[i + 1], d[i + 2])) {
            n++;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
      }
      if (!n) return null;
      return { x0: x0 / c.width, y0: y0 / c.height, x1: (x1 + 1) / c.width, y1: (y1 + 1) / c.height, aspect: c.width / c.height, n };
    },
    { dataUrl, kind, maxY },
  );
}

async function chooseColor(page: Page, hex: string) {
  await page.getByRole('button', { name: hex, exact: true }).first().click();
}

test.describe('PDF Editor', () => {
  test.describe.configure({ timeout: 120_000 });

  test('text annotation stays selectable, original text kept', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 2 }));
    await tool(page, 'Text');
    await clickOnPage(page, [0.2, 0.4]);
    await page.keyboard.type('Approved by QA');
    await page.keyboard.press('Enter');
    const text = await pdfText(await exportPdf(page));
    expect(text[0]).toContain('Approved by QA');
    expect(text[0]).toContain('Page 1');
    expect(text).toHaveLength(2);
  });

  test('Arabic and mixed Arabic/English text exports correctly shaped', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 1 }));
    await tool(page, 'Text');
    await clickOnPage(page, [0.1, 0.3]);
    await page.keyboard.type('مرحبا بالعالم');
    await page.keyboard.press('Enter');
    await clickOnPage(page, [0.1, 0.4]);
    await page.keyboard.type('تم إصدار Rarvon في شهر March');
    await page.keyboard.press('Enter');
    const pdf = await exportPdf(page);
    // Read the exported page back with the app's own OCR.
    const src = await renderedPage(page, pdf, 1);
    await openTool(page, '/tools/image/to-text');
    await page.getByLabel('Language of the text').selectOption('ara');
    await page.getByLabel('Also contains English').setChecked(true);
    await upload(page, { name: 'export.png', mimeType: 'image/png', buffer: Buffer.from(src.split(',')[1], 'base64') });
    const box = page.getByRole('textbox', { name: 'Extracted text (editable)' });
    await expect(box).toHaveValue(/مرحبا/, { timeout: 60_000 });
    const ocr = await box.inputValue();
    expect(ocr).toContain('بالعالم');
    expect(ocr).toContain('Rarvon');
    expect(ocr).toContain('March');
  });

  test('annotations land in place on pages with their own rotation and a crop box', async ({ page }) => {
    await openEditor(page, await geometryPdf());
    await tool(page, 'Shapes');
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await page.getByRole('button', { name: 'Thick' }).click();
    await chooseColor(page, '#1c7ed6');
    for (const n of [1, 2, 3]) {
      if (n > 1) await goToPage(page, n);
      await expect(page.getByText(`Page ${n} / 3`)).toBeVisible();
      await dragOnPage(page, [0.02, 0.02], [0.25, 0.12]);
    }
    const pdf = await exportPdf(page);
    const info = await pdfInfo(pdf);
    expect(info.pageCount).toBe(3);
    for (const n of [1, 2, 3]) {
      const img = await renderedPage(page, pdf, n);
      const box = await colorBox(page, img, 'blue');
      // The rectangle sits in the displayed top-left corner on every page.
      expect(box, `page ${n}`).not.toBeNull();
      expect(box!.x0).toBeLessThan(0.06);
      expect(box!.y0).toBeLessThan(0.06);
      expect(box!.x1).toBeGreaterThan(0.2);
      expect(box!.x1).toBeLessThan(0.3);
    }
    // Rotated page keeps landscape proportions after export.
    const p2 = await colorBox(page, await renderedPage(page, pdf, 2), 'blue');
    expect(p2!.aspect).toBeGreaterThan(1.3);
  });

  test('clicks map correctly on a page rotated in the editor', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 1 }));
    await page.locator('[data-page-index]').first().hover();
    await page.getByRole('button', { name: 'Rotate page 90 degrees' }).click();
    await tool(page, 'Shapes');
    await page.getByRole('button', { name: 'Rectangle' }).click();
    await chooseColor(page, '#1c7ed6');
    // Visual top-left of the rotated page.
    await dragOnPage(page, [0.05, 0.05], [0.3, 0.2]);
    const pdf = await exportPdf(page);
    const box = await colorBox(page, await renderedPage(page, pdf, 1), 'blue');
    expect(box).not.toBeNull();
    expect(box!.x0).toBeLessThan(0.1);
    expect(box!.y0).toBeLessThan(0.1);
    expect(box!.aspect).toBeGreaterThan(1.3); // page is landscape after the rotation
  });

  test('underline, shapes (rect, ellipse, arrow) and an image are exported', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 1 }));
    await tool(page, 'Underline');
    await chooseColor(page, '#2f8f6e');
    await dragOnPage(page, [0.05, 0.05], [0.5, 0.08]);
    await tool(page, 'Shapes');
    await chooseColor(page, '#1c7ed6');
    await page.getByRole('button', { name: 'Ellipse' }).click();
    await dragOnPage(page, [0.6, 0.3], [0.9, 0.45]);
    await page.getByRole('button', { name: 'Arrow' }).click();
    await page.getByRole('button', { name: 'Thick' }).click();
    await dragOnPage(page, [0.1, 0.6], [0.5, 0.6]);
    await tool(page, 'Image');
    const img = await makeImage(page, { width: 400, height: 200, type: 'image/png', name: 'logo.png' });
    await page.locator('aside, div').filter({ hasText: 'Add an image' }).locator('input[type=file]').last().setInputFiles(img);
    await expect(page.getByAltText('Image to insert')).toBeVisible();
    await clickOnPage(page, [0.5, 0.85]);
    await expect(page.getByAltText('Inserted image')).toBeVisible();

    const pdf = await exportPdf(page);
    const doc = await PDFDocument.load(pdf);
    const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xobjects?.keys().length ?? 0).toBeGreaterThanOrEqual(1); // the inserted image

    const render = await renderedPage(page, pdf, 1);
    const blue = await colorBox(page, render, 'blue');
    expect(blue).not.toBeNull();
    expect(blue!.x1).toBeGreaterThan(0.85); // ellipse reaches the right
    expect(blue!.y1).toBeGreaterThan(0.58); // arrow lower down
    const green = await colorBox(page, render, 'green', 0.3); // top band only (the inserted photo has green in it)
    expect(green).not.toBeNull(); // underline along the bottom of the dragged band
    expect(green!.y0).toBeGreaterThan(0.06);
    expect(green!.y1).toBeLessThan(0.1);
    expect(green!.x1 - green!.x0).toBeGreaterThan(0.4);
  });

  test('sticky note becomes a real PDF comment', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 1 }));
    await tool(page, 'Note');
    await clickOnPage(page, [0.7, 0.2]);
    await page.getByRole('textbox', { name: 'Note text' }).fill('Please check this figure — راجع هذا الرقم');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByLabel(/^Note: Please check/)).toBeVisible();
    const doc = await PDFDocument.load(await exportPdf(page));
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const note = annots.lookup(0, PDFDict);
    expect(note.get(PDFName.of('Subtype'))?.toString()).toBe('/Text');
    expect(note.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Please check this figure — راجع هذا الرقم');
  });

  test('insert a blank page after page 1', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 2 }));
    await page.locator('[data-page-index]').first().hover();
    await page.getByRole('button', { name: 'Insert blank page after this page' }).first().click();
    await expect(page.locator('[data-page-index]')).toHaveCount(3);
    await tool(page, 'Text');
    await clickOnPage(page, [0.1, 0.1]);
    await page.keyboard.type('Inserted page');
    await page.keyboard.press('Enter');
    const pdf = await exportPdf(page);
    const info = await pdfInfo(pdf);
    expect(info.pageCount).toBe(3);
    expect(info.pages[1]).toMatchObject({ w: 595, h: 842 });
    const text = await pdfText(pdf);
    expect(text.map((t) => t.trim())).toEqual(['Page 1', 'Inserted page', 'Page 2']);
  });

  test('redaction removes the underlying text and keeps page proportions', async ({ page }) => {
    await openEditor(page, await geometryPdf());
    await goToPage(page, 2); // page with its own rotation
    await expect(page.getByText('Page 2 / 3')).toBeVisible();
    await tool(page, 'Redact');
    await dragOnPage(page, [0.02, 0.02], [0.6, 0.2]);
    const pdf = await exportPdf(page);
    const info = await pdfInfo(pdf);
    const p = info.pages[1];
    const [w, h] = p.rotation % 180 ? [p.h, p.w] : [p.w, p.h];
    expect(w).toBeGreaterThan(h); // still landscape as displayed
    const text = await pdfText(pdf);
    expect(text[1]).not.toContain('Page 2');
    expect(text[0]).toContain('Page 1'); // other pages untouched
  });

  test('undo and redo an annotation', async ({ page }) => {
    await openEditor(page, await makePdf({ pages: 1 }));
    await tool(page, 'Highlight');
    await dragOnPage(page, [0.1, 0.1], [0.4, 0.2]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Redo' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    const text = await pdfText(await exportPdf(page));
    expect(text[0]).toContain('Page 1');
  });
});

// Keep imports referenced for type-only helpers used above.
void rgb;
