import type { VideoInfo } from './videoEngine';

/**
 * Target bitrates for compression, derived from the source instead of fixed
 * presets: a fixed "low quality" bitrate can be *higher* than an already
 * efficient source, which made compressed files grow. Audio is budgeted at
 * up to 128 kb/s and the rest is assumed to be video.
 */
export function compressionBitrates(info: VideoInfo, level: 'high' | 'medium' | 'low', outPixels?: number) {
  const audio = info.hasAudio ? Math.min(128_000, info.bitrate * 0.15) : 0;
  const sourceVideo = Math.max(50_000, info.bitrate - audio);
  const factor = { high: 0.7, medium: 0.45, low: 0.25 }[level];
  // When the resolution is also reduced, scale the budget with the pixel count.
  const pixelScale = outPixels ? Math.min(1, outPixels / (info.width * info.height)) : 1;
  const video = Math.max(80_000, Math.round(sourceVideo * factor * Math.max(pixelScale, 0.35)));
  const audioOut = info.hasAudio ? { high: 128_000, medium: 96_000, low: 64_000 }[level] : undefined;
  return { video, audio: audioOut && audio > 0 ? Math.min(audioOut, Math.max(48_000, audio)) : audioOut };
}
