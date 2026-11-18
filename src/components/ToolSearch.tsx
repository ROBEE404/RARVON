import { showsBrowserWarning } from '../engine/info';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tools, getCategory, actionMeta } from '../lib/toolRegistry';
import type { ToolMeta, ToolAction } from '../lib/toolRegistry';
import { tr } from '../lib/i18n';

const actionLabels = new Map(actionMeta.map((a) => [a.value, a.label]));

/**
 * Scores a tool against one search token. Action matches score highest and
 * uniformly across categories, on purpose — that's what makes searching a
 * broad intent like "compress" surface Compress PDF, Image Compressor,
 * Audio Compressor etc. together at the top, rather than favoring whichever
 * tool happens to have the closest literal name match.
 */
function scoreTokenAgainstTool(tool: ToolMeta, token: string): number {
  const name = `${tool.name} ${tr(tool.name)}`.toLowerCase();
  if (name === token) return 100;
  if (tool.actions.some((a) => a === token || actionLabels.get(a)?.toLowerCase() === token || tr(actionLabels.get(a) ?? '') === token)) return 95;
  if (name.startsWith(token)) return 80;
  if (tool.actions.some((a) => a.startsWith(token))) return 75;
  if (name.includes(token)) return 60;
  if (tool.keywords.some((k) => k.toLowerCase().includes(token))) return 40;
  if (`${tool.shortDescription} ${tr(tool.shortDescription)}`.toLowerCase().includes(token)) return 20;
  return 0;
}

function scoreTool(tool: ToolMeta, query: string): number {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const tokenScores = tokens.map((t) => scoreTokenAgainstTool(tool, t));
  if (tokenScores.some((s) => s === 0)) return 0; // every word in a multi-word query must match something
  return tokenScores.reduce((sum, s) => sum + s, 0) / tokenScores.length;
}

function matchedAction(tool: ToolMeta, query: string): ToolAction | null {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const hit = tool.actions.find((a) => a === token || actionLabels.get(a)?.toLowerCase() === token);
    if (hit) return hit;
  }
  return null;
}

export default function ToolSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = tools
    .map((t) => ({ tool: t, score: scoreTool(t, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, 12)
    .map((r) => r.tool);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(tool: ToolMeta) {
    onClose();
    if (tool.status === 'available') navigate(`/tools/${tool.category}/${tool.slug}`);
    else navigate(`/tools/${tool.category}/${tool.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && results[activeIndex]) {
      go(results[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('Search tools')}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-elevated shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tr('Search tools… e.g. compress image, merge pdf, json')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
            aria-label={tr('Search tools')}
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-3 sm:inline">{tr('Esc')}</kbd>
        </div>
        <ul className="max-h-96 overflow-auto py-1" role="listbox">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">{tr('No tools match “{q}”', { q: query })}</li>}
          {results.map((tool, i) => {
            const category = getCategory(tool.category);
            const action = matchedAction(tool, query);
            return (
              <li key={`${tool.category}-${tool.slug}`} role="option" aria-selected={i === activeIndex}>
                <button
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(tool)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm ${i === activeIndex ? 'bg-workshop-dim' : ''}`}
                >
                  <span>
                    <span className="font-medium">{tr(tool.name)}</span>
                    <span className="ms-2 text-xs text-ink-3">{tr(category?.name ?? '')}</span>
                    {action && <span className="ms-2 rounded-full bg-workshop-dim px-1.5 py-0.5 text-[10px] font-medium text-workshop">{tr(actionLabels.get(action) ?? '')}</span>}
                  </span>
                  {tool.status === 'coming-soon' && (
                    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase text-ink-3">{tr('Soon')}</span>
                  )}
                  {tool.status === 'experimental' && showsBrowserWarning(tool.category, tool.slug) && (
                    <span className="shrink-0 rounded-full border border-warn/30 bg-warn-dim px-2 py-0.5 text-[10px] uppercase text-warn">{tr('Experimental')}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
