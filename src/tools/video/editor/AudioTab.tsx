import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import clsx from 'clsx';
import type { Project, Timeline } from '../../../lib/videoEditor/types';
import { audioDuration, formatTime } from '../../../lib/videoEditor/types';
import type { Range, SilenceSettings, SoundAnalysis } from '../../../lib/videoEditor/audioAnalysis';
import { DEFAULT_SILENCE, STEP, analyseMedia, applyCuts, findSilences, keptRanges, mergeRanges } from '../../../lib/videoEditor/audioAnalysis';
import { tr } from '../../../lib/i18n';

interface Props {
  project: Project;
  files: Map<string, File>;
  onTimeline: (tl: Timeline) => void;
  /** Clip to open first (the one selected on the Edit tab, if it has sound). */
  initialClipId?: string | null;
}

interface Sound {
  key: string;
  kind: 'video' | 'audio';
  clipId: string;
  mediaId: string;
  name: string;
  label: string;
  in: number;
  out: number;
}

type Play = 'off' | 'original' | 'preview';

const MIN_VIEW = 0.4; // seconds visible at the deepest zoom

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** The Audio tab: find and cut pauses in one clip's sound (layout D). */
export default function AudioTab({ project, files, onTimeline, initialClipId }: Props) {
  const media = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media]);

  // Every clip that has sound.
  const sounds = useMemo<Sound[]>(() => {
    const out: Sound[] = [];
    let n = 0;
    for (const c of project.timeline.video) {
      const m = media.get(c.mediaId);
      // Muted clips have no audible sound to cut.
      if (m?.type !== 'video' || !m.hasAudio || c.muted) continue;
      n++;
      out.push({ key: `video:${c.id}`, kind: 'video', clipId: c.id, mediaId: c.mediaId, name: m.name, label: tr('Clip {n}', { n }), in: c.in, out: c.out });
    }
    let k = 0;
    for (const c of project.timeline.audio) {
      const m = media.get(c.mediaId);
      if (!m) continue;
      k++;
      out.push({ key: `audio:${c.id}`, kind: 'audio', clipId: c.id, mediaId: c.mediaId, name: m.name, label: tr('Music {n}', { n: k }), in: c.in, out: c.in + audioDuration(c) });
    }
    return out;
  }, [project.timeline, media]);

  const [selectedKey, setSelectedKey] = useState<string | null>(() => sounds.find((s) => s.clipId === initialClipId)?.key ?? sounds[0]?.key ?? null);
  const sound = sounds.find((s) => s.key === selectedKey) ?? sounds[0] ?? null;

  const [analyses, setAnalyses] = useState<Record<string, SoundAnalysis>>({});
  const [loading, setLoading] = useState<{ mediaId: string; f: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SilenceSettings>(DEFAULT_SILENCE);
  const [cutVideo, setCutVideo] = useState(true);
  const [kept, setKept] = useState<Set<string>>(new Set()); // silences switched to "keep"
  const [manual, setManual] = useState<Range[]>([]);
  const [selection, setSelection] = useState<Range | null>(null);
  const [view, setView] = useState<{ start: number; dur: number } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [play, setPlay] = useState<Play>('off');
  const [done, setDone] = useState<string | null>(null);

  const an = sound ? analyses[sound.mediaId] : undefined;

  // Decode the selected sound (once per media file).
  useEffect(() => {
    if (!sound || analyses[sound.mediaId]) return;
    const file = files.get(sound.mediaId);
    const m = media.get(sound.mediaId);
    if (!file || !m) return;
    let cancelled = false;
    setError(null);
    setLoading({ mediaId: sound.mediaId, f: 0 });
    analyseMedia(`${project.id}:${sound.mediaId}`, file, m.duration, (f) => !cancelled && setLoading({ mediaId: sound.mediaId, f }))
      .then((a) => !cancelled && setAnalyses((x) => ({ ...x, [sound.mediaId]: a })))
      .catch((e) => !cancelled && setError(e instanceof Error ? tr(e.message) : tr("This sound couldn't be analysed.")))
      .finally(() => !cancelled && setLoading(null));
    return () => {
      cancelled = true;
    };
  }, [sound, analyses, files, media, project.id]);

  // New clip: reset the view and the edits.
  const soundId = sound ? `${sound.key}:${sound.in}:${sound.out}` : '';
  useEffect(() => {
    if (!sound) return;
    setView({ start: sound.in, dur: sound.out - sound.in });
    setPlayhead(sound.in);
    setKept(new Set());
    setManual([]);
    setSelection(null);
    setPlay('off');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundId]);

  const detection = useMemo(() => (an && sound ? findSilences(an, sound.in, sound.out, settings) : null), [an, sound, settings]);
  const silences = useMemo(() => detection?.silences ?? [], [detection]);
  const keyOf = (r: Range) => r.start.toFixed(2);
  // Changing the settings re-detects pauses, so earlier "keep" choices no longer line up.
  useEffect(() => setKept(new Set()), [settings]);

  const cuts = useMemo(() => mergeRanges([...silences.filter((s) => !kept.has(keyOf(s))), ...manual]), [silences, kept, manual]);
  const removeSeconds = cuts.reduce((n, c) => n + (c.end - c.start), 0);

  // ---------- Drawing ----------
  const waveRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = waveRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const c = waveRef.current;
    const o = overRef.current;
    if (!c || !o || !sound || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const W = width;
    const H = c.clientHeight || 240;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--color-workshop');
    const warn = cssVar('--color-warn');
    const ink3 = cssVar('--color-ink-3');
    const line = cssVar('--color-line');
    const x = (t: number) => ((t - view.start) / view.dur) * W;
    const RULER = 20;
    const mid = RULER + (H - RULER) / 2;
    const amp = (H - RULER) / 2 - 6;

    // Pause shading
    for (const s of silences) {
      const isKept = kept.has(keyOf(s));
      const x1 = x(s.start), x2 = x(s.end);
      if (x2 < 0 || x1 > W) continue;
      ctx.fillStyle = isKept ? 'transparent' : warn;
      ctx.globalAlpha = isKept ? 1 : 0.14;
      if (!isKept) ctx.fillRect(x1, RULER, x2 - x1, H - RULER);
      ctx.globalAlpha = 1;
      ctx.setLineDash(isKept ? [4, 3] : []);
      ctx.strokeStyle = isKept ? ink3 : warn;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 0.5, RULER + 0.5, Math.max(1, x2 - x1 - 1), H - RULER - 1);
      ctx.setLineDash([]);
    }
    for (const r of manual) {
      ctx.fillStyle = warn;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(x(r.start), RULER, x(r.end) - x(r.start), H - RULER);
      ctx.globalAlpha = 1;
    }
    if (selection) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x(selection.start), RULER, x(selection.end) - x(selection.start), H - RULER);
      ctx.globalAlpha = 1;
    }

    // Waveform (loudness envelope, mirrored)
    if (an) {
      const inCut = (t: number) => cuts.some((r) => t >= r.start && t < r.end);
      for (let px = 0; px < W; px++) {
        const t0 = view.start + (px / W) * view.dur;
        const t1 = view.start + ((px + 1) / W) * view.dur;
        if (t0 > sound.out || t1 < sound.in) continue;
        let mx = -90;
        for (let i = Math.floor(t0 / STEP); i <= Math.floor(t1 / STEP) && i < an.db.length; i++) if (an.db[i] > mx) mx = an.db[i];
        const level = Math.max(0, Math.min(1, (mx + 60) / 60));
        const h = Math.max(1, level * amp);
        ctx.fillStyle = inCut((t0 + t1) / 2) ? warn : accent;
        ctx.globalAlpha = inCut((t0 + t1) / 2) ? 0.55 : 0.9;
        ctx.fillRect(px, mid - h, 1, h * 2);
      }
      ctx.globalAlpha = 1;
      // Quiet level line
      if (detection) {
        const lv = Math.max(0, Math.min(1, (detection.threshold + 60) / 60)) * amp;
        ctx.strokeStyle = ink3;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, mid - lv);
        ctx.lineTo(W, mid - lv);
        ctx.moveTo(0, mid + lv);
        ctx.lineTo(W, mid + lv);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Ruler
    ctx.fillStyle = cssVar('--color-paper-dim');
    ctx.fillRect(0, 0, W, RULER);
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(0, RULER + 0.5);
    ctx.lineTo(W, RULER + 0.5);
    ctx.stroke();
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const stepT = steps.find((s) => (s / view.dur) * W >= 70) ?? 600;
    ctx.fillStyle = ink3;
    ctx.font = '10px ui-monospace, monospace';
    for (let t = Math.ceil(view.start / stepT) * stepT; t < view.start + view.dur; t += stepT) {
      const px = x(t);
      ctx.fillRect(px, RULER - 6, 1, 6);
      ctx.fillText(stepT < 1 ? formatTime(t) : formatTime(t, false), px + 3, 13);
    }

    // Playhead
    ctx.fillStyle = cssVar('--color-ink');
    ctx.fillRect(Math.round(x(playhead)), 0, 1.5, H);

    // ----- Overview: whole clip, with the zoomed window
    const OW = width;
    const OH = o.clientHeight || 44;
    o.width = OW * dpr;
    o.height = OH * dpr;
    const oc = o.getContext('2d')!;
    oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    oc.clearRect(0, 0, OW, OH);
    const total = sound.out - sound.in;
    const ox = (t: number) => ((t - sound.in) / total) * OW;
    for (const r of cuts) {
      oc.fillStyle = warn;
      oc.globalAlpha = 0.25;
      oc.fillRect(ox(r.start), 0, Math.max(1, ox(r.end) - ox(r.start)), OH);
    }
    oc.globalAlpha = 0.65;
    if (an) {
      for (let px = 0; px < OW; px++) {
        const t0 = sound.in + (px / OW) * total;
        const t1 = sound.in + ((px + 1) / OW) * total;
        let mx = -90;
        for (let i = Math.floor(t0 / STEP); i <= Math.floor(t1 / STEP) && i < an.db.length; i++) if (an.db[i] > mx) mx = an.db[i];
        const h = Math.max(0.5, Math.max(0, (mx + 60) / 60) * (OH / 2 - 3));
        oc.fillStyle = ink3;
        oc.fillRect(px, OH / 2 - h, 1, h * 2);
      }
    }
    oc.globalAlpha = 1;
    oc.strokeStyle = accent;
    oc.lineWidth = 2;
    oc.fillStyle = accent;
    oc.globalAlpha = 0.15;
    oc.fillRect(ox(view.start), 1, ox(view.start + view.dur) - ox(view.start), OH - 2);
    oc.globalAlpha = 1;
    oc.strokeRect(ox(view.start) + 1, 1, Math.max(4, ox(view.start + view.dur) - ox(view.start) - 2), OH - 2);
    oc.fillStyle = cssVar('--color-ink');
    oc.fillRect(ox(playhead), 0, 1, OH);
  }, [an, sound, view, width, silences, kept, manual, selection, cuts, playhead, detection]);

  useEffect(() => {
    draw();
  }, [draw]);
  // Redraw when the theme changes.
  useEffect(() => {
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [draw]);

  // ---------- View helpers ----------
  const clampView = useCallback((start: number, dur: number) => {
    if (!sound) return { start, dur };
    const total = sound.out - sound.in;
    const d = Math.min(total, Math.max(Math.min(MIN_VIEW, total), dur));
    const s = Math.min(sound.out - d, Math.max(sound.in, start));
    return { start: s, dur: d };
  }, [sound]);

  const zoomAround = useCallback((t: number, factor: number) => {
    setView((v) => {
      if (!v) return v;
      const dur = v.dur * factor;
      const rel = (t - v.start) / v.dur;
      return clampView(t - rel * dur, dur);
    });
  }, [clampView]);

  // Wheel: zoom around the pointer; Shift+wheel scrolls.
  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!view) return;
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const t = view.start + ((e.clientX - rect.left) / rect.width) * view.dur;
      if (e.shiftKey) setView((v) => (v ? clampView(v.start + (e.deltaY / 400) * v.dur, v.dur) : v));
      else zoomAround(t, e.deltaY > 0 ? 1.25 : 0.8);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [view, clampView, zoomAround]);

  const timeAt = (clientX: number) => {
    const rect = waveRef.current!.getBoundingClientRect();
    return view!.start + ((clientX - rect.left) / rect.width) * view!.dur;
  };

  const onWavePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!view || !sound || e.button !== 0) return;
    stopPlay();
    const x0 = e.clientX;
    const t0 = timeAt(e.clientX);
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - x0) < 4) return;
      dragging = true;
      const t1 = Math.min(sound.out, Math.max(sound.in, timeAt(ev.clientX)));
      setSelection({ start: Math.min(t0, t1), end: Math.max(t0, t1) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) return;
      // A click: toggle a pause, remove a hand-made cut, or move the playhead.
      setSelection(null);
      const hitManual = manual.find((r) => t0 >= r.start && t0 < r.end);
      if (hitManual) {
        setManual((m) => m.filter((r) => r !== hitManual));
        return;
      }
      const hit = silences.find((s) => t0 >= s.start && t0 < s.end);
      if (hit) {
        setKept((k) => {
          const next = new Set(k);
          const key = keyOf(hit);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        return;
      }
      setPlayhead(Math.min(sound.out, Math.max(sound.in, t0)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onOverview = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sound || !view) return;
    const el = e.currentTarget;
    const go = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const t = sound.in + ((clientX - rect.left) / rect.width) * (sound.out - sound.in);
      setView((v) => (v ? clampView(t - v.dur / 2, v.dur) : v));
    };
    go(e.clientX);
    const move = (ev: PointerEvent) => go(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- Playback (Web Audio, from the small mono copy) ----------
  const audio = useRef<{ ctx: AudioContext; nodes: AudioBufferSourceNode[]; raf: number; buffers: Map<string, AudioBuffer> } | null>(null);
  const stopPlay = useCallback(() => {
    const a = audio.current;
    if (a) {
      a.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      a.nodes = [];
      cancelAnimationFrame(a.raf);
    }
    setPlay('off');
  }, []);
  useEffect(() => () => {
    stopPlay();
    void audio.current?.ctx.close();
  }, [stopPlay]);
  useEffect(() => stopPlay(), [soundId, stopPlay]);

  const startPlay = (mode: Exclude<Play, 'off'>) => {
    if (!an || !sound) return;
    stopPlay();
    audio.current ??= { ctx: new AudioContext(), nodes: [], raf: 0, buffers: new Map() };
    const a = audio.current;
    void a.ctx.resume();
    let buf = a.buffers.get(sound.mediaId);
    if (!buf) {
      buf = a.ctx.createBuffer(1, an.preview.length, an.previewRate);
      buf.copyToChannel(an.preview as Float32Array<ArrayBuffer>, 0);
      a.buffers.set(sound.mediaId, buf);
    }
    const from = playhead >= sound.out - 0.05 ? sound.in : playhead;
    const segs = mode === 'preview' ? keptRanges(from, sound.out, cuts) : [{ start: from, end: sound.out }];
    const t0 = a.ctx.currentTime + 0.05;
    let at = 0;
    const map: { at: number; seg: Range }[] = [];
    for (const s of segs) {
      const n = a.ctx.createBufferSource();
      n.buffer = buf;
      n.connect(a.ctx.destination);
      n.start(t0 + at, s.start, s.end - s.start);
      a.nodes.push(n);
      map.push({ at, seg: s });
      at += s.end - s.start;
    }
    setPlay(mode);
    const tick = () => {
      const el = a.ctx.currentTime - t0;
      if (el >= at) {
        setPlayhead(segs.length ? segs[segs.length - 1].end : from);
        stopPlay();
        return;
      }
      const cur = [...map].reverse().find((m) => el >= m.at) ?? map[0];
      if (cur) {
        const t = cur.seg.start + Math.max(0, el - cur.at);
        setPlayhead(t);
        // Keep the playhead in view.
        setView((v) => (v && (t > v.start + v.dur * 0.92 || t < v.start) ? clampView(t - v.dur * 0.1, v.dur) : v));
      }
      a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
  };

  // ---------- Applying ----------
  const apply = () => {
    if (!sound || !cuts.length) return;
    stopPlay();
    const removed = removeSeconds;
    onTimeline(applyCuts(project.timeline, sound.kind, sound.clipId, cuts, cutVideo));
    setDone(tr('Removed {s} from {name}.', { s: formatTime(removed), name: sound.label }));
    setManual([]);
    setKept(new Set());
    setSelection(null);
  };
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), 4000);
    return () => window.clearTimeout(t);
  }, [done]);

  // Keyboard: Space plays the preview, Delete cuts the selection, Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [role=dialog]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (play !== 'off') stopPlay();
        else startPlay('preview');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        setManual((m) => mergeRanges([...m, selection]));
        setSelection(null);
      } else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Zoom slider (log scale) ----------
  const total = sound ? sound.out - sound.in : 1;
  const zoomValue = view ? Math.round((Math.log(total / view.dur) / Math.log(Math.max(1.0001, total / Math.min(MIN_VIEW, total)))) * 100) : 0;
  const setZoomValue = (v: number) => {
    if (!view || !sound) return;
    const dur = total / Math.pow(Math.max(1.0001, total / Math.min(MIN_VIEW, total)), v / 100);
    const centre = view.start + view.dur / 2;
    setView(clampView(centre - dur / 2, dur));
  };

  if (!sounds.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="font-display text-base font-semibold">{tr('Nothing to cut yet')}</p>
          <p className="mt-2 text-sm text-ink-2">{tr('Add a video with sound, or music, on the Edit tab. Its sound shows up here.')}</p>
        </div>
      </div>
    );
  }

  const isVideo = sound?.kind === 'video';
  const thresholdShown = detection?.threshold ?? -45;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:p-4" data-testid="audio-tab">
      {/* Header: which sound */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-base font-semibold">{sound?.label}</h2>
        <span className="truncate text-sm text-ink-3">{sound?.name} · {formatTime(total)}</span>
        {loading && <span className="text-xs text-ink-3" role="status">{tr('Analysing the sound… {n}%', { n: Math.round(loading.f * 100) })}</span>}
        {done && <span className="rounded-full bg-signal-dim px-2.5 py-0.5 text-xs font-medium text-signal" role="status">{done}</span>}
      </div>

      {/* Overview + big waveform (layout D: full width on top) */}
      <div dir="ltr" className="grid gap-2">
        <canvas
          ref={overRef}
          onPointerDown={onOverview}
          className="h-11 w-full cursor-pointer rounded-lg border border-line bg-paper-dim"
          aria-label={tr('Overview of the whole sound. Click to jump.')}
          data-testid="audio-overview"
        />
        <div className="relative">
          <canvas
            ref={waveRef}
            onPointerDown={onWavePointerDown}
            className="block h-[38vh] min-h-[220px] w-full cursor-crosshair touch-none rounded-lg border border-line bg-elevated"
            aria-label={tr('Waveform. Shaded parts are pauses that will be cut. Click one to keep it, or drag to select.')}
            data-testid="audio-wave"
          />
          {!an && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-3">
              {error ?? (loading ? tr('Analysing the sound… {n}%', { n: Math.round(loading.f * 100) }) : tr('Loading…'))}
            </div>
          )}
        </div>
      </div>

      {/* Transport + zoom */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (play === 'preview' ? stopPlay() : startPlay('preview'))}
          disabled={!an}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-workshop px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          <PlayIcon playing={play === 'preview'} />
          {play === 'preview' ? tr('Stop') : tr('Preview result')}
        </button>
        <button
          onClick={() => (play === 'original' ? stopPlay() : startPlay('original'))}
          disabled={!an}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:border-ink disabled:opacity-40"
        >
          <PlayIcon playing={play === 'original'} />
          {play === 'original' ? tr('Stop') : tr('Play original')}
        </button>
        <span className="font-mono text-xs text-ink-2" data-testid="audio-time">{formatTime(Math.max(0, playhead - (sound?.in ?? 0)))}</span>
        {selection && (
          <span className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setManual((m) => mergeRanges([...m, selection]));
                setSelection(null);
              }}
              className="h-8 rounded-md border border-warn/50 px-2.5 text-xs font-medium text-warn hover:bg-warn-dim"
            >
              {tr('Cut selection')} ({formatTime(selection.end - selection.start)})
            </button>
            <button onClick={() => setSelection(null)} className="h-8 rounded-md px-2 text-xs text-ink-3 hover:text-ink">{tr('Clear')}</button>
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-3">
            {tr('Zoom')}
            <input type="range" min={0} max={100} value={zoomValue} onChange={(e) => setZoomValue(Number(e.target.value))} className="w-32 accent-[var(--color-workshop)] sm:w-48" aria-label={tr('Waveform zoom')} />
          </label>
          <button onClick={() => sound && setView({ start: sound.in, dur: total })} className="h-8 rounded-md border border-line px-2.5 text-xs font-medium hover:border-ink">{tr('Fit')}</button>
        </div>
      </div>

      {/* Bottom: sounds | settings */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card title={tr('Sounds')}>
          <ul className="grid gap-1.5">
            {sounds.map((s) => {
              const a = analyses[s.mediaId];
              const n = a ? findSilences(a, s.in, s.out, settings).silences.length : null;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setSelectedKey(s.key)}
                    aria-pressed={s.key === sound?.key}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors',
                      s.key === sound?.key ? 'border-workshop bg-workshop-dim' : 'border-line hover:border-ink',
                    )}
                  >
                    <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-md', s.kind === 'video' ? 'bg-[color-mix(in_srgb,var(--color-cat-video)_18%,transparent)] text-[var(--color-cat-video)]' : 'bg-[color-mix(in_srgb,var(--color-cat-audio)_18%,transparent)] text-[var(--color-cat-audio)]')} aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.kind === 'video' ? 'M4 6h11v12H4zM15 10l5-3v10l-5-3' : 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z'} /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.label}</span>
                      <span className="block truncate text-xs text-ink-3">{s.name} · {formatTime(s.out - s.in, false)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">{n === null ? '—' : tr(n === 1 ? '{n} pause' : '{n} pauses', { n })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={tr('Silence settings')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Setting
              label={tr('Quiet level')}
              value={settings.thresholdDb === null ? tr('Auto ({n} dB)', { n: thresholdShown }) : `${settings.thresholdDb} dB`}
              hint={tr('Sound below this level counts as a pause.')}
            >
              <input type="range" min={-70} max={-10} step={1} value={settings.thresholdDb ?? thresholdShown} onChange={(e) => setSettings((s) => ({ ...s, thresholdDb: Number(e.target.value) }))} className="w-full accent-[var(--color-workshop)]" aria-label={tr('Quiet level')} />
              <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                <input type="checkbox" checked={settings.thresholdDb === null} onChange={(e) => setSettings((s) => ({ ...s, thresholdDb: e.target.checked ? null : thresholdShown }))} className="accent-[var(--color-workshop)]" />
                {tr('Automatic')}
              </label>
            </Setting>
            <Setting label={tr('Shortest pause')} value={`${settings.minPause.toFixed(1)} s`} hint={tr('Shorter pauses, like breaths between words, are left alone.')}>
              <input type="range" min={0.2} max={3} step={0.1} value={settings.minPause} onChange={(e) => setSettings((s) => ({ ...s, minPause: Number(e.target.value) }))} className="w-full accent-[var(--color-workshop)]" aria-label={tr('Shortest pause')} />
            </Setting>
            <Setting label={tr('Breathing room')} value={`${Math.round(settings.padding * 1000)} ms`} hint={tr('Sound kept before and after each word, so cuts don’t sound chopped.')}>
              <input type="range" min={0} max={0.5} step={0.01} value={settings.padding} onChange={(e) => setSettings((s) => ({ ...s, padding: Number(e.target.value) }))} className="w-full accent-[var(--color-workshop)]" aria-label={tr('Breathing room')} />
            </Setting>
          </div>

          {isVideo && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
              <input type="checkbox" checked={cutVideo} onChange={(e) => setCutVideo(e.target.checked)} className="mt-0.5 accent-[var(--color-workshop)]" data-testid="cut-video" />
              <span>
                <span className="block text-sm font-medium">{tr('Also cut the video')}</span>
                <span className="block text-xs text-ink-3">
                  {cutVideo ? tr('The picture is cut at the same spots, so lips stay in sync with the voice.') : tr('The picture keeps playing; only the sound is silenced in the cut parts.')}
                </span>
              </span>
            </label>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <p className="text-sm text-ink-2" data-testid="audio-summary">
              {tr('{n} pauses found', { n: silences.length })} · <span className="font-medium text-ink">{tr('{s} to remove', { s: formatTime(removeSeconds) })}</span>
            </p>
            {(kept.size > 0 || manual.length > 0) && (
              <button onClick={() => { setKept(new Set()); setManual([]); }} className="text-xs text-ink-3 hover:text-ink">{tr('Reset choices')}</button>
            )}
            <div className="ms-auto flex flex-wrap gap-2">
              <button
                onClick={() => (play === 'preview' ? stopPlay() : startPlay('preview'))}
                disabled={!an || !cuts.length}
                className="h-10 rounded-md border border-line px-4 text-sm font-medium hover:border-ink disabled:opacity-40"
              >
                {play === 'preview' ? tr('Stop') : tr('Preview result')}
              </button>
              <button
                onClick={apply}
                disabled={!an || !cuts.length}
                className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
              >
                {manual.length && !silences.length ? tr('Apply cuts') : tr('Remove all silences')}
              </button>
            </div>
          </div>
        </Card>
      </div>
      <p className="text-xs text-ink-3">
        {tr('Tip: scroll on the waveform to zoom, Shift+scroll to move, drag to select a part and press Delete to cut it. Space plays the preview.')}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-elevated p-4">
      <h3 className="mb-3 font-display text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Setting({ label, value, hint, children }: { label: string; value: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2">
        {label}
        <span className="font-mono text-ink">{value}</span>
      </p>
      {children}
      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">{hint}</p>
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="rtl:-scale-x-100"><path d="M7 4l13 8-13 8z" /></svg>
  );
}
