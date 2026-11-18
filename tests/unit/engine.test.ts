import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { engine, isBenchApp, isCancelled, videoTooBig } from '../../src/engine';
import { CancelledError, ExportCancelled, VideoCancelledError } from '../../src/lib/jobErrors';

const fakeFile = (bytes: number) => ({ size: bytes, name: 'clip.mp4' }) as File;
const MB = 1024 * 1024;

describe('engine', () => {
  it('runs the browser engine on the website, with browser warnings on', () => {
    expect(isBenchApp()).toBe(false);
    expect(engine.kind).toBe('browser');
    expect(engine.showsBrowserWarnings).toBe(true);
  });

  it('accepts videos up to the browser limit and explains when one is too big', () => {
    expect(engine.maxVideoBytes).toBe(250 * MB);
    expect(videoTooBig(fakeFile(250 * MB))).toBeNull();
    expect(videoTooBig(fakeFile(300 * MB))).toContain('300 MB');
  });

  it('recognises Cancel from every kind of job', () => {
    expect(isCancelled(new CancelledError())).toBe(true);
    expect(isCancelled(new VideoCancelledError())).toBe(true);
    expect(isCancelled(new ExportCancelled())).toBe(true);
    expect(isCancelled(new Error('real failure'))).toBe(false);
  });

  it('tools only reach video, audio, image, PDF, OCR and AI work through the engine', () => {
    const internals = /lib\/(videoEngine|audioEngine|videoAudioCapture|videoEditor\/exporter|pdfjs|ocrEngine|ocrPreprocess|backgroundRemoval|imageFormatSupport|imageEncoders|imageDecoders|documentEncoders)'/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && internals.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    for (const dir of ['src/tools', 'src/pages', 'src/components']) walk(dir);
    expect(offenders).toEqual([]);
  });
});
