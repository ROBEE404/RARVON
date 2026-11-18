import { canEncodeVideo } from 'mediabunny';
import type { Aspect, Project, Timeline } from './types';
import { ASPECTS, audioDuration, totalDuration, videoStarts, visualDuration } from './types';

/** Export settings for the Video Editor's Export tab (saved with the project). */

export type ExportFormat = 'mp4' | 'webm' | 'mp3' | 'm4a' | 'wav';
export type ExportQuality = 'small' | 'balanced' | 'high';
export type ShortSide = 480 | 720 | 1080 | 1440 | 2160;

export interface ExportSettings {
  preset: string;
  /** Frame shape of the output; usually the project's. */
  aspect: Aspect;
  short: ShortSide;
  fps: 24 | 25 | 30 | 50 | 60;
  quality: ExportQuality;
  format: ExportFormat;
  /** Seconds on the project timeline; null = whole video. */
  range: { from: number; to: number } | null;
}

export const RESOLUTIONS: { short: ShortSide; label: string }[] = [
  { short: 480, label: '480p' },
  { short: 720, label: '720p (HD)' },
  { short: 1080, label: '1080p (Full HD)' },
  { short: 1440, label: '1440p (2K)' },
  { short: 2160, label: '2160p (4K)' },
];
export const FRAME_RATES = [24, 25, 30, 50, 60] as const;
export const FORMATS: { value: ExportFormat; label: string; audioOnly: boolean }[] = [
  { value: 'mp4', label: 'MP4 (H.264)', audioOnly: false },
  { value: 'webm', label: 'WebM (VP9)', audioOnly: false },
  { value: 'mp3', label: 'MP3 (audio only)', audioOnly: true },
  { value: 'm4a', label: 'M4A (audio only)', audioOnly: true },
  { value: 'wav', label: 'WAV (audio only)', audioOnly: true },
];

export interface Preset {
  id: string;
  name: string;
  hint: string;
  settings: Partial<ExportSettings>;
}

export const PRESETS: Preset[] = [
  { id: 'youtube', name: 'YouTube', hint: '1080p · 16:9 · 30 fps', settings: { aspect: '16:9', short: 1080, fps: 30, quality: 'balanced', format: 'mp4' } },
  { id: 'youtube-4k', name: 'YouTube 4K', hint: '2160p · 16:9 · high quality', settings: { aspect: '16:9', short: 2160, fps: 30, quality: 'high', format: 'mp4' } },
  { id: 'shorts', name: 'Shorts / Reels / TikTok', hint: '1080×1920 · 9:16', settings: { aspect: '9:16', short: 1080, fps: 30, quality: 'balanced', format: 'mp4' } },
  { id: 'instagram', name: 'Instagram post', hint: '1080×1080 · 1:1', settings: { aspect: '1:1', short: 1080, fps: 30, quality: 'balanced', format: 'mp4' } },
  { id: 'whatsapp', name: 'WhatsApp / small file', hint: '720p · smaller size', settings: { short: 720, fps: 30, quality: 'small', format: 'mp4' } },
  { id: 'audio', name: 'Audio only', hint: 'MP3 of the sound', settings: { format: 'mp3' } },
  { id: 'custom', name: 'Custom', hint: 'Choose everything yourself', settings: {} },
];

export function defaultSettings(project: Project): ExportSettings {
  return { preset: 'youtube', aspect: project.aspect, short: 1080, fps: 30, quality: 'balanced', format: 'mp4', range: null };
}

export function applyPreset(s: ExportSettings, preset: Preset, project: Project): ExportSettings {
  return { ...s, aspect: project.aspect, ...preset.settings, preset: preset.id };
}

/** Output pixel size for a frame shape and short side (even numbers, as encoders need). */
export function sizeFor(aspect: Aspect, short: number) {
  const { w, h } = ASPECTS[aspect];
  if (w === h) return { width: short, height: short };
  const long = Math.round((short * Math.max(w, h)) / Math.min(w, h) / 2) * 2;
  return w > h ? { width: long, height: short } : { width: short, height: long };
}

const BITS_PER_PIXEL: Record<ExportQuality, number> = { small: 0.045, balanced: 0.08, high: 0.13 };
const AUDIO_BITRATE: Record<ExportQuality, number> = { small: 96_000, balanced: 160_000, high: 256_000 };

export function videoBitrate(width: number, height: number, fps: number, q: ExportQuality) {
  // Higher frame rates need less than proportionally more bits.
  return Math.round(width * height * Math.pow(fps, 0.75) * Math.pow(30, 0.25) * BITS_PER_PIXEL[q]);
}
export function audioBitrate(q: ExportQuality, format: ExportFormat) {
  if (format === 'wav') return 48000 * 16 * 2;
  return AUDIO_BITRATE[q];
}

export function isAudioOnly(format: ExportFormat) {
  return FORMATS.find((f) => f.value === format)?.audioOnly ?? false;
}

export function exportDuration(project: Project, s: ExportSettings) {
  const total = totalDuration(project.timeline);
  return s.range ? Math.max(0, Math.min(total, s.range.to) - Math.max(0, s.range.from)) : total;
}

/** Estimated file size in bytes. */
export function estimateSize(project: Project, s: ExportSettings) {
  const d = exportDuration(project, s);
  const { width, height } = sizeFor(s.aspect, s.short);
  const v = isAudioOnly(s.format) ? 0 : videoBitrate(width, height, s.fps, s.quality);
  return Math.round(((v + audioBitrate(s.quality, s.format)) * d) / 8 * 1.02);
}

export function extensionFor(format: ExportFormat) {
  return format === 'm4a' ? 'm4a' : format;
}

const supportCache = new Map<string, Promise<boolean>>();
/** Whether this device can encode video at this size (checked once per size and codec). */
export function canEncodeSize(format: ExportFormat, width: number, height: number, fps: number) {
  if (isAudioOnly(format)) return Promise.resolve(true);
  const codec = format === 'webm' ? 'vp9' : 'avc';
  const key = `${codec}:${width}x${height}@${fps}`;
  let p = supportCache.get(key);
  if (!p) {
    p = canEncodeVideo(codec, { width, height, bitrate: videoBitrate(width, height, fps, 'balanced') }).catch(() => false);
    supportCache.set(key, p);
  }
  return p;
}

/** A copy of the timeline holding only [from, to), shifted to start at 0. */
export function cropTimeline(tl: Timeline, from: number, to: number): Timeline {
  const starts = videoStarts(tl.video);
  const video = tl.video.flatMap((c, i) => {
    const s = starts[i];
    const e = s + visualDuration(c);
    if (e <= from || s >= to) return [];
    const cutStart = Math.max(0, from - s) * c.speed;
    const cutEnd = Math.max(0, e - to) * c.speed;
    return [{ ...c, in: c.in + cutStart, out: c.out - cutEnd, fadeIn: s < from ? 0 : c.fadeIn, fadeOut: e > to ? 0 : c.fadeOut }];
  });
  const audio = tl.audio.flatMap((c) => {
    const s = c.start;
    const e = s + audioDuration(c);
    if (e <= from || s >= to) return [];
    const cutStart = Math.max(0, from - s);
    const cutEnd = Math.max(0, e - to);
    return [{ ...c, start: Math.max(0, s - from), in: c.in + cutStart, out: c.out - cutEnd, fadeIn: s < from ? 0 : c.fadeIn, fadeOut: e > to ? 0 : c.fadeOut }];
  });
  const text = tl.text.flatMap((c) => {
    const s = Math.max(c.start, from);
    const e = Math.min(c.start + c.duration, to);
    if (e <= s) return [];
    return [{ ...c, start: s - from, duration: e - s }];
  });
  return { video, audio, text };
}
