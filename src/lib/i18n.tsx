import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';

/**
 * English / Arabic interface.
 *
 * English is the source language and the default: the site always opens in
 * English unless the visitor has switched to Arabic (remembered in
 * localStorage). Every visible string is written in English in the code and
 * passed through t(); the Arabic dictionary (src/lib/i18n/ar.ts, English →
 * Arabic) is loaded only when Arabic is chosen. A string missing from the
 * dictionary simply stays in English.
 *
 * Placeholders: t('Search {n} tools', { n: 52 }).
 */

export type Lang = 'en' | 'ar';
export const LANG_KEY = 'bench-lang';
type Dict = Record<string, string>;
type Vars = Record<string, string | number>;

// Module state so non-React code (error messages in lib/, the tool registry
// helpers) can translate too. The provider keeps it in sync and re-renders.
let currentLang: Lang = 'en';
let currentDict: Dict = {};

export function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

let arPromise: Promise<Dict> | null = null;
export function loadArabic(): Promise<Dict> {
  arPromise ??= import('./i18n/ar').then((m) => m.ar);
  return arPromise;
}

function interpolate(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translates an English UI string into the current language. */
export function tr(s: string, vars?: Vars): string {
  if (currentLang === 'ar') {
    const hit = currentDict[s];
    if (hit !== undefined) return interpolate(hit, vars);
  }
  return interpolate(s, vars);
}

export function getLang() {
  return currentLang;
}

function applyToDocument(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: typeof tr; switching: boolean } | null>(null);

export function I18nProvider({ children, initialDict }: { children: ReactNode; initialDict?: Dict }) {
  const [lang, setLangState] = useState<Lang>(() => (initialDict ? 'ar' : 'en'));
  const [, setVersion] = useState(0);
  const [switching, setSwitching] = useState(false);
  if (initialDict && currentLang !== 'ar' && lang === 'ar') {
    currentLang = 'ar';
    currentDict = initialDict;
  }

  useEffect(() => {
    applyToDocument(lang);
  }, [lang]);

  const setLang = useCallback(async (next: Lang) => {
    if (next === currentLang) return;
    const dict = next === 'ar' ? await loadArabic() : {};
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage blocked: still switch for this visit */
    }
    const commit = () => {
      currentLang = next;
      currentDict = dict;
      applyToDocument(next);
      setLangState(next);
      setVersion((v) => v + 1);
    };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (!reduce && doc.startViewTransition) {
      document.documentElement.dataset.langSwitch = next;
      setSwitching(true);
      const vt = doc.startViewTransition(() => flushSync(commit));
      void vt.finished.finally(() => {
        delete document.documentElement.dataset.langSwitch;
        setSwitching(false);
      });
    } else if (!reduce) {
      // Fallback: a quick fade.
      document.documentElement.classList.add('lang-fade');
      window.setTimeout(() => {
        flushSync(commit);
        requestAnimationFrame(() => document.documentElement.classList.remove('lang-fade'));
      }, 150);
    } else commit();
  }, []);

  const value = useMemo(() => ({ lang, setLang: (l: Lang) => void setLang(l), t: tr, switching }), [lang, setLang, switching]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Current language plus t(); components using it re-render when the language changes. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) return { lang: 'en' as Lang, setLang: () => undefined, t: tr, switching: false };
  return ctx;
}

/** Shorthand for components that only need t(). */
export function useT() {
  return useI18n().t;
}

/** Formats a date for the current language. */
export function formatDate(d: Date | number) {
  return new Date(d).toLocaleDateString(currentLang === 'ar' ? 'ar' : undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
