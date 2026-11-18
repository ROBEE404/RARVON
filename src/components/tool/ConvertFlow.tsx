import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import DownloadButton from '../DownloadButton';
import { tr } from '../../lib/i18n';
import { engine } from '../../engine';

/**
 * The "From → To" layout shared by the converters: the file you have on one
 * side, the file you will get on the other, and an arrow between them that
 * moves while the conversion runs. When it is done, the right card becomes
 * the result with its Download button.
 */

export interface FlowSide {
  /** A small picture, waveform or icon. */
  preview: ReactNode;
  name: string;
  /** e.g. "497 KB" or "about 140 KB". */
  detail: ReactNode;
  format: string;
}

export function ConvertFlow({
  from,
  to,
  state,
  onRemove,
  result,
  progress,
}: {
  from: FlowSide;
  to: FlowSide;
  state: 'idle' | 'busy' | 'done';
  onRemove: () => void;
  result?: { url: string; filename: string };
  /** 0–1 while busy, for conversions that report progress. */
  progress?: number;
}) {
  return (
    <div className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]" data-testid="convert-flow">
      <FlowCard side={from} label={tr('From')} action={
        <button onClick={onRemove} className="text-xs font-medium text-workshop hover:underline">{tr('Remove')}</button>
      } />

      <div className="flex items-center justify-center py-1 sm:py-0" aria-hidden="true">
        <span className={clsx('flow-arrow grid h-10 w-10 place-items-center rounded-full border transition-colors', state === 'done' ? 'border-signal bg-signal-dim text-signal' : 'border-workshop/40 bg-workshop-dim text-workshop', state === 'busy' && 'flow-arrow-busy')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={state === 'done' ? undefined : 'rotate-90 sm:rotate-0 rtl:sm:rotate-180'}>
            {state === 'done' ? <path d="M5 12l5 5L20 7" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
          </svg>
        </span>
      </div>

      <FlowCard
        side={to}
        label={state === 'done' ? tr('Ready') : tr('To')}
        target
        state={state}
        progress={state === 'busy' ? progress : undefined}
        action={result && state === 'done' ? <DownloadButton url={result.url} filename={result.filename} label={tr('Download')} /> : null}
      />
    </div>
  );
}

export type FlowState = 'idle' | 'busy' | 'done' | 'warn';

export function FlowCard({ side, label, action, target, state, progress }: { side: FlowSide; label: string; action?: ReactNode; target?: boolean; state?: FlowState; progress?: number }) {
  const done = state === 'done';
  const warn = state === 'warn';
  return (
    <div
      role={target && done ? 'group' : undefined}
      aria-label={target && done ? tr('Result') : undefined}
      className={clsx(
        'flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition-all duration-300',
        !target && 'border-line bg-elevated',
        target && !done && !warn && 'border-dashed border-workshop/50 bg-paper',
        target && warn && 'border-warn/50 bg-warn-dim',
        target && done && 'flow-done border-signal/60 bg-signal-dim',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={clsx('relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-paper-dim', target && !done && 'opacity-80', state === 'busy' && 'flow-shimmer')}>
          {side.preview}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
          <p className="truncate text-sm font-medium" title={side.name}>{side.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {side.format && (
              <span
                key={side.format}
                className={clsx('flow-pill rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold', target ? (done ? 'border-signal/50 text-signal' : warn ? 'border-warn/50 text-warn' : 'border-workshop/50 text-workshop') : 'border-line text-ink-2')}
              >
                {side.format}
              </span>
            )}
            <span className="text-xs text-ink-2">{side.detail}</span>
          </div>
        </div>
      </div>
      {progress !== undefined && (
        <div className="grid gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={tr('Converting')}>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-dim">
            <div className="h-full rounded-full bg-workshop transition-[width] duration-300" style={{ width: `${Math.max(3, progress * 100)}%` }} />
          </div>
          <span className="text-end font-mono text-[11px] text-ink-3">{Math.round(progress * 100)}%</span>
        </div>
      )}
      {action && <div className="flex justify-end">{action}</div>}
    </div>
  );
}

/** Pick the output format: a row of pills, each with a short "what is it for". */
export function FormatPills<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label = 'Convert to',
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  /** The group's name for screen readers. */
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={tr(label)} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-start transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[7.5rem]',
              on ? 'border-workshop bg-workshop-dim shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-workshop)_15%,transparent)]' : 'border-line bg-paper hover:border-ink',
            )}
          >
            <span className={clsx('text-sm font-semibold', on ? 'text-workshop' : 'text-ink')}>{o.label}</span>
            {o.hint && <span className="text-[11px] leading-tight text-ink-3">{tr(o.hint)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A tinted tile with an icon, for files without a picture (audio). */
export function IconTile({ kind, tone = 'workshop' }: { kind: 'audio' | 'video'; tone?: 'workshop' | 'signal' }) {
  return (
    <div className={clsx('grid h-full w-full place-items-center', tone === 'signal' ? 'bg-signal-dim text-signal' : 'bg-workshop-dim text-workshop')}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'audio' ? <path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" /> : <path d="M4 5h16v14H4zM10 9l5 3-5 3z" />}
      </svg>
    </div>
  );
}

/**
 * The first frame of a video, as a still picture. With `file`, the Rarvon app
 * draws it with FFmpeg, so videos the browser can't play (AVI, WMV…) get one too.
 */
export function VideoThumb({ url, file }: { url: string; file?: File | null }) {
  const [poster, setPoster] = useState<string | null>(null);
  useEffect(() => {
    const make = engine.video.thumbnail;
    if (!file || !make) return;
    let made: string | null = null;
    let live = true;
    make(file)
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setPoster(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      setPoster(null);
      if (made) URL.revokeObjectURL(made);
    };
  }, [file]);
  if (poster) return <img src={poster} alt="" className="h-full w-full object-cover" />;
  return <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />;
}
