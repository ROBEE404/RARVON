import { test, expect, upload, download, makePdf, pdfInfo } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('after one visit, tools work offline (PWA)', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  // Wait until the service worker is active and has precached the build.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 100; i++) {
      const keys = await (await caches.open('bench-assets')).keys();
      if (keys.length > 100) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('precache did not complete');
  });
  const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
  expect(manifest.short_name).toBe('Rarvon');

  await context.setOffline(true);
  // A tool never opened before, loaded fresh while offline.
  await page.goto('/tools/pdf/merge');
  await expect(page.getByRole('heading', { name: 'Merge PDF' })).toBeVisible();
  await upload(page, [await makePdf({ pages: 2, label: 'A' }), await makePdf({ pages: 1, label: 'B' })]);
  await page.getByRole('button', { name: 'Merge PDFs' }).click();
  expect((await pdfInfo((await download(page)).buffer)).pageCount).toBe(3);

  await page.goto('/tools/text/word-counter');
  await page.locator('main textarea').fill('works without a connection');
  await expect(page.locator('main')).toContainText('4');
  await context.setOffline(false);
});

test('no page loads anything from another host', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) external.push(r.url());
  });
  for (const path of ['/', '/tools/pdf/editor', '/tools/image/to-text', '/tools/video/compress', '/about']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});
