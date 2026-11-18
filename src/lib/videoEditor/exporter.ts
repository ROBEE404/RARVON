import {
  Input, Output, BlobSource, BufferTarget, ALL_FORMATS, Mp4OutputFormat, WebMOutputFormat, Mp3OutputFormat, WavOutputFormat,
  CanvasSink, AudioBufferSink, CanvasSource, AudioBufferSource,
  canEncodeVideo, canEncodeAudio,
} from 'mediabunny';
import type { AudioCodec, InputVideoTrack } from 'mediabunny';
import type { Project, VisualClip } from './types';
import { totalDuration, videoStarts, visualDuration, fadeAlpha } from './types';
import { drawFrame, textsAt } from './compositor';
import type { ExportSettings } from './exportSettings';
import { audioBitrate, cropTimeline, isAudioOnly, sizeFor, videoBitrate } from './exportSettings';
import { ensureMp3Encoder } from '../audioEngine';
import { tr } from '../i18n';

export interface ExportOptions {
  settings: ExportSettings;
  onProgress: (fraction: number, stage: string) => void;
  signal: AbortSignal;
}

import { ExportCancelled } from '../jobErrors';
export { ExportCancelled };

const SAMPLE_RATE = 48000;

/**
 * Renders the project with the Export tab's settings: MP4 (H.264 + AAC) or
 * WebM (VP9 + Opus) at any size and frame rate, or only the sound as MP3,
 * M4A or WAV. A range exports a cropped copy of the timeline.
 */
export async function exportProject(source: Project, files: Map<string, File>, opts: ExportOptions): Promise<Blob> {
  const s = opts.settings;
  const project = s.range ? { ...source, timeline: cropTimeline(source.timeline, s.range.from, s.range.to) } : source;
  const tl = project.timeline;
  const duration = totalDuration(tl);
  if (duration <= 0) throw new Error(tr("The timeline is empty. Add a clip first."));
  if (isAudioOnly(s.format)) return exportAudioOnly(project, files, duration, opts);
  const { width: W, height: H } = sizeFor(s.aspect, s.short);
  const fps = s.fps;
  const webm = s.format === 'webm';
  const check = () => {
    if (opts.signal.aborted) throw new ExportCancelled();
  };

  const can = (c: 'avc' | 'vp9' | 'vp8') => canEncodeVideo(c, { width: W, height: H }).catch(() => false);
  const videoCodec = webm ? ((await can('vp9')) ? 'vp9' : (await can('vp8')) ? 'vp8' : null) : (await can('avc')) ? 'avc' : null;
  if (!videoCodec) throw new Error(tr("This device can't encode video at this size. Choose a lower resolution or another format."));

  // ---- Audio: mix every audible clip with the Web Audio API, offline (faster than real time).
  opts.onProgress(0, 'Mixing audio');
  const mixed = await mixAudio(project, files, duration, opts.signal);
  check();
  const canAudio = (c: AudioCodec) => canEncodeAudio(c, { sampleRate: SAMPLE_RATE, numberOfChannels: 2 }).catch(() => false);
  const audioCodec: AudioCodec | null = mixed
    ? webm ? ((await canAudio('opus')) ? 'opus' : null) : (await canAudio('aac')) ? 'aac' : (await canAudio('opus')) ? 'opus' : null
    : null;

  // ---- Output
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const target = new BufferTarget();
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: videoBitrate(W, H, fps, s.quality), keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const audioSource = mixed && audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: audioBitrate(s.quality, s.format) }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();

  const abort = () => void output.cancel();
  opts.signal.addEventListener('abort', abort);
  try {
    const frameCount = Math.max(1, Math.round(duration * fps));
    const starts = videoStarts(tl.video);
    let audioDoneUntil = 0;
    const feedAudio = async (until: number) => {
      if (!audioSource || !mixed) return;
      const end = Math.min(until, duration);
      if (end <= audioDoneUntil) return;
      await audioSource.add(sliceBuffer(mixed, audioDoneUntil, end));
      audioDoneUntil = end;
    };

    // Frames are produced clip by clip so each source file is decoded in one sequential pass.
    const inputs = new Map<string, { input: Input; track: InputVideoTrack | null; first: number }>();
    const bitmaps = new Map<string, ImageBitmap>();
    const media = new Map(project.media.map((m) => [m.id, m]));
    let f = 0;

    const emit = async (draw: () => void) => {
      const t = f / fps;
      await feedAudio(t + 1);
      draw();
      await videoSource.add(t, 1 / fps);
      f++;
      if (f % 5 === 0) opts.onProgress(0.05 + 0.93 * (f / frameCount), 'Rendering video');
      check();
    };

    for (let i = 0; i < tl.video.length && f < frameCount; i++) {
      const clip = tl.video[i];
      const start = starts[i];
      const d = visualDuration(clip);
      const m = media.get(clip.mediaId);
      const file = files.get(clip.mediaId);
      // Frames whose time falls inside this clip.
      const frames: number[] = [];
      for (let k = f; k < frameCount && k / fps < start + d - 1e-6; k++) if (k / fps >= start - 1e-6) frames.push(k);
      // Gap frames before it (shouldn't happen on the magnetic track, but stay safe).
      while (f < (frames[0] ?? f)) await emit(() => drawFrame(ctx, W, H, null, textsAt(tl, f / fps)));
      if (!frames.length) continue;
      const alphaAt = (t: number) => fadeAlpha(t - start, d, clip.fadeIn, clip.fadeOut);

      if (!m || !file) {
        for (const k of frames) await emit(() => drawFrame(ctx, W, H, null, textsAt(tl, k / fps)));
        continue;
      }
      if (m.type === 'image') {
        let bmp = bitmaps.get(m.id);
        if (!bmp) {
          bmp = await createImageBitmap(file);
          bitmaps.set(m.id, bmp);
        }
        const b = bmp;
        for (const k of frames) {
          const t = k / fps;
          await emit(() => drawFrame(ctx, W, H, { source: b, width: b.width, height: b.height, fit: clip.fit, alpha: alphaAt(t) }, textsAt(tl, t)));
        }
        continue;
      }
      let src = inputs.get(m.id);
      if (!src) {
        const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        src = { input, track, first: track ? await track.getFirstTimestamp() : 0 };
        inputs.set(m.id, src);
      }
      if (!src.track) {
        for (const k of frames) await emit(() => drawFrame(ctx, W, H, null, textsAt(tl, k / fps)));
        continue;
      }
      await renderVideoClip(src.track, src.first, clip, start, frames, fps, W, H, async (k, frame) => {
        const t = k / fps;
        await emit(() => drawFrame(ctx, W, H, frame ? { source: frame, width: frame.width, height: frame.height, fit: clip.fit, alpha: alphaAt(t) } : null, textsAt(tl, t)));
      });
    }
    // Anything after the video track ends (music or text running longer).
    while (f < frameCount) await emit(() => drawFrame(ctx, W, H, null, textsAt(tl, f / fps)));
    await feedAudio(duration);
    bitmaps.forEach((b) => b.close());

    videoSource.close();
    audioSource?.close();
    opts.onProgress(0.99, 'Finishing');
    await output.finalize();
  } catch (e) {
    if (opts.signal.aborted) throw new ExportCancelled();
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    opts.signal.removeEventListener('abort', abort);
  }
  if (!target.buffer) throw new Error(tr("The export finished but produced no file."));
  opts.onProgress(1, 'Done');
  return new Blob([target.buffer], { type: webm ? 'video/webm' : 'video/mp4' });
}

/** Only the mixed sound, as MP3, M4A (AAC) or WAV. */
async function exportAudioOnly(project: Project, files: Map<string, File>, duration: number, opts: ExportOptions): Promise<Blob> {
  const s = opts.settings;
  opts.onProgress(0, 'Mixing audio');
  const mixed = await mixAudio(project, files, duration, opts.signal);
  if (opts.signal.aborted) throw new ExportCancelled();
  if (!mixed) throw new Error(tr("There's no sound in this project to export."));
  let codec: AudioCodec = s.format === 'wav' ? 'pcm-s16' : s.format === 'mp3' ? 'mp3' : 'aac';
  if (codec === 'mp3') await ensureMp3Encoder();
  else if (codec === 'aac' && !(await canEncodeAudio('aac').catch(() => false))) throw new Error(tr("This browser can't encode AAC audio. Choose MP3 or WAV."));
  const target = new BufferTarget();
  const format = s.format === 'wav' ? new WavOutputFormat() : s.format === 'mp3' ? new Mp3OutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
  const output = new Output({ format, target });
  const source = new AudioBufferSource({ codec, bitrate: audioBitrate(s.quality, s.format) });
  output.addAudioTrack(source);
  await output.start();
  const abort = () => void output.cancel();
  opts.signal.addEventListener('abort', abort);
  try {
    for (let t = 0; t < duration; t += 10) {
      await source.add(sliceBuffer(mixed, t, Math.min(duration, t + 10)));
      opts.onProgress(0.3 + 0.65 * Math.min(1, (t + 10) / duration), 'Encoding audio');
      if (opts.signal.aborted) throw new ExportCancelled();
    }
    source.close();
    await output.finalize();
  } catch (e) {
    if (opts.signal.aborted) throw new ExportCancelled();
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    opts.signal.removeEventListener('abort', abort);
  }
  if (!target.buffer) throw new Error(tr("The export finished but produced no file."));
  opts.onProgress(1, 'Done');

  return new Blob([target.buffer], { type: s.format === 'wav' ? 'audio/wav' : s.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4' });
}

async function renderVideoClip(
  track: InputVideoTrack, first: number, clip: VisualClip, start: number, frames: number[], fps: number,
  W: number, H: number, onFrame: (k: number, frame: HTMLCanvasElement | OffscreenCanvas | null) => Promise<void>,
) {
  // Decode at about the output size, which is much faster than full 4K frames.
  const tw = await track.getDisplayWidth();
  const th = await track.getDisplayHeight();
  const scale = Math.min(1, Math.max(W / tw, H / th));
  const sink = new CanvasSink(track, { width: Math.max(2, Math.round((tw * scale) / 2) * 2), height: Math.max(2, Math.round((th * scale) / 2) * 2), fit: 'fill', poolSize: 3 });
  const times = frames.map((k) => Math.max(first, first + clip.in + (k / fps - start) * clip.speed));
  let last: HTMLCanvasElement | OffscreenCanvas | null = null;
  let idx = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    if (wrapped) last = wrapped.canvas;
    await onFrame(frames[idx], last);
    idx++;
  }
  // If the decoder yields fewer frames than asked, hold the last one.
  for (; idx < frames.length; idx++) await onFrame(frames[idx], last);
}

/** Mixes all audible clips into one stereo AudioBuffer of the project's length, or null when nothing is audible. */
async function mixAudio(project: Project, files: Map<string, File>, duration: number, signal: AbortSignal): Promise<AudioBuffer | null> {
  const tl = project.timeline;
  const media = new Map(project.media.map((m) => [m.id, m]));
  const jobs: { mediaId: string; at: number; in: number; out: number; speed: number; volume: number; fadeIn: number; fadeOut: number }[] = [];
  const starts = videoStarts(tl.video);
  tl.video.forEach((c, i) => {
    const m = media.get(c.mediaId);
    if (m?.type === 'video' && m.hasAudio && !c.muted && c.volume > 0) {
      jobs.push({ mediaId: c.mediaId, at: starts[i], in: c.in, out: c.out, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut });
    }
  });
  for (const c of tl.audio) {
    if (c.volume > 0 && media.get(c.mediaId)) jobs.push({ mediaId: c.mediaId, at: c.start, in: c.in, out: c.out, speed: 1, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut });
  }
  if (!jobs.length) return null;

  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
  const decoded = new Map<string, { input: Input }>();
  for (const job of jobs) {
    if (signal.aborted) throw new ExportCancelled();
    const file = files.get(job.mediaId);
    if (!file) continue;
    let d = decoded.get(job.mediaId);
    if (!d) {
      d = { input: new Input({ source: new BlobSource(file), formats: ALL_FORMATS }) };
      decoded.set(job.mediaId, d);
    }
    const track = await d.input.getPrimaryAudioTrack();
    if (!track) continue;
    const first = await track.getFirstTimestamp();
    const segment = await decodeSegment(new AudioBufferSink(track), first + job.in, first + job.out, ctx);
    if (!segment) continue;
    const node = ctx.createBufferSource();
    node.buffer = segment.buffer;
    node.playbackRate.value = job.speed;
    const gain = ctx.createGain();
    const len = (job.out - job.in) / job.speed;
    const t0 = job.at;
    gain.gain.setValueAtTime(job.fadeIn > 0 ? 0 : job.volume, t0);
    if (job.fadeIn > 0) gain.gain.linearRampToValueAtTime(job.volume, t0 + Math.min(job.fadeIn, len));
    if (job.fadeOut > 0) {
      gain.gain.setValueAtTime(job.volume, Math.max(t0, t0 + len - job.fadeOut));
      gain.gain.linearRampToValueAtTime(0, t0 + len);
    }
    node.connect(gain).connect(ctx.destination);
    node.start(t0, segment.offset, job.out - job.in);
  }
  return ctx.startRendering();
}

async function decodeSegment(sink: AudioBufferSink, from: number, to: number, ctx: BaseAudioContext) {
  const parts: { buffer: AudioBuffer; timestamp: number }[] = [];
  for await (const w of sink.buffers(from, to)) parts.push({ buffer: w.buffer, timestamp: w.timestamp });
  if (!parts.length) return null;
  const rate = parts[0].buffer.sampleRate;
  const channels = Math.min(2, Math.max(...parts.map((p) => p.buffer.numberOfChannels)));
  const begin = parts[0].timestamp;
  const end = Math.max(...parts.map((p) => p.timestamp + p.buffer.duration));
  const out = ctx.createBuffer(channels, Math.max(1, Math.ceil((end - begin) * rate)), rate);
  for (const p of parts) {
    const offset = Math.round((p.timestamp - begin) * rate);
    for (let ch = 0; ch < channels; ch++) {
      const data = p.buffer.getChannelData(Math.min(ch, p.buffer.numberOfChannels - 1));
      const room = out.length - offset;
      if (room <= 0) continue;
      out.copyToChannel(room >= data.length ? data : data.subarray(0, room), ch, offset);
    }
  }
  return { buffer: out, offset: Math.max(0, from - begin) };
}

function sliceBuffer(buf: AudioBuffer, from: number, to: number) {
  const rate = buf.sampleRate;
  const a = Math.floor(from * rate);
  const b = Math.min(buf.length, Math.floor(to * rate));
  const out = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: rate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(a, b), ch);
  return out;
}

