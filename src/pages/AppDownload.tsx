import type { ReactNode } from 'react';
import { usePageMeta } from '../lib/usePageMeta';
import { appRelease, detectSystem } from '../lib/appRelease';
import type { AppSystem } from '../lib/appRelease';
import FeedbackButton from '../components/FeedbackButton';
import { tr } from '../lib/i18n';

const ICONS = {
  windows: 'M3 5.5l7.5-1v7H3zM11.5 4.4L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z',
  linux: 'M12 3c-2 0-3 1.8-3 4 0 1.5.4 2.3-.7 4C6.9 13.1 6 15 6.8 17c.5 1.3 1.8 1.7 2.7 1.4.7.8 1.6 1.1 2.5 1.1s1.8-.3 2.5-1.1c.9.3 2.2-.1 2.7-1.4.8-2-.1-3.9-1.5-6-1.1-1.7-.7-2.5-.7-4 0-2.2-1-4-3-4z',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
};

function Icon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

const COMPARE: [string, string, string][] = [
  ['Video file size', 'Up to 250 MB', 'Any size'],
  ['Video and audio formats', 'MP4, MOV, WebM, MKV', 'Almost every format'],
  ['Speed', 'What the browser allows', 'Your processor and graphics card'],
  ['Background Remover', 'Standard model', 'Sharper model on your graphics card'],
  ['Whole folders at once', '—', 'Yes'],
  ['Right-click a file: Convert with Rarvon', '—', 'Yes'],
  ['Works offline', 'After the first visit', 'Always'],
];

const FAQ: [string, string][] = [
  ['Is the app free?', 'Yes. Like the website: free, no ads, no account, and donating never unlocks anything.'],
  ['Does the app upload my files?', 'No. Everything runs on your computer. The only time the app goes online is to check for updates, and you can switch that off.'],
  ['Does it connect to the Rarvon website?', 'Only if you choose to. The installer asks, and the answer is "no" unless you say otherwise. You can change it any time in the app’s Settings. Without it, the app works fully on its own.'],
  ['What does "beta" mean here?', 'The app works, but it’s new: you may find rough edges. Please report anything odd, it helps a lot.'],
  ['Is there a Mac or phone version?', 'Not yet. The app is for Windows and Linux first; phones will come later.'],
];

export default function AppDownload() {
  usePageMeta(tr('Rarvon for desktop'), tr('Every Rarvon tool at full power on your own computer: any file size, almost every format, your graphics card. Free, offline, no account.'));
  const system = detectSystem();
  const all: { system: AppSystem; label: string; detail: string; url: string }[] = [
    { system: 'windows', label: tr('Download for Windows'), detail: tr('Windows 10 and 11 · installer (.exe)'), url: appRelease.windows },
    { system: 'linux', label: tr('Download for Linux'), detail: tr('Most distributions · .AppImage'), url: appRelease.linuxAppImage },
    { system: 'linux', label: tr('Linux (.deb)'), detail: tr('Ubuntu, Debian and similar'), url: appRelease.linuxDeb },
  ];
  const options = all.filter((o) => o.url);
  const main = options.find((o) => o.system === system) ?? options[0];
  const others = options.filter((o) => o !== main);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <section className="float-in relative overflow-hidden rounded-2xl border border-line bg-elevated px-5 py-10 text-center sm:px-10 sm:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -top-28 left-1/2 h-56 w-[30rem] -translate-x-1/2 rounded-full bg-workshop/15 blur-3xl" />
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-workshop text-white shadow-lg">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18v12H3zM8 21h8M12 17v4" /></svg>
        </div>
        <h1 className="relative mt-5 flex flex-wrap items-center justify-center gap-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {tr('Rarvon for desktop')}
          <span className="rounded-full bg-warn-dim px-2.5 py-0.5 text-sm font-semibold text-warn">{tr('Beta')}</span>
        </h1>
        <p className="relative mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-2 sm:text-base">
          {tr('Every Rarvon tool at full power on your own computer. Any file size, almost every format, and your own graphics card. Free, offline, no account.')}
        </p>

        <div className="relative mt-8">
          {main ? (
            <>
              <a href={main.url} className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-workshop px-7 text-base font-semibold text-white shadow-[0_8px_24px_-8px_var(--color-workshop)] transition-transform hover:-translate-y-0.5" data-testid="app-download">
                <Icon d={main.system === 'windows' ? ICONS.windows : main.system === 'linux' ? ICONS.linux : ICONS.download} size={20} />
                {main.label}
              </a>
              <p className="mt-3 text-xs text-ink-3">
                {[appRelease.version && tr('Version {v}', { v: appRelease.version }), tr('about {n} MB', { n: appRelease.sizeMb }), main.detail].filter(Boolean).join(' · ')}
              </p>
              {others.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-ink-3">{tr('Other downloads:')}</span>
                  {others.map((o) => <a key={o.url} href={o.url} className="font-medium text-workshop hover:underline">{o.label}</a>)}
                </p>
              )}
              {system === 'other' && <p className="mt-3 text-xs text-ink-3">{tr('The app is for Windows and Linux. On this device, the website has every tool.')}</p>}
            </>
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-4 py-2 text-sm text-ink-3" data-testid="app-coming-soon">
              {tr('The beta is on its way. Until then, every tool works right here on the website.')}
            </p>
          )}
        </div>
      </section>

      {/* Browser vs app */}
      <Section title={tr('Website or app?')} delay={120}>
        <p className="text-sm leading-relaxed text-ink-2">{tr('Both have every tool and the same look. The website runs inside your browser, which has limits; the app runs on your computer directly.')}</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-start text-sm">
            <thead className="bg-elevated text-xs text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold"><span className="sr-only">{tr('What')}</span></th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">{tr('Website')}</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold text-workshop">{tr('Rarvon app')}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([what, web, app]) => (
                <tr key={what} className="border-t border-line align-top">
                  <th scope="row" className="px-4 py-2.5 text-start font-medium text-ink">{tr(what)}</th>
                  <td className="px-4 py-2.5 text-ink-2">{tr(web)}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">
                    <span className="inline-flex items-start gap-1.5">
                      {app !== '—' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-signal"><path d="M5 12l5 5L20 7" /></svg>}
                      {tr(app)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Privacy */}
      <Section title={tr('Private by design')} delay={180}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Point icon="M4 5h16v11H4zM2 20h20" title={tr('Files stay on your computer')}>{tr('Nothing you open is uploaded, ever.')}</Point>
          <Point icon="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4" title={tr('Website connection: off')}>{tr('The installer asks; it stays off unless you choose it.')}</Point>
          <Point icon="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0012 3M19 9A7 7 0 007 6" title={tr('Signed updates')}>{tr('Only genuine Rarvon updates install. You can switch update checks off.')}</Point>
        </div>
      </Section>

      {/* FAQ */}
      <Section title={tr('Questions')} delay={240}>
        <div className="grid gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-line bg-elevated px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                {tr(q)}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{tr(a)}</p>
            </details>
          ))}
        </div>
        {/* A div, not a p: the button brings its pop-up (with a heading) along. */}
        <div className="mt-4 text-sm text-ink-2">
          {tr('Found something odd in the beta?')}{' '}
          <FeedbackButton kind="bug" toolName={tr('Rarvon for desktop')} className="font-semibold text-workshop hover:underline">{tr('Report a bug')}</FeedbackButton>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  return (
    <section className="float-in mt-12" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Point({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-4">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-signal-dim text-signal"><Icon d={icon} /></span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}
