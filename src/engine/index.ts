/**
 * The one place that decides which engine Rarvon runs on. Tools import
 * `engine` and the helpers below from here, never from `src/lib` directly.
 */
import type { Engine } from './types';
import { browserEngine } from './browser';
import { nativeEngine } from './native';
import { hasNativeEngine } from './info';
import { CancelledError, ExportCancelled, VideoCancelledError } from '../lib/jobErrors';
import { tr } from '../lib/i18n';

export type { Engine, EngineKind, VideoEngine, AudioEngine, ImageEngine, PdfEngine, PdfDocument, OcrEngine, AiEngine } from './types';

export { isBenchApp, engineInfo, showsBrowserWarning } from './info';

/**
 * The engine for this session: in Rarvon for desktop, video and audio run in
 * FFmpeg on this computer; on the website, everything runs in the browser.
 */
export const engine: Engine = hasNativeEngine ? nativeEngine : browserEngine;

export { PasswordRequired } from '../lib/jobErrors';
export { UnsupportedImageError } from '../lib/imageDecoders';

/** True when a job ended because the person pressed Cancel (in any engine). */
export function isCancelled(e: unknown): boolean {
  return e instanceof CancelledError || e instanceof VideoCancelledError || e instanceof ExportCancelled;
}

/** A friendly message when a video is too big for this engine, or null when it's fine. */
export function videoTooBig(file: File): string | null {
  const max = engine.maxVideoBytes;
  if (max === null || file.size <= max) return null;
  const mb = (n: number) => Math.round(n / (1024 * 1024));
  return tr('This file is {size} MB, above the {max} MB limit for video in the browser. The whole file has to fit in the tab’s memory, so very large files can crash it. Try a shorter clip or a lower resolution first.', { size: mb(file.size), max: mb(max) });
}

// Shared lists, types and pure helpers the tools use alongside the engine.
export { AUDIO_TARGETS } from '../lib/audioTargets';
export type { AudioTarget, AudioTargetInfo } from '../lib/audioTargets';
export type { AudioInfo, AudioJobOptions } from '../lib/audioEngine';
export { compressionBitrates } from '../lib/videoBitrates';
export type { VideoInfo, OutputContainer, WriteContainer, RunConversionOptions, GifOptions } from '../lib/videoEngine';
export type { ImageFormatOption } from '../lib/imageFormatSupport';
// SVG has no fixed size: helpers to detect it and read its intended size.
export { isSvg, guessSvgDimensions } from '../lib/imageFormatSupport';
export type { PdfPageText } from '../lib/pdfjs';
export type { OcrLanguage, OcrLayout, OcrProgress, OcrResult } from '../lib/ocrEngine';
export type { BackgroundRemover, MaskResult } from '../lib/backgroundRemoval';
// Picture preparation for text recognition: plain canvas work, the same in every engine.
export { decodeImage, preprocessForOcr } from '../lib/ocrPreprocess';
// Rarvon's own still/animated writers, for tools that build pictures themselves.
export { encodeBmp, encodeGif, encodeTiff } from '../lib/imageEncoders';
