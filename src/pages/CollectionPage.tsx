import { Link } from 'react-router-dom';
import type { Collection } from '../lib/collections';
import { resolveCollection, collectionSize } from '../lib/collections';
import { CategoryIcon } from '../lib/categoryIcons';
import { ActionIcon } from '../lib/actionIcons';
import { getCategory } from '../lib/toolRegistry';
import { tr } from '../lib/i18n';
import { showsBrowserWarning } from '../engine/info';

/** A dedicated page for one cross-category collection (Convert, Compress). */
export default function CollectionPage({ collection }: { collection: Collection }) {
  const groups = resolveCollection(collection);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label={tr("Breadcrumb")} className="mb-4 text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">{tr('Home')}</Link> <span aria-hidden="true">/</span> <span className="text-ink">{tr(collection.title)}</span>
      </nav>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-workshop-dim text-workshop">
          <ActionIcon action={collection.slug} />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{tr(collection.title)}</h1>
        <span className="ms-1 font-mono text-sm text-ink-3">{tr('{n} tools', { n: collectionSize(collection) })}</span>
      </div>
      <p className="mt-3 max-w-xl text-sm text-ink-2">{tr(collection.intro)}</p>

      <div className="mt-8 grid gap-10">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="font-display text-sm font-semibold text-ink-2">{tr(g.title)}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.entries.map(({ tool, formats }) => (
                <Link
                  key={tool.category + tool.slug}
                  to={`/tools/${tool.category}/${tool.slug}`}
                  className="group flex items-start gap-3 rounded-xl border border-line bg-elevated p-4 transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-[2px_2px_0_0_var(--color-ink)]"
                >
                  <CategoryIcon category={tool.category} size={36} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold">{tr(tool.name)}</span>
                      {tool.status === 'experimental' && showsBrowserWarning(tool.category, tool.slug) && <span className="font-mono text-[10px] uppercase tracking-wide text-warn">{tr('Beta')}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-2">{tr(formats)}</span>
                    <span className="mt-1 block text-[11px] text-ink-3">{tr(getCategory(tool.category)?.name ?? '')}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {collection.note && (
        <p className="mt-10 max-w-2xl rounded-lg border border-line bg-paper-dim p-4 text-sm text-ink-2">{tr(collection.note)}</p>
      )}
      <p className="mt-8 text-xs text-ink-3">
        {tr('These tools also stay in their own categories.')} <Link to="/tools" className="text-workshop hover:underline">{tr('Browse all tools')}</Link>
      </p>
    </div>
  );
}
