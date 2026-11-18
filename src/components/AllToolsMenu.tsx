import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { actionMeta, categories, toolsForCategory } from '../lib/toolRegistry';
import { ActionIcon } from '../lib/actionIcons';
import { CategoryIcon } from '../lib/categoryIcons';
import { tr } from '../lib/i18n';
import { appAvailable } from '../lib/appRelease';
import ThemeToggle from './ThemeToggle';

/**
 * The header's single navigation entry: every category with its tools, the
 * action shortcuts (/compress, /convert…) and a link to the full list. A
 * dropdown on wide screens, a full-width sheet on phones.
 */
export default function AllToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="md:relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={tr('All tools')}
        className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors sm:px-3 ${open ? 'border-line bg-paper-dim text-ink' : 'border-transparent text-ink-2 hover:bg-paper-dim hover:text-ink'}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="sm:hidden">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="hidden sm:inline">{tr('All tools')}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={`hidden transition-transform sm:block ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={tr('All tools')}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
          className="absolute inset-x-0 top-full z-30 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-line bg-elevated shadow-lg md:inset-x-auto md:start-0 md:mt-2 md:w-[min(56rem,calc(100vw-3rem))] md:rounded-xl md:border"
        >
          <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => {
              const list = toolsForCategory(c.slug).filter((t) => t.status !== 'coming-soon');
              return (
                <div key={c.slug} className="min-w-0">
                  <Link role="menuitem" to={`/tools/${c.slug}`} className="flex items-center gap-2 font-display text-sm font-semibold hover:text-workshop">
                    <CategoryIcon category={c.slug} size={26} />
                    {tr(c.name)}
                    <span className="ms-auto font-mono text-[11px] font-normal text-ink-3">{list.length}</span>
                  </Link>
                  <ul className="mt-2 grid gap-0.5">
                    {list.map((t) => (
                      <li key={t.slug}>
                        <Link
                          role="menuitem"
                          to={`/tools/${t.category}/${t.slug}`}
                          className="block truncate rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-dim hover:text-ink"
                        >
                          {tr(t.name)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">{tr('By action')}</p>
              <ul className="mt-2 grid gap-0.5">
                {actionMeta.map((a) => (
                  <li key={a.value}>
                    <Link role="menuitem" to={`/${a.value}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-dim hover:text-ink">
                      <ActionIcon action={a.value} className="shrink-0 text-workshop" />
                      {tr(a.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3">
            <Link role="menuitem" to="/tools" className="me-auto text-sm font-medium text-workshop hover:underline">
              {tr('See every tool on one page →')}
            </Link>
            {appAvailable && (
              <Link role="menuitem" to="/app" className="text-sm font-medium text-ink-2 hover:text-ink">{tr('Rarvon for desktop')} <span className="rounded-full bg-warn-dim px-1.5 py-0.5 text-[10px] font-semibold text-warn">{tr('Beta')}</span></Link>
            )}
            {/* On the smallest phones the theme button lives here instead of the top bar. */}
            <div className="flex items-center gap-2 text-sm text-ink-2 min-[400px]:hidden">
              {tr('Theme')}
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
