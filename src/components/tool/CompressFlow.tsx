import type { ReactNode } from 'react';
import clsx from 'clsx';
import DownloadButton from '../DownloadButton';
import { FlowCard } from './ConvertFlow';
import type { FlowSide, FlowState } from './ConvertFlow';
import { tr } from '../../lib/i18n';

/**
 * The compressors' layout: the file you have, a ring showing how much smaller
 * it gets, and the file you will get. The ring shows an estimate before
 * compressing, progress while it runs, and the real saving when done.
 */
export function CompressFlow({
  from,
  to,
  before,
  after,
  state,
  progress,
  onRemove,
  result,
}: {
  from: FlowSide;
  to: FlowSide;
  /** Size before (bytes). */
  before: number;
  /** Estimated or real size after (bytes); null when it can't be known in advance. */
  after: number | null;
  state: FlowState;
  /** 0–1 while busy, when the tool reports progress. */
  progress?: number;
  onRemove: () => void;
  result?: { url: string; filename: string };
}) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)]" data-testid="compress-flow">
      <FlowCard side={from} label={tr('From')} action={<button onClick={onRemove} className="text-xs font-medium text-workshop hover:underline">{tr('Remove')}</button>} />
      <div className="flex justify-center py-1 sm:py-0">
        <SavingsRing before={before} after={after} state={state} progress={progress} />
      </div>
      <FlowCard
        side={to}
        label={state === 'done' ? tr('Ready') : state === 'warn' ? tr('Not smaller') : tr('To')}
        target
        state={state}
        action={result && (state === 'done' || state === 'warn') ? <DownloadButton url={result.url} filename={result.filename} label={state === 'warn' ? tr('Download anyway') : tr('Download')} /> : null}
      />
    </div>
  );
}

const R = 44;
const C = 2 * Math.PI * R;

export function SavingsRing({ before, after, state, progress }: { before: number; after: number | null; state: FlowState; progress?: number }) {
  const saving = after != null && before > 0 ? Math.min(1, Math.max(0, 1 - after / before)) : null;
  const busy = state === 'busy';
  const known = busy ? progress ?? null : state === 'warn' ? 0 : saving;
  const fraction = busy ? progress ?? 0.28 : known ?? 0;

  let big: string;
  let small: string;
  if (busy) {
    big = progress != null ? `${Math.round(progress * 100)}%` : '…';
    small = tr('Working');
  } else if (state === 'warn') {
    big = '0%';
    small = tr('Already small');
  } else if (saving == null) {
    big = '?';
    small = tr('Compress to see');
  } else {
    big = `${state === 'done' ? '' : '~'}${Math.round(saving * 100)}%`;
    small = tr('smaller');
  }

  const color = state === 'done' ? 'var(--color-signal)' : state === 'warn' ? 'var(--color-warn)' : 'var(--color-workshop)';
  return (
    <div
      className={clsx('relative h-28 w-28 sm:h-[8.5rem] sm:w-[8.5rem]', state === 'done' && 'flow-done')}
      role="img"
      aria-label={busy ? tr('Working') : saving == null && state !== 'warn' ? tr('Compress to see') : `${big} ${small}`}
      data-testid="savings-ring"
    >
      <svg viewBox="0 0 112 112" className={clsx('h-full w-full -rotate-90', busy && progress == null && 'ring-spin')} aria-hidden="true">
        <circle cx="56" cy="56" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap={fraction > 0.005 ? 'round' : 'butt'}
          strokeDasharray={`${(C * fraction).toFixed(1)} ${C.toFixed(1)}`}
          className="ring-arc"
          opacity={state === 'idle' ? 0.55 : 1}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span key={big} className={clsx('ring-num font-mono text-2xl font-semibold leading-none sm:text-[1.7rem]', state === 'done' ? 'text-signal' : state === 'warn' ? 'text-warn' : 'text-ink')}>{big}</span>
        <span className="mt-1 max-w-[5.5rem] text-[11px] leading-tight text-ink-3">{small}</span>
      </div>
    </div>
  );
}

/** Level names can mean something else elsewhere ("Light" is also a theme), so they get their own keys. */
function trLevel(label: string) {
  const key = `level|${label}`;
  const hit = tr(key);
  return hit === key ? tr(label) : hit;
}

export interface LevelOption<T> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Light / Balanced / Strong as a slider-looking row of radio buttons: a track
 * with a knob that glides to the chosen stop. `value` may be null when the
 * user picked a custom setting under "More options".
 */
export function LevelSlider<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: LevelOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const n = options.length;
  const i = options.findIndex((o) => o.value === value);
  const pos = (k: number) => `${((k + 0.5) / n) * 100}%`;
  return (
    <div role="radiogroup" aria-label={tr('Level')} className={clsx('relative', disabled && 'opacity-60')}>
      {/* Track, the filled part and the knob */}
      <div className="pointer-events-none absolute top-[11px] h-1.5 rounded-full bg-line" style={{ insetInlineStart: pos(0), insetInlineEnd: pos(0) }} />
      {i >= 0 && (
        <>
          <div className="level-fill pointer-events-none absolute top-[11px] h-1.5 rounded-full bg-workshop" style={{ insetInlineStart: pos(0), width: `${(i / n) * 100}%` }} />
          <div className="level-knob pointer-events-none absolute top-[3px] h-[22px] w-[22px] -translate-x-1/2 rounded-full border-[3px] border-workshop bg-paper shadow-sm rtl:translate-x-1/2" style={{ insetInlineStart: pos(i) }} />
        </>
      )}
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {options.map((o, k) => {
          const on = k === i;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.hint ? `${trLevel(o.label)} — ${tr(o.hint)}` : trLevel(o.label)}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className="group flex flex-col items-center gap-1 rounded-lg px-1 pb-1 text-center disabled:cursor-not-allowed"
            >
              <span className={clsx('mt-[8px] h-3 w-3 rounded-full border-2 transition-colors', k <= i ? 'border-workshop bg-workshop' : 'border-line bg-paper group-hover:border-ink')} />
              <span className={clsx('mt-1 text-sm font-semibold transition-colors', on ? 'text-workshop' : 'text-ink-2 group-hover:text-ink')}>{trLevel(o.label)}</span>
              {o.hint && <span className="text-[11px] leading-tight text-ink-3">{tr(o.hint)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Extra settings, folded away so the page stays simple. */
export function MoreOptions({ children, defaultOpen }: { children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-lg border border-line bg-paper" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink">
        {tr('More options')}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="slide-in grid gap-3 border-t border-line p-3">{children}</div>
    </details>
  );
}

/** A tinted tile with a document or stack-of-files icon. */
export function DocTile({ kind, tone = 'workshop' }: { kind: 'pdf' | 'files'; tone?: 'workshop' | 'signal' | 'warn' }) {
  return (
    <div className={clsx('grid h-full w-full place-items-center', tone === 'signal' ? 'bg-signal-dim text-signal' : tone === 'warn' ? 'bg-warn-dim text-warn' : 'bg-workshop-dim text-workshop')}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'pdf'
          ? <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5" />
          : <path d="M4 7h16v13H4zM9 7V4h6v3M10 12h4" />}
      </svg>
    </div>
  );
}
