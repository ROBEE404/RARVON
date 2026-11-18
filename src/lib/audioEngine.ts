import {
  Input, Output, Conversion, BlobSource, BufferTarget, ALL_FORMATS,
  OggOutputFormat, Mp4OutputFormat, WavOutputFormat, Mp3OutputFormat,
  canEncodeAudio,
} from 'mediabunny';
import type { AudioCodec } from 'mediabunny';
import { tr } from './i18n';

/**
 * Audio conversion on top of Mediabunny + WebCodecs: demux any container the
 * library reads (MP3, WAV, OGG, FLAC, M4A/AAC, WebM, MP4, MOV, MKV…), decode
 * and re-encode with the browser's own encoders, faster than real time. When
 * the source audio can be kept as-is (e.g. pulling the AAC track out of an
 * MP4), it is copied without re-encoding — instant and lossless.
 */

import { AUDIO_TARGETS } from './audioTargets';
import type { AudioTarget, AudioTargetInfo } from './audioTargets';
export { AUDIO_TARGETS };
export type { AudioTarget, AudioTargetInfo };

let encodable: Promise<Set<AudioTarget>> | null = null;
/** Which targets this browser can actually encode (WAV always; Opus/AAC depend on WebCodecs support). */
export function encodableAudioTargets(): Promise<Set<AudioTarget>> {
  encodable ??= (async () => {
    const set = new Set<AudioTarget>(['wav']);
    // MP3: browsers have no MP3 encoder, so a WebAssembly build of LAME is
    // loaded on demand (see ensureMp3Encoder) — available wherever WASM is.
    if (typeof WebAssembly === 'object') set.add('mp3');
    for (const t of AUDIO_TARGETS) {
      if (t.value === 'wav' || t.value === 'mp3') continue;
      if (await canEncodeAudio(t.codec).catch(() => false)) set.add(t.value);
    }
    return set;
  })();
  return encodable;
}

export interface AudioInfo {
  durationSec: number;
  codec: string | null;
  sampleRate: number;
  channels: number;
  hasVideo: boolean;
  /** Approximate source audio bitrate in bits/s (file size based when the container doesn't say). */
  bitrate: number;
}

function makeInput(file: Blob) {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export async function probeAudio(file: File): Promise<AudioInfo> {
  const input = makeInput(file);
  if (!(await input.canRead())) throw new Error('unreadable');
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error(tr("This file has no audio track."));
  const [durationSec, videoTracks] = await Promise.all([input.computeDuration(), input.getVideoTracks()]);
  return {
    durationSec,
    codec: track.codec,
    sampleRate: track.sampleRate,
    channels: track.numberOfChannels,
    hasVideo: videoTracks.length > 0,
    bitrate: durationSec > 0 ? (file.size * 8) / durationSec : 0,
  };
}

import { CancelledError } from './jobErrors';
export { CancelledError };

export interface AudioJobOptions {
  target: AudioTarget | 'original';
  /** Target bitrate in bits/s for lossy targets. */
  bitrate?: number;
  trim?: { start?: number; end?: number };
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Container for keeping the source codec as-is (used by Extract → "original"). */
function containerForCopy(codec: string | null) {
  switch (codec) {
    case 'aac': return { format: new Mp4OutputFormat(), extension: 'm4a', mime: 'audio/mp4' };
    case 'opus':
    case 'vorbis': return { format: new OggOutputFormat(), extension: 'ogg', mime: 'audio/ogg' };
    case 'mp3': return { format: new Mp3OutputFormat(), extension: 'mp3', mime: 'audio/mpeg' };
    default: return null;
  }
}

function formatFor(target: AudioTarget) {
  if (target === 'opus') return new OggOutputFormat();
  if (target === 'aac') return new Mp4OutputFormat();
  if (target === 'mp3') return new Mp3OutputFormat();
  return new WavOutputFormat();
}

let mp3Ready: Promise<void> | null = null;
/**
 * Loads and registers the MP3 encoder (LAME compiled to WebAssembly, LGPL,
 * wrapped by @mediabunny/mp3-encoder, MPL-2.0). It lives in its own
 * lazily-loaded chunk, fetched only the first time someone exports MP3, and is
 * used unmodified — see THIRD_PARTY_LICENSES.md.
 */
export function ensureMp3Encoder(): Promise<void> {
  mp3Ready ??= (async () => {
    if (await canEncodeAudio('mp3').catch(() => false)) return; // a browser with native MP3 encoding
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder');
    registerMp3Encoder();
  })();
  mp3Ready.catch(() => {
    mp3Ready = null;
  });
  return mp3Ready;
}

/**
 * Converts (or extracts) the audio of `file`. Returns the encoded file and the
 * extension/mime to save it with.
 */
export async function convertAudio(file: File, options: AudioJobOptions): Promise<{ blob: Blob; extension: string; mime: string; copied: boolean }> {
  const input = makeInput(file);
  if (!(await input.canRead())) throw new Error(tr("This file’s format isn’t supported."));
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error(tr("This file has no audio track."));

  let format;
  let extension: string;
  let mime: string;
  let codec: AudioCodec | undefined;
  let copied = false;
  if (options.target === 'original') {
    const copy = containerForCopy(track.codec);
    if (copy) {
      ({ format, extension, mime } = copy);
      copied = true;
    } else {
      // Codec with no sensible audio-only container (e.g. PCM inside MOV): fall back to Opus or WAV.
      const targets = await encodableAudioTargets();
      const t = AUDIO_TARGETS.find((x) => x.value === (targets.has('opus') ? 'opus' : 'wav'))!;
      format = formatFor(t.value);
      ({ extension, mime, codec } = t);
    }
  } else {
    const t = AUDIO_TARGETS.find((x) => x.value === options.target)!;
    format = formatFor(t.value);
    ({ extension, mime, codec } = t);
  }
  if (codec === 'mp3') await ensureMp3Encoder();

  const target = new BufferTarget();
  const output = new Output({ format, target });
  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: {
      codec,
      bitrate: codec && codec !== 'pcm-s16' && options.bitrate ? options.bitrate : undefined,
      forceTranscode: !copied && options.target !== 'original' ? true : undefined,
    },
    trim: options.trim,
    showWarnings: false,
  });
  if (!conversion.isValid) {
    throw new Error(tr("This browser can’t decode the audio in this file."));
  }
  conversion.onProgress = (f) => options.onProgress?.(f);

  const onAbort = () => void conversion.cancel();
  options.signal?.addEventListener('abort', onAbort);
  try {
    await conversion.execute();
  } catch (e) {
    if (options.signal?.aborted) throw new CancelledError();
    throw e;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
  if (options.signal?.aborted) throw new CancelledError();
  if (!target.buffer) throw new Error(tr("Conversion finished but produced no output."));
  return { blob: new Blob([target.buffer], { type: mime }), extension, mime, copied };
}
