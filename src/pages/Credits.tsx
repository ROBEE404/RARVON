import { useEffect, useMemo, useState } from 'react';
import { usePageMeta } from '../lib/usePageMeta';
import { tr } from '../lib/i18n';

interface Pkg {
  name: string;
  version: string;
  license: string;
  repository: string;
  note: string;
  text: string;
}
interface Model {
  id: string;
  revision: string;
  license: string;
  url: string;
}
/** One row on the page: a package, a family of packages, or an AI model. */
interface Row {
  key: string;
  name: string;
  version?: string;
  license: string;
  what: string;
  url?: string;
  note?: string;
  text?: string;
}

type GroupId = 'pdf' | 'image' | 'media' | 'ocr' | 'ai' | 'fonts' | 'base';

const GROUPS: { id: GroupId; title: string; icon: string; color: string }[] = [
  { id: 'pdf', title: 'PDF tools', icon: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6', color: 'var(--color-cat-pdf)' },
  { id: 'image', title: 'Images', icon: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01', color: 'var(--color-cat-image)' },
  { id: 'media', title: 'Video and audio', icon: 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z', color: 'var(--color-cat-audio)' },
  { id: 'ocr', title: 'Text recognition', icon: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 9h8M8 12h8M8 15h5', color: 'var(--color-cat-text)' },
  { id: 'ai', title: 'AI (Background Remover)', icon: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z', color: 'var(--color-workshop)' },
  { id: 'fonts', title: 'Fonts', icon: 'M4 20l6-16h4l6 16M7 14h10', color: 'var(--color-cat-developer)' },
  { id: 'base', title: 'Building blocks', icon: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4', color: 'var(--color-ink-3)' },
];

/** What each package does in Rarvon, and which group it belongs to. Anything not listed is a building block. */
const KNOWN: Record<string, [GroupId, string]> = {
  'pdf-lib': ['pdf', 'Creates and edits PDF files'],
  'pdfjs-dist': ['pdf', 'Shows PDF pages and reads their text'],
  '@pdf-lib/fontkit': ['pdf', 'Puts text in any font into PDFs, including Arabic'],
  '@pdf-lib/standard-fonts': ['pdf', 'The basic PDF fonts'],
  '@pdf-lib/upng': ['pdf', 'Adds PNG pictures to PDFs'],
  'bidi-js': ['pdf', 'Lays out right-to-left text like Arabic'],
  'upng-js': ['image', 'Makes PNG files smaller'],
  pako: ['image', 'Compresses data for PNG and ZIP files'],
  exifr: ['image', 'Reads photo details like camera and location'],
  qrcode: ['image', 'Draws QR codes'],
  dijkstrajs: ['image', 'Helps the QR code maker'],
  mediabunny: ['media', 'Reads, converts and writes video and audio'],
  '@mediabunny/mp3-encoder': ['media', 'Makes MP3 files, using the LAME encoder'],
  'tesseract.js': ['ocr', 'Reads text in pictures and scanned PDFs'],
  'tesseract.js-core': ['ocr', 'The text-reading engine itself'],
  '@huggingface/transformers': ['ai', 'Runs the AI models in your browser'],
  'onnxruntime-web': ['ai', 'Does the AI maths on your device'],
  'onnxruntime-common': ['ai', 'Shared parts of the AI engine'],
  react: ['base', 'Builds every page you see'],
  'react-dom': ['base', 'Puts the pages on screen'],
  'react-router': ['base', 'Moves between pages'],
  jszip: ['base', 'Creates and opens ZIP files'],
};

function toRows(pkgs: Pkg[], models: Model[]): Map<GroupId, Row[]> {
  const groups = new Map<GroupId, Row[]>(GROUPS.map((g) => [g.id, []]));
  // The OCR language packs are one family: show them as one row.
  const langs = pkgs.filter((p) => p.name.startsWith('@tesseract.js-data/'));
  for (const p of pkgs) {
    if (p.name.startsWith('@tesseract.js-data/')) continue;
    const fonts = p.name.startsWith('@fontsource/');
    const [group, what] = KNOWN[p.name] ?? (fonts ? ['fonts', 'A font used on this site'] : ['base', 'Part of how Rarvon is built']);
    groups.get(group)!.push({ key: p.name, name: p.name, version: p.version, license: p.license, what, url: p.repository || undefined, note: p.note || undefined, text: p.text || undefined });
  }
  if (langs.length) {
    groups.get('ocr')!.push({
      key: '@tesseract.js-data',
      name: '@tesseract.js-data',
      license: langs[0].license,
      what: tr('Language files for {n} languages', { n: langs.length }),
      url: langs[0].repository || undefined,
      text: langs[0].text || undefined,
    });
  }
  for (const m of models) {
    groups.get('ai')!.push({ key: m.id, name: m.id, version: m.revision, license: m.license.toUpperCase().replace('APACHE', 'Apache'), what: m.id.toLowerCase().includes('slimsam') ? 'AI model for click-to-select and automatic cut-outs' : 'AI model for high-quality cut-outs (hair, fine edges)', url: m.url });
  }
  // Most important first: the order of KNOWN, then the rest A to Z.
  const order = Object.keys(KNOWN);
  const rank = (r: Row) => { const i = order.indexOf(r.key); return i < 0 ? order.length : i; };
  for (const rows of groups.values()) rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return groups;
}

export default function Credits() {
  usePageMeta(tr('Credits and licenses'), tr('Rarvon is built on free software made by other people. Every package and AI model it uses, what it does, and its license.'));
  const [data, setData] = useState<{ packages: Pkg[]; models: Model[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/licenses/credits.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const groups = useMemo(() => (data ? toRows(data.packages, data.models) : null), [data]);
  const q = query.trim().toLowerCase();
  const match = (r: Row) => !q || [r.name, r.license, tr(r.what)].some((s) => s.toLowerCase().includes(q));
  const total = data ? data.packages.length + data.models.length : 0;
  const shown = groups ? [...groups.values()].flat().filter(match).length : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="float-in">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{tr('Credits')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
          {tr('Rarvon is built on free software made by other people. Thank you to everyone below. Each one keeps its own license, which you can read by opening it.')}
        </p>
        {data && (
          <p className="mt-2 text-xs text-ink-3">{tr('{p} packages and {m} AI models', { p: data.packages.length, m: data.models.length })}</p>
        )}
      </header>

      <label className="float-in mt-6 flex h-11 items-center gap-2 rounded-xl border border-line bg-elevated px-3 focus-within:border-workshop" style={{ animationDelay: '80ms' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink-3"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span className="sr-only">{tr('Find a package or license')}</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Find a package or license')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {q && <span className="shrink-0 text-xs text-ink-3">{tr('{n} of {total}', { n: shown, total })}</span>}
      </label>

      {failed && <p className="mt-8 rounded-xl border border-line bg-elevated p-4 text-sm text-ink-2">{tr('The list couldn’t be loaded. The full texts are also in')} <a href="/licenses/third-party.txt" className="font-medium text-workshop hover:underline">third-party.txt</a>.</p>}
      {!data && !failed && <p className="mt-8 text-sm text-ink-3">{tr('Loading…')}</p>}

      {groups && GROUPS.map((g, gi) => {
        const rows = groups.get(g.id)!.filter(match);
        if (!rows.length) return null;
        return (
          <section key={g.id} className="float-in mt-10" style={{ animationDelay: `${120 + gi * 60}ms` }} aria-labelledby={`credits-${g.id}`}>
            <h2 id={`credits-${g.id}`} className="flex items-center gap-2.5 font-display text-lg font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-paper-dim" style={{ color: g.color }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={g.icon} /></svg>
              </span>
              {tr(g.title)}
              <span className="font-mono text-xs font-normal text-ink-3">{rows.length}</span>
            </h2>
            <ul className="mt-3 grid gap-2">
              {rows.map((r) => (
                <li key={r.key}>
                  <details className="group rounded-xl border border-line bg-elevated transition-colors open:border-workshop/50">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                      <span className="min-w-0">
                        <span className="font-mono text-sm font-semibold text-ink">{r.name}</span>
                        {r.version && <span className="ms-2 font-mono text-[11px] text-ink-3">{r.version}</span>}
                        <span className="block text-xs text-ink-2">{tr(r.what)}</span>
                      </span>
                      <span className="ms-auto flex items-center gap-2">
                        <LicenseBadge license={r.license} />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
                      </span>
                    </summary>
                    <div className="slide-in border-t border-line px-4 py-3">
                      {r.note && <p className="mb-2 text-xs leading-relaxed text-ink-2">{r.note}</p>}
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-workshop hover:underline">{r.url.replace(/^https?:\/\//, '')}</a>}
                      {r.text
                        ? <pre dir="ltr" className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-paper-dim p-3 text-start font-mono text-[11px] leading-relaxed text-ink-2">{r.text}</pre>
                        : <p className="mt-2 text-xs text-ink-3">{tr('Its license is {license}; see the link above for the full text.', { license: r.license })}</p>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {groups && q && shown === 0 && <p className="mt-8 text-sm text-ink-3">{tr('Nothing matches “{q}”.', { q: query })}</p>}

      <p className="mt-12 text-xs text-ink-3">
        {tr('All of these are open source and allow use in Rarvon. Rarvon itself is not open source: see the License file.')}{' '}
        <a href="/licenses/third-party.txt" className="font-medium text-workshop hover:underline">{tr('All license texts in one file')}</a>
      </p>
    </div>
  );
}

/** Colour by kind: permissive (green), file-level copyleft like MPL/LGPL (amber), fonts (blue). */
function LicenseBadge({ license }: { license: string }) {
  const l = license.toUpperCase();
  // "MIT OR GPL" lets you pick MIT, so it counts as permissive.
  const permissiveChoice = /MIT/.test(l) && / OR /.test(l);
  const tone = !permissiveChoice && /LGPL|MPL|GPL/.test(l) ? 'bg-warn-dim text-warn' : /OFL/.test(l) ? 'bg-workshop-dim text-workshop' : 'bg-signal-dim text-signal';
  return <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${tone}`}>{license}</span>;
}
