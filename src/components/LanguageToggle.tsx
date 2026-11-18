import clsx from 'clsx';
import { useI18n } from '../lib/i18n';

/** Switches the interface between English and Arabic. Shows the language you'd switch to, in that language. */
export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const toArabic = lang === 'en';
  return (
    <button
      onClick={() => setLang(toArabic ? 'ar' : 'en')}
      lang={toArabic ? 'ar' : 'en'}
      aria-label={toArabic ? 'التبديل إلى العربية' : 'Switch to English'}
      title={toArabic ? 'العربية' : 'English'}
      data-testid="language-toggle"
      className={clsx(
        'group flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink',
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-500 group-hover:rotate-[20deg]">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <span className={clsx(compact ? 'hidden sm:inline' : '', toArabic && 'font-[Noto_Sans_Arabic]')}>{toArabic ? 'العربية' : 'English'}</span>
      {compact && <span className="sm:hidden">{toArabic ? 'ع' : 'EN'}</span>}
    </button>
  );
}
