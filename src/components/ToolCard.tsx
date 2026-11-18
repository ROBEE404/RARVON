import { showsBrowserWarning } from '../engine/info';
import { Link } from 'react-router-dom';
import type { ToolMeta } from '../lib/toolRegistry';
import { getCategory, EXPERIMENTAL_NOTE } from '../lib/toolRegistry';
import clsx from 'clsx';
import { CategoryIcon } from '../lib/categoryIcons';
import { tr } from '../lib/i18n';

export default function ToolCard({ tool, showCategory = false }: { tool: ToolMeta; showCategory?: boolean }) {
  const isSoon = tool.status === 'coming-soon';
  // The warning is about browser limits, so the engine decides whether it applies.
  const isExperimental = tool.status === 'experimental' && showsBrowserWarning(tool.category, tool.slug);
  const category = showCategory ? getCategory(tool.category) : null;
  const content = (
    <div
      className={clsx(
        'group relative flex h-full flex-col gap-2 rounded-lg border border-line bg-paper p-4 transition-all',
        isSoon ? 'opacity-60' : 'hover:-translate-y-0.5 hover:border-ink hover:shadow-[2px_2px_0_0_var(--color-ink)]',
      )}
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={tool.category} size={32} />
        <h3 className="min-w-0 flex-1 pt-1.5 font-display text-sm font-semibold leading-snug">{tr(tool.name)}</h3>
        {isSoon && (
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">
            {tr('Coming soon')}
          </span>
        )}
        {isExperimental && (
          <span
            title={tr(EXPERIMENTAL_NOTE)}
            className="shrink-0 rounded-full border border-warn/30 bg-warn-dim px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warn"
          >
            {tr('Beta')}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-2">{tr(tool.shortDescription)}</p>
      {category && <p className="mt-auto text-[10px] font-medium uppercase tracking-wide text-workshop">{tr(category.name)}</p>}
    </div>
  );

  if (isSoon) {
    return <div aria-disabled="true">{content}</div>;
  }
  return (
    <Link to={`/tools/${tool.category}/${tool.slug}`} className="block h-full">
      {content}
    </Link>
  );
}
