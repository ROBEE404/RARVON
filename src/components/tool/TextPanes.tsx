import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { CopyButton } from './index';
import { tr } from '../../lib/i18n';

/**
 * The text tools' layout: your text on one side, the live result on the other
 * (stacked on phones), with option pills above.
 */
export function TextWorkspace({ options, input, output }: { options?: ReactNode; input: ReactNode; output: ReactNode }) {
  return (
    <div className="space-y-3">
      {options && <div className="flex flex-wrap items-center gap-2">{options}</div>}
      <div className="grid gap-3 lg:grid-cols-2">
        {input}
        {output}
      </div>
    </div>
  );
}

/** A range of the input to highlight (for example, spaces that will be removed). */
export interface Mark {
  start: number;
  end: number;
}

export function InputPane({
  value,
  onChange,
  placeholder,
  marks,
  mono,
  footer,
  rows = 12,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  marks?: Mark[];
  mono?: boolean;
  footer?: ReactNode;
  rows?: number;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const [pasteFailed, setPasteFailed] = useState(false);
  const textClass = clsx('px-3 py-2.5 leading-relaxed whitespace-pre-wrap break-words', mono ? 'font-mono text-xs' : 'text-sm');

  async function paste() {
    try {
      onChange(value + (await navigator.clipboard.readText()));
    } catch {
      setPasteFailed(true);
      window.setTimeout(() => setPasteFailed(false), 2200);
    }
  }

  async function open(file: File) {
    onChange(await file.text());
  }

  // The highlight layer sits behind the (transparent) text box with the same text, split at the marks.
  const highlighted = useMemo(() => {
    if (!marks?.length) return null;
    const parts: ReactNode[] = [];
    let at = 0;
    for (const [k, m] of [...marks].sort((a, b) => a.start - b.start).entries()) {
      if (m.start < at) continue;
      parts.push(value.slice(at, m.start));
      parts.push(<mark key={k} className="rounded-[2px] bg-warn/25 text-transparent">{value.slice(m.start, m.end)}</mark>);
      at = m.end;
    }
    parts.push(value.slice(at));
    return parts;
  }, [marks, value]);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper" aria-label={tr('Your text')}>
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line bg-elevated px-3 py-2">
        <span className="me-auto text-xs font-semibold text-ink-2">{tr('Your text')}</span>
        <PaneButton onClick={() => void paste()}>{pasteFailed ? tr('Use Ctrl+V') : tr('Paste')}</PaneButton>
        <label className="cursor-pointer rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-semibold text-ink hover:border-ink">
          {tr('Open .txt')}
          <input type="file" accept=".txt,.csv,.md,.json,.log,text/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = ''; }} />
        </label>
        {value && <PaneButton onClick={() => onChange('')}>{tr('Clear')}</PaneButton>}
      </header>
      <div className="relative min-h-0 flex-1">
        {highlighted && (
          <div ref={backdrop} aria-hidden="true" className={clsx(textClass, 'pointer-events-none absolute inset-0 overflow-hidden text-transparent')}>
            {highlighted}
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => { if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop; }}
          rows={rows}
          placeholder={placeholder}
          spellCheck={false}
          className={clsx(textClass, 'relative block h-full min-h-[14rem] w-full resize-y bg-transparent outline-none')}
        />
      </div>
      {footer && <footer className="border-t border-line bg-elevated px-3 py-1.5 text-[11px] text-ink-3">{footer}</footer>}
    </section>
  );
}

export function OutputPane({
  title,
  text,
  children,
  footer,
  mono,
  filename = 'result.txt',
  tone,
}: {
  title: string;
  /** The text to copy and download; omit for panes that show something else (numbers, a list). */
  text?: string;
  /** Custom content instead of the plain result text. */
  children?: ReactNode;
  footer?: ReactNode;
  mono?: boolean;
  filename?: string;
  tone?: 'good';
}) {
  const url = useMemo(() => (text ? URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })) : null), [text]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper" aria-label={title}>
      <header className="flex flex-wrap items-center gap-1.5 border-b border-line bg-elevated px-3 py-2">
        <span className="me-auto text-xs font-semibold text-ink-2">{title}</span>
        {text !== undefined && (
          <>
            {url && <a href={url} download={filename} className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-semibold text-ink hover:border-ink">{tr('Download .txt')}</a>}
            <CopyButton text={text} label="Copy" variant="button" disabled={!text} className="!min-h-0 !px-2.5 !py-1 !text-[11px] !font-semibold" />
          </>
        )}
      </header>
      <div className="min-h-[14rem] flex-1">
        {children ?? (
          text
            ? <pre key={text.length > 0 ? 'full' : 'empty'} className={clsx('fade-in max-h-[28rem] overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 leading-relaxed', mono ? 'font-mono text-xs' : 'font-sans text-sm')}>{text}</pre>
            : <p className="grid h-full min-h-[14rem] place-items-center px-6 text-center text-xs text-ink-3">{tr('The result appears here as you type.')}</p>
        )}
      </div>
      {footer && <footer className={clsx('border-t border-line bg-elevated px-3 py-1.5 text-[11px]', tone === 'good' ? 'text-signal' : 'text-ink-3')}>{footer}</footer>}
    </section>
  );
}

function PaneButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-semibold text-ink hover:border-ink">
      {children}
    </button>
  );
}

/** An on/off option shown as a pill. */
export function ToggleChip({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={clsx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.97]',
        on ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line bg-paper text-ink-2 hover:border-ink',
      )}
    >
      <span className={clsx('grid h-4 w-4 place-items-center rounded-full border transition-colors', on ? 'border-workshop bg-workshop text-white' : 'border-ink-3')}>
        {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
      </span>
      {children}
    </button>
  );
}

/** Pick one of several options, shown as joined pills. */
export function ChoicePills<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-elevated p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-full px-3 py-1 text-xs font-semibold transition-all', o.value === value ? 'bg-workshop text-white shadow-sm' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "12 lines · 340 characters" for pane footers. */
export function textStats(s: string) {
  const lines = s ? s.split('\n').length : 0;
  return tr('{l} lines · {c} characters', { l: lines.toLocaleString(), c: s.length.toLocaleString() });
}
