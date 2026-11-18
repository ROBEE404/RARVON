import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/usePageMeta';
import { tools, categories } from '../lib/toolRegistry';
import { maker } from '../lib/supportConfig';
import FeedbackButton from '../components/FeedbackButton';
import { tr } from '../lib/i18n';

const toolCount = tools.filter((t) => t.status !== 'coming-soon').length;

const PRINCIPLES: { label: string; icon: string }[] = [
  { label: 'Free', icon: 'M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z' },
  { label: 'No ads', icon: 'M4 6h16v12H4zM3 3l18 18' },
  { label: 'No account', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0M3 3l18 18' },
  { label: 'Files stay on your device', icon: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4' },
  { label: 'Works offline', icon: 'M2 8.8a15 15 0 014.2-2.6M8.5 5.2A15 15 0 0122 8.8M5 12.9a10 10 0 015.2-2.7M12 18h.01M3 3l18 18' },
];

function Icon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

/** Counts up from 0 the first time it scrolls into view. */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || to === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    let frame = 0;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1100);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      setN(0);
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(frame); };
  }, [to]);
  return <span ref={ref}>{n.toLocaleString()}</span>;
}

function Section({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <section className="float-in mt-12" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function About() {
  usePageMeta(tr('About'), tr('Why Rarvon exists: one free toolbox for everyday file jobs that runs in your browser, so your files never leave your device.'));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Story */}
      <section className="float-in relative overflow-hidden rounded-2xl border border-line bg-elevated p-6 sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 rounded-full bg-workshop/10 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-wider text-workshop">{tr('About Rarvon')}</p>
        <h1 className="relative mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{tr('One toolbox. Your files stay yours.')}</h1>
        <p className="relative mt-5 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
          {tr("Most online tools make you upload your files to someone else's server, and every small job lives on a different website. I wanted one tidy place where everything runs right in your browser, so your files never leave your device.")}
        </p>
        <p className="relative mt-3 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
          {tr('So I built Rarvon: converters, compressors, PDF, image, video, audio and text tools, all free, all in one place.')}
        </p>
        <a href={maker.url} target="_blank" rel="noopener noreferrer" className="group relative mt-6 inline-flex items-center gap-3 rounded-full border border-line bg-paper py-1.5 pe-4 ps-1.5 transition-colors hover:border-workshop">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-workshop text-sm font-bold text-white">{maker.name.slice(0, 1)}</span>
          <span className="text-sm">
            {tr('Made by')} <span className="font-semibold text-workshop">{maker.name}</span>
            <span className="ms-2 text-xs text-ink-3 group-hover:text-ink-2">github.com/{maker.url.split('/').pop()}</span>
          </span>
        </a>
      </section>

      {/* How it works */}
      <Section title={tr('How it works')} delay={120}>
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
          <Step icon="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6" title={tr('Your file')} text={tr('Picked from your device')} />
          <FlowArrow />
          <div className="relative">
            <Step strong icon="M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01" title={tr('Your browser does the work')} text={tr('Converting, compressing and editing happen right here')} />
            {/* The server that isn't there */}
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-ink-3">
              <span className="relative grid h-7 w-7 place-items-center">
                <Icon d="M7 18a4.5 4.5 0 01-.6-9A6 6 0 0117.7 8 4 4 0 0117 18z" size={20} />
                <span className="absolute h-0.5 w-8 rotate-45 rounded bg-warn" />
              </span>
              {tr('Nothing is uploaded')}
            </div>
          </div>
          <FlowArrow />
          <Step icon="M12 4v12M7 11l5 5 5-5M5 20h14" title={tr('Your result')} text={tr('Saved straight back to you')} />
        </div>
      </Section>

      {/* Numbers */}
      <Section title={tr('Rarvon in numbers')} delay={200}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            [toolCount, tr('tools')],
            [categories.length, tr('categories')],
            [2, tr('languages')],
            [0, tr('files sent to a server')],
          ] as const).map(([value, label]) => (
            <div key={label} className="rounded-xl border border-line bg-elevated p-4 text-center">
              <p className="font-display text-4xl font-semibold text-workshop"><CountUp to={value} /></p>
              <p className="mt-1 text-xs font-medium text-ink-2">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Principles */}
      <Section title={tr('Principles')} delay={280}>
        <ul className="flex flex-wrap gap-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.label} className="page-in inline-flex items-center gap-2 rounded-full border border-line bg-elevated px-3.5 py-2 text-sm font-medium" style={{ animationDelay: `${400 + i * 60}ms` }}>
              <Icon d={p.icon} size={16} className="text-workshop" />
              {tr(p.label)}
            </li>
          ))}
        </ul>
      </Section>

      {/* Help */}
      <Section title={tr('Help improve it')} delay={340}>
        <p className="text-sm leading-relaxed text-ink-2">{tr("Found a bug, or want a tool that isn't here yet? I'd like to hear about it.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <FeedbackButton kind="bug" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold hover:border-ink">
            <Icon d="M12 8v4M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z" size={16} className="text-workshop" />{tr('Report a bug')}
          </FeedbackButton>
          <FeedbackButton kind="tool" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold hover:border-ink">
            <Icon d="M12 5v14M5 12h14" size={16} className="text-workshop" />{tr('Ask for a tool')}
          </FeedbackButton>
          <Link to="/support" className="heart-beat inline-flex min-h-10 items-center gap-2 rounded-full border border-heart/50 bg-heart-dim px-4 text-sm font-semibold text-heart hover:border-heart">
            <svg className="heart" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C1 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 2.9 1.5-1.8 3-2.9 5.1-2.9 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z" /></svg>
            {tr('Support Rarvon')}
          </Link>
        </div>
      </Section>
    </div>
  );
}

function Step({ icon, title, text, strong }: { icon: string; title: string; text: string; strong?: boolean }) {
  return (
    <div className={strong ? 'rounded-xl border-2 border-workshop bg-workshop-dim p-4 text-center' : 'rounded-xl border border-line bg-elevated p-4 text-center'}>
      <span className={strong ? 'mx-auto grid h-10 w-10 place-items-center rounded-lg bg-workshop text-white' : 'mx-auto grid h-10 w-10 place-items-center rounded-lg bg-paper-dim text-ink-2'}>
        <Icon d={icon} size={20} />
      </span>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-ink-2">{text}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center text-workshop" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="about-arrow rotate-90 sm:rotate-0 rtl:sm:rotate-180">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  );
}
