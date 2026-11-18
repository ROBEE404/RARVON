import { tr } from '../lib/i18n';

export default function SuccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-md border border-signal/30 bg-signal-dim px-4 py-3 text-sm text-signal">
      {typeof children === 'string' ? tr(children) : children}
    </div>
  );
}
