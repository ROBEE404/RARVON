/**
 * The few engine facts every page needs (tool cards, search, the tool page
 * header), kept apart from the engine itself so the home page loads nothing
 * else. Tools that do work import the full engine from `src/engine`.
 */
import type { EngineKind } from './types';

declare global {
  interface Window {
    /** Set by Rarvon for desktop (the Rarvon Engine) on the page it serves. */
    __BENCH_APP__?: { version: string; key: string; ffmpeg?: boolean };
  }
}

/** True inside Rarvon for desktop: the Rarvon Engine marks the page it serves. */
export function isBenchApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__BENCH_APP__);
}

export interface EngineInfo {
  kind: EngineKind;
  /** Largest video file accepted, in bytes (null = no limit). */
  maxVideoBytes: number | null;
  /** Whether tools marked "experimental" show their browser-limits warning. */
  showsBrowserWarnings: boolean;
  /** Tools ("category/slug") this engine runs natively, without browser limits. */
  nativeTools: ReadonlySet<string>;
  /** Which video files the video tools accept, and how that's described. */
  videoAccept: string;
  videoHint: string;
}

/** The browser engine's facts. (The app's native engine will report its own.) */
export const BROWSER_INFO: EngineInfo = {
  kind: 'browser',
  maxVideoBytes: 250 * 1024 * 1024,
  showsBrowserWarnings: true,
  nativeTools: new Set(),
  videoAccept: 'video/mp4,video/webm,video/quicktime,video/x-matroska,.mkv,.mov',
  videoHint: 'MP4, MOV, WebM or MKV, up to 250MB',
};

/** Rarvon for desktop with FFmpeg: video and audio on this computer, no size limit. */
export const NATIVE_INFO: EngineInfo = {
  kind: 'native',
  maxVideoBytes: null,
  showsBrowserWarnings: false,
  nativeTools: new Set(['video/convert', 'video/compress', 'video/trim', 'video/resolution', 'audio/convert', 'audio/compress', 'audio/extract']),
  videoAccept: 'video/*,.mkv,.mov,.avi,.wmv,.flv,.ts,.mts,.m2ts,.m4v,.3gp,.mpg,.mpeg,.vob,.ogv',
  videoHint: 'Any video: MP4, MOV, MKV, AVI, WMV and more, any size',
};

/** Whether this page runs in Rarvon for desktop with its FFmpeg engine. */
export const hasNativeEngine = typeof window !== 'undefined' && Boolean(window.__BENCH_APP__?.ffmpeg);

export const engineInfo: EngineInfo = hasNativeEngine ? NATIVE_INFO : BROWSER_INFO;

/**
 * Whether a tool page shows the "experimental in the browser" warning: not for
 * tools the native engine runs (the warning is about browser limits).
 */
export function showsBrowserWarning(category: string, slug: string): boolean {
  return engineInfo.showsBrowserWarnings || !engineInfo.nativeTools.has(`${category}/${slug}`);
}
