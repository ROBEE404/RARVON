import type { EditorTool } from './types';
import { tr } from '../../../lib/i18n';

const TOOLS: { value: EditorTool; label: string; icon: string }[] = [
  { value: 'select', label: 'Select', icon: 'M4 4l7 16 2-7 7-2z' },
  { value: 'text', label: 'Text', icon: 'M5 5h14M12 5v14' },
  { value: 'draw', label: 'Draw', icon: 'M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z' },
  { value: 'highlight', label: 'Highlight', icon: 'M4 20h16M6 16l8-8 4 4-8 8H6v-4z' },
  { value: 'underline', label: 'Underline', icon: 'M7 4v7a5 5 0 0010 0V4M5 20h14' },
  { value: 'shape', label: 'Shapes', icon: 'M3 3h8v8H3zM17 7m-4 0a4 4 0 108 0 4 4 0 10-8 0M4 20L20 14' },
  { value: 'image', label: 'Image', icon: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01' },
  { value: 'note', label: 'Note', icon: 'M4 5h16v10H9l-5 4z' },
  { value: 'signature', label: 'Signature', icon: 'M3 17c3-1 5-4 6-8 1 4 3 7 6 8 2-1 3-3 3-3M3 17l2 3M18 14s1 2 3 3' },
  { value: 'redact', label: 'Redact', icon: 'M4 6h16v12H4zM7 9h4M7 12h6M7 15h3' },
];

interface Props {
  active: EditorTool;
  onChange: (t: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoomMode: 'fit' | 'custom';
  zoomPercent: number;
  onZoomStep: (delta: number) => void;
  onFit: () => void;
  currentPageNum: number;
  totalPages: number;
  onExport: () => void;
  exporting: boolean;
}

export default function EditorToolbar({
  active, onChange, onUndo, onRedo, canUndo, canRedo,
  zoomMode, zoomPercent, onZoomStep, onFit, currentPageNum, totalPages, onExport, exporting,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={tr("Editing tools")}>
        {TOOLS.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active === t.value}
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${active === t.value ? 'border-workshop bg-workshop-dim text-workshop' : 'border-transparent text-ink-2 hover:bg-paper-dim'}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={t.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button onClick={onUndo} disabled={!canUndo} title={tr("Undo")} aria-label={tr("Undo")} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-paper-dim disabled:opacity-30">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v1" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button onClick={onRedo} disabled={!canRedo} title={tr("Redo")} aria-label={tr("Redo")} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-paper-dim disabled:opacity-30">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 00-5 5v1" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-ink-3 sm:inline">{tr("Page")}{' '}{currentPageNum} / {totalPages}</span>
        <div className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

        <div className="flex items-center gap-1" role="group" aria-label={tr("Zoom")}>
          <button onClick={() => onZoomStep(-0.1)} aria-label={tr("Zoom out")} title={tr("Zoom out")} className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-paper-dim">−</button>
          <button
            onClick={onFit}
            title={tr("Fit page to window")}
            aria-label={tr("Fit page to window")}
            aria-pressed={zoomMode === 'fit'}
            className={`rounded px-2 py-1 text-xs font-medium ${zoomMode === 'fit' ? 'bg-workshop-dim text-workshop' : 'text-ink-2 hover:bg-paper-dim'}`}
          >
            {tr("Fit")}
          </button>
          <span className="w-11 text-center text-xs text-ink-3">{Math.round(zoomPercent * 100)}%</span>
          <button onClick={() => onZoomStep(0.1)} aria-label={tr("Zoom in")} title={tr("Zoom in")} className="flex h-7 w-7 items-center justify-center rounded text-ink-2 hover:bg-paper-dim">+</button>
        </div>

        <button
          onClick={onExport}
          disabled={exporting}
          className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-workshop disabled:opacity-50"
        >
          {exporting ? tr("Exporting…") : tr("Export PDF")}
        </button>
      </div>
    </div>
  );
}
