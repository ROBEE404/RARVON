import { tr } from '../lib/i18n';

export default function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-warn/30 bg-warn-dim px-4 py-3 text-sm text-warn">
      {typeof children === 'string' ? tr(children) : children}
    </div>
  );
}
