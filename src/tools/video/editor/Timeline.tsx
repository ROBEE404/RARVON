import { useRef } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import type { MediaItem, Project, Timeline as TL, TrackKind } from '../../../lib/videoEditor/types';
import { MIN_CLIP, audioDuration, totalDuration, videoStarts, visualDuration, formatTime } from '../../../lib/videoEditor/types';
import { tr } from '../../../lib/i18n';

export interface Selection {
  kind: TrackKind;
  id: string;
}

interface Props {
  project: Project;
  time: number;
  pps: number; // pixels per second
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onSeek: (t: number) => void;
  onChange: (tl: TL, commit: boolean) => void;
  onDropMedia: (mediaId: string, kind: TrackKind, time: number) => void;
  snapping?: boolean;
}

export const MEDIA_DRAG_TYPE = 'application/x-bench-media';
const LABEL_W = 76;
const ROWS: { kind: TrackKind; label: string; h: number }[] = [
  { kind: 'video', label: 'Video', h: 60 },
  { kind: 'text', label: 'Text', h: 34 },
  { kind: 'audio', label: 'Music', h: 42 },
];

type DragMode = 'move' | 'trim-l' | 'trim-r';

export default function Timeline({ project, time, pps, selection, onSelect, onSeek, onChange, onDropMedia, snapping = true }: Props) {
  const tl = project.timeline;
  const media = new Map(project.media.map((m) => [m.id, m]));
  const scroller = useRef<HTMLDivElement>(null);
  const total = totalDuration(tl);
  const width = Math.max((total + 15) * pps, 600);
  const starts = videoStarts(tl.video);

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft - LABEL_W) / pps);
  };

  // Snap a time to the playhead or a clip edge when close (8px).
  const snap = (t: number, ignoreId: string) => {
    if (!snapping) return t;
    const points = [0, time, ...starts, ...tl.video.map((c, i) => starts[i] + visualDuration(c))];
    for (const c of tl.audio) if (c.id !== ignoreId) points.push(c.start, c.start + audioDuration(c));
    for (const c of tl.text) if (c.id !== ignoreId) points.push(c.start, c.start + c.duration);
    let best = t;
    let dist = 8 / pps;
    for (const p of points) {
      if (Math.abs(p - t) < dist) {
        dist = Math.abs(p - t);
        best = p;
      }
    }
    return best;
  };

  const startSeekDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    onSeek(timeAt(e.clientX));
    const move = (ev: PointerEvent) => onSeek(timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startClipDrag = (e: ReactPointerEvent, kind: TrackKind, id: string, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect({ kind, id });
    const x0 = e.clientX;
    const base = tl;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      const next = applyDrag(base, kind, id, mode, dx, media, snap);
      if (next) onChange(next, false);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      const next = applyDrag(base, kind, id, mode, (ev.clientX - x0) / pps, media, snap);
      onChange(next ?? base, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDragOver = (e: DragEvent, kind: TrackKind) => {
    if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    void kind;
  };
  const onDrop = (e: DragEvent, kind: TrackKind) => {
    const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (!id) return;
    e.preventDefault();
    onDropMedia(id, kind, timeAt(e.clientX));
  };

  // Ruler ticks: choose a step that keeps labels ~80px apart.
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 70) ?? 300;
  const ticks: number[] = [];
  for (let t = 0; t * pps < width; t += step) ticks.push(t);

  return (
    <div
      ref={scroller}
      className="relative h-full overflow-x-auto overflow-y-hidden select-none"
      data-testid="timeline"
      // Time runs left to right in both languages; the drag maths relies on it.
      dir="ltr"
    >
      <div className="relative" style={{ width: width + LABEL_W }}>
        {/* Ruler */}
        <div className="sticky top-0 z-20 flex h-6 border-b border-line bg-paper-dim">
          <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-paper-dim" style={{ width: LABEL_W }} />
          <div className="relative flex-1 cursor-pointer" onPointerDown={startSeekDrag} aria-label={tr("Timeline ruler")}>
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 h-full border-l border-line ps-1 font-mono text-[10px] leading-6 text-ink-3" style={{ left: t * pps }}>
                {formatTime(t, false)}
              </span>
            ))}
          </div>
        </div>

        {ROWS.map((row) => (
          <div key={row.kind} className="flex border-b border-line" style={{ height: row.h }}>
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-paper-dim px-3 text-xs font-medium text-ink-2" style={{ width: LABEL_W }}>
              {tr(row.label)}
            </div>
            <div
              className="relative flex-1"
              onPointerDown={(e) => {
                onSelect(null);
                startSeekDrag(e);
              }}
              onDragOver={(e) => onDragOver(e, row.kind)}
              onDrop={(e) => onDrop(e, row.kind)}
              data-track={row.kind}
            >
              {row.kind === 'video' && tl.video.length === 0 && (
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-ink-3">{tr("Drag videos and pictures here, or press + on one")}</span>
              )}
              {row.kind === 'audio' && tl.audio.length === 0 && (
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-ink-3">{tr("Drag music or sound here")}</span>
              )}
              {row.kind === 'video' && tl.video.map((c, i) => {
                const m = media.get(c.mediaId);
                return (
                  <ClipBox
                    key={c.id}
                    left={starts[i] * pps}
                    width={visualDuration(c) * pps}
                    selected={selection?.id === c.id}
                    tone="video"
                    thumb={m?.thumb}
                    label={m?.name ?? tr("Missing file")}
                    badges={[c.speed !== 1 ? `${c.speed}×` : '', c.muted && m?.type === 'video' ? 'Muted' : ''].filter(Boolean)}
                    onPointerDown={(e, mode) => startClipDrag(e, 'video', c.id, mode)}
                  />
                );
              })}
              {row.kind === 'text' && tl.text.map((c) => (
                <ClipBox
                  key={c.id}
                  left={c.start * pps}
                  width={c.duration * pps}
                  selected={selection?.id === c.id}
                  tone="text"
                  label={c.text || tr("Text")}
                  onPointerDown={(e, mode) => startClipDrag(e, 'text', c.id, mode)}
                />
              ))}
              {row.kind === 'audio' && tl.audio.map((c) => (
                <ClipBox
                  key={c.id}
                  left={c.start * pps}
                  width={audioDuration(c) * pps}
                  selected={selection?.id === c.id}
                  tone="audio"
                  label={media.get(c.mediaId)?.name ?? tr("Missing file")}
                  onPointerDown={(e, mode) => startClipDrag(e, 'audio', c.id, mode)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Playhead */}
        <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: LABEL_W + time * pps }}>
          <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-workshop" />
          <div className="h-full w-px bg-workshop" />
        </div>
      </div>
    </div>
  );
}

function ClipBox({ left, width, selected, tone, label, thumb, badges = [], onPointerDown }: {
  left: number; width: number; selected: boolean; tone: 'video' | 'text' | 'audio'; label: string; thumb?: string; badges?: string[];
  onPointerDown: (e: ReactPointerEvent, mode: DragMode) => void;
}) {
  const toneClass = {
    video: 'bg-[color-mix(in_srgb,var(--color-cat-video)_22%,var(--color-paper))] border-[var(--color-cat-video)]',
    text: 'bg-[color-mix(in_srgb,var(--color-workshop)_18%,var(--color-paper))] border-workshop',
    audio: 'bg-[color-mix(in_srgb,var(--color-cat-audio)_20%,var(--color-paper))] border-[var(--color-cat-audio)]',
  }[tone];
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={tr("{0} clip: {1}", { 0: tone, 1: label })}
      aria-pressed={selected}
      data-clip={tone}
      className={clsx(
        'group absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border text-[11px] active:cursor-grabbing',
        toneClass,
        selected ? 'z-10 ring-2 ring-workshop ring-offset-1 ring-offset-paper' : 'opacity-95 hover:opacity-100',
      )}
      style={{
        left,
        width: Math.max(6, width),
        backgroundImage: thumb ? `url(${thumb})` : undefined,
        backgroundSize: 'auto 100%',
        backgroundRepeat: 'repeat-x',
      }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
    >
      <div className={clsx('flex h-full items-start gap-1 px-2 pt-0.5', thumb && 'bg-gradient-to-b from-black/55 to-transparent text-white')}>
        <span className="truncate font-medium">{label}</span>
        {badges.map((b) => (
          <span key={b} className="shrink-0 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{b}</span>
        ))}
      </div>
      <span
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/0 group-hover:bg-black/25"
        onPointerDown={(e) => onPointerDown(e, 'trim-l')}
        aria-hidden="true"
      />
      <span
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/0 group-hover:bg-black/25"
        onPointerDown={(e) => onPointerDown(e, 'trim-r')}
        aria-hidden="true"
      />
    </div>
  );
}

/** The timeline after dragging a clip by dx seconds, or null when nothing changes. */
export function applyDrag(
  tl: TL, kind: TrackKind, id: string, mode: DragMode, dx: number,
  media: Map<string, MediaItem>, snap: (t: number, ignoreId: string) => number = (t) => t,
): TL | null {
  if (kind === 'video') {
    const i = tl.video.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const c = tl.video[i];
    const m = media.get(c.mediaId);
    if (mode === 'move') {
      // Reorder: find where the dragged clip's centre lands among the others.
      const starts = videoStarts(tl.video);
      const center = starts[i] + visualDuration(c) / 2 + dx;
      const others = tl.video.filter((x) => x.id !== id);
      const otherStarts = videoStarts(others);
      let idx = others.length;
      for (let k = 0; k < others.length; k++) {
        if (center < otherStarts[k] + visualDuration(others[k]) / 2) {
          idx = k;
          break;
        }
      }
      if (idx === i) return null;
      const video = [...others.slice(0, idx), c, ...others.slice(idx)];
      return { ...tl, video };
    }
    const isImage = m?.type === 'image';
    const srcMax = isImage ? Infinity : m?.duration ?? c.out;
    let next = c;
    if (mode === 'trim-l') {
      if (isImage) next = { ...c, out: Math.max(MIN_CLIP, c.out - dx) };
      else next = { ...c, in: clamp(c.in + dx * c.speed, 0, c.out - MIN_CLIP * c.speed) };
    } else if (isImage) next = { ...c, out: Math.max(MIN_CLIP, c.out + dx) };
    else next = { ...c, out: clamp(c.out + dx * c.speed, c.in + MIN_CLIP * c.speed, srcMax) };
    return { ...tl, video: tl.video.map((x) => (x.id === id ? next : x)) };
  }
  if (kind === 'audio') {
    const c = tl.audio.find((x) => x.id === id);
    if (!c) return null;
    const max = media.get(c.mediaId)?.duration ?? c.out;
    let next = c;
    if (mode === 'move') next = { ...c, start: Math.max(0, snap(c.start + dx, id)) };
    else if (mode === 'trim-l') {
      const d = clamp(dx, -Math.min(c.in, c.start), c.out - c.in - MIN_CLIP);
      next = { ...c, in: c.in + d, start: c.start + d };
    } else next = { ...c, out: clamp(c.out + dx, c.in + MIN_CLIP, max) };
    return { ...tl, audio: tl.audio.map((x) => (x.id === id ? next : x)) };
  }
  const c = tl.text.find((x) => x.id === id);
  if (!c) return null;
  let next = c;
  if (mode === 'move') next = { ...c, start: Math.max(0, snap(c.start + dx, id)) };
  else if (mode === 'trim-l') {
    const d = clamp(dx, -c.start, c.duration - MIN_CLIP);
    next = { ...c, start: c.start + d, duration: c.duration - d };
  } else next = { ...c, duration: Math.max(MIN_CLIP, c.duration + dx) };
  return { ...tl, text: tl.text.map((x) => (x.id === id ? next : x)) };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
