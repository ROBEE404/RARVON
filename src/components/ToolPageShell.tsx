import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ToolMeta } from '../lib/toolRegistry';
import { getCategory, relatedTools } from '../lib/toolRegistry';
import { CategoryIcon } from '../lib/categoryIcons';
import { useWorkspace } from '../lib/workspaceContext';
import { KIND_LABEL, kindOfFile, toolsForKind } from '../lib/fileKinds';
import { tr } from '../lib/i18n';
import FeedbackButton from './FeedbackButton';
import { useScrollTint } from '../lib/useScrollTint';
import { toolText } from '../lib/appText';

/**
 * Next steps under a tool: once it has produced a result, tools that accept
 * that kind of file (opening one loads the result automatically); before
 * that, related tools from the same category.
 */
function NextSteps({ tool, wide }: { tool: ToolMeta; wide: boolean }) {
  const { pending } = useWorkspace();
  const { pathname } = useLocation();
  const own = pending && pending.source === pathname ? pending : null;
  const key = `${tool.category}/${tool.slug}`;
  const kind = own ? kindOfFile(own.filename) : null;
  const next = kind ? toolsForKind(kind, key).slice(0, 8) : [];
  const related = relatedTools(tool);
  if (!next.length && !related.length) return null;
  return (
    <section className={`mt-10 border-t border-line pt-6 ${wide ? 'mx-auto max-w-3xl' : ''}`} aria-labelledby="next-heading">
      {next.length > 0 && own && kind ? (
        <>
          <h2 id="next-heading" className="font-display text-sm font-semibold">{tr('Continue with {name}', { name: own.filename })}</h2>
          <p className="mt-1 text-xs text-ink-3">{tr('Opens the tool with your {kind} already loaded.', { kind: tr(KIND_LABEL[kind]) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((t) => (
              <Link
                key={t.slug + t.category}
                to={`/tools/${t.category}/${t.slug}`}
                state={{ useResult: true }}
                className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1 text-xs font-medium text-ink-2 hover:border-ink hover:text-ink"
              >
                <CategoryIcon category={t.category} size={22} />
                {tr(t.name)}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 id="next-heading" className="font-display text-sm font-semibold">{tr('Related tools')}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((t) => (
              <Link
                key={t.slug}
                to={`/tools/${t.category}/${t.slug}`}
                className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1 text-xs font-medium text-ink-2 hover:border-ink hover:text-ink"
              >
                <CategoryIcon category={t.category} size={22} />
                {tr(t.name)}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function ToolPageShell({ tool, children }: { tool: ToolMeta; children: ReactNode }) {
  const category = getCategory(tool.category);
  const wide = tool.layout === 'wide';
  const { faq } = toolText(tool);
  useScrollTint(tool.category);
  return (
    <div className={wide ? 'group/shell mx-auto max-w-[1680px] px-3 py-4 sm:px-4' : 'mx-auto max-w-3xl px-4 py-10 sm:px-6'}>
      {/* Wide tools (e.g. the PDF Editor) look like any other tool until they
          open a workspace (an element with data-workspace), then the header
          collapses to a compact full-width bar above it. */}
      <div className={wide ? 'mx-auto max-w-3xl pt-6 group-has-[[data-workspace]]/shell:max-w-none group-has-[[data-workspace]]/shell:pt-0' : undefined}>
        <nav aria-label={tr("Breadcrumb")} className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          <Link to="/tools" className="hover:text-ink">{tr('All tools')}</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/tools/${tool.category}`} className="hover:text-ink">{tr(category?.name ?? '')}</Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{tr(tool.name)}</span>
        </nav>
        <div className="flex items-center gap-3">
          <CategoryIcon category={tool.category} size={40} className={wide ? 'group-has-[[data-workspace]]/shell:hidden' : undefined} />
          <h1 className={`font-display text-2xl font-semibold tracking-tight sm:text-3xl ${wide ? 'group-has-[[data-workspace]]/shell:text-lg sm:group-has-[[data-workspace]]/shell:text-xl' : ''}`}>{tr(tool.name)}</h1>
        </div>
        <p className={`mt-2 max-w-xl text-sm text-ink-2 ${wide ? 'group-has-[[data-workspace]]/shell:hidden' : ''}`}>{tr(toolText(tool).description)}</p>
      </div>

      <div className={wide ? 'mt-8 group-has-[[data-workspace]]/shell:mt-3' : 'mt-8'}>{children}</div>

      {tool.status !== 'coming-soon' && <NextSteps tool={tool} wide={wide} />}

      {faq && faq.length > 0 && (
        <section className={`mt-12 border-t border-line pt-6 ${wide ? 'mx-auto max-w-3xl' : ''}`} aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-sm font-semibold">{tr('Frequently asked questions')}</h2>
          <dl className="mt-3 space-y-4">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="text-sm font-medium">{tr(f.q)}</dt>
                <dd className="mt-1 text-sm text-ink-2">{tr(f.a)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className={`mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-ink-2 ${wide ? 'mx-auto max-w-3xl' : ''}`} data-testid="tool-feedback">
        <span className="me-auto">{tr('Something wrong with this tool, or missing a tool?')}</span>
        <FeedbackButton kind="bug" toolName={tr(tool.name)} className="font-semibold text-workshop hover:underline">{tr('Report a bug')}</FeedbackButton>
        <span aria-hidden="true" className="text-ink-3">·</span>
        <FeedbackButton kind="tool" className="font-semibold text-workshop hover:underline">{tr('Ask for a tool')}</FeedbackButton>
      </div>
    </div>
  );
}
