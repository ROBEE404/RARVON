import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Aspect, AudioClip, Project, TextClip, Timeline, VisualClip } from '../../../lib/videoEditor/types';
import { ASPECTS, audioDuration, formatTime, visualDuration } from '../../../lib/videoEditor/types';
import type { Selection } from './Timeline';
import { tr } from '../../../lib/i18n';

interface Props {
  project: Project;
  selection: Selection | null;
  onTimeline: (tl: Timeline, commit: boolean) => void;
  onProject: (patch: Partial<Pick<Project, 'name' | 'aspect'>>) => void;
  onDelete: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export default function Inspector({ project, selection, onTimeline, onProject, onDelete }: Props) {
  const tl = project.timeline;

  if (!selection) {
    return (
      <Panel title={tr("Project")}>
        <Field label={tr("Name")}>
          <input
            value={project.name}
            onChange={(e) => onProject({ name: e.target.value })}
            className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
            aria-label={tr("Project name")}
          />
        </Field>
        <Field label={tr("Frame shape")}>
          <div className="grid gap-1.5">
            {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
              <label key={a} className={clsx('flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm', project.aspect === a ? 'border-workshop bg-workshop-dim' : 'border-line hover:border-ink')}>
                <input type="radio" name="aspect" checked={project.aspect === a} onChange={() => onProject({ aspect: a })} className="accent-[var(--color-workshop)]" />
                <span className="font-medium">{ASPECTS[a].label}</span>
                <span className="text-xs text-ink-3">{ASPECTS[a].hint}</span>
              </label>
            ))}
          </div>
        </Field>
        <p className="text-xs text-ink-3">{tr("Select a clip on the timeline to change it.")}</p>
      </Panel>
    );
  }

  const set = <T extends { id: string }>(list: T[], patch: Partial<T>) =>
    list.map((c) => (c.id === selection.id ? { ...c, ...patch } : c));

  if (selection.kind === 'video') {
    const c = tl.video.find((x) => x.id === selection.id);
    if (!c) return null;
    const m = project.media.find((x) => x.id === c.mediaId);
    const isImage = m?.type === 'image';
    const upd = (patch: Partial<VisualClip>, commit = true) => onTimeline({ ...tl, video: set(tl.video, patch) }, commit);
    const d = visualDuration(c);
    return (
      <Panel title={isImage ? tr("Picture") : tr("Video clip")} subtitle={m?.name} onDelete={onDelete}>
        {isImage ? (
          <Field label={tr("Duration (seconds)")}>
            <NumberInput value={c.out} min={0.1} max={600} step={0.1} onChange={(v) => upd({ out: v })} label={tr("Picture duration")} />
          </Field>
        ) : (
          <>
            <Field label={tr("Trim (seconds in the original)")}>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput value={c.in} min={0} max={c.out - 0.1} step={0.1} onChange={(v) => upd({ in: v })} label={tr("Start")} prefix={tr("Start")} />
                <NumberInput value={c.out} min={c.in + 0.1} max={m?.duration ?? c.out} step={0.1} onChange={(v) => upd({ out: v })} label={tr("End")} prefix={tr("End")} />
              </div>
              <p className="mt-1 text-xs text-ink-3">{tr("Plays for")}{' '}{formatTime(d)}</p>
            </Field>
            <Field label={tr("Speed")}>
              <div className="flex flex-wrap gap-1">
                {SPEEDS.map((s) => (
                  <button key={s} onClick={() => upd({ speed: s })} className={clsx('rounded-md border px-2 py-1 font-mono text-xs', c.speed === s ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink')}>
                    {s}×
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tr("Sound")}>
              {m?.hasAudio ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={c.muted} onChange={(e) => upd({ muted: e.target.checked })} className="accent-[var(--color-workshop)]" />
                    {tr("Remove audio from this clip")}
                  </label>
                  {!c.muted && (
                    <Slider label={tr("Volume")} value={c.volume} min={0} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, commit) => upd({ volume: v }, commit)} />
                  )}
                </>
              ) : (
                <p className="text-xs text-ink-3">{tr("This video has no sound.")}</p>
              )}
            </Field>
          </>
        )}
        <Field label={tr("Fill the frame")}>
          <div className="grid grid-cols-2 gap-1.5">
            {(['contain', 'cover'] as const).map((f) => (
              <button key={f} onClick={() => upd({ fit: f })} className={clsx('rounded-md border px-2 py-1.5 text-xs', c.fit === f ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink')}>
                {f === 'contain' ? tr("Show all (bars)") : tr("Fill (crop edges)")}
              </button>
            ))}
          </div>
        </Field>
        <Fades fadeIn={c.fadeIn} fadeOut={c.fadeOut} max={d / 2} onChange={(p, commit) => upd(p, commit)} />
      </Panel>
    );
  }

  if (selection.kind === 'audio') {
    const c = tl.audio.find((x) => x.id === selection.id);
    if (!c) return null;
    const m = project.media.find((x) => x.id === c.mediaId);
    const upd = (patch: Partial<AudioClip>, commit = true) => onTimeline({ ...tl, audio: set(tl.audio, patch) }, commit);
    const d = audioDuration(c);
    return (
      <Panel title={tr("Music or sound")} subtitle={m?.name} onDelete={onDelete}>
        <Field label={tr("Starts at (seconds)")}>
          <NumberInput value={c.start} min={0} max={36000} step={0.1} onChange={(v) => upd({ start: v })} label={tr("Starts at")} />
        </Field>
        <Field label={tr("Trim (seconds in the original)")}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={c.in} min={0} max={c.out - 0.1} step={0.1} onChange={(v) => upd({ in: v })} label={tr("Start")} prefix={tr("Start")} />
            <NumberInput value={c.out} min={c.in + 0.1} max={m?.duration ?? c.out} step={0.1} onChange={(v) => upd({ out: v })} label={tr("End")} prefix={tr("End")} />
          </div>
          <p className="mt-1 text-xs text-ink-3">{tr("Plays for")}{' '}{formatTime(d)}</p>
        </Field>
        <Slider label={tr("Volume")} value={c.volume} min={0} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, commit) => upd({ volume: v }, commit)} />
        <Fades fadeIn={c.fadeIn} fadeOut={c.fadeOut} max={d / 2} onChange={(p, commit) => upd(p, commit)} />
      </Panel>
    );
  }

  const c = tl.text.find((x) => x.id === selection.id);
  if (!c) return null;
  const upd = (patch: Partial<TextClip>, commit = true) => onTimeline({ ...tl, text: set(tl.text, patch) }, commit);
  return (
    <Panel title={tr("Text")} onDelete={onDelete}>
      <Field label={tr("Text")}>
        <textarea
          value={c.text}
          onChange={(e) => upd({ text: e.target.value }, false)}
          onBlur={() => upd({}, true)}
          rows={3}
          dir="auto"
          className="w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
          aria-label={tr("Text")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={tr("Starts at")}>
          <NumberInput value={c.start} min={0} max={36000} step={0.1} onChange={(v) => upd({ start: v })} label={tr("Text starts at")} />
        </Field>
        <Field label={tr("Duration")}>
          <NumberInput value={c.duration} min={0.1} max={36000} step={0.1} onChange={(v) => upd({ duration: v })} label={tr("Text duration")} />
        </Field>
      </div>
      <Field label={tr("Position")}>
        <div className="grid grid-cols-3 gap-1.5">
          {(['top', 'center', 'bottom'] as const).map((p) => (
            <button key={p} onClick={() => upd({ position: p })} className={clsx('rounded-md border px-2 py-1.5 text-xs capitalize', c.position === p ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink')}>
              {p === 'center' ? tr("Middle") : p}
            </button>
          ))}
        </div>
      </Field>
      <Slider label={tr("Size")} value={c.size} min={0.03} max={0.2} step={0.005} format={(v) => `${Math.round(v * 100)}`} onChange={(v, commit) => upd({ size: v }, commit)} />
      <Field label={tr("Colour")}>
        <div className="flex items-center gap-2">
          {['#ffffff', '#111111', '#facc15', '#f87171', '#60a5fa', '#4ade80'].map((col) => (
            <button key={col} onClick={() => upd({ color: col })} aria-label={tr("Colour {0}", { 0: col })} className={clsx('h-6 w-6 rounded-full border', c.color === col ? 'ring-2 ring-workshop ring-offset-1 ring-offset-paper' : 'border-line')} style={{ background: col }} />
          ))}
          <input type="color" value={c.color} onChange={(e) => upd({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" aria-label={tr("Custom colour")} />
        </div>
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={c.box} onChange={(e) => upd({ box: e.target.checked })} className="accent-[var(--color-workshop)]" />
        {tr("Dark box behind the text")}
      </label>
      <Fades fadeIn={c.fadeIn} fadeOut={c.fadeOut} max={c.duration / 2} onChange={(p, commit) => upd(p, commit)} />
    </Panel>
  );
}

function Panel({ title, subtitle, onDelete, children }: { title: string; subtitle?: string; onDelete?: () => void; children: ReactNode }) {
  return (
    <div className="grid gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          {subtitle && <p className="truncate text-xs text-ink-3" title={subtitle}>{subtitle}</p>}
        </div>
        {onDelete && (
          <button onClick={onDelete} className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:border-warn hover:text-warn">
            {tr("Delete")}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-2">{label}</p>
      {children}
    </div>
  );
}

function NumberInput({ value, min, max, step, onChange, label, prefix }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; prefix?: string }) {
  return (
    <label className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-sm focus-within:border-workshop">
      {prefix && <span className="text-xs text-ink-3">{prefix}</span>}
      <input
        type="number"
        aria-label={label}
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
      />
    </label>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number, commit: boolean) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium text-ink-2">
        {label}
        <span className="font-mono text-ink-3">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value), false)}
        onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
        onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value), true)}
        className="w-full accent-[var(--color-workshop)]"
      />
    </label>
  );
}

function Fades({ fadeIn, fadeOut, max, onChange }: { fadeIn: number; fadeOut: number; max: number; onChange: (p: { fadeIn?: number; fadeOut?: number }, commit: boolean) => void }) {
  const m = Math.max(0, Math.min(3, Math.floor(max * 10) / 10));
  if (m <= 0) return null;
  return (
    <div className="grid gap-2">
      <Slider label={tr("Fade in")} value={Math.min(fadeIn, m)} min={0} max={m} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v, c) => onChange({ fadeIn: v }, c)} />
      <Slider label={tr("Fade out")} value={Math.min(fadeOut, m)} min={0} max={m} step={0.1} format={(v) => `${v.toFixed(1)}s`} onChange={(v, c) => onChange({ fadeOut: v }, c)} />
    </div>
  );
}
