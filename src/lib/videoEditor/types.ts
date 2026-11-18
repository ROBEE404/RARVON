/**
 * Video Editor project model. A project is plain JSON (saved as project.json)
 * plus the media files it uses, stored next to it by id.
 *
 * Tracks:
 * - video: clips play back to back in order (no gaps), so a clip has no start
 *   time of its own; its position comes from the clips before it.
 * - text and audio: clips sit at a free `start` time and may overlap the video.
 */

import type { ExportSettings } from './exportSettings';

export type Aspect = '16:9' | '9:16' | '1:1';
export type MediaType = 'video' | 'image' | 'audio';

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  mime: string;
  size: number;
  /** Seconds; images have none (their clips set a duration). */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Small JPEG data URL for the media bin and timeline. */
  thumb?: string;
}

interface ClipBase {
  id: string;
  fadeIn: number;
  fadeOut: number;
}

/** A piece of a video or image on the video track. */
export interface VisualClip extends ClipBase {
  mediaId: string;
  /** Source in and out points in seconds (for images: 0 and the shown duration). */
  in: number;
  out: number;
  speed: number;
  volume: number;
  muted: boolean;
  /** 'contain' keeps the whole picture (bars if needed); 'cover' fills the frame. */
  fit: 'contain' | 'cover';
}

export interface AudioClip extends ClipBase {
  mediaId: string;
  start: number;
  in: number;
  out: number;
  volume: number;
}

export interface TextClip extends ClipBase {
  start: number;
  duration: number;
  text: string;
  /** Font size as a fraction of the frame height. */
  size: number;
  color: string;
  position: 'top' | 'center' | 'bottom';
  box: boolean;
}

export interface Timeline {
  video: VisualClip[];
  text: TextClip[];
  audio: AudioClip[];
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  aspect: Aspect;
  createdAt: number;
  updatedAt: number;
  /** Keep this project in the browser (auto-save). When false the browser copy is only a recovery copy. */
  browserSave: boolean;
  /** Also write every change to a folder on the computer (Chrome and Edge). */
  folderSave: boolean;
  /** True once the person has edited the project in a session and hasn't chosen what to do with it yet. */
  pendingChoice: boolean;
  media: MediaItem[];
  timeline: Timeline;
  /** Last settings used on the Export tab. */
  export?: ExportSettings;
}

export type TrackKind = keyof Timeline;
export type AnyClip = VisualClip | TextClip | AudioClip;

export const ASPECTS: Record<Aspect, { label: string; hint: string; w: number; h: number }> = {
  '16:9': { label: '16:9', hint: 'YouTube, landscape', w: 16, h: 9 },
  '9:16': { label: '9:16', hint: 'Shorts, Reels, TikTok', w: 9, h: 16 },
  '1:1': { label: '1:1', hint: 'Square posts', w: 1, h: 1 },
};

export const IMAGE_DEFAULT_DURATION = 3;
export const TEXT_DEFAULT_DURATION = 3;
export const MIN_CLIP = 0.1;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyProject(name: string, aspect: Aspect, browserSave: boolean, folderSave: boolean): Project {
  const now = Date.now();
  return {
    version: 1, id: uid(), name, aspect, createdAt: now, updatedAt: now,
    browserSave, folderSave, pendingChoice: false,
    media: [], timeline: { video: [], text: [], audio: [] },
  };
}

export function visualDuration(c: VisualClip) {
  return (c.out - c.in) / c.speed;
}
export function audioDuration(c: AudioClip) {
  return c.out - c.in;
}

/** Start time of every clip on the video track. */
export function videoStarts(clips: VisualClip[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const c of clips) {
    starts.push(t);
    t += visualDuration(c);
  }
  return starts;
}

export function videoTrackEnd(clips: VisualClip[]) {
  return clips.reduce((t, c) => t + visualDuration(c), 0);
}

export function totalDuration(tl: Timeline) {
  return Math.max(
    videoTrackEnd(tl.video),
    ...tl.text.map((c) => c.start + c.duration),
    ...tl.audio.map((c) => c.start + audioDuration(c)),
    0,
  );
}

/** The video-track clip showing at time t, with its start and the matching source time. */
export function visualAt(clips: VisualClip[], t: number) {
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const d = visualDuration(c);
    if (t >= start && t < start + d) return { clip: c, index: i, start, sourceTime: c.in + (t - start) * c.speed };
    start += d;
  }
  return null;
}

/** 0..1 opacity for a clip at local time `local` (seconds since the clip started) with fades. */
export function fadeAlpha(local: number, duration: number, fadeIn: number, fadeOut: number) {
  let a = 1;
  if (fadeIn > 0 && local < fadeIn) a = Math.min(a, local / fadeIn);
  if (fadeOut > 0 && local > duration - fadeOut) a = Math.min(a, (duration - local) / fadeOut);
  return Math.max(0, Math.min(1, a));
}

export function hasEdits(tl: Timeline) {
  return tl.video.length + tl.text.length + tl.audio.length > 0;
}

export function formatTime(sec: number, withFraction = true) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const base = `${m}:${String(whole).padStart(2, '0')}`;
  return withFraction ? `${base}.${Math.floor((rest - whole) * 10)}` : base;
}

/** Splits the clip on a track at timeline time t. Returns the new timeline, or null when t isn't inside a clip. */
export function splitAt(tl: Timeline, kind: TrackKind, clipId: string, t: number): Timeline | null {
  if (kind === 'video') {
    const starts = videoStarts(tl.video);
    const i = tl.video.findIndex((c) => c.id === clipId);
    if (i < 0) return null;
    const c = tl.video[i];
    const local = t - starts[i];
    if (local < MIN_CLIP || local > visualDuration(c) - MIN_CLIP) return null;
    const cut = c.in + local * c.speed;
    const a: VisualClip = { ...c, out: cut, fadeOut: 0 };
    const b: VisualClip = { ...c, id: uid(), in: cut, fadeIn: 0 };
    return { ...tl, video: [...tl.video.slice(0, i), a, b, ...tl.video.slice(i + 1)] };
  }
  if (kind === 'audio') {
    const i = tl.audio.findIndex((c) => c.id === clipId);
    if (i < 0) return null;
    const c = tl.audio[i];
    const local = t - c.start;
    if (local < MIN_CLIP || local > audioDuration(c) - MIN_CLIP) return null;
    const a: AudioClip = { ...c, out: c.in + local, fadeOut: 0 };
    const b: AudioClip = { ...c, id: uid(), start: t, in: c.in + local, fadeIn: 0 };
    return { ...tl, audio: [...tl.audio.slice(0, i), a, b, ...tl.audio.slice(i + 1)] };
  }
  const i = tl.text.findIndex((c) => c.id === clipId);
  if (i < 0) return null;
  const c = tl.text[i];
  const local = t - c.start;
  if (local < MIN_CLIP || local > c.duration - MIN_CLIP) return null;
  const a: TextClip = { ...c, duration: local, fadeOut: 0 };
  const b: TextClip = { ...c, id: uid(), start: t, duration: c.duration - local, fadeIn: 0 };
  return { ...tl, text: [...tl.text.slice(0, i), a, b, ...tl.text.slice(i + 1)] };
}

/** The clip under time t on a track (used when nothing is selected and Split is pressed). */
export function clipAt(tl: Timeline, kind: TrackKind, t: number): string | null {
  if (kind === 'video') return visualAt(tl.video, t)?.clip.id ?? null;
  if (kind === 'audio') return tl.audio.find((c) => t >= c.start && t < c.start + audioDuration(c))?.id ?? null;
  return tl.text.find((c) => t >= c.start && t < c.start + c.duration)?.id ?? null;
}

export function removeClip(tl: Timeline, kind: TrackKind, id: string): Timeline {
  if (kind === 'video') return { ...tl, video: tl.video.filter((c) => c.id !== id) };
  if (kind === 'audio') return { ...tl, audio: tl.audio.filter((c) => c.id !== id) };
  return { ...tl, text: tl.text.filter((c) => c.id !== id) };
}

/** Media no clip uses any more can be dropped from the project when it is saved as a file. */
export function usedMediaIds(tl: Timeline) {
  return new Set([...tl.video.map((c) => c.mediaId), ...tl.audio.map((c) => c.mediaId)]);
}
