import { Link } from 'react-router-dom';
import type { ToolMeta } from '../lib/toolRegistry';
import { tr } from '../lib/i18n';

/** What changes in the app, for the kind of heavy tool this is. */
function differences(tool: ToolMeta): [string, string][] {
  if (tool.category === 'video') {
    return [
      ['Videos up to 250 MB', 'Any size'],
      ['MP4, MOV, WebM, MKV', 'Almost every format'],
      ['Speed depends on the browser', 'Your processor and graphics card'],
    ];
  }
  return [
    ['Standard AI model', 'Sharper model for hair and edges'],
    ['Speed depends on the browser', 'Your graphics card'],
    ['One picture at a time', 'Whole folders at once'],
  ];
}

/**
 * Shown on heavy tools (video and AI) while they run in the browser: the
 * honest warning, plus what the Rarvon app does differently and a way to get it.
 */
export default function BrowserLimitsCard({ tool }: { tool: ToolMeta }) {
  const rows = differences(tool);
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-warn/30 bg-elevated" aria-label={tr('This tool runs in your browser')} data-testid="browser-limits">
      <p className="flex items-start gap-2 bg-warn-dim px-4 py-2.5 text-sm text-warn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.86l-8.2 14.2A2 2 0 004.13 21h15.74a2 2 0 001.83-2.94l-8.2-14.2a2 2 0 00-3.5 0z" />
        </svg>
        <span>{tr('This tool works, but it runs inside your browser, so speed and file size depend on it.')}</span>
      </p>
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{tr('In the browser')}</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {rows.map(([web]) => <li key={web}>{tr(web)}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-workshop">{tr('In the Rarvon app')}</p>
          <ul className="mt-1.5 space-y-1 text-sm font-medium text-ink">
            {rows.map(([web, app]) => (
              <li key={web} className="flex items-start gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0 text-signal"><path d="M5 12l5 5L20 7" /></svg>
                {tr(app)}
              </li>
            ))}
          </ul>
        </div>
        <Link to="/app" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-workshop bg-workshop px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90" data-testid="get-app">
          {tr('Get the app')}
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">{tr('Beta')}</span>
        </Link>
      </div>
    </section>
  );
}
