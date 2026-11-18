import { tr } from '../lib/i18n';

export default function ExperimentalNotice({ note }: { note: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn-dim px-4 py-3 text-sm text-warn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.86l-8.2 14.2A2 2 0 004.13 21h15.74a2 2 0 001.83-2.94l-8.2-14.2a2 2 0 00-3.5 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{tr(note)}</span>
    </div>
  );
}
