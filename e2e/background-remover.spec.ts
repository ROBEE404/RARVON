import type { Page } from '@playwright/test';
import { test, expect, download, imageSize } from './helpers';
import type { UploadFile } from './helpers';

// The first run downloads the AI engine and model (~39 MB) from the preview server and runs on the CPU.
test.describe.configure({ timeout: 240_000 });
// Tall enough that the whole picture is on screen for real mouse clicks.
test.use({ viewport: { width: 1280, height: 1400 } });

/** A 1200×900 picture: an orange bottle with a white label on a blue gradient and a green floor. */
async function bottlePicture(page: Page): Promise<UploadFile> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 1200, 900);
    grd.addColorStop(0, '#3b82f6');
    grd.addColorStop(1, '#93c5fd');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1200, 900);
    g.fillStyle = '#14532d';
    g.fillRect(0, 700, 1200, 200);
    g.fillStyle = '#f97316';
    g.beginPath();
    g.roundRect(500, 270, 200, 480, 40);
    g.fill();
    g.fillRect(565, 150, 70, 130);
    g.fillStyle = '#fff';
    g.fillRect(520, 450, 160, 90);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s);
  });
  return { name: 'bottle.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

/** Alpha of the preview canvas at picture coordinates (the preview is the picture's own size here). */
function alphaAt(page: Page, x: number, y: number) {
  return page.getByTestId('bg-canvas').evaluate((c: HTMLCanvasElement, [px, py]) => c.getContext('2d')!.getImageData(px, py, 1, 1).data[3], [x, y]);
}

async function waitIdle(page: Page) {
  await expect(page.getByTestId('bg-remover').getByRole('status')).toHaveCount(0, { timeout: 200_000 });
}

test('remove the background automatically, compare before/after, crop and download a PNG', async ({ page }) => {
  await page.goto('/tools/image/remove-background');
  await page.locator('input[type=file]').first().setInputFiles(await bottlePicture(page));
  await expect(page.getByTestId('bg-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make PNG' })).toBeDisabled();

  await page.getByRole('button', { name: 'Remove background' }).click();
  await waitIdle(page);
  await expect(page.locator('[role=alert]')).toHaveCount(0);
  expect(await alphaAt(page, 20, 20), 'background removed').toBe(0);
  expect(await alphaAt(page, 600, 620), 'bottle kept').toBe(255);

  // Before / after.
  await page.getByRole('button', { name: 'Show before' }).click();
  await expect(page.getByRole('button', { name: 'Show after' })).toBeVisible();
  expect(await alphaAt(page, 20, 20)).toBe(255);
  await page.getByRole('button', { name: 'Show after' }).click();
  expect(await alphaAt(page, 20, 20)).toBe(0);

  // Crop to the object and download.
  await page.getByLabel('Crop to the object').check();
  await page.getByRole('button', { name: 'Make PNG' }).click();
  const out = await download(page, /Download/);
  expect(out.name).toBe('bottle-no-background.png');
  const size = await imageSize(page, out.buffer, 'image/png');
  // Bottle is 200×600 px; with 20 px of space around it.
  expect(size.width).toBeGreaterThan(200);
  expect(size.width).toBeLessThan(320);
  expect(size.height).toBeGreaterThan(600);
  expect(size.height).toBeLessThan(720);
});

test('one click on an object selects the whole object, and the brush and undo fix it', async ({ page }) => {
  await page.goto('/tools/image/remove-background');
  await page.locator('input[type=file]').first().setInputFiles(await bottlePicture(page));
  const canvas = page.getByTestId('bg-canvas');
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => ({ x: (x / 1200) * box.width, y: (y / 900) * box.height });

  // Click the label: the whole bottle should be kept, not just the label.
  await canvas.click({ position: at(600, 495) });
  await waitIdle(page);
  expect(await alphaAt(page, 600, 650), 'bottle body kept').toBe(255);
  expect(await alphaAt(page, 600, 200), 'bottle neck kept').toBe(255);
  expect(await alphaAt(page, 100, 100), 'sky removed').toBe(0);

  // Erase a stripe with the brush, then undo it.
  await page.getByTestId('rail-brush').click();
  await page.getByRole('button', { name: 'Brush: erase' }).click();
  // Measure again: the page scrolls the tool into view after the picture loads.
  const now = (await canvas.boundingBox())!;
  const a = at(480, 620);
  const b = at(720, 620);
  await page.mouse.move(now.x + a.x, now.y + a.y);
  await page.mouse.down();
  await page.mouse.move(now.x + b.x, now.y + b.y, { steps: 8 });
  await page.mouse.up();
  expect(await alphaAt(page, 600, 620)).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await alphaAt(page, 600, 620)).toBe(255);
});

test('manual outline: draw with the Pen, reshape a point, and cut out exactly along it', async ({ page }) => {
  await page.goto('/tools/image/remove-background');
  await page.locator('input[type=file]').first().setInputFiles(await bottlePicture(page));
  const canvas = page.getByTestId('bg-canvas');
  await page.getByTestId('rail-outline').click();
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + (x / 1200) * box.width, y: box.y + (y / 900) * box.height });

  // A rectangle around the bottle's body only (not the neck), point by point.
  for (const [x, y] of [[480, 260], [720, 260], [720, 760], [480, 760]] as const) {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  }
  // Clicking the first point closes the shape.
  const first = at(480, 260);
  await page.mouse.click(first.x, first.y);
  await expect(page.getByTestId('outline-cut')).toBeVisible();

  // Reshape: drag the top-left point up to include the neck area.
  const tl = at(480, 260);
  const to = at(560, 120);
  await page.mouse.move(tl.x, tl.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: 'test-results/outline-editing.png' });

  await page.getByTestId('outline-cut').click();
  expect(await alphaAt(page, 600, 600), 'inside the outline is kept').toBe(255);
  expect(await alphaAt(page, 300, 600), 'outside is removed').toBe(0);
  expect(await alphaAt(page, 575, 175), 'the dragged point took in the neck').toBe(255);
  expect(await alphaAt(page, 700, 175), 'the other top corner stayed').toBe(0);

  // Undo brings back the editing state step by step; the export follows the outline.
  await page.getByLabel('Crop to the object').check();
  await page.getByRole('button', { name: 'Make PNG' }).click();
  const out = await download(page, /Download/);
  const size = await imageSize(page, out.buffer, 'image/png');
  expect(size.width).toBeGreaterThan(240);
  expect(size.width).toBeLessThan(300);
});

test('outline from the AI selection becomes editable points', async ({ page }) => {
  await page.goto('/tools/image/remove-background');
  await page.locator('input[type=file]').first().setInputFiles(await bottlePicture(page));
  await page.getByRole('button', { name: 'Remove background' }).click();
  await waitIdle(page);
  await page.getByTestId('rail-outline').click();
  await page.getByTestId('outline-from-selection').click();
  const points = page.getByTestId('outline-layer').locator('circle[data-point]');
  expect(await points.count()).toBeGreaterThan(5);
  expect(await points.count()).toBeLessThan(120);
  await page.getByTestId('outline-cut').click();
  expect(await alphaAt(page, 20, 20)).toBe(0);
  expect(await alphaAt(page, 600, 620)).toBe(255);
});

