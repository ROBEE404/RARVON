import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, upload, download, openTool } from '../../e2e/helpers';

/**
 * Rarvon for desktop: the real tool pages, served by the real Rarvon Engine,
 * with video and audio done by FFmpeg. Run with `npm run test:desktop`.
 */

const FFMPEG = join(process.cwd(), 'desktop', 'bench-engine', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const dir = mkdtempSync(join(tmpdir(), 'bench-desktop-test-'));

/** Makes a test clip with FFmpeg itself (formats the browser engine can't open). */
function clip(name: string, args: string[]) {
  const path = join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-shortest', ...args, path]);
  return { name, mimeType: 'application/octet-stream', buffer: readFileSync(path) };
}

/** What FFmpeg says about a result: its streams and length. */
function details(buffer: Buffer, ext: string) {
  const path = join(dir, `result-${Date.now()}.${ext}`);
  writeFileSync(path, buffer);
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-i', path], { stdio: 'pipe' });
  } catch (e) {
    const text = String((e as { stderr: Buffer }).stderr);
    const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(text) ?? [];
    return { text, duration: Number(h) * 3600 + Number(m) * 60 + Number(s) };
  }
  return { text: '', duration: 0 };
}

const avi = () => clip('old-camera.avi', ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame']);

test.describe('Rarvon for desktop (FFmpeg engine)', () => {
  test('the app hides "Get the app" and the browser warnings, and accepts any video', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => Boolean(window.__BENCH_APP__?.ffmpeg))).toBe(true);
    await expect(page.locator('a[href="/app"]')).toHaveCount(0);
    await openTool(page, '/tools/video/convert');
    await expect(page.getByText(/hasn.t been verified across every browser/)).toHaveCount(0);
    await expect(page.getByText('Any video: MP4, MOV, MKV, AVI, WMV and more, any size')).toBeVisible();
    // The app's own description and answers, not the browser's.
    await expect(page.getByText(/Video Converter turns almost any video/)).toBeVisible();
    await expect(page.getByText(/In the Rarvon app, FFmpeg does the work on your computer/)).toBeVisible();
    await expect(page.getByText(/WebCodecs|this browser/)).toHaveCount(0);
    // No "Beta" tag on tools FFmpeg runs; the Video Editor keeps it.
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^Video Converter/ }).first()).not.toContainText('Beta');
    await expect(page.getByRole('link', { name: /^Video Editor/ }).first()).toContainText('Beta');
    await page.goto('/tools/audio');
    await expect(page.getByText('all on your computer', { exact: false }).first()).toBeVisible();
    // The Video Editor still runs in the browser, so it keeps its note.
    await page.goto('/tools/video/editor');
    await expect(page.getByText(/hasn.t been verified across every browser/)).toBeVisible();
  });

  test('converts an AVI (which the browser can’t open) to MP4 with AAC sound', async ({ page }) => {
    await openTool(page, '/tools/video/convert');
    await upload(page, avi());
    // The browser can't play AVI, so the engine draws the preview picture.
    const preview = page.getByTestId('convert-flow').locator('img').first();
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(480);
    await page.getByRole('button', { name: 'Convert to MP4' }).click();
    const out = await download(page);
    expect(out.name).toBe('old-camera.mp4');
    const info = details(out.buffer, 'mp4');
    expect(info.text).toMatch(/Video: h264/);
    expect(info.text).toMatch(/Audio: aac/);
    expect(info.duration).toBeGreaterThan(3.5);
  });

  test('turns an AVI into an animated GIF', async ({ page }) => {
    await openTool(page, '/tools/video/convert');
    await upload(page, avi());
    await page.getByRole('radio', { name: 'GIF', exact: true }).click();
    await page.getByRole('button', { name: 'Convert to GIF' }).click();
    const gif = await download(page);
    expect(gif.buffer.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(details(gif.buffer, 'gif').text).toMatch(/Video: gif/);
  });

  test('compresses, trims and resizes', async ({ page }) => {
    const mp4 = clip('phone.mp4', ['-c:v', 'libopenh264', '-b:v', '4M', '-c:a', 'aac']);
    await openTool(page, '/tools/video/compress');
    await upload(page, mp4);
    await page.getByRole('button', { name: 'Compress video' }).click();
    const small = await download(page);
    expect(small.buffer.length).toBeLessThan(mp4.buffer.length * 0.8);

    await openTool(page, '/tools/video/trim');
    await upload(page, mp4);
    await page.getByLabel(/^End/).fill('2');
    await page.getByRole('button', { name: 'Trim video' }).click();
    const trimmed = details((await download(page)).buffer, 'mp4');
    expect(trimmed.duration).toBeGreaterThan(1.5);
    expect(trimmed.duration).toBeLessThan(2.6);

    await openTool(page, '/tools/video/resolution');
    await upload(page, mp4);
    await page.locator('main input[type=number]').nth(0).fill('320');
    await page.locator('main input[type=number]').nth(1).fill('180');
    await page.getByRole('button', { name: 'Change resolution' }).click();
    expect(details((await download(page)).buffer, 'mp4').text).toMatch(/320x180/);
  });

  test('pulls the sound out of an AVI', async ({ page }) => {
    await openTool(page, '/tools/audio/extract');
    await upload(page, avi());
    await page.getByRole('button', { name: 'Extract audio' }).click();
    const out = await download(page);
    const info = details(out.buffer, out.name.split('.').pop()!);
    expect(info.text).toMatch(/Audio:/);
    expect(info.text).not.toMatch(/Video:/);
    expect(info.duration).toBeGreaterThan(3.5);
  });

  test('other websites can’t use the engine', async ({ request }) => {
    expect((await request.post('/__bench/probe', { data: {} })).status()).toBe(403);
    expect((await request.get('/', { headers: { Host: 'evil.example:47821' } })).status()).toBe(403);
  });
});
