import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../lib/themeContext';
import type { ThemePreference } from '../lib/themeContext';
import { tr } from '../lib/i18n';

const ICONS: Record<ThemePreference, string> = {
  light: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 7a5 5 0 100 10 5 5 0 000-10z',
  dark: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  system: 'M3 5h18v11H3z M8 20h8 M12 16v4',
};

function ThemeIcon({ value }: { value: ThemePreference }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[value]} />
    </svg>
  );
}

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={tr('Theme: {name}. Click to change.', { name: tr(current.label) })}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-2 hover:border-ink hover:text-ink"
      >
        <ThemeIcon value={current.value} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute end-0 z-30 mt-1 w-32 overflow-hidden rounded-md border border-line bg-elevated py-1 text-sm shadow-lg"
        >
          {OPTIONS.map((o) => (
            <li key={o.value} role="none">
              <button
                role="menuitemradio"
                aria-checked={preference === o.value}
                onClick={() => {
                  setPreference(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-paper-dim ${preference === o.value ? 'font-medium text-workshop' : 'text-ink-2'}`}
              >
                <ThemeIcon value={o.value} />
                {tr(o.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
