import type { Engine } from './types';
import type { AudioInfo } from '../lib/audioEngine';
import type { VideoInfo, OutputContainer } from '../lib/videoEngine';
import type { AudioTarget } from '../lib/audioTargets';
import { CancelledError, VideoCancelledError } from '../lib/jobErrors';
import { tr } from '../lib/i18n';
import { browserEngine } from './browser';
import { NATIVE_INFO } from './info';

/**
 * Rarvon for desktop: video and audio run in FFmpeg on this computer (its
 * graphics card when it has a video encoder), through the Rarvon Engine. Files
 * go only to the engine on this same computer, never over the internet.
 * Everything else (pictures, PDFs, text recognition, AI) still runs the
 * browser way, as does the Video Editor's export.
 */

const key = () => window.__BENCH_APP__?.key ?? '';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'X-Rarvon-Key': key(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || tr('The Rarvon app couldn’t do this.'));
  return data as T;
}

/** Each chosen file is handed to the engine once, however many times a tool uses it. */
const uploads = new WeakMap<File, Promise<string>>();
function upload(file: File): Promise<string> {
  let id = uploads.get(file);
  if (!id) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()! : '';
    id = fetch(`/__bench/upload?ext=${encodeURIComponent(ext)}`, {
      method: 'POST',
      headers: { 'X-Rarvon-Key': key(), 'Content-Type': 'application/octet-stream' },
      body: file,
    })
      .then((r) => r.json())
      .then((d: { id?: string; error?: string }) => {
        if (!d.id) throw new Error(d.error || tr('The Rarvon app couldn’t open this file.'));
        return d.id;
      });
    id.catch(() => uploads.delete(file));
    uploads.set(file, id);
  }
  return id;
}

interface Probe {
  format: string;
  duration: number;
  bitrate: number;
  video: { codec: string; width: number; height: number } | null;
  audio: { codec: string; sampleRate: number; channels: number } | null;
}

async function probe(file: File): Promise<Probe> {
  try {
    return await call<Probe>('/__bench/probe', { file: await upload(file) });
  } catch {
    throw new Error(tr('This file couldn’t be read. It may be damaged, or not a video or audio file.'));
  }
}

const CODEC_NAMES: Record<string, string> = { h264: 'avc', mp3float: 'mp3' };
const codecName = (c: string) => CODEC_NAMES[c] ?? c;

interface JobStatus { state: 'running' | 'done' | 'failed' | 'cancelled'; progress: number; error: string; mime: string; extension: string; copied: boolean }

/** Runs one job: start, report progress, stop on Cancel, then fetch the result. */
async function runJob(file: File, spec: Record<string, unknown>, onProgress?: (f: number) => void, signal?: AbortSignal, cancelled: () => Error = () => new VideoCancelledError()) {
  if (signal?.aborted) throw cancelled();
  const { id } = await call<{ id: string }>('/__bench/job', { file: await upload(file), ...spec });
  const stop = () => void call(`/__bench/job/${id}/cancel`).catch(() => undefined);
  signal?.addEventListener('abort', stop);
  try {
    for (;;) {
      const res = await fetch(`/__bench/job/${id}`, { headers: { 'X-Rarvon-Key': key() } });
      const status = (await res.json()) as JobStatus;
      if (status.state === 'cancelled' || signal?.aborted) throw cancelled();
      if (status.state === 'failed') throw new Error(tr('The conversion failed: {reason}', { reason: status.error }));
      onProgress?.(status.progress);
      if (status.state === 'done') {
        const result = await fetch(`/__bench/job/${id}/result`, { headers: { 'X-Rarvon-Key': key() } });
        if (!result.ok) throw new Error(tr('The Rarvon app couldn’t do this.'));
        return { blob: new Blob([await result.blob()], { type: status.mime }), status };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}

const encodable = new Map<string, Promise<boolean>>();

export const nativeEngine: Engine = {
  ...browserEngine,
  ...NATIVE_INFO,
  video: {
    probe: async (file): Promise<VideoInfo> => {
      const p = await probe(file);
      if (!p.video) throw new Error(tr("This file doesn't have a video track."));
      const name = file.name.toLowerCase();
      const codec = codecName(p.video.codec);
      const isMatroska = p.format.includes('matroska');
      const ext = name.includes('.') ? name.split('.').pop()! : '';
      const isMp4Family = p.format.startsWith('mov,mp4');
      const sourceFormat = isMatroska
        ? (ext === 'webm' ? 'webm' : 'mkv')
        : isMp4Family
          ? (ext === 'mov' ? 'mov' : 'mp4')
          // Other containers (AVI, WMV, FLV, MPEG…): named by the file's extension.
          : (/^[a-z0-9]{2,5}$/.test(ext) ? ext : p.format.split(',')[0]);
      const webmCodec = codec === 'vp8' || codec === 'vp9' || codec === 'av1';
      const container: OutputContainer = isMatroska && webmCodec ? 'webm' : 'mp4';
      return { durationSec: p.duration, width: p.video.width, height: p.video.height, hasAudio: Boolean(p.audio), container, videoCodec: codec, sourceFormat, bitrate: p.bitrate };
    },
    convert: async (file, o) =>
      (await runJob(file, {
        kind: 'video',
        container: o.container,
        codec: o.forceVideoCodec,
        trimStart: o.trim?.start,
        trimEnd: o.trim?.end,
        width: o.resize?.width,
        height: o.resize?.height,
        quality: o.quality,
        videoBitrate: o.videoBitrate && Math.round(o.videoBitrate),
        audioBitrate: o.audioBitrate && Math.round(o.audioBitrate),
      }, o.onProgress, o.signal)).blob,
    toGif: async (file, o) =>
      (await runJob(file, { kind: 'gif', start: o.start, seconds: o.seconds, width: Math.round(o.width), fps: o.fps }, o.onProgress, o.signal)).blob,
    canEncode: (codec) => {
      if (!encodable.has(codec)) encodable.set(codec, call<{ ok: boolean }>('/__bench/can-encode', { codec }).then((r) => r.ok).catch(() => false));
      return encodable.get(codec)!;
    },
    thumbnail: async (file) => {
      const res = await fetch('/__bench/thumbnail', {
        method: 'POST',
        headers: { 'X-Rarvon-Key': key(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: await upload(file) }),
      });
      if (!res.ok) throw new Error('no picture');
      return res.blob();
    },
    exportProject: browserEngine.video.exportProject,
  },
  audio: {
    probe: async (file): Promise<AudioInfo> => {
      const p = await probe(file);
      if (!p.audio) throw new Error(tr('This file has no audio track.'));
      return { durationSec: p.duration, codec: codecName(p.audio.codec), sampleRate: p.audio.sampleRate, channels: p.audio.channels, hasVideo: Boolean(p.video), bitrate: p.bitrate };
    },
    convert: async (file, o) => {
      const { blob, status } = await runJob(
        file,
        { kind: 'audio', target: o.target, audioBitrate: o.bitrate && Math.round(o.bitrate), trimStart: o.trim?.start, trimEnd: o.trim?.end },
        o.onProgress, o.signal, () => new CancelledError(),
      );
      return { blob, extension: status.extension, mime: status.mime, copied: status.copied };
    },
    encodableTargets: async () => new Set<AudioTarget>(['opus', 'aac', 'mp3', 'wav']),
    // FFmpeg reads the sound of any video directly; no need to play it.
    captureFromVideo: null,
  },
};
