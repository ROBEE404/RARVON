import { useCallback, useEffect, useRef } from 'react';
import type { Project } from '../../../lib/videoEditor/types';
import { audioDuration, fadeAlpha, totalDuration } from '../../../lib/videoEditor/types';
import { drawFrame, outputSize, textsAt, visualStateAt } from '../../../lib/videoEditor/compositor';
import { tr } from '../../../lib/i18n';

interface Props {
  project: Project;
  urls: Map<string, string>;
  time: number;
  playing: boolean;
  onTime: (t: number) => void;
  onEnded: () => void;
}

/**
 * Live preview. Each clip gets its own hidden <video>/<audio> element that is
 * played, seeked and muted to follow the timeline; the picture is drawn onto a
 * canvas with the same compositor the export uses.
 */
export default function Preview({ project, urls, time, playing, onTime, onEnded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elements = useRef(new Map<string, HTMLMediaElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const clock = useRef({ t: time, at: 0 });
  const raf = useRef(0);
  const projectRef = useRef(project);
  projectRef.current = project;
  const timeRef = useRef(time);
  timeRef.current = time;

  const size = outputSize(project.aspect, '720p');
  const W = Math.round(size.width / 1.5);
  const H = Math.round(size.height / 1.5);

  const mediaEl = useCallback((key: string, mediaId: string, kind: 'video' | 'audio') => {
    let el = elements.current.get(key);
    const url = urls.get(mediaId);
    if (!url) return null;
    if (!el) {
      el = document.createElement(kind);
      el.preload = 'auto';
      el.src = url;
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      el.addEventListener('seeked', () => {
        if (!playingRef.current) draw(timeRef.current);
      });
      el.addEventListener('loadeddata', () => {
        if (playingRef.current) return;
        sync(timeRef.current, false);
        draw(timeRef.current);
      });
      el.addEventListener('canplay', () => {
        if (!playingRef.current) draw(timeRef.current);
      });
      elements.current.set(key, el);
    }
    return el;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  const imageEl = useCallback((mediaId: string) => {
    let img = images.current.get(mediaId);
    const url = urls.get(mediaId);
    if (!url) return null;
    if (!img) {
      img = new Image();
      img.src = url;
      img.onload = () => {
        if (!playingRef.current) draw(timeRef.current);
      };
      images.current.set(mediaId, img);
    }
    return img;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  /** Puts every media element in the state the timeline wants at time t. */
  const sync = useCallback((t: number, isPlaying: boolean) => {
    const p = projectRef.current;
    const media = new Map(p.media.map((m) => [m.id, m]));
    const active = new Set<string>();
    const v = visualStateAt(p.timeline, t);
    if (v && media.get(v.clip.mediaId)?.type === 'video') {
      const key = `v:${v.clip.id}`;
      const el = mediaEl(key, v.clip.mediaId, 'video');
      if (el) {
        active.add(key);
        const m = media.get(v.clip.mediaId)!;
        el.muted = v.clip.muted || !m.hasAudio;
        el.volume = Math.min(1, v.clip.volume * v.alpha);
        el.playbackRate = v.clip.speed;
        const target = v.sourceTime;
        if (isPlaying) {
          if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
          if (el.paused) void el.play().catch(() => undefined);
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.01) el.currentTime = target;
        }
      }
    }
    // Pre-load the next video clip so cuts are quick.
    if (v) {
      const next = p.timeline.video[v.index + 1];
      if (next && media.get(next.mediaId)?.type === 'video') {
        const el = mediaEl(`v:${next.id}`, next.mediaId, 'video');
        if (el && el.paused && Math.abs(el.currentTime - next.in) > 0.05) el.currentTime = next.in;
        active.add(`v:${next.id}`);
        if (el && !el.paused) el.pause();
      }
    }
    for (const c of p.timeline.audio) {
      const d = audioDuration(c);
      if (t < c.start || t >= c.start + d) continue;
      const key = `a:${c.id}`;
      const el = mediaEl(key, c.mediaId, 'audio');
      if (!el) continue;
      active.add(key);
      const target = c.in + (t - c.start);
      el.volume = Math.min(1, c.volume * fadeAlpha(t - c.start, d, c.fadeIn, c.fadeOut));
      if (isPlaying) {
        if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
        if (el.paused) void el.play().catch(() => undefined);
      } else {
        if (!el.paused) el.pause();
        el.currentTime = target;
      }
    }
    elements.current.forEach((el, key) => {
      if (!active.has(key) && !el.paused) el.pause();
    });
  }, [mediaEl]);

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = projectRef.current;
    const v = visualStateAt(p.timeline, t);
    const m = v ? p.media.find((x) => x.id === v.clip.mediaId) : null;
    let layer = null;
    if (v && m?.type === 'video') {
      const el = elements.current.get(`v:${v.clip.id}`) as HTMLVideoElement | undefined;
      if (el && el.readyState >= 2) layer = { source: el, width: el.videoWidth, height: el.videoHeight, fit: v.clip.fit, alpha: v.alpha };
    } else if (v && m?.type === 'image') {
      const img = imageEl(m.id);
      if (img?.complete && img.naturalWidth) layer = { source: img, width: img.naturalWidth, height: img.naturalHeight, fit: v.clip.fit, alpha: v.alpha };
    }
    drawFrame(ctx, canvas.width, canvas.height, layer, textsAt(p.timeline, t));
  }, [imageEl]);

  // Paused: follow the playhead.
  useEffect(() => {
    if (playing) return;
    sync(time, false);
    draw(time);
  }, [time, playing, project, sync, draw]);

  // Playing: run a clock and keep the elements in step.
  useEffect(() => {
    if (!playing) return;
    const end = totalDuration(projectRef.current.timeline);
    clock.current = { t: timeRef.current >= end - 0.05 ? 0 : timeRef.current, at: performance.now() };
    const tick = () => {
      const t = clock.current.t + (performance.now() - clock.current.at) / 1000;
      const total = totalDuration(projectRef.current.timeline);
      if (t >= total) {
        onTime(total);
        onEnded();
        return;
      }
      sync(t, true);
      draw(t);
      onTime(t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      elements.current.forEach((el) => el.pause());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Drop elements of clips that no longer exist.
  useEffect(() => {
    const keys = new Set([...project.timeline.video.map((c) => `v:${c.id}`), ...project.timeline.audio.map((c) => `a:${c.id}`)]);
    elements.current.forEach((el, key) => {
      if (!keys.has(key)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        elements.current.delete(key);
      }
    });
  }, [project.timeline]);

  useEffect(() => {
    const els = elements.current;
    return () => {
      els.forEach((el) => {
        el.pause();
        el.removeAttribute('src');
      });
      els.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      data-testid="editor-preview"
      className="max-h-full max-w-full rounded-md bg-black shadow-sm"
      style={{ aspectRatio: `${W} / ${H}` }}
      aria-label={tr("Video preview")}
    />
  );
}

