import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

/**
 * `test` with a guard that fails any test whose page logs a console error or
 * throws an uncaught exception — this is what catches render loops, broken
 * lazy chunks and React errors that a "the button exists" check would miss.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use(errors);
      expect(errors, 'console errors during test').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Uploads through the tool's real <input type=file>, like a user picking files. */
export async function upload(page: Page, files: UploadFile | UploadFile[]) {
  await page.locator('input[type=file]').first().setInputFiles(Array.isArray(files) ? files : [files]);
}

/** Clicks a download button and returns the downloaded bytes + suggested name. */
export async function download(page: Page, name: string | RegExp = /Download/) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).first().click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), buffer: await readFile(path) };
}

export async function openTool(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('input[type=file]').first()).toBeAttached();
}

// ---------- fixtures generated in Node ----------

export async function makePdf(opts: { pages?: number; rotateSecond?: boolean; label?: string } = {}) {
  const { pages = 3, rotateSecond = false, label = 'Page' } = opts;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${label} ${i + 1}`, { x: 50, y: 780, size: 28, font });
    p.drawRectangle({ x: 50, y: 50, width: 120, height: 120, color: rgb(0.8, 0.1, 0.1) });
    if (rotateSecond && i === 1) p.setRotation(degrees(90));
  }
  return { name: `${label.toLowerCase()}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

/** 16-bit mono PCM WAV with a sine tone. */
export function makeWav(seconds = 3, sampleRate = 44100): UploadFile {
  const n = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000), 44 + i * 2);
  return { name: 'tone.wav', mimeType: 'audio/wav', buffer: buf };
}

// ---------- fixtures generated in the browser (needs canvas / MediaRecorder) ----------

/** A photo-like image with colored shapes and text, encoded by the browser. */
export async function makeImage(page: Page, opts: { width?: number; height?: number; type?: 'image/png' | 'image/jpeg'; name?: string } = {}) {
  const { width = 1200, height = 800, type = 'image/jpeg' } = opts;
  const b64 = await page.evaluate(
    async ({ width, height, type }) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, '#1d4ed8');
      g.addColorStop(1, '#f59e0b');
      x.fillStyle = g;
      x.fillRect(0, 0, width, height);
      for (let i = 0; i < 150; i++) {
        x.fillStyle = `hsl(${(i * 37) % 360},70%,55%)`;
        x.beginPath();
        x.arc((i * 97) % width, (i * 53) % height, 10 + (i % 40), 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#000';
      x.font = `${Math.round(height / 10)}px sans-serif`;
      x.fillText('Rarvon test 123', width * 0.1, height * 0.5);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.95));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    },
    { width, height, type },
  );
  const ext = type === 'image/png' ? 'png' : 'jpg';
  return { name: opts.name ?? `photo.${ext}`, mimeType: type, buffer: Buffer.from(b64, 'base64') };
}

/** A few seconds of WebM (VP8/VP9 + Opus) recorded from an animated canvas and an oscillator. */
export async function makeWebm(page: Page, seconds = 3) {
  const b64 = await page.evaluate(async ({ seconds }) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const x = c.getContext('2d')!;
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dst = ac.createMediaStreamDestination();
    osc.connect(dst);
    osc.start();
    // Under load the audio clock can start late; record only once sound is flowing.
    await ac.resume();
    while (ac.state !== 'running' || ac.currentTime === 0) await new Promise((r) => setTimeout(r, 20));
    const stream = c.captureStream(30);
    dst.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m))!;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let f = 0;
    const iv = setInterval(() => {
      x.fillStyle = `hsl(${(f * 5) % 360},60%,50%)`;
      x.fillRect(0, 0, 640, 360);
      x.fillStyle = '#fff';
      x.font = '60px sans-serif';
      x.fillText(`frame ${f++}`, 50, 200);
    }, 33);
    rec.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    clearInterval(iv);
    osc.stop();
    await ac.close();
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }, { seconds });
  return { name: 'clip.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') };
}

/**
 * An MP4 (H.264 + AAC) made by running a recorded WebM through the app's own
 * Video Converter — headless Chromium's MediaRecorder can't record MP4.
 */
export async function makeMp4(page: Page, seconds = 3): Promise<UploadFile> {
  const webm = await makeWebm(page, seconds);
  await page.goto('/tools/video/convert');
  await page.locator('input[type=file]').first().setInputFiles(webm);
  await page.getByRole('button', { name: 'Convert to MP4' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download/ }).click()]);
  return { name: 'clip.mp4', mimeType: 'video/mp4', buffer: await readFile(await dl.path()) };
}

// ---------- analysis of outputs ----------

export async function pdfInfo(buffer: Buffer) {
  const doc = await PDFDocument.load(buffer);
  return {
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((p) => ({ w: Math.round(p.getWidth()), h: Math.round(p.getHeight()), rotation: p.getRotation().angle })),
    title: doc.getTitle(),
    author: doc.getAuthor(),
  };
}

/** Extracts text per page with pdfjs (Node legacy build). */
export async function pdfText(buffer: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  await task.destroy();
  return out;
}

/** Decodes an image in the browser and returns its real dimensions. */
export async function imageSize(page: Page, buffer: Buffer, mimeType: string) {
  return page.evaluate(
    async ({ b64, mimeType }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: mimeType }));
      return { width: bmp.width, height: bmp.height };
    },
    { b64: buffer.toString('base64'), mimeType },
  );
}

/** Loads a media file in a <video>/<audio> element and returns what the browser sees. */
export async function mediaInfo(page: Page, buffer: Buffer, mimeType: string) {
  return page.evaluate(
    async ({ b64, mimeType }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const el = document.createElement(mimeType.startsWith('audio') ? 'audio' : 'video') as HTMLVideoElement;
      el.preload = 'metadata';
      el.src = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      await new Promise<void>((res, rej) => {
        el.onloadedmetadata = () => res();
        el.onerror = () => rej(new Error('media failed to load'));
      });
      // WebM from MediaRecorder reports Infinity until seeked to the end.
      if (!Number.isFinite(el.duration)) {
        el.currentTime = 1e9;
        await new Promise((r) => (el.ontimeupdate = r));
      }
      return { duration: el.duration, width: el.videoWidth ?? 0, height: el.videoHeight ?? 0 };
    },
    { b64: buffer.toString('base64'), mimeType },
  );
}
