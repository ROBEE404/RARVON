import type { Aspect, TextClip, Timeline } from './types';
import { ASPECTS, fadeAlpha, visualDuration, visualAt } from './types';

/**
 * Draws one frame of the project. The preview and the export both call this,
 * so what you see while editing is what the exported MP4 contains.
 */

export interface VisualLayer {
  source: CanvasImageSource;
  width: number;
  height: number;
  fit: 'contain' | 'cover';
  alpha: number;
}

export const FONT_STACK = '"Inter", "Noto Sans", "Noto Sans Arabic", system-ui, sans-serif';

export function outputSize(aspect: Aspect, quality: '720p' | '1080p') {
  const short = quality === '1080p' ? 1080 : 720;
  const { w, h } = ASPECTS[aspect];
  if (w === h) return { width: short, height: short };
  return w > h
    ? { width: Math.round((short * w) / h / 2) * 2, height: short }
    : { width: short, height: Math.round((short * h) / w / 2) * 2 };
}

export function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, visual: VisualLayer | null, texts: { clip: TextClip; alpha: number }[]) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (visual && visual.alpha > 0 && visual.width > 0 && visual.height > 0) {
    const scale = visual.fit === 'cover'
      ? Math.max(W / visual.width, H / visual.height)
      : Math.min(W / visual.width, H / visual.height);
    const dw = visual.width * scale;
    const dh = visual.height * scale;
    ctx.globalAlpha = visual.alpha;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(visual.source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  for (const { clip, alpha } of texts) drawText(ctx, W, H, clip, alpha);
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (ctx.measureText(next).width > maxWidth) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function drawText(ctx: CanvasRenderingContext2D, W: number, H: number, clip: TextClip, alpha: number) {
  if (!clip.text.trim() || alpha <= 0) return;
  const px = Math.max(8, Math.round(clip.size * H));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${px}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'inherit';
  const lines = wrapLines(ctx, clip.text, W * 0.86);
  const lineH = px * 1.25;
  const blockH = lines.length * lineH;
  const margin = H * 0.08;
  const top = clip.position === 'top' ? margin : clip.position === 'bottom' ? H - margin - blockH : (H - blockH) / 2;
  if (clip.box) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = px * 0.5;
    const padY = px * 0.25;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const x = W / 2 - widest / 2 - padX;
    const y = top - padY;
    const w = widest + padX * 2;
    const h = blockH + padY * 2;
    const r = px * 0.25;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = px * 0.18;
    ctx.shadowOffsetY = px * 0.04;
  }
  ctx.fillStyle = clip.color;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lineH * (i + 0.5)));
  ctx.restore();
}

/** Text clips showing at time t, with their fade opacity. */
export function textsAt(tl: Timeline, t: number) {
  return tl.text
    .filter((c) => t >= c.start && t < c.start + c.duration)
    .map((clip) => ({ clip, alpha: fadeAlpha(t - clip.start, clip.duration, clip.fadeIn, clip.fadeOut) }));
}

/** The video-track clip at t plus its fade opacity. */
export function visualStateAt(tl: Timeline, t: number) {
  const hit = visualAt(tl.video, t);
  if (!hit) return null;
  const d = visualDuration(hit.clip);
  return { ...hit, alpha: fadeAlpha(t - hit.start, d, hit.clip.fadeIn, hit.clip.fadeOut) };
}
