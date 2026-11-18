import { useState } from 'react';
import type { ReactNode } from 'react';
import { supportLinks, projectRepo } from '../lib/supportConfig';
import { usePageMeta } from '../lib/usePageMeta';
import { tr } from '../lib/i18n';

const PAYS_FOR: { title: string; text: string; icon: string }[] = [
  { title: 'Keeps it online', text: 'Hosting and the domain', icon: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01' },
  { title: 'New tools', text: 'The ones people ask for', icon: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z' },
  { title: 'Works everywhere', text: 'Testing on more phones, computers and browsers', icon: 'M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2' },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

export default function Support() {
  usePageMeta(tr('Support Rarvon'), tr('Rarvon is free, ad-free and account-free for everyone. Support is entirely optional and never unlocks features or changes access.'));
  const [shared, setShared] = useState<'idle' | 'copied'>('idle');
  const kofi = supportLinks.kofi || supportLinks.donation;

  async function share() {
    const url = window.location.origin + '/';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Rarvon', text: tr('Free file tools that run in your browser.'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared('copied');
      window.setTimeout(() => setShared('idle'), 2000);
    } catch {
      // Share sheet closed, or clipboard blocked: nothing to do.
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <section className="float-in relative overflow-hidden rounded-2xl border border-heart/30 bg-elevated px-5 py-10 text-center sm:px-10 sm:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[28rem] -translate-x-1/2 rounded-full bg-heart/10 blur-3xl" />
        <div className="heart-beat relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-heart-dim text-heart">
          <svg className="heart" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7.5-4.6-9.6-9.3C1 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 2.9 1.5-1.8 3-2.9 5.1-2.9 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z" />
          </svg>
        </div>
        <h1 className="relative mt-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{tr('Rarvon is free. If it helped you, you can help it.')}</h1>
        <p className="relative mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-2 sm:text-base">
          {tr('I build Rarvon on my own, in my free time. No ads, no accounts, and your files never leave your device. That stays true whether you donate or not.')}
        </p>
        <div className="relative mt-7">
          {kofi ? (
            <a
              href={kofi}
              target="_blank"
              rel="noopener noreferrer"
              className="heart-beat inline-flex min-h-12 items-center gap-2.5 rounded-full bg-[#ff5e5b] px-6 text-base font-semibold text-white shadow-[0_6px_20px_-6px_#ff5e5b] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              data-testid="kofi-button"
            >
              <svg className="heart" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h13v5a6 6 0 01-6 6H10a6 6 0 01-6-6zM17 9h1.5a2.5 2.5 0 010 5H17M8 3v2M12 3v2" /></svg>
              {tr('Buy me a coffee on Ko-fi')}
            </a>
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-4 py-2 text-sm text-ink-3">{tr('The donation link is coming soon.')}</p>
          )}
          {kofi && <p className="mt-3 text-xs text-ink-3">{tr('One-off or monthly, any amount. It opens Ko-fi in a new tab.')}</p>}
        </div>
      </section>

      {/* What it pays for */}
      <h2 className="float-in mt-12 text-center font-display text-lg font-semibold" style={{ animationDelay: '120ms' }}>{tr('What your support pays for')}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PAYS_FOR.map((c, i) => (
          <div key={c.title} className="float-in rounded-xl border border-line bg-elevated p-4 transition-all hover:-translate-y-0.5 hover:border-heart/40" style={{ animationDelay: `${200 + i * 90}ms` }}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-heart-dim text-heart"><Icon d={c.icon} /></span>
            <p className="mt-3 text-sm font-semibold">{tr(c.title)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{tr(c.text)}</p>
          </div>
        ))}
      </div>

      {/* Other ways to help */}
      <section className="float-in mt-8 rounded-xl border border-line bg-elevated p-5" style={{ animationDelay: '480ms' }}>
        <h2 className="font-display text-base font-semibold">{tr('No money? You can still help')}</h2>
        <div className={projectRepo ? 'mt-3 grid gap-2 sm:grid-cols-3' : 'mt-3 grid gap-2'}>
          <HelpButton onClick={() => void share()} icon="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13">
            {shared === 'copied' ? tr('Link copied') : tr('Share Rarvon with a friend')}
          </HelpButton>
          {projectRepo && (
            <>
              <HelpButton href={`${projectRepo}/issues`} icon="M12 8v4M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z">{tr('Report a bug or ask for a tool')}</HelpButton>
              <HelpButton href={projectRepo} icon="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z">{tr('Star it on GitHub')}</HelpButton>
            </>
          )}
        </div>
      </section>

      <p className="float-in mt-8 text-center text-xs text-ink-3" style={{ animationDelay: '560ms' }}>
        {tr('Donating never unlocks features. Everyone gets the same Rarvon.')}
      </p>
    </div>
  );
}

function HelpButton({ children, icon, href, onClick }: { children: ReactNode; icon: string; href?: string; onClick?: () => void }) {
  const cls = 'flex min-h-11 items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-start text-sm font-medium transition-colors hover:border-ink';
  const inner = (
    <>
      <Icon d={icon} className="shrink-0 text-heart" />
      <span>{children}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-live="polite">{inner}</button>
  );
}
