import { useParams, Navigate, Link } from 'react-router-dom';
import { getCategory, toolsForCategory } from '../lib/toolRegistry';
import ToolCard from '../components/ToolCard';
import { CategoryIcon } from '../lib/categoryIcons';
import { usePageMeta } from '../lib/usePageMeta';
import { useScrollTint } from '../lib/useScrollTint';
import { tr } from '../lib/i18n';
import { categoryDescription } from '../lib/appText';

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const meta = getCategory(category ?? '');
  useScrollTint(meta?.slug);
  usePageMeta(
    meta ? tr('{name} tools', { name: tr(meta.name) }) : 'Rarvon',
    meta ? tr(categoryDescription(meta)) : '',
  );
  if (!meta) return <Navigate to="/" replace />;
  const list = toolsForCategory(meta.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label={tr("Breadcrumb")} className="mb-4 text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">{tr('Home')}</Link> <span aria-hidden="true">/</span>{' '}
        <Link to="/tools" className="hover:text-ink">{tr('All tools')}</Link> <span aria-hidden="true">/</span> <span className="text-ink">{tr(meta.name)}</span>
      </nav>
      <div className="flex items-center gap-3">
        <CategoryIcon category={meta.slug} size={40} />
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{tr('{name} tools', { name: tr(meta.name) })}</h1>
      </div>
      <p className="mt-2 max-w-xl text-sm text-ink-2">{tr(categoryDescription(meta))}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <ToolCard key={t.slug} tool={t} />
        ))}
      </div>
    </div>
  );
}
