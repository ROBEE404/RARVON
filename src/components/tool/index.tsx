import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import DownloadButton from '../DownloadButton';
import { tr } from '../../lib/i18n';

/**
 * Shared building blocks for tool pages, so every tool looks and behaves the
 * same: one result card, one way to pick options, copy with feedback, and a
 * primary action that stays reachable on phones.
 */

/** The result of a tool: file name (and any detail), with Download as the primary action. */
export function ResultCard({
  children,
  url,
  filename,
  downloadLabel,
  actions,
  note,
}: {
  children: ReactNode;
  url: string;
  filename: string;
  downloadLabel?: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={tr("Result")}
      className="grid gap-2 rounded-xl border p-3 sm:p-4"
      style={{ borderColor: 'color-mix(in srgb, var(--color-signal) 40%, var(--color-line))', background: 'var(--color-signal-dim)' }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <path d="M5 12l5 5L20 7" />
        </svg>
        <span className="min-w-0 flex-1 break-words text-sm font-medium">{children}</span>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <DownloadButton url={url} filename={filename} label={downloadLabel} />
        </div>
      </div>
      {note && <div className="text-xs text-ink-2">{note}</div>}
    </div>
  );
}

/** Size change shown in results, e.g. "(−42%)". */
export function SizeDelta({ before, after }: { before: number; after: number }) {
  if (!before) return null;
  const pct = Math.round((1 - after / before) * 100);
  return (
    <span className={clsx('ms-1 font-mono text-xs', after < before ? 'text-signal' : 'text-ink-3')}>
      ({after < before ? `−${pct}%` : tr("no smaller")})
    </span>
  );
}

/** Copy to clipboard with a visible "Copied" confirmation. */
export function CopyButton({
  text,
  label = 'Copy',
  variant = 'link',
  disabled,
  className,
}: {
  text: string;
  label?: string;
  variant?: 'link' | 'button';
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    }
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1600);
  }

  const shown = state === 'copied' ? tr('Copied') : state === 'failed' ? tr('Copy failed') : tr(label);
  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={disabled}
      aria-live="polite"
      className={clsx(
        variant === 'button'
          ? 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-paper px-4 py-2.5 text-sm font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0'
          : 'inline-flex items-center gap-1 text-xs font-medium text-workshop hover:underline disabled:opacity-40',
        state === 'copied' && 'text-signal',
        className,
      )}
    >
      {state === 'copied' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {shown}
    </button>
  );
}

export interface OptionCard<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * One way to choose between options on every tool: radio buttons shown as
 * cards. Each card's accessible name is "Label — hint".
 */
export function OptionCards<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
  columns = 'auto',
}: {
  legend: string;
  name: string;
  options: OptionCard<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  columns?: 'auto' | 1 | 2;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-xs font-medium text-ink-2">{tr(legend)}</legend>
      <div
        className={clsx(
          'grid gap-2',
          columns === 1 ? 'grid-cols-1' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]',
        )}
      >
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={String(o.value)}
              className={clsx(
                'relative flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border bg-paper px-3 py-2 transition-shadow has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-workshop',
                checked ? 'border-ink shadow-[2px_2px_0_0_var(--color-ink)]' : 'border-line hover:border-ink',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {/* Covers the whole card (transparent), so the full card is the click target and stays focusable. */}
              <input type="radio" name={name} checked={checked} onChange={() => onChange(o.value)} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
              <span className="text-sm font-medium">{tr(o.label)}</span>
              {o.hint && (
                <span className="text-xs text-ink-3">
                  <span className="sr-only"> — </span>
                  {tr(o.hint)}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Holds a tool's main action. On phones it sticks to the bottom of the screen
 * while the tool is in view, so the button is never scrolled away.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}
