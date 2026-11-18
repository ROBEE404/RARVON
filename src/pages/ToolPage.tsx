import { showsBrowserWarning } from '../engine/info';
import { Suspense, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { getTool, getCategory, EXPERIMENTAL_NOTE } from '../lib/toolRegistry';
import { toolComponents } from '../lib/toolComponents';
import ToolPageShell from '../components/ToolPageShell';
import ComingSoonNotice from '../components/ComingSoonNotice';
import ExperimentalNotice from '../components/ExperimentalNotice';
import { usePageMeta, toolJsonLd } from '../lib/usePageMeta';
import { recordToolVisit } from '../lib/recentTools';
import BrowserLimitsCard from '../components/BrowserLimitsCard';
import { appAvailable } from '../lib/appRelease';
import { tr } from '../lib/i18n';

export default function ToolPage() {
  const { category, slug } = useParams<{ category: string; slug: string }>();
  const tool = getTool(category ?? '', slug ?? '');
  usePageMeta(tool ? tr(tool.name) : 'Rarvon', tool ? tr(tool.shortDescription) : '', {
    jsonLd: tool ? toolJsonLd(tool, getCategory(tool.category)?.name ?? '') : null,
  });
  const key = tool ? `${tool.category}/${tool.slug}` : '';
  useEffect(() => {
    if (key && tool?.status !== 'coming-soon') recordToolVisit(key);
  }, [key, tool?.status]);
  if (!tool) return <Navigate to="/" replace />;

  const Component = toolComponents[`${tool.category}/${tool.slug}`];

  if (tool.status === 'coming-soon' && !Component) {
    return (
      <ToolPageShell tool={tool}>
        <ComingSoonNotice reason={tool.comingSoonReason} />
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell tool={tool}>
      {tool.status === 'coming-soon' && <div className="mb-4"><ComingSoonNotice reason={tool.comingSoonReason} /></div>}
      {tool.status === 'experimental' && showsBrowserWarning(tool.category, tool.slug) && (
        // With the app available, heavy tools show what it does better; until then, the plain warning.
        appAvailable ? <BrowserLimitsCard tool={tool} /> : <ExperimentalNotice note={EXPERIMENTAL_NOTE} />
      )}
      <Suspense fallback={<div className="py-12 text-center text-sm text-ink-3">{tr("Loading tool…")}</div>}>
        {Component ? <Component /> : null}
      </Suspense>
    </ToolPageShell>
  );
}
