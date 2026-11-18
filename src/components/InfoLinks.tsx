import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { tr } from '../lib/i18n';

const LINKS = [
  { to: '/about', label: 'About', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01', tone: 'workshop' },
  { to: '/privacy', label: 'Privacy', icon: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9.5 11.5V10a2.5 2.5 0 015 0v1.5M9 11.5h6V15H9z', tone: 'signal' },
] as const;

/**
 * About and Privacy as one joined pill of icons. Pointing at an icon slides
 * its name out; the page you're on keeps its name showing and tinted.
 */
export default function InfoLinks() {
  const { pathname } = useLocation();
  const onPage = LINKS.some((l) => l.to === pathname);
  return (
    // The outer box keeps room for a name to slide out on wide screens, so the
    // search box never changes size when you point at About or Privacy.
    <div className={clsx('ms-auto flex shrink-0 justify-end', onPage ? 'lg:min-w-[11.5rem]' : 'lg:min-w-[8.75rem]')}>
    <nav aria-label={tr('About and privacy')} className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-full border border-line" data-testid="info-links">
      {LINKS.map((l, i) => {
        const on = pathname === l.to;
        return (
          <Link
            key={l.to}
            to={l.to}
            aria-current={on ? 'page' : undefined}
            aria-label={tr(l.label)}
            title={tr(l.label)}
            className={clsx(
              'info-link group flex items-center px-2 text-sm font-semibold transition-colors max-[399px]:px-1.5 sm:px-2.5',
              i > 0 && 'border-s border-line',
              on ? (l.tone === 'signal' ? 'is-on bg-signal-dim text-signal' : 'is-on bg-workshop-dim text-workshop') : 'text-ink-2 hover:bg-paper-dim hover:text-ink',
            )}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={clsx('shrink-0', !on && (l.tone === 'signal' ? 'text-signal' : 'text-workshop'))}>
              <path d={l.icon} />
            </svg>
            <span className="info-label">{tr(l.label)}</span>
          </Link>
        );
      })}
    </nav>
    </div>
  );
}
