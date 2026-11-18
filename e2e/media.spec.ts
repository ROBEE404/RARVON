import JSZip from 'jszip';
import exifr from 'exifr';
import { test, expect, upload, download, openTool, makeImage, makeWebm, makeMp4, makeWav, makePdf, imageSize, mediaInfo } from './helpers';
import type { UploadFile } from './helpers';

/** Inserts a minimal EXIF APP1 segment (Make + Model) right after the JPEG SOI marker. */
function withExif(jpeg: UploadFile, make = 'BenchCam', model = 'Model T'): UploadFile {
  const entries: [number, string][] = [[0x010f, make], [0x0110, model]];
  const ifdSize = 2 + entries.length * 12 + 4;
  const strings = entries.map(([, s]) => Buffer.from(`${s}\0`, 'latin1'));
  const tiff = Buffer.alloc(8 + ifdSize + strings.reduce((n, b) => n + b.length, 0));
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(entries.length, 8);
  let dataOffset = 8 + ifdSize;
  entries.forEach(([tag], i) => {
    const at = 10 + i * 12;
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(2, at + 2); // ASCII
    tiff.writeUInt32LE(strings[i].length, at + 4);
    tiff.writeUInt32LE(dataOffset, at + 8);
    strings[i].copy(tiff, dataOffset);
    dataOffset += strings[i].length;
  });
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return { ...jpeg, buffer: Buffer.concat([jpeg.buffer.subarray(0, 2), header, payload, jpeg.buffer.subarray(2)]) };
}

test.describe('image tools with real files', () => {
  test('image converter opens TGA and TIFF, and saves to every format Rarvon writes itself', async ({ page }) => {
    await openTool(page, '/tools/image/convert');
    // A 4×3 TGA (24-bit, bottom-up), made by hand: red top row, blue below.
    const w = 4, h = 3;
    const tgaHead = Buffer.alloc(18);
    tgaHead[2] = 2; tgaHead[12] = w; tgaHead[14] = h; tgaHead[16] = 24;
    const px: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(...(y === h - 1 ? [0, 0, 255] : [255, 0, 0])); // BGR, bottom row first
    await upload(page, { name: 'tiny.tga', mimeType: 'image/x-tga', buffer: Buffer.concat([tgaHead, Buffer.from(px)]) });
    await expect(page.getByTestId('convert-flow')).toContainText('TGA');
    await page.getByRole('radio', { name: 'PNG', exact: true }).click();
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const png = await download(page);
    expect(await imageSize(page, png.buffer, 'image/png')).toEqual({ width: 4, height: 3 });

    // Save as each format and check the file's signature.
    const checks: [string, string, (b: Buffer) => boolean][] = [
      ['TIFF', 'tif', (b) => b.subarray(0, 4).toString('hex') === '49492a00'],
      ['BMP', 'bmp', (b) => b.subarray(0, 2).toString('latin1') === 'BM'],
      ['GIF', 'gif', (b) => b.subarray(0, 6).toString('latin1') === 'GIF89a'],
      ['ICO', 'ico', (b) => b.readUInt16LE(2) === 1 && b.readUInt16LE(4) === 6],
      ['ICNS', 'icns', (b) => b.subarray(0, 4).toString('latin1') === 'icns'],
      ['PSD', 'psd', (b) => b.subarray(0, 4).toString('latin1') === '8BPS'],
      ['EPS', 'eps', (b) => b.toString('latin1').startsWith('%!PS-Adobe-3.0 EPSF-3.0')],
      ['PS', 'ps', (b) => b.toString('latin1').startsWith('%!PS-Adobe-3.0\n')],
      ['ODG', 'odg', (b) => b.subarray(30, 38).toString('latin1') === 'mimetype'],
    ];
    for (const [label, ext, ok] of checks) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      const out = await download(page);
      expect(out.name, label).toBe(`tiny.${ext}`);
      expect(ok(out.buffer), label).toBe(true);
    }

    // The TIFF Rarvon wrote opens again in Rarvon.
    const tif = (await (async () => {
      await page.getByRole('radio', { name: 'TIFF', exact: true }).click();
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      return download(page);
    })()).buffer;
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await upload(page, { name: 'again.tif', mimeType: 'image/tiff', buffer: tif });
    await expect(page.getByTestId('convert-flow')).toContainText('4×3');
  });

  test('convert JPEG to PNG and WebP', async ({ page }) => {
    await openTool(page, '/tools/image/convert');
    const src = await makeImage(page, { width: 900, height: 600 });
    for (const [mime, ext, label] of [['image/png', 'png', 'PNG'], ['image/webp', 'webp', 'WebP']] as const) {
      await upload(page, src);
      await page.getByRole('radio', { name: label, exact: true }).click();
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      const out = await download(page);
      expect(out.name).toMatch(new RegExp(`\\.${ext}$`));
      expect(await imageSize(page, out.buffer, mime)).toEqual({ width: 900, height: 600 });
      await page.getByRole('button', { name: 'Remove' }).click();
    }
  });

  test('compress a JPEG to a smaller file at the same size', async ({ page }) => {
    await openTool(page, '/tools/image/compress');
    const src = await makeImage(page, { width: 1600, height: 1200 });
    await upload(page, src);
    // The ring shows an estimate before compressing.
    await expect(page.getByTestId('savings-ring')).toHaveAttribute('aria-label', /~\d+% smaller/);
    await page.getByRole('radio', { name: /^Strong —/ }).click();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await expect(page.getByTestId('savings-ring')).toHaveAttribute('aria-label', /^\d+% smaller/);
    const out = await download(page);
    expect(out.buffer.length).toBeLessThan(src.buffer.length);
    expect(await imageSize(page, out.buffer, 'image/jpeg')).toEqual({ width: 1600, height: 1200 });
  });

  test('resize to exact width keeps aspect ratio', async ({ page }) => {
    await openTool(page, '/tools/image/resize');
    await upload(page, await makeImage(page, { width: 1200, height: 800 }));
    const width = page.locator('main input[type=number]').first();
    await width.fill('600');
    await page.getByRole('button', { name: 'Resize image' }).click();
    const out = await download(page, 'Download result');
    const size = await imageSize(page, out.buffer, out.name.endsWith('png') ? 'image/png' : 'image/jpeg');
    expect(size).toEqual({ width: 600, height: 400 });
  });

  test('crop to a dragged region', async ({ page }) => {
    await openTool(page, '/tools/image/crop');
    await upload(page, await makeImage(page, { width: 800, height: 600 }));
    const img = page.getByAltText('To crop');
    await expect(img).toBeVisible();
    const b = (await img.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.75, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    const out = await download(page);
    const size = await imageSize(page, out.buffer, 'image/jpeg');
    expect(size.width).toBeGreaterThan(380);
    expect(size.width).toBeLessThan(420);
    expect(size.height).toBeGreaterThan(280);
    expect(size.height).toBeLessThan(320);
  });

  test('rotate 90° swaps dimensions', async ({ page }) => {
    await openTool(page, '/tools/image/rotate');
    await upload(page, await makeImage(page, { width: 800, height: 500 }));
    await page.getByRole('button', { name: 'Rotate right 90°' }).click();
    await page.getByRole('button', { name: 'Apply and export' }).click();
    const out = await download(page);
    expect(await imageSize(page, out.buffer, 'image/jpeg')).toEqual({ width: 500, height: 800 });
  });

  test('metadata viewer shows EXIF camera make', async ({ page }) => {
    await openTool(page, '/tools/image/metadata');
    await upload(page, withExif(await makeImage(page, { width: 400, height: 300 })));
    await expect(page.locator('main')).toContainText('BenchCam');
  });

  test('remove metadata strips EXIF', async ({ page }) => {
    await openTool(page, '/tools/image/remove-metadata');
    const src = withExif(await makeImage(page, { width: 400, height: 300 }));
    expect((await exifr.parse(src.buffer))?.Make).toBe('BenchCam');
    await upload(page, src);
    await page.getByRole('button', { name: 'Remove metadata' }).click();
    const out = await download(page, 'Download result');
    expect(await exifr.parse(out.buffer).catch(() => undefined)).toBeFalsy();
  });
});

test.describe('ZIP', () => {
  test('File Compressor bundles files and de-duplicates names', async ({ page }) => {
    await openTool(page, '/tools/utilities/archive');
    const text = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello '.repeat(2000)) };
    await upload(page, [text, { ...text, buffer: Buffer.from('second') }, await makePdf({ pages: 1 })]);
    await page.getByRole('button', { name: 'Create ZIP' }).click();
    const out = await download(page);
    const zip = await JSZip.loadAsync(out.buffer);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['notes (1).txt', 'notes.txt', 'page.pdf']);
    expect(await zip.file('notes.txt')!.async('string')).toBe('hello '.repeat(2000));
    expect(out.buffer.length).toBeLessThan(12000 + 1000); // text compressed well
  });
});

test.describe('video tools (WebCodecs via Mediabunny)', () => {
  test('trim shortens the clip (WebM and MP4)', async ({ page }) => {
    for (const container of ['webm', 'mp4'] as const) {
      const clip = container === 'mp4' ? await makeMp4(page, 4) : await makeWebm(page, 4);
      await openTool(page, '/tools/video/trim');
      await upload(page, clip);
      await page.getByLabel(/^End/).fill('2');
      await page.getByRole('button', { name: 'Trim video' }).click();
      const out = await download(page);
      expect(out.name.endsWith(`.${container}`)).toBe(true);
      const info = await mediaInfo(page, out.buffer, `video/${container}`);
      expect(info.duration, container).toBeGreaterThan(1.5);
      expect(info.duration, container).toBeLessThan(2.6);
    }
  });

  test('change resolution to 320x180', async ({ page }) => {
    await openTool(page, '/tools/video/resolution');
    await upload(page, await makeWebm(page, 2));
    const [w, h] = [page.locator('main input[type=number]').nth(0), page.locator('main input[type=number]').nth(1)];
    await w.fill('320');
    await h.fill('180');
    await page.getByRole('button', { name: 'Change resolution' }).click();
    const out = await download(page);
    const info = await mediaInfo(page, out.buffer, 'video/webm');
    expect([info.width, info.height]).toEqual([320, 180]);
  });

  test('convert to MOV, MKV and an animated GIF', async ({ page }) => {
    await openTool(page, '/tools/video/convert');
    await upload(page, await makeWebm(page, 3));
    for (const [label, ext] of [['MOV', 'mov'], ['MKV', 'mkv']] as const) {
      await page.getByRole('radio', { name: label, exact: true }).click();
      await page.getByRole('button', { name: `Convert to ${label}` }).click();
      const out = await download(page);
      expect(out.name.endsWith(`.${ext}`)).toBe(true);
      if (ext === 'mov') expect(out.buffer.subarray(4, 12).toString('latin1')).toBe('ftypqt  ');
      else expect(out.buffer.subarray(0, 4).toString('hex')).toBe('1a45dfa3'); // Matroska
    }
    await page.getByRole('radio', { name: 'GIF', exact: true }).click();
    await expect(page.getByText('no sound').first()).toBeVisible();
    await page.getByRole('button', { name: 'Convert to GIF' }).click();
    const gif = await download(page);
    expect(gif.name).toMatch(/\.gif$/);
    expect(gif.buffer.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    // Several frames: each starts with a graphic control extension (21 F9 04).
    const frames = gif.buffer.toString('hex').split('21f904').length - 1;
    expect(frames).toBeGreaterThan(10);
    // The width picker starts at the largest size that fits the 640 px clip.
    const size = await imageSize(page, gif.buffer, 'image/gif');
    expect(size.width).toBe(640);
  });

  test('convert WebM to MP4 with AAC audio', async ({ page }) => {
    await openTool(page, '/tools/video/convert');
    await upload(page, await makeWebm(page, 2));
    await page.getByRole('button', { name: 'Convert to MP4' }).click();
    const out = await download(page);
    expect(out.name).toMatch(/\.mp4$/);
    expect(out.buffer.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(out.buffer.includes(Buffer.from('mp4a'))).toBe(true); // AAC audio, plays in Safari/QuickTime
    expect(out.buffer.includes(Buffer.from('Opus'))).toBe(false);
    const info = await mediaInfo(page, out.buffer, 'video/mp4');
    expect(info.duration).toBeGreaterThan(1.5);
    expect([info.width, info.height]).toEqual([640, 360]);
  });

  test('compress makes the video smaller, also with a lower resolution', async ({ page }) => {
    await openTool(page, '/tools/video/compress');
    const src = await makeWebm(page, 3);
    await upload(page, src);
    await expect(page.getByTestId('savings-ring')).toHaveAttribute('aria-label', /~\d+% smaller/);
    await page.getByRole('button', { name: 'Compress video' }).click();
    const out = await download(page);
    expect(out.buffer.length).toBeLessThan(src.buffer.length * 0.8);
    expect((await mediaInfo(page, out.buffer, 'video/webm')).duration).toBeGreaterThan(2.5);

    await page.getByRole('radio', { name: /^Strong —/ }).click();
    await page.getByText('More options').click();
    await page.getByLabel('Maximum resolution').selectOption('240');
    await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Compress video' }).click();
    await expect(page.getByRole('button', { name: /Download/ })).toBeVisible({ timeout: 60_000 });
    const small = await download(page);
    expect(small.buffer.length).toBeLessThan(out.buffer.length);
    const info = await mediaInfo(page, small.buffer, 'video/webm');
    expect(Math.min(info.width, info.height)).toBe(240);
  });

  test('compress an MP4 and cancel a running job', async ({ page }) => {
    const src = await makeMp4(page, 6);
    await openTool(page, '/tools/video/compress');
    await upload(page, src);
    await page.getByRole('button', { name: 'Compress video' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Compress video' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Compress video' }).click();
    const out = await download(page);
    expect(out.name).toMatch(/\.mp4$/);
    expect(out.buffer.length).toBeLessThan(src.buffer.length);
  });
});

test.describe('audio tools', () => {
  test('trim exports a shorter WAV', async ({ page }) => {
    await openTool(page, '/tools/audio/trim');
    await upload(page, makeWav(4));
    await page.getByLabel(/^End/).fill('1.5');
    await page.getByRole('button', { name: 'Trim & export as WAV' }).click();
    const out = await download(page);
    expect(out.buffer.subarray(0, 4).toString('latin1')).toBe('RIFF');
    const info = await mediaInfo(page, out.buffer, 'audio/wav');
    expect(info.duration).toBeCloseTo(1.5, 1);
  });

  test('convert to MP3, AAC, Opus and WAV much faster than real time', async ({ page }) => {
    await openTool(page, '/tools/audio/convert');
    const src = makeWav(20);
    await upload(page, src);
    const targets = [['MP3', 'mp3', 'audio/mpeg'], ['AAC', 'm4a', 'audio/mp4'], ['Opus', 'ogg', 'audio/ogg'], ['WAV', 'wav', 'audio/wav']] as const;
    for (const [label, ext, mime] of targets) {
      await page.getByLabel(new RegExp(`^${label}`)).check();
      const started = Date.now();
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      const out = await download(page);
      expect(Date.now() - started, label).toBeLessThan(8000); // 20 s of audio; the old encoder took 20 s
      expect(out.name).toBe(`tone.${ext}`);
      expect((await mediaInfo(page, out.buffer, mime)).duration, label).toBeCloseTo(20, 0);
      if (ext !== 'wav') expect(out.buffer.length).toBeLessThan(src.buffer.length / 4);
      if (ext === 'mp3') expect(out.buffer[0] === 0xff || out.buffer.subarray(0, 3).toString('latin1') === 'ID3').toBe(true);
    }
  });

  test('compress shrinks a WAV to the chosen bitrate', async ({ page }) => {
    await openTool(page, '/tools/audio/compress');
    const src = makeWav(10);
    await upload(page, src);
    await page.getByRole('radio', { name: /^Strong —/ }).click();
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    const out = await download(page);
    // 64 kb/s × 10 s ≈ 80 KB (+ container overhead)
    expect(out.buffer.length).toBeLessThan(110_000);
    expect((await mediaInfo(page, out.buffer, 'audio/ogg')).duration).toBeCloseTo(10, 0);
  });

  test('extract copies the soundtrack out of a video without re-encoding', async ({ page }) => {
    const cases = [['webm', 'ogg'], ['mp4', 'm4a']] as const;
    for (const [container, ext] of cases) {
      const clip = container === 'mp4' ? await makeMp4(page, 3) : await makeWebm(page, 3);
      await openTool(page, '/tools/audio/extract');
      await upload(page, clip);
      await page.getByRole('button', { name: 'Extract audio' }).click();
      await expect(page.getByText('Copied without re-encoding')).toBeVisible();
      const out = await download(page);
      expect(out.name.endsWith(`.${ext}`)).toBe(true);
      expect((await mediaInfo(page, out.buffer, ext === 'ogg' ? 'audio/ogg' : 'audio/mp4')).duration).toBeGreaterThan(2.2);
    }
  });
});

test.describe('tool chaining', () => {
  test('a PDF result can be continued in another tool without re-uploading', async ({ page }) => {
    await openTool(page, '/tools/pdf/merge');
    await upload(page, [await makePdf({ pages: 2, label: 'A' }), await makePdf({ pages: 1, label: 'B' })]);
    await page.getByRole('button', { name: 'Merge PDFs' }).click();
    await expect(page.getByRole('button', { name: /Download/ })).toBeVisible();
    // A tool never offers its own result back to itself.
    await expect(page.getByRole('button', { name: 'Use this file' })).toHaveCount(0);
    // "Continue with" opens the next tool with the result already loaded.
    await expect(page.getByRole('heading', { name: 'Continue with merged.pdf' })).toBeVisible();
    await page.getByRole('link', { name: 'Split PDF' }).first().click();
    await expect(page).toHaveURL(/\/tools\/pdf\/split/);
    await expect(page.locator('main')).toContainText('merged.pdf · 3 pages');
    await page.getByRole('button', { name: 'Split PDF' }).click();
    const zip = await JSZip.loadAsync((await download(page)).buffer);
    expect(Object.keys(zip.files).filter((n) => n.endsWith('.pdf'))).toHaveLength(3);
  });

  test('a PDF result is not offered to an image tool', async ({ page }) => {
    await openTool(page, '/tools/pdf/merge');
    await upload(page, [await makePdf({ pages: 1, label: 'A' }), await makePdf({ pages: 1, label: 'B' })]);
    await page.getByRole('button', { name: 'Merge PDFs' }).click();
    await expect(page.getByRole('button', { name: /Download/ })).toBeVisible();
    await page.getByRole('button', { name: 'All tools' }).click();
    await page.getByRole('menuitem', { name: 'Image Compressor' }).click();
    await expect(page.locator('input[type=file]')).toBeAttached();
    await expect(page.getByText(/Continue with/)).toHaveCount(0);
  });
});
