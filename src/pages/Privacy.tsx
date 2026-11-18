import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePageMeta } from '../lib/usePageMeta';
import { maker } from '../lib/supportConfig';
import { getLang, tr } from '../lib/i18n';

/** When this policy last changed. Update it with every change to the text. */
const UPDATED = new Date(2026, 10, 17);

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-ink-2 sm:text-[15px]">{children}</p>;
}

/** A list item with a bold lead-in, e.g. "Your files are not uploaded." + explanation. */
function Li({ lead, children }: { lead?: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-ink-2 sm:text-[15px]">
      <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-workshop" />
      <span>{lead && <strong className="font-semibold text-ink">{lead} </strong>}{children}</span>
    </li>
  );
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2">{children}</ul>;
}

const SUMMARY: { icon: string; text: string }[] = [
  { icon: 'M4 5h16v11H4zM2 20h20', text: 'Your files never leave your device. Every tool works inside your browser. Nothing you open in Rarvon is uploaded to me or to anyone else.' },
  { icon: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4', text: 'No account, no ads, no tracking. There are no cookies, no analytics and no trackers, and there never will be.' },
  { icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', text: 'A few things are saved on your device, like your theme, your language and your Video Editor projects, so Rarvon remembers them next time. They stay on your device, and you can delete them at any time.' },
  { icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', text: 'The website’s host sees ordinary visit logs, like any website. They never include your files.' },
];

const KEPT: [string, string, string][] = [
  ['Theme (light or dark) and language', 'So Rarvon opens the way you left it', 'Clear this site’s data in your browser settings'],
  ['Recently used tools', 'To show them first on the home page', 'Clear this site’s data in your browser settings'],
  ['Image to Text settings and Video Editor shortcuts', 'So you don’t set them up again', 'Clear this site’s data in your browser settings'],
  ['Video Editor projects, including copies of the videos you add', 'So your project is saved and can be recovered after a crash', 'Delete the project in the Video Editor, or clear this site’s data'],
  ['AI models and offline files', 'So the Background Remover and the whole site work without downloading again, even offline', 'Clear this site’s data in your browser settings'],
];

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

export default function Privacy() {
  usePageMeta(tr('Privacy'), tr('Your files never leave your device: every Rarvon tool works inside your browser. No account, no ads, no cookies, no analytics, no tracking.'));

  const sections: Section[] = [
    {
      id: 'why',
      title: tr('Why Rarvon exists'),
      body: (
        <>
          <P>{tr('Most online file tools work the same way: you upload your file to their server, they process it there, and you download the result. That means a stranger’s computer gets a copy of your photos, documents and videos, and you have to trust what happens to it afterwards. On top of that, every small job lives on a different website, each with its own ads, sign-ups and “upgrade to Pro” pop-ups.')}</P>
          <P>{tr('I built Rarvon to do it differently: one place for everyday file jobs, where all the work happens in your own browser. Your browser is already powerful enough to convert, compress and edit files, so there’s no reason to send them anywhere.')}</P>
          <P>{tr('This page explains exactly what that means, what Rarvon stores, and what it never does.')}</P>
        </>
      ),
    },
    {
      id: 'files',
      title: tr('How your files are handled'),
      body: (
        <>
          <P>{tr('When you open a file in a Rarvon tool, it is read by the browser tab you have open. The converting, compressing, editing or reading happens on your device, using your device’s processor and memory. The result is created on your device too, and saved straight back to you when you press Download.')}</P>
          <Ul>
            <Li lead={tr('Your files are not uploaded.')}>{tr('Rarvon has no server that receives them, so it couldn’t store or look at them even if it wanted to.')}</Li>
            <Li lead={tr('“Continue with…” stays in your browser.')}>{tr('When you pass a result to another tool, the file is handed over inside your browser tab. It still never leaves your device.')}</Li>
            <Li lead={tr('Closing the tab clears your files.')}>{tr('When you close the tab, the files you worked on are gone from Rarvon. The only exception is the Video Editor, which can keep your projects (see below).')}</Li>
            <Li lead={tr('Paste reads only when you ask.')}>{tr('The Paste button in the text tools reads your clipboard only at the moment you press it.')}</Li>
          </Ul>
        </>
      ),
    },
    {
      id: 'kept',
      title: tr('What Rarvon keeps on your device'),
      body: (
        <>
          <P>{tr('To remember your choices, Rarvon saves a few small things in your browser’s own storage. This storage belongs to your browser on your device. Nothing in it is sent to me.')}</P>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[34rem] text-start text-sm">
              <thead className="bg-elevated text-xs text-ink-3">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{tr('What')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{tr('Why')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{tr('How to remove it')}</th>
                </tr>
              </thead>
              <tbody>
                {KEPT.map(([what, why, how]) => (
                  <tr key={what} className="border-t border-line align-top">
                    <th scope="row" className="px-3 py-2.5 text-start font-medium text-ink">{tr(what)}</th>
                    <td className="px-3 py-2.5 text-ink-2">{tr(why)}</td>
                    <td className="px-3 py-2.5 text-ink-2">{tr(how)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P><strong className="font-semibold text-ink">{tr('Rarvon does not use cookies.')}</strong></P>
        </>
      ),
    },
    {
      id: 'downloads',
      title: tr('What Rarvon downloads'),
      body: (
        <>
          <P>{tr('Some tools need extra parts the first time you use them: the AI models for the Background Remover, the language files for Image to Text, and the MP3 encoder. These are downloaded from Rarvon’s own website, never from other companies, and stored in your browser so you only download them once.')}</P>
          <P>{tr('Downloading them sends nothing about you or your files. Rarvon is simply fetching its own parts, the same way it loads its pages.')}</P>
        </>
      ),
    },
    {
      id: 'never',
      title: tr('What Rarvon never does'),
      body: (
        <Ul>
          <Li>{tr('It never uploads, stores or looks at your files.')}</Li>
          <Li>{tr('It never asks for an account, an email address or a password.')}</Li>
          <Li>{tr('It never shows ads.')}</Li>
          <Li>{tr('It never uses analytics, visitor statistics, cookies or trackers of any kind, and never will.')}</Li>
          <Li>{tr('It never loads fonts, scripts or anything else from other companies’ servers.')}</Li>
          <Li>{tr('It never sells or shares any information, because it doesn’t collect any.')}</Li>
        </Ul>
      ),
    },
    {
      id: 'host',
      title: tr('The website host'),
      body: (
        <>
          <P>{tr('Rarvon’s pages have to be served from somewhere, like every website. The company that hosts Rarvon can see the ordinary information every web server sees when a page is loaded: your IP address, your browser type, the page you asked for and the time. Hosting companies usually keep these logs for a short time to keep their service running and safe.')}</P>
          <P>{tr('These logs never contain your files, because your files never reach the server. I don’t use these logs to track or identify anyone. I’ll name the hosting company here once Rarvon is online.')}</P>
        </>
      ),
    },
    {
      id: 'links',
      title: tr('Links to other websites'),
      body: <P>{tr('Rarvon links to a few other websites, like Ko-fi (if you choose to support Rarvon) and GitHub. When you click one of those links you leave Rarvon, and that website’s own privacy policy applies.')}</P>,
    },
    {
      id: 'children',
      title: tr('Children'),
      body: <P>{tr('Rarvon doesn’t collect personal information from anyone, including children. It can be used safely at any age.')}</P>,
    },
    {
      id: 'changes',
      title: tr('The plan, and changes to this page'),
      body: (
        <>
          <P>{tr('The plan for Rarvon is simple: keep adding useful tools, and keep every one of them working on your device. Privacy isn’t a feature that might change later. It is how Rarvon is built.')}</P>
          <P>{tr('If anything on this page ever changes, I’ll update this page and its date first, and explain what changed.')}</P>
        </>
      ),
    },
    {
      id: 'questions',
      title: tr('Questions'),
      body: (
        <>
        <P>{tr('If you report a bug or ask for a tool by email or on GitHub, I see what you send, including your email address or GitHub name. I use it only to reply and to fix or build what you asked for, and I never share it.')}</P>
        <P>
          {tr('If you have a question about privacy, or you think something here isn’t accurate, you can reach me on GitHub:')}{' '}
          <a href={maker.url} target="_blank" rel="noopener noreferrer" className="font-medium text-workshop hover:underline">github.com/{maker.url.split('/').pop()}</a>
        </P>
        </>
      ),
    },
  ];

  const toc = [{ id: 'summary', title: tr('In plain words') }, ...sections.map((s, i) => ({ id: s.id, title: `${i + 1}. ${s.title}` }))];
  const active = useActiveSection(toc.map((t) => t.id));
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        {/* Contents: a side list that follows you on wide screens */}
        <nav aria-label={tr('On this page')} className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{tr('On this page')}</p>
            <ol className="space-y-0.5 border-s border-line">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => { e.preventDefault(); jump(t.id); history.replaceState(null, '', `#${t.id}`); }}
                    aria-current={active === t.id ? 'location' : undefined}
                    className={`-ms-px block border-s-2 py-1 ps-3 text-[13px] leading-snug transition-colors ${active === t.id ? 'border-workshop font-medium text-workshop' : 'border-transparent text-ink-3 hover:text-ink'}`}
                  >
                    {t.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="min-w-0">
          <header className="float-in">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{tr('Privacy')}</h1>
            <p className="mt-2 text-xs text-ink-3">{tr('Last updated {date}', { date: UPDATED.toLocaleDateString(getLang() === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>
          </header>

          {/* On phones and tablets: a jump menu */}
          <label className="mt-6 flex items-center gap-2 lg:hidden">
            <span className="text-xs font-medium text-ink-2">{tr('Jump to section')}</span>
            <select
              value={active}
              onChange={(e) => jump(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 py-2 text-sm"
            >
              {toc.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>

          <section id="summary" className="float-in mt-6 scroll-mt-24 rounded-2xl border border-signal/40 bg-signal-dim p-5 sm:p-6" style={{ animationDelay: '80ms' }}>
            <h2 className="font-display text-lg font-semibold">{tr('In plain words')}</h2>
            <ul className="mt-4 grid gap-3">
              {SUMMARY.map((s) => (
                <li key={s.icon} className="flex gap-3 text-sm leading-relaxed text-ink sm:text-[15px]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-signal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={s.icon} /></svg>
                  </span>
                  <span>{tr(s.text)}</span>
                </li>
              ))}
            </ul>
          </section>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
              <h2 className="flex items-baseline gap-3 font-display text-xl font-semibold">
                <span className="font-mono text-sm text-workshop">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

/** Which section is being read: the last one whose heading has passed the top quarter of the screen. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    const list = key.split('|');
    const update = () => {
      const line = window.innerHeight * 0.25;
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = list[list.length - 1];
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [key]);
  return active;
}
