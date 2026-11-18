import { Input, BlobSource, ALL_FORMATS, AudioBufferSink } from 'mediabunny';
import type { AudioClip, Timeline, VisualClip } from './types';
import { uid } from './types';

/**
 * Sound analysis for the Audio tab.
 *
 * A media file's sound is decoded once into:
 * - a loudness curve: one dB value per STEP seconds (10 ms), enough to find
 *   pauses and to draw the waveform at any zoom level instantly;
 * - a small mono copy for previewing cuts (16 kHz, or 8 kHz for long files).
 * Results are cached per media file, so switching clips or tabs is instant.
 */

export const STEP = 0.01;
const FLOOR_DB = -90;

export interface SoundAnalysis {
  duration: number;
  /** Loudness in dB per STEP seconds, from the start of the media file. */
  db: Float32Array;
  /** Mono copy for previews. */
  preview: Float32Array;
  previewRate: number;
}

const cache = new Map<string, Promise<SoundAnalysis>>();

export function analyseMedia(key: string, file: File, duration: number, onProgress?: (f: number) => void): Promise<SoundAnalysis> {
  let p = cache.get(key);
  if (!p) {
    p = decode(file, duration, onProgress);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function decode(file: File, duration: number, onProgress?: (f: number) => void): Promise<SoundAnalysis> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('This file has no audio track.');
  const first = await track.getFirstTimestamp();
  const dur = Math.max(duration, 0.01);
  const previewRate = dur > 30 * 60 ? 8000 : 16000;
  const windows = Math.ceil(dur / STEP) + 1;
  const sumSq = new Float64Array(windows);
  const counts = new Uint32Array(windows);
  const preview = new Float32Array(Math.ceil(dur * previewRate) + 1);
  const pCounts = new Uint16Array(preview.length);

  for await (const w of new AudioBufferSink(track).buffers()) {
    const buf = w.buffer;
    const sr = buf.sampleRate;
    const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
    const t0 = w.timestamp - first;
    for (let i = 0; i < buf.length; i++) {
      let v = 0;
      for (const ch of chans) v += ch[i];
      v /= chans.length;
      const t = t0 + i / sr;
      if (t < 0) continue;
      const wi = Math.floor(t / STEP);
      if (wi >= windows) break;
      sumSq[wi] += v * v;
      counts[wi]++;
      const pi = Math.floor(t * previewRate);
      if (pi < preview.length) {
        preview[pi] += v;
        pCounts[pi]++;
      }
    }
    onProgress?.(Math.min(1, (t0 + buf.duration) / dur));
  }
  const db = new Float32Array(windows);
  for (let i = 0; i < windows; i++) {
    db[i] = counts[i] ? Math.max(FLOOR_DB, 10 * Math.log10(sumSq[i] / counts[i] + 1e-12)) : FLOOR_DB;
  }
  for (let i = 0; i < preview.length; i++) if (pCounts[i] > 1) preview[i] /= pCounts[i];
  return { duration: dur, db, preview, previewRate };
}

export interface SilenceSettings {
  /** null = automatic. */
  thresholdDb: number | null;
  minPause: number;
  padding: number;
}

export const DEFAULT_SILENCE: SilenceSettings = { thresholdDb: null, minPause: 0.5, padding: 0.15 };

export interface Range {
  start: number;
  end: number;
}

/**
 * The quiet level between the room's background noise and the voice: a third
 * of the way up from the quiet end of the clip's loudness range.
 */
export function autoThreshold(db: Float32Array, from: number, to: number) {
  const a = Math.max(0, Math.floor(from / STEP));
  const b = Math.min(db.length, Math.ceil(to / STEP));
  const vals = Array.from(db.subarray(a, b)).sort((x, y) => x - y);
  if (!vals.length) return -45;
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const quiet = q(0.1);
  const loud = q(0.9);
  if (loud - quiet < 6) return quiet + 3; // no clear speech: only near-silence counts
  return Math.round(quiet + (loud - quiet) * 0.35);
}

/** Pauses in [from, to] (source seconds), already shrunk by the breathing room. */
export function findSilences(an: SoundAnalysis, from: number, to: number, s: SilenceSettings): { threshold: number; silences: Range[] } {
  const threshold = s.thresholdDb ?? autoThreshold(an.db, from, to);
  const out: Range[] = [];
  const a = Math.max(0, Math.floor(from / STEP));
  const b = Math.min(an.db.length, Math.ceil(to / STEP));
  let runStart = -1;
  const close = (endIdx: number) => {
    if (runStart < 0) return;
    const st = Math.max(from, runStart * STEP);
    const en = Math.min(to, endIdx * STEP);
    if (en - st >= s.minPause) {
      // Keep a little sound on both sides, except at the very start and end of the clip.
      const ps = st <= from + STEP ? st : st + s.padding;
      const pe = en >= to - STEP ? en : en - s.padding;
      if (pe - ps >= 0.05) out.push({ start: ps, end: pe });
    }
    runStart = -1;
  };
  for (let i = a; i < b; i++) {
    if (an.db[i] < threshold) {
      if (runStart < 0) runStart = i;
    } else close(i);
  }
  close(b);
  return { threshold, silences: out };
}

/** Sorted, merged union of ranges. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.end - r.start > 0.001).sort((x, y) => x.start - y.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.001) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** The parts of [from, to] not covered by cuts. */
export function keptRanges(from: number, to: number, cuts: Range[]): Range[] {
  const out: Range[] = [];
  let t = from;
  for (const c of mergeRanges(cuts)) {
    if (c.end <= from || c.start >= to) continue;
    if (c.start > t) out.push({ start: t, end: Math.min(c.start, to) });
    t = Math.max(t, c.end);
  }
  if (to - t > 0.001) out.push({ start: t, end: to });
  return out.filter((r) => r.end - r.start >= 0.04);
}

/**
 * Applies cuts (source seconds) to one clip.
 * - Music clips and video clips with `cutVideo`: the cut parts are removed and
 *   the rest closes up.
 * - Video clips without `cutVideo`: the picture keeps playing; the cut parts
 *   become muted pieces of the same clip.
 */
export function applyCuts(tl: Timeline, kind: 'video' | 'audio', clipId: string, cuts: Range[], cutVideo: boolean): Timeline {
  if (kind === 'audio') {
    const i = tl.audio.findIndex((c) => c.id === clipId);
    if (i < 0) return tl;
    const c = tl.audio[i];
    const kept = keptRanges(c.in, c.out, cuts);
    let at = c.start;
    const pieces: AudioClip[] = kept.map((r, k) => {
      const piece: AudioClip = { ...c, id: k === 0 ? c.id : uid(), in: r.start, out: r.end, start: at, fadeIn: k === 0 ? c.fadeIn : 0, fadeOut: k === kept.length - 1 ? c.fadeOut : 0 };
      at += r.end - r.start;
      return piece;
    });
    return { ...tl, audio: [...tl.audio.slice(0, i), ...pieces, ...tl.audio.slice(i + 1)] };
  }
  const i = tl.video.findIndex((c) => c.id === clipId);
  if (i < 0) return tl;
  const c = tl.video[i];
  const kept = keptRanges(c.in, c.out, cuts);
  let pieces: VisualClip[];
  if (cutVideo) {
    pieces = kept.map((r, k) => ({ ...c, id: k === 0 ? c.id : uid(), in: r.start, out: r.end, fadeIn: k === 0 ? c.fadeIn : 0, fadeOut: k === kept.length - 1 ? c.fadeOut : 0 }));
  } else {
    // Alternate kept (as they were) and cut (muted) pieces across the whole clip.
    const bounds: { r: Range; mute: boolean }[] = [];
    let t = c.in;
    for (const r of kept) {
      if (r.start > t) bounds.push({ r: { start: t, end: r.start }, mute: true });
      bounds.push({ r, mute: c.muted });
      t = r.end;
    }
    if (c.out > t + 0.001) bounds.push({ r: { start: t, end: c.out }, mute: true });
    pieces = bounds.map((b, k) => ({ ...c, id: k === 0 ? c.id : uid(), in: b.r.start, out: b.r.end, muted: b.mute, fadeIn: k === 0 ? c.fadeIn : 0, fadeOut: k === bounds.length - 1 ? c.fadeOut : 0 }));
  }
  if (!pieces.length) return tl;
  return { ...tl, video: [...tl.video.slice(0, i), ...pieces, ...tl.video.slice(i + 1)] };
}
