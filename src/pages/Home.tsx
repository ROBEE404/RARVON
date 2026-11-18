import { useEffect, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { categories, tools, toolsForCategory, getTool } from '../lib/toolRegistry';
import type { ToolMeta } from '../lib/toolRegistry';
import { useToolSearch } from '../lib/searchContext';
import { usePageMeta } from '../lib/usePageMeta';
import { useWorkspace } from '../lib/workspaceContext';
import { CategoryIcon } from '../lib/categoryIcons';
import { KIND_LABEL, kindOfFile, toolsForKind } from '../lib/fileKinds';
import type { FileKind } from '../lib/fileKinds';
import { getRecentTools } from '../lib/recentTools';
import { HOME_TOP_TOOLS, HOME_TOP_COLLECTION, HOME_HIDDEN_CATEGORIES } from '../lib/homeTools';
import { formatBytes } from '../lib/imageUtils';
import { useInstallPrompt } from '../lib/installPrompt';
import { COLLECTIONS, resolveCollection, collectionSize } from '../lib/collections';
import type { Collection } from '../lib/collections';
import { ActionIcon } from '../lib/actionIcons';
import { appAvailable } from '../lib/appRelease';
import { tr } from '../lib/i18n';
import { showsBrowserWarning } from '../engine/info';

const toolCount = tools.filter((t) => t.status !== 'coming-soon').length;
const MAX_SUGGESTIONS = 6;


function imageFromPaste(e: ClipboardEvent): File | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return new File([f], `pasted-image.${item.type.split('/')[1] || 'png'}`, { type: item.type });
    }
  }
  return null;
}

/** The drop area: Rarvon looks at the file and suggests the tools that take it. */
function DropStart() {
  const navigate = useNavigate();
  const { setPending } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const img = imageFromPaste(e);
      if (img) {
        e.preventDefault();
        setFile(img);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const kind: FileKind | null = file ? kindOfFile(file.name, file.type) : null;
  const suggestions = kind ? toolsForKind(kind) : [];

  function open(tool: ToolMeta) {
    if (!file) return;
    setPending({ url: URL.createObjectURL(file), filename: file.name, source: '/' });
    navigate(`/tools/${tool.category}/${tool.slug}`, { state: { useResult: true } });
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  return (
    <div className="mt-7 grid gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          'grid cursor-pointer gap-4 rounded-2xl border-2 border-dashed bg-elevated p-5 shadow-[4px_4px_0_0_var(--color-ink)] transition-colors sm:grid-cols-[auto_1fr_auto] sm:items-center',
          over ? 'border-workshop bg-workshop-dim' : 'border-ink',
        )}
      >
        <span className="hidden h-12 w-12 place-items-center rounded-xl bg-workshop-dim text-workshop sm:grid" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </span>
        <span>
          <span className="block font-display text-lg font-semibold">{tr('Drop any file here')}</span>
          <span className="mt-0.5 block text-sm text-ink-2">{tr('or paste an image with Ctrl+V. Your file stays on this device.')}</span>
        </span>
        <span className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper">{tr('Choose file')}</span>
        <input
          type="file"
          className="sr-only"
          aria-label={tr('Choose a file to work on')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
      </label>

      {file && kind && (
        <div className="rounded-xl border border-line bg-elevated p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <CategoryIcon category={kind === 'zip' || kind === 'other' ? 'utilities' : kind === 'text' ? 'text' : kind} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-xs text-ink-3">{formatBytes(file.size)} · {tr('what would you like to do with this {kind}?', { kind: tr(KIND_LABEL[kind]) })}</p>
            </div>
            <button onClick={() => setFile(null)} className="text-xs font-medium text-ink-3 hover:text-ink">{tr('Clear')}</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.slice(0, MAX_SUGGESTIONS).map((t, i) => (
              <button
                key={t.category + t.slug}
                onClick={() => open(t)}
                className={clsx(
                  'flex items-center gap-2 rounded-full border bg-paper py-1 pe-3 ps-1 text-sm font-medium hover:border-ink',
                  i === 0 ? 'border-ink shadow-[2px_2px_0_0_var(--color-ink)]' : 'border-line',
                )}
              >
                <CategoryIcon category={t.category} size={24} />
                {tr(t.name)}
              </button>
            ))}
            {suggestions.length > MAX_SUGGESTIONS && (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:border-ink">
                  {tr('+ {n} more', { n: suggestions.length - MAX_SUGGESTIONS })}
                </summary>
                <div className="absolute start-0 z-10 mt-1 grid w-60 gap-0.5 rounded-xl border border-line bg-elevated p-2 shadow-lg">
                  {suggestions.slice(MAX_SUGGESTIONS).map((t) => (
                    <button key={t.category + t.slug} onClick={() => open(t)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-paper-dim">
                      <CategoryIcon category={t.category} size={22} />
                      {tr(t.name)}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  usePageMeta(
    tr('Rarvon — Free tools. No ads. No account.'),
    tr('Free, ad-free, account-free tools for PDFs, images, video, audio, text and data — processed on your device.'),
  );
  const { openSearch } = useToolSearch();
  const { canInstall, installed, install } = useInstallPrompt();
  const [recent] = useState(() =>
    getRecentTools()
      .map((k) => getTool(k.split('/')[0], k.split('/')[1]))
      .filter((t): t is ToolMeta => Boolean(t) && t!.status !== 'coming-soon'),
  );

  return (
    <>
      <section className="bg-grid-paper border-b border-line">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{tr('Drop a file. Pick what to do.')}</h1>
          <p className="mt-4 max-w-xl text-base text-ink-2">
            {tr('PDFs, images, video, audio and text. Free, no ads, no account, and everything runs on your device.')}
          </p>
          <DropStart />
          <button
            onClick={openSearch}
            className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
            {tr('Or search {n} tools', { n: toolCount })}
            <kbd className="rounded border border-line px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="font-display text-base font-semibold">{tr('Recently used')}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {recent.map((t) => (
              <Link key={t.category + t.slug} to={`/tools/${t.category}/${t.slug}`} className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1 text-sm font-medium hover:border-ink">
                <CategoryIcon category={t.category} size={24} />
                {tr(t.name)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="all-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="all-heading" className="font-display text-lg font-semibold">{tr('All tools')}</h2>
          <Link to="/tools" className="text-sm font-medium text-workshop hover:underline">{tr('Browse all tools →')}</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.filter((c) => !HOME_HIDDEN_CATEGORIES.includes(c.slug)).map((c) => {
            const list = toolsForCategory(c.slug).filter((t) => t.status !== 'coming-soon');
            const top = (HOME_TOP_TOOLS[c.slug] ?? [])
              .map((slug) => list.find((t) => t.slug === slug))
              .filter((t): t is ToolMeta => Boolean(t));
            const shown = top.length ? top : list.slice(0, 4);
            const more = list.length - shown.length;
            return (
              <div key={c.slug} className="flex flex-col rounded-xl border border-line bg-elevated p-4">
                <Link to={`/tools/${c.slug}`} className="flex items-center gap-2 font-display text-sm font-semibold hover:text-workshop">
                  <CategoryIcon category={c.slug} size={30} />
                  {tr(c.name)}
                  <span className="ms-auto font-mono text-xs font-normal text-ink-3">{list.length}</span>
                </Link>
                <ul className="mt-3 grid gap-0.5">
                  {shown.map((t) => (
                    <li key={t.slug}>
                      <Link to={`/tools/${t.category}/${t.slug}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-dim hover:text-ink">
                        <span className="truncate">{tr(t.name)}</span>
                        {t.status === 'experimental' && showsBrowserWarning(t.category, t.slug) && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-warn">{tr('Beta')}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <Link to={`/tools/${c.slug}`} className="mt-2 px-2 text-sm font-medium text-workshop hover:underline">
                    {tr(more === 1 ? '+{n} more {name} tool' : '+{n} more {name} tools', { n: more, name: tr(c.name) })}
                  </Link>
                )}
              </div>
            );
          })}
          <CollectionCard collection={COLLECTIONS.convert} />
          <CollectionCard collection={COLLECTIONS.compress} />
          <Link
            to="/tools"
            className="group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-line p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-solid hover:border-workshop hover:bg-workshop-dim hover:shadow-[2px_2px_0_0_var(--color-workshop)]"
          >
            <span className="flex -space-x-2" aria-hidden="true">
              {HOME_HIDDEN_CATEGORIES.map((slug, i) => (
                <span key={slug} className="rounded-lg ring-2 ring-paper transition-transform duration-200 group-hover:translate-y-[-2px]" style={{ transitionDelay: `${i * 40}ms` }}>
                  <CategoryIcon category={slug} size={30} />
                </span>
              ))}
            </span>
            <span className="mt-3 flex items-center gap-1.5 font-display text-sm font-semibold group-hover:text-workshop">
              {tr('See all {n} tools', { n: toolCount })}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
            <span className="mt-1 text-xs text-ink-3">{tr('Including Developer and Utilities tools')}</span>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6" aria-labelledby="tips-heading">
        <h2 id="tips-heading" className="font-display text-lg font-semibold">{tr('Get more out of Rarvon')}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tip icon="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" title={tr('Works offline')}>
            {installed
              ? tr('Rarvon is installed on this device. Every tool works without an internet connection.')
              : tr('After your first visit every tool works without a connection. Install Rarvon to open it like an app.')}
            {canInstall && (
              <button onClick={() => void install()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-ink">
                {tr('Install app')}
              </button>
            )}
          </Tip>
          <Tip icon="M8 4h8l2 3h2v13H4V7h2zM12 11v5m-2.5-2.5h5" title={tr('Drop or paste anything')}>
            {tr('Drop a file at the top of this page, or paste a screenshot with Ctrl+V, and Rarvon suggests the right tool.')}
          </Tip>
          <Tip icon="M4 12h12m0 0l-4-4m4 4l-4 4M20 5v14" title={tr('Keep going with a result')}>
            {tr('Every result has “Continue with” buttons that open the next tool with your file already loaded.')}
          </Tip>
          <Tip icon="M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5" title={tr('Find any tool fast')}>
            {tr('Press')} <kbd className="rounded border border-line px-1 font-mono text-[11px]">Ctrl</kbd>{' '}
            <kbd className="rounded border border-line px-1 font-mono text-[11px]">K</kbd> {tr('on any page and type what you want to do, like “compress video”.')}
          </Tip>
        </div>
        {appAvailable && (
          <Link to="/app" className="group mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-workshop/40 bg-workshop-dim/50 p-4 transition-colors hover:border-workshop sm:p-5" data-testid="home-app-card">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-workshop text-white" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18v12H3zM8 21h8M12 17v4" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 font-display text-base font-semibold">
                {tr('Rarvon for desktop')}
                <span className="rounded-full bg-warn-dim px-2 py-0.5 text-[11px] font-semibold text-warn">{tr('Beta')}</span>
              </span>
              <span className="mt-0.5 block text-sm text-ink-2">{tr('Every tool at full power on your own computer: any file size, almost every format, your graphics card.')}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-workshop">
              {tr('Get the app')}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        )}
      </section>
    </>
  );
}

function Tip({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-line p-4">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-workshop-dim text-workshop" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <h3 className="mt-3 font-display text-sm font-semibold">{title}</h3>
      <div className="mt-1 text-sm text-ink-2">{children}</div>
    </div>
  );
}

function CollectionCard({ collection }: { collection: Collection }) {
  const all = resolveCollection(collection).flatMap((g) => g.entries.map((e) => e.tool));
  const top = HOME_TOP_COLLECTION[collection.slug]
    .map((key) => all.find((t) => `${t.category}/${t.slug}` === key))
    .filter((t): t is ToolMeta => Boolean(t));
  const shown = top.length ? top : all.slice(0, 4);
  const more = collectionSize(collection) - shown.length;
  return (
    <div className="flex flex-col rounded-xl border border-line bg-elevated p-4" data-testid={`home-${collection.slug}`}>
      <Link to={`/${collection.slug}`} className="flex items-center gap-2 font-display text-sm font-semibold hover:text-workshop">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-workshop-dim text-workshop">
          <ActionIcon action={collection.slug} className="h-[18px] w-[18px]" />
        </span>
        {tr('All {name} tools', { name: tr(collection.title) })}
        <span className="ms-auto font-mono text-xs font-normal text-ink-3">{collectionSize(collection)}</span>
      </Link>
      <ul className="mt-3 grid gap-0.5">
        {shown.map((t) => (
          <li key={t.category + t.slug}>
            <Link to={`/tools/${t.category}/${t.slug}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-paper-dim hover:text-ink">
              <span className="truncate">{tr(t.name)}</span>
              {t.status === 'experimental' && showsBrowserWarning(t.category, t.slug) && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-warn">{tr('Beta')}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/${collection.slug}`} className="mt-2 px-2 text-sm font-medium text-workshop hover:underline">
        {more > 0 ? tr('+{n} more {name} tools', { n: more, name: tr(collection.title) }) : tr('Open {name}', { name: tr(collection.title) })}
      </Link>
    </div>
  );
}
