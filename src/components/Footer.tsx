import { Link } from 'react-router-dom';
import { categories } from '../lib/toolRegistry';
import SupportButton from './SupportButton';
import { appAvailable } from '../lib/appRelease';
import { tr } from '../lib/i18n';
import { categoryDescription } from '../lib/appText';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-paper-dim">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {categories.map((c) => (
            <div key={c.slug}>
              <h3 className="font-display text-sm font-semibold">{tr(c.name)}</h3>
              <p className="mt-1 text-xs text-ink-3">{tr(categoryDescription(c))}</p>
              <Link to={`/tools/${c.slug}`} className="mt-2 inline-block text-xs font-medium text-workshop hover:underline">
                {tr('Browse {name} tools', { name: tr(c.name).toLowerCase() })}
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{tr('Free. No ads. No account. Your files never leave your device.')}</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-ink">{tr('Privacy')}</Link>
            <Link to="/about" className="hover:text-ink">{tr('About')}</Link>
            <Link to="/support" className="hover:text-ink">{tr('Support')}</Link>
            {appAvailable && <Link to="/app" className="hover:text-ink">{tr('Desktop app')}</Link>}
            <Link to="/credits" className="hover:text-ink">{tr('Credits and licenses')}</Link>
            <SupportButton variant="footer" />
          </div>
        </div>
      </div>
    </footer>
  );
}
