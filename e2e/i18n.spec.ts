import { test, expect } from './helpers';

test.describe('English / Arabic interface', () => {
  test('opens in English and switches to Arabic and back, remembering the choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('h1')).toHaveText('Drop a file. Pick what to do.');

    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toHaveText('أفلت ملفًا. واختر ما تريد فعله.');
    await expect(page.getByRole('link', { name: 'كل الأدوات', exact: false }).first()).toBeVisible();

    // Remembered across pages and reloads.
    await page.goto('/tools/pdf/merge');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toHaveText('دمج PDF');
    await expect(page.getByRole('button', { name: 'ادمج ملفات PDF' })).toBeVisible();
    await expect(page).toHaveTitle(/دمج PDF/);

    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText('Merge PDF');
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Merge PDF');
  });

  test('switching keeps what you already entered in a tool', async ({ page }) => {
    await page.goto('/tools/text/word-counter');
    await page.locator('textarea').fill('one two three');
    await expect(page.getByText('Words', { exact: true })).toBeVisible();
    await page.getByTestId('language-toggle').click();
    await expect(page.getByText('الكلمات', { exact: true })).toBeVisible();
    await expect(page.locator('textarea')).toHaveValue('one two three');
  });

  test('Arabic pages fit a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    for (const path of ['/', '/tools', '/compress', '/tools/image/resize', '/tools/pdf/editor', '/tools/video/editor', '/tools/image/remove-background']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
