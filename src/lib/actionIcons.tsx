import type { ToolAction } from './toolRegistry';

const paths: Record<ToolAction, string> = {
  convert: 'M17 2l4 4-4 4M3 12v-2a4 4 0 014-4h14M7 22l-4-4 4-4M21 12v2a4 4 0 01-4 4H3',
  compress: 'M8 3v4a1 1 0 01-1 1H3m18 0h-4a1 1 0 01-1-1V3M3 16h4a1 1 0 011 1v4m10-5h4a1 1 0 001-1v-4',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  resize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  extract: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  generate: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  optimize: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  analyze: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
};

export function ActionIcon({ action, className }: { action: ToolAction; className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d={paths[action]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
