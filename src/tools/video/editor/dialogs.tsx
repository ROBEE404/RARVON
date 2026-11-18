import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Aspect } from '../../../lib/videoEditor/types';
import { ASPECTS } from '../../../lib/videoEditor/types';
import { browserStorageSupported, folderSaveSupported } from '../../../lib/videoEditor/storage';
import { tr } from '../../../lib/i18n';

/** A centred dialog. `locked` dialogs can't be closed with Esc or a click outside; a choice must be made. */
export function Modal({ title, children, onClose, locked, labelledBy = 'modal-title', wide }: {
  title: string; children: ReactNode; onClose?: () => void; locked?: boolean; labelledBy?: string; wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose?.();
      if (e.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href]')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [locked, onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose?.()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={clsx('max-h-[92vh] w-full overflow-y-auto rounded-xl border border-line bg-elevated p-5 shadow-2xl', wide ? 'max-w-xl' : 'max-w-md')}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={labelledBy} className="font-display text-lg font-semibold">{title}</h2>
          {!locked && onClose && (
            <button onClick={onClose} className="-m-1 rounded p-1 text-ink-3 hover:text-ink" aria-label={tr("Close")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function ChoiceButton({ title, detail, onClick, tone = 'default', disabled, icon }: {
  title: string; detail?: string; onClick: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean; icon: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'border-workshop bg-workshop-dim hover:bg-workshop/15',
        tone === 'danger' && 'border-line hover:border-warn hover:bg-warn-dim',
        tone === 'default' && 'border-line hover:border-ink',
      )}
    >
      <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md', tone === 'danger' ? 'bg-warn-dim text-warn' : 'bg-workshop-dim text-workshop')} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </span>
      <span className="min-w-0">
        <span className={clsx('block text-sm font-semibold', tone === 'danger' && 'text-warn')}>{tr(title)}</span>
        {detail && <span className="mt-0.5 block text-xs text-ink-2">{tr(detail)}</span>}
      </span>
    </button>
  );
}

export const ICONS = {
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  back: 'M15 6l-6 6 6 6',
  restore: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v5h5',
};

export interface NewProjectChoice {
  name: string;
  aspect: Aspect;
  browserSave: boolean;
  folderSave: boolean;
}

export function NewProjectDialog({ onCreate, onClose, startingFile }: { onCreate: (c: NewProjectChoice) => void; onClose: () => void; startingFile?: string }) {
  const [name, setName] = useState(startingFile ? startingFile.replace(/\.[^.]+$/, '') : tr('My video'));
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [browserSave, setBrowserSave] = useState(browserStorageSupported());
  const [folderSave, setFolderSave] = useState(false);
  const folderOk = folderSaveSupported();
  const valid = name.trim() && (browserSave || folderSave);
  return (
    <Modal title={tr("New video project")} onClose={onClose} labelledBy="new-project-title">
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCreate({ name: name.trim(), aspect, browserSave, folderSave });
        }}
      >
        {startingFile && <p className="rounded-md bg-paper-dim px-3 py-2 text-xs text-ink-2">{tr("Starting with")}{' '}<strong className="font-medium text-ink">{startingFile}</strong></p>}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Project name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm" required />
        </label>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-2">{tr("Frame shape")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ASPECTS) as Aspect[]).map((a) => {
              const { w, h } = ASPECTS[a];
              return (
                <label key={a} className={clsx('relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center', aspect === a ? 'border-workshop bg-workshop-dim' : 'border-line hover:border-ink')}>
                  <input type="radio" name="new-aspect" checked={aspect === a} onChange={() => setAspect(a)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${a} ${ASPECTS[a].hint}`} />
                  <span className="grid h-10 place-items-center"><span className="rounded-sm border-2 border-current text-ink-2" style={{ width: (w / Math.max(w, h)) * 36, height: (h / Math.max(w, h)) * 36 }} /></span>
                  <span className="text-sm font-semibold">{a}</span>
                  <span className="text-[11px] leading-tight text-ink-3">{ASPECTS[a].hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-xs font-medium text-ink-2">{tr("How should Rarvon save your work? You can pick both.")}</legend>
          <label className={clsx('flex cursor-pointer items-start gap-3 rounded-lg border p-3', browserSave ? 'border-workshop bg-workshop-dim' : 'border-line')}>
            <input type="checkbox" checked={browserSave} disabled={!browserStorageSupported()} onChange={(e) => setBrowserSave(e.target.checked)} className="mt-0.5 accent-[var(--color-workshop)]" />
            <span>
              <span className="block text-sm font-semibold">{tr("Auto-save in this browser")}</span>
              <span className="block text-xs text-ink-2">{tr("Every change is saved as you work. Find it under “Your projects” next time.")}</span>
            </span>
          </label>
          <label className={clsx('flex items-start gap-3 rounded-lg border p-3', folderOk ? 'cursor-pointer' : 'opacity-60', folderSave ? 'border-workshop bg-workshop-dim' : 'border-line')}>
            <input type="checkbox" checked={folderSave} disabled={!folderOk} onChange={(e) => setFolderSave(e.target.checked)} className="mt-0.5 accent-[var(--color-workshop)]" />
            <span>
              <span className="block text-sm font-semibold">{tr("Save to a folder on my computer")}</span>
              <span className="block text-xs text-ink-2">
                {folderOk
                  ? tr("You pick a folder once, and every change is written to it automatically.")
                  : tr("Needs Chrome or Edge. In this browser you can still download a project file at any time.")}
              </span>
            </span>
          </label>
          {!browserSave && !folderSave && <p className="text-xs text-warn">{tr("Pick at least one way to save.")}</p>}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm hover:border-ink">{tr("Cancel")}</button>
          <button type="submit" disabled={!valid} className="rounded-md bg-workshop px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{tr("Create project")}</button>
        </div>
      </form>
    </Modal>
  );
}
