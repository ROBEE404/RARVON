import { Link } from 'react-router-dom';
import { tools } from '../lib/toolRegistry';
import { useToolSearch } from '../lib/searchContext';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import AllToolsMenu from './AllToolsMenu';
import InfoLinks from './InfoLinks';
import { LogoMark } from './Logo';
import { appAvailable } from '../lib/appRelease';
import { tr } from '../lib/i18n';

const toolCount = tools.filter((t) => t.status !== 'coming-soon').length;

export default function Header() {
  const { openSearch } = useToolSearch();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 max-[399px]:gap-1.5 max-[399px]:px-3 sm:gap-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label={tr('Rarvon home')}>
          <LogoMark />
          {/* The narrowest phones show the raven alone; the link's label still says Rarvon. */}
          <span className="font-brand text-[17px] font-extrabold uppercase tracking-[0.08em] max-[419px]:hidden">Rarvon</span>
        </Link>
        <AllToolsMenu />
        <button
          onClick={openSearch}
          className="flex h-9 min-w-9 flex-1 items-center gap-2 rounded-md border border-line bg-elevated px-2.5 text-start text-sm text-ink-3 hover:border-ink sm:ms-2 sm:px-3 lg:max-w-[35rem]"
          aria-label={tr('Search tools')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span className="truncate max-[399px]:sr-only">
            <span className="sm:hidden">{tr('Search')}</span>
            <span className="hidden sm:inline">{tr('Search {n} tools', { n: toolCount })}</span>
          </span>
          <kbd className="ms-auto hidden shrink-0 rounded border border-line px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>
        {appAvailable && (
          <Link
            to="/app"
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-workshop/40 bg-workshop-dim px-2.5 text-sm font-semibold text-workshop transition-colors hover:border-workshop md:inline-flex lg:px-3"
            aria-label={tr('Get the Rarvon app')}
            title={tr('Get the Rarvon app')}
            data-testid="app-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v11M7.5 9.5L12 14l4.5-4.5M4 19h16" /></svg>
            <span className="hidden xl:inline">{tr('App')}</span>
          </Link>
        )}
        <InfoLinks />
        <Link
          to="/support"
          className="heart-beat inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-heart/50 bg-heart-dim px-2.5 text-sm font-semibold text-heart transition-colors hover:border-heart sm:px-3.5"
          aria-label={tr('Support Rarvon')}
          data-testid="support-button"
        >
          <svg className="heart" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7.5-4.6-9.6-9.3C1 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 2.9 1.5-1.8 3-2.9 5.1-2.9 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z" />
          </svg>
          <span className="hidden lg:inline">{tr('Support Rarvon')}</span>
        </Link>
        <LanguageToggle compact />
        {/* On the smallest phones the theme button moves into the All tools menu to make room. */}
        <div className="max-[399px]:hidden">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
