/// <reference lib="webworker" />
import UPNG from 'upng-js';

/**
 * Lossy PNG compression off the main thread: UPNG.js reduces the image to a
 * palette of at most `colors` colours (with alpha) and writes an optimized,
 * deflate-compressed PNG. colors = 0 means lossless re-compression only.
 */
self.onmessage = (e: MessageEvent<{ rgba: ArrayBuffer; width: number; height: number; colors: number }>) => {
  const { rgba, width, height, colors } = e.data;
  try {
    const out = UPNG.encode([rgba], width, height, colors);
    (self as unknown as Worker).postMessage({ png: out }, [out]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : 'PNG encoding failed' });
  }
};
