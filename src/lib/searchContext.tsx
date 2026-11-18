import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import ToolSearch from '../components/ToolSearch';

const SearchContext = createContext<{ openSearch: () => void } | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <SearchContext.Provider value={{ openSearch: () => setOpen(true) }}>
      {children}
      <ToolSearch open={open} onClose={() => setOpen(false)} />
    </SearchContext.Provider>
  );
}

export function useToolSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useToolSearch must be used within SearchProvider');
  return ctx;
}
