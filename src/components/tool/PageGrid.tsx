import { useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { tr } from '../../lib/i18n';

export interface PageItem {
  id: string;
  /** Thumbnail URL; null while it is still being made. */
  src: string | null;
  /** Shown under the page, e.g. the file name. */
  caption?: string;
}

/**
 * A grid of numbered page thumbnails. With `onMove`, pages can be dragged
 * (or moved with their arrow buttons) and slide smoothly to their new place.
 * With `selected`/`onToggle`, a click picks or unpicks a page.
 */
export function PageGrid({
  items,
  onMove,
  onRemove,
  onAdd,
  addAccept,
  selected,
  onToggle,
}: {
  items: PageItem[];
  onMove?: (from: number, to: number) => void;
  onRemove?: (id: string) => void;
  onAdd?: (files: File[]) => void;
  addAccept?: string;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, DOMRect>());
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // FLIP: remember where every page was, then after the reorder slide each one from there.
  const move = (from: number, to: number) => {
    if (!onMove || from === to || to < 0 || to >= items.length) return;
    before.current = new Map([...refs.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
    onMove(from, to);
  };
  const order = items.map((i) => i.id).join('|');
  useLayoutEffect(() => {
    if (!before.current.size) return;
    for (const [id, el] of refs.current) {
      const old = before.current.get(id);
      if (!old) continue;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    before.current.clear();
  }, [order]);

  return (
    <ol className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5" data-testid="page-grid">
      {items.map((item, i) => {
        const picked = selected ? selected.has(item.id) : true;
        return (
          <li
            key={item.id}
            ref={(el) => { if (el) refs.current.set(item.id, el); else refs.current.delete(item.id); }}
            draggable={Boolean(onMove)}
            onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (dragging === null) return; e.preventDefault(); setOver(i); }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); if (dragging !== null) move(dragging, i); setDragging(null); setOver(null); }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            className={clsx(
              'page-in group relative flex flex-col gap-1',
              onMove && 'cursor-grab active:cursor-grabbing',
              dragging === i && 'opacity-40',
            )}
            style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
          >
            <button
              type="button"
              onClick={onToggle ? () => onToggle(item.id) : undefined}
              tabIndex={onToggle ? 0 : -1}
              aria-pressed={onToggle ? picked : undefined}
              aria-label={onToggle ? tr('Page {n}', { n: i + 1 }) : undefined}
              className={clsx(
                'relative block aspect-[3/4] w-full overflow-hidden rounded-lg border bg-white p-1 transition-all',
                over === i && dragging !== i ? 'border-workshop ring-2 ring-workshop/40 scale-[1.03]' : 'border-line',
                onToggle ? 'cursor-pointer hover:border-ink' : 'cursor-[inherit]',
                !picked && 'opacity-40 grayscale',
              )}
            >
              {item.src ? (
                <img src={item.src} alt="" draggable={false} className="h-full w-full object-contain" />
              ) : (
                <span className="flow-shimmer absolute inset-1 block rounded bg-paper-dim" />
              )}
              <span className={clsx('absolute start-1.5 top-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold', picked ? 'bg-workshop text-white' : 'bg-ink-3 text-paper')}>{i + 1}</span>
              {onToggle && (
                <span className={clsx('absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 transition-colors', picked ? 'border-workshop bg-workshop text-white' : 'border-ink-3 bg-paper')}>
                  {picked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
                </span>
              )}
            </button>

            {(onMove || onRemove) && (
              <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {onMove && (
                  <>
                    <TileButton label={tr('Move earlier')} onClick={() => move(i, i - 1)} disabled={i === 0} d="M15 6l-6 6 6 6" flip />
                    <TileButton label={tr('Move later')} onClick={() => move(i, i + 1)} disabled={i === items.length - 1} d="M9 6l6 6-6 6" flip />
                  </>
                )}
                {onRemove && <TileButton label={tr('Remove')} onClick={() => onRemove(item.id)} d="M6 6l12 12M18 6L6 18" danger />}
              </div>
            )}
            {item.caption && <span className="truncate px-0.5 text-[11px] text-ink-3" title={item.caption}>{item.caption}</span>}
          </li>
        );
      })}

      {onAdd && (
        <li className="page-in" style={{ animationDelay: `${Math.min(items.length, 12) * 35}ms` }}>
          <label className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-ink-3 transition-colors hover:border-workshop hover:text-workshop">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span className="text-xs font-semibold">{tr('Add')}</span>
            <input type="file" multiple accept={addAccept} className="sr-only" onChange={(e) => { if (e.target.files?.length) onAdd(Array.from(e.target.files)); e.target.value = ''; }} />
          </label>
        </li>
      )}
    </ol>
  );
}

function TileButton({ label, onClick, disabled, d, danger, flip }: { label: string; onClick: () => void; disabled?: boolean; d: string; danger?: boolean; flip?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx('grid h-6 w-6 place-items-center rounded-md border bg-paper/95 shadow-sm backdrop-blur disabled:opacity-30', danger ? 'border-warn/40 text-warn hover:bg-warn-dim' : 'border-line text-ink hover:border-ink')}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={flip ? 'rtl:-scale-x-100' : undefined}><path d={d} /></svg>
    </button>
  );
}
