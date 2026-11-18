import { useParams, Link } from 'react-router-dom';
import { tools, actionMeta } from '../lib/toolRegistry';
import ToolCard from '../components/ToolCard';
import { ActionIcon } from '../lib/actionIcons';
import { usePageMeta } from '../lib/usePageMeta';
import NotFound from './NotFound';
import CollectionPage from './CollectionPage';
import { COLLECTIONS } from '../lib/collections';
import { tr } from '../lib/i18n';
import { isBenchApp } from '../engine/info';

const RUNS_LOCALLY = isBenchApp()
  ? 'Every tool below runs on your computer. Nothing is uploaded to a server.'
  : 'Every tool below runs in your browser. Nothing is uploaded to a server.';

export default function ActionPage() {
  const { action } = useParams<{ action: string }>();
  const meta = actionMeta.find((a) => a.value === action);

  usePageMeta(
    meta ? tr('{name} — free, local, no account', { name: tr(meta.label) }) : tr('Page not found'),
    meta ? `${tr(meta.description)} ${tr(RUNS_LOCALLY)}` : tr('This page could not be found.'),
  );

  if (!meta) return <NotFound />;
  if (meta.value === 'convert' || meta.value === 'compress') return <CollectionPage collection={COLLECTIONS[meta.value]} />;

  const matches = tools.filter((t) => t.actions.includes(meta.value));
  const available = matches.filter((t) => t.status !== 'coming-soon');
  const soon = matches.filter((t) => t.status === 'coming-soon');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label={tr("Breadcrumb")} className="mb-4 text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">{tr('Home')}</Link> <span aria-hidden="true">/</span> <span className="text-ink">{tr(meta.label)}</span>
      </nav>

      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-workshop-dim text-workshop">
          <ActionIcon action={meta.value} />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{tr(meta.label)}</h1>
      </div>
      <p className="mt-3 max-w-xl text-sm text-ink-2">
        {tr(meta.description)} {tr(RUNS_LOCALLY)}
      </p>

      {(
        <>
          {available.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((t) => (
                <ToolCard key={`${t.category}-${t.slug}`} tool={t} showCategory />
              ))}
            </div>
          )}

          {soon.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-4 font-display text-sm font-semibold text-ink-2">{tr('Coming soon')}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {soon.map((t) => (
                  <ToolCard key={`${t.category}-${t.slug}`} tool={t} showCategory />
                ))}
              </div>
            </div>
          )}

          {matches.length === 0 && <p className="mt-8 text-sm text-ink-3">{tr('No tools are tagged for this action yet.')}</p>}
        </>
      )}

      <p className="mt-10 text-xs text-ink-3">
        {tr('Prefer browsing by file type instead?')}{' '}
        <Link to="/tools/pdf" className="text-workshop hover:underline">{tr('Browse by category')}</Link>.
      </p>
    </div>
  );
}
