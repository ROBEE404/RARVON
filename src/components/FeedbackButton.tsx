import { useRef } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { feedbackEmail, maker, projectRepo } from '../lib/supportConfig';
import { tr } from '../lib/i18n';

export type FeedbackKind = 'bug' | 'tool';

/** The email and GitHub links for a report or request, with a ready-to-fill template. */
function feedbackLinks(kind: FeedbackKind, toolName?: string) {
  const where = typeof window !== 'undefined' ? window.location.href : '';
  const browser = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const title = kind === 'bug'
    ? (toolName ? tr('Bug in {tool}', { tool: toolName }) : tr('Bug report'))
    : tr('Tool request');
  const body = kind === 'bug'
    ? [
        tr('What happened?'), '', '',
        tr('What did you expect to happen?'), '', '',
        tr('How can I make it happen again?'), '', '',
        '---',
        `${tr('Page')}: ${where}`,
        `${tr('Browser')}: ${browser}`,
      ].join('\n')
    : [
        tr('What would you like to do?'), '', '',
        tr('What kind of files are involved (for example PDF, photo, video)?'), '', '',
      ].join('\n');
  const q = (s: string) => encodeURIComponent(s);
  return {
    email: feedbackEmail ? `mailto:${feedbackEmail}?subject=${q(`Rarvon: ${title}`)}&body=${q(body)}` : null,
    github: projectRepo ? `${projectRepo}/issues/new?title=${q(title)}&body=${q(body)}` : maker.url,
  };
}

/**
 * A button that opens a small pop-up with the two ways to reach me: email and
 * GitHub. Tool requests put email first (anyone can write one); bug reports
 * put GitHub first (public, so the same bug isn't reported twice).
 */
export default function FeedbackButton({ kind, toolName, className, children }: { kind: FeedbackKind; toolName?: string; className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const links = feedbackLinks(kind, toolName);

  const email = links.email && (
    <Choice
      key="email"
      href={links.email}
      icon="M4 6h16v12H4zM4 7l8 6 8-6"
      title={tr('Send an email')}
      text={kind === 'tool' ? tr('Opens your email app with a short template. Anyone can do it.') : tr('Opens your email app with the details filled in. Good if you don’t have GitHub.')}
      best={kind === 'tool'}
      testId="feedback-email"
    />
  );
  const github = (
    <Choice
      key="github"
      href={links.github}
      external
      icon="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
      title={tr('Open an issue on GitHub')}
      text={kind === 'bug' ? tr('Public, so you can see if it’s already reported and follow the fix. Needs a GitHub account.') : tr('Public, so others can add their vote. Needs a GitHub account.')}
      best={kind === 'bug' || !links.email}
      testId="feedback-github"
    />
  );

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className}>{children}</button>
      <dialog
        ref={dialog}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
        className="feedback-dialog m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-elevated p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        aria-labelledby={`feedback-title-${kind}`}
        data-testid="feedback-dialog"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`feedback-title-${kind}`} className="font-display text-lg font-semibold">{kind === 'bug' ? tr('Report a bug') : tr('Ask for a tool')}</h2>
              <p className="mt-0.5 text-sm text-ink-2">
                {toolName ? tr('About: {tool}', { tool: toolName }) + ' · ' : ''}{tr('Pick whichever is easier for you.')}
              </p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label={tr('Close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-paper-dim hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {kind === 'tool' ? [email, github] : [github, email]}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            {tr('Nothing is sent until you press send in your email app or on GitHub, and you can edit everything first.')}
          </p>
        </div>
      </dialog>
    </>
  );
}

function Choice({ href, icon, title, text, best, external, testId }: { href: string; icon: string; title: string; text: string; best?: boolean; external?: boolean; testId: string }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      data-testid={testId}
      className={clsx(
        'group flex items-start gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5',
        best ? 'border-workshop bg-workshop-dim/60 hover:shadow-md' : 'border-line bg-paper hover:border-ink',
      )}
    >
      <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', best ? 'bg-workshop text-white' : 'bg-paper-dim text-ink-2')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {best && <span className="rounded-md bg-workshop px-1.5 py-0.5 text-[10px] font-semibold text-white">{tr('Best for this')}</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{text}</span>
      </span>
    </a>
  );
}
