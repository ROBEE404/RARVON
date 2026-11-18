import { Link } from 'react-router-dom';
import { categories, toolsForCategory, tools } from '../lib/toolRegistry';
import { CategoryIcon } from '../lib/categoryIcons';
import ToolCard from '../components/ToolCard';
import { usePageMeta } from '../lib/usePageMeta';
import { ActionIcon } from '../lib/actionIcons';
import { tr } from '../lib/i18n';
import { categoryDescription } from '../lib/appText';

export default function AllToolsPage() {
  const count = tools.filter((t) => t.status !== 'coming-soon').length;
  usePageMeta(tr('All tools'), tr('All {n} Rarvon tools for PDFs, images, video, audio, text and data, grouped by category.', { n: count }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label={tr("Breadcrumb")} className="mb-4 text-xs text-ink-3">
        <Link to="/" className="hover:text-ink">{tr('Home')}</Link> <span aria-hidden="true">/</span> <span className="text-ink">{tr('All tools')}</span>
      </nav>
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{tr('All tools')}</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-2">{tr('{n} tools in {g} groups. Every one runs in your browser.', { n: count, g: categories.length })}</p>
      <nav aria-label={tr('Jump to category')} className="mt-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <a key={c.slug} href={`#${c.slug}`} className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1 text-sm font-medium hover:border-ink">
            <CategoryIcon category={c.slug} size={24} />
            {tr(c.name)}
          </a>
        ))}
        {(['convert', 'compress'] as const).map((a) => (
          <Link key={a} to={`/${a}`} className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1.5 text-sm font-medium hover:border-ink">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-workshop-dim text-workshop"><ActionIcon action={a} className="h-3.5 w-3.5" /></span>
            {tr(a === 'convert' ? 'All Convert tools' : 'All Compress tools')}
          </Link>
        ))}
      </nav>
      <div className="mt-10 grid gap-12">
        {categories.map((c) => (
          <section key={c.slug} id={c.slug} aria-labelledby={`h-${c.slug}`} className="scroll-mt-24">
            <div className="flex items-center gap-3">
              <CategoryIcon category={c.slug} size={34} />
              <div className="min-w-0">
                <h2 id={`h-${c.slug}`} className="font-display text-lg font-semibold">{tr(c.name)}</h2>
                <p className="text-sm text-ink-2">{tr(categoryDescription(c))}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {toolsForCategory(c.slug).map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
