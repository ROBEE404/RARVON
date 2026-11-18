import {
  Input, Output, Conversion, BlobSource, BufferTarget,
  MP4, QTFF, WEBM, MATROSKA, Mp4OutputFormat, WebMOutputFormat, MovOutputFormat, MkvOutputFormat,
  canEncodeVideo, canEncode, CanvasSink,
  QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW,
} from 'mediabunny';
import type { VideoCodec } from 'mediabunny';
import { tr } from './i18n';
import { GifWriter } from './imageEncoders';

export type OutputContainer = 'mp4' | 'webm';
/** Every container Rarvon can write: the two above plus MOV (Apple) and MKV (Matroska). */
export type WriteContainer = OutputContainer | 'mov' | 'mkv';

const encodeSupport = new Map<VideoCodec, Promise<boolean>>();
/** Whether this device can encode a video codec (tested once, never assumed). */
export function canEncodeVideoCodec(codec: VideoCodec): Promise<boolean> {
  if (!encodeSupport.has(codec)) encodeSupport.set(codec, canEncodeVideo(codec).catch(() => false));
  return encodeSupport.get(codec)!;
}

export async function canEncodeAac(): Promise<boolean> {
  try {
    return await canEncode('aac');
  } catch {
    return false;
  }
}

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Container to write results in: MP4/MOV sources → mp4; WebM, and MKV holding WebM codecs → webm. */
  container: OutputContainer | null;
  videoCodec: string | null;
  /** The file's actual container (the app also reads others, such as "avi" or "wmv"). */
  sourceFormat: 'mp4' | 'mov' | 'webm' | 'mkv' | (string & {});
  /** Average total bitrate of the file in bits/s. */
  bitrate: number;
}

import { VideoCancelledError } from './jobErrors';
export { VideoCancelledError };

function makeInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  const input = makeInput(file);
  const canRead = await input.canRead();
  if (!canRead) {
    throw new Error(tr("This browser couldn't read this video. MP4, MOV, WebM and MKV files are supported — see the tool's FAQ for why other formats aren't."));
  }
  const format = await input.getFormat();
  const [videoTracks, audioTracks, duration] = await Promise.all([
    input.getVideoTracks(),
    input.getAudioTracks(),
    input.computeDuration(),
  ]);
  const track = videoTracks[0];
  if (!track) throw new Error(tr("This file doesn't have a video track."));
  const [width, height] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
  const videoCodec = track.codec;
  const webmCodec = videoCodec === 'vp8' || videoCodec === 'vp9' || videoCodec === 'av1';
  const container: OutputContainer | null =
    format === MP4 || format === QTFF ? 'mp4' : format === WEBM ? 'webm' : format === MATROSKA ? (webmCodec ? 'webm' : 'mp4') : null;
  return {
    durationSec: duration, width, height, hasAudio: audioTracks.length > 0, container, videoCodec,
    sourceFormat: format === QTFF ? 'mov' : format === WEBM ? 'webm' : format === MATROSKA ? 'mkv' : 'mp4',
    bitrate: duration > 0 ? (file.size * 8) / duration : 0,
  };
}

function outputFormatFor(container: WriteContainer) {
  switch (container) {
    case 'mp4': return new Mp4OutputFormat();
    case 'mov': return new MovOutputFormat();
    case 'mkv': return new MkvOutputFormat();
    default: return new WebMOutputFormat();
  }
}
const MIME: Record<WriteContainer, string> = { mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm' };

export interface RunConversionOptions {
  container: WriteContainer;
  /** Only set this when the tool's whole purpose is a codec/container change
   * (the Convert tool). Leaving it unset for Trim/Resize/Compress lets
   * Mediabunny copy the existing encoded stream directly whenever it can,
   * instead of forcing an unnecessary re-encode. */
  forceVideoCodec?: VideoCodec;
  trim?: { start?: number; end?: number };
  resize?: { width: number; height: number };
  quality?: 'high' | 'medium' | 'low';
  /** Explicit target bitrates in bits/s (take precedence over `quality`). */
  videoBitrate?: number;
  audioBitrate?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const QUALITY_MAP = { high: QUALITY_HIGH, medium: QUALITY_MEDIUM, low: QUALITY_LOW };

export async function runVideoConversion(file: File, options: RunConversionOptions): Promise<Blob> {
  const input = makeInput(file);
  const canRead = await input.canRead();
  if (!canRead) {
    throw new Error(tr("This browser couldn't read this video file."));
  }

  const target = new BufferTarget();
  const output = new Output({ format: outputFormatFor(options.container), target });

  const needsVideoOptions = Boolean(options.forceVideoCodec || options.resize || options.quality || options.videoBitrate);
  // MP4 players (Safari/QuickTime, many TVs) expect AAC audio; when a
  // conversion re-encodes for MP4 anyway, make sure audio ends up as AAC.
  const wantAac = options.container !== 'webm' && Boolean(options.forceVideoCodec) && (await canEncodeAac());
  const needsAudioOptions = Boolean(options.quality || options.audioBitrate || wantAac);

  const conversion = await Conversion.init({
    input,
    output,
    video: needsVideoOptions ? {
      codec: options.forceVideoCodec,
      width: options.resize?.width,
      height: options.resize?.height,
      fit: options.resize ? 'contain' : undefined,
      bitrate: options.videoBitrate ?? (options.quality ? QUALITY_MAP[options.quality] : undefined),
      forceTranscode: options.videoBitrate ? true : undefined,
    } : undefined,
    audio: needsAudioOptions ? {
      codec: wantAac ? 'aac' : undefined,
      bitrate: options.audioBitrate ?? (options.quality ? QUALITY_MAP[options.quality] : undefined),
    } : undefined,
    trim: options.trim,
    showWarnings: false,
  });

  if (!conversion.isValid) {
    throw new Error(tr("This video couldn't be converted with the current settings — it may use a codec this browser can't decode."));
  }

  conversion.onProgress = (fraction) => options.onProgress?.(fraction);
  const onAbort = () => void conversion.cancel();
  options.signal?.addEventListener('abort', onAbort);
  try {
    await conversion.execute();
  } catch (e) {
    if (options.signal?.aborted) throw new VideoCancelledError();
    throw e;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
  if (options.signal?.aborted) throw new VideoCancelledError();

  if (!target.buffer) throw new Error(tr("Conversion finished but produced no output."));
  return new Blob([target.buffer], { type: MIME[options.container] });
}

export interface GifOptions {
  /** Where to start, in seconds. */
  start: number;
  /** How many seconds to turn into the GIF. */
  seconds: number;
  /** Width of the GIF in pixels (height follows the video's shape). */
  width: number;
  /** Frames per second. */
  fps: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Turns part of a video into an animated GIF (no sound; 256 colours). */
export async function videoToGif(file: File, o: GifOptions): Promise<Blob> {
  const input = makeInput(file);
  if (!(await input.canRead())) throw new Error(tr("This browser couldn't read this video file."));
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(tr("This file doesn't have a video track."));
  const [dw, dh] = [await track.getDisplayWidth(), await track.getDisplayHeight()];
  const width = Math.max(2, Math.round(Math.min(o.width, dw) / 2) * 2);
  const height = Math.max(2, Math.round((width * dh) / dw / 2) * 2);
  const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 2 });
  const count = Math.max(1, Math.round(o.seconds * o.fps));
  const times = Array.from({ length: count }, (_, k) => o.start + k / o.fps);
  const gif = new GifWriter(width, height);
  let done = 0;
  for await (const frame of sink.canvasesAtTimestamps(times)) {
    if (o.signal?.aborted) throw new VideoCancelledError();
    if (frame) {
      const ctx = (frame.canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
      gif.addFrame(ctx.getImageData(0, 0, width, height), 1000 / o.fps);
    }
    o.onProgress?.(++done / count);
  }
  return gif.finish();
}

export { compressionBitrates } from './videoBitrates';
