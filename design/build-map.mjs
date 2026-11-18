// Builds the Figma pack from the screens `npm run design:capture` took:
//   design/out/figma/<NN-flow>/<NN-screen>.png   every screen, full length
//   design/out/figma/flow-sheets/<NN-flow>.svg   one sheet per flow: screens in
//     order, arrows labelled with the button that leads on. Dragged into Figma,
//     an SVG becomes editable layers (pictures, arrows, text).
//   design/out/figma/README.md                   how to bring it into Figma
//   design/out/Rarvon-figma-pack.zip              all of the above
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';

const ROOT = process.cwd();
const SCREENS = join(ROOT, 'design', 'screens');
const OUT = join(ROOT, 'design', 'out');
const PACK = join(OUT, 'figma');

const shots = Object.fromEntries(
  readdirSync(SCREENS).filter((f) => f.endsWith('.json')).map((f) => {
    const s = JSON.parse(readFileSync(join(SCREENS, f), 'utf8'));
    return [s.id, s];
  }),
);

// The same boards, in the same order, as the canvas.
const FLOWS = [
  ['01-finding-tools', 'Finding tools', ['home', 'search', 'menu', 'category-pdf', 'action-convert', 'all-tools']],
  ['02-from-to-converters', 'From → To converters', ['convert-image-empty', 'convert-image-loaded', 'convert-image-done', 'convert-video-loaded', 'convert-audio-loaded']],
  ['03-compressors', 'Compressors', ['compress-image-empty', 'compress-image-loaded', 'compress-image-done', 'compress-pdf-loaded']],
  ['04-pdf-page-tools', 'PDF page tools', ['merge-empty', 'merge-loaded', 'merge-done', 'rotate-loaded']],
  ['05-pdf-editor', 'PDF Editor', ['editor-empty', 'editor-loaded']],
  ['06-image-editing', 'Image editing', ['resize-loaded', 'crop-loaded']],
  ['07-ai-tools', 'AI tools', ['bg-empty', 'bg-loaded', 'ocr-empty', 'ocr-done']],
  ['08-video-audio-editing', 'Video and audio editing', ['trim-video-loaded', 'trim-audio-loaded']],
  ['09-video-editor', 'Video Editor', ['video-editor-start', 'video-editor-timeline']],
  ['10-text-developer', 'Text and developer tools', ['word-counter', 'case-converter', 'json-formatter', 'regex-tester']],
  ['11-utilities', 'Utilities', ['qr', 'password', 'archive-loaded']],
  ['12-info-feedback', 'Information pages and feedback', ['about', 'privacy', 'support', 'credits', 'app-coming', 'not-found', 'feedback']],
  ['13-download-on', 'Download button switched on', ['dl-home', 'dl-app', 'dl-video-tool']],
  ['14-desktop-app', 'Rarvon for desktop', ['app-home', 'app-convert-done']],
  ['15-phone', 'Phone (390 px)', ['phone-home', 'phone-menu', 'phone-convert-image-loaded', 'phone-merge-loaded', 'phone-word-counter', 'phone-about']],
  ['16-arabic', 'Arabic (right to left)', ['ar-home', 'ar-menu', 'ar-convert-image-loaded', 'ar-merge-loaded', 'ar-word-counter', 'ar-about']],
];

// Every flow also in the dark theme: the same screens, taken dark ("<id>-dark").
const ALL_FLOWS = FLOWS.flatMap(([folder, title, ids]) => [
  [folder, title, ids, false],
  [`${folder}-dark`, `${title} · dark`, ids.map((id) => `${id}-dark`), true],
]);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function flowSheet(title, ids, dark) {
  const C = dark
    ? { bg: '#17171d', ink: '#f1f0f5', ink2: '#c3c1cf', ink3: '#9a98a8', line: '#34333f', card: '#1d1d25', accent: '#9d97ff' }
    : { bg: '#f6f5f1', ink: '#1b1b22', ink2: '#4c4b57', ink3: '#6e6c7a', line: '#dcd9cf', card: '#ffffff', accent: '#5146d8' };
  const phone = ids.every((id) => shots[id].width < 600);
  const CARD = phone ? 300 : 520;
  const GAP = 160;
  const MAX_SRC = phone ? 2000 : 1800; // crop very long pages
  const PAD = 72;
  const TOP = 150;
  let x = PAD;
  let bottom = 0;
  const parts = [];
  ids.forEach((id, i) => {
    const s = shots[id];
    const h = Math.round((Math.min(s.height, MAX_SRC) * CARD) / s.width);
    const png = readFileSync(join(SCREENS, `${id}.png`)).toString('base64');
    const fullH = Math.round((s.height * CARD) / s.width);
    parts.push(`<g id="${esc(id)}">`,
      `<text x="${x}" y="${TOP - 14}" font-family="Space Grotesk, Inter, sans-serif" font-size="20" font-weight="600" fill="${C.ink}">${esc(s.title)}</text>`,
      `<clipPath id="c-${esc(id)}"><rect x="${x}" y="${TOP}" width="${CARD}" height="${h}" rx="12"/></clipPath>`,
      `<rect x="${x}" y="${TOP}" width="${CARD}" height="${h}" rx="12" fill="${C.card}" stroke="${C.line}"/>`,
      `<image href="data:image/png;base64,${png}" x="${x}" y="${TOP}" width="${CARD}" height="${fullH}" clip-path="url(#c-${esc(id)})" preserveAspectRatio="xMidYMin slice"/>`);
    let y = TOP + h + 28;
    if (s.note) for (const l of wrap(s.note, phone ? 40 : 70)) { parts.push(`<text x="${x}" y="${y}" font-family="Inter, sans-serif" font-size="15" fill="${C.ink2}">${esc(l)}</text>`); y += 22; }
    const others = (s.arrows ?? []).filter((a) => a.to !== ids[i + 1]);
    if (others.length) {
      y += 10;
      parts.push(`<text x="${x}" y="${y}" font-family="JetBrains Mono, monospace" font-size="12" letter-spacing="1" fill="${C.ink3}">BUTTONS HERE LEAD TO</text>`);
      y += 24;
      for (const a of others) {
        const target = shots[a.to]?.title ?? a.to;
        parts.push(`<text x="${x}" y="${y}" font-family="Inter, sans-serif" font-size="15" fill="${C.ink}"><tspan font-weight="600" fill="${C.accent}">${esc(a.label)}</tspan> → ${esc(target)}</text>`);
        y += 22;
      }
    }
    parts.push('</g>');
    bottom = Math.max(bottom, y);
    x += CARD;
    const next = (s.arrows ?? []).find((a) => a.to === ids[i + 1]);
    if (next) {
      const ay = TOP + 200;
      parts.push(`<g id="arrow-${esc(id)}">`,
        `<text x="${x + GAP / 2}" y="${ay - 16}" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="${C.accent}">${esc(next.label)}</text>`,
        `<path d="M${x + 14} ${ay}h${GAP - 36}M${x + GAP - 30} ${ay - 8}l8 8-8 8" fill="none" stroke="${C.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        '</g>');
    }
    if (i < ids.length - 1) x += GAP;
  });
  const width = x + PAD;
  const height = bottom + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${C.bg}"/>
<text x="${PAD}" y="76" font-family="Space Grotesk, Inter, sans-serif" font-size="40" font-weight="700" fill="${C.ink}">${esc(title)}</text>
${parts.join('\n')}
</svg>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(PACK, 'flow-sheets'), { recursive: true });
const zip = new JSZip();
for (const [folder, title, ids, dark] of ALL_FLOWS) {
  for (const id of ids) if (!shots[id]) throw new Error(`Missing screen ${id}: run npm run design:capture first`);
  mkdirSync(join(PACK, folder), { recursive: true });
  ids.forEach((id, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${id}.png`;
    copyFileSync(join(SCREENS, `${id}.png`), join(PACK, folder, name));
    zip.file(`figma/${folder}/${name}`, readFileSync(join(SCREENS, `${id}.png`)));
  });
  const svg = flowSheet(title, ids, dark);
  writeFileSync(join(PACK, 'flow-sheets', `${folder}.svg`), svg);
  zip.file(`figma/flow-sheets/${folder}.svg`, svg);
}
const guide = readFileSync(join(ROOT, 'design', 'FIGMA.md'), 'utf8');
writeFileSync(join(PACK, 'README.md'), guide);
zip.file('figma/README.md', guide);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(join(OUT, 'Rarvon-figma-pack.zip'), buf);
const count = ALL_FLOWS.reduce((n, f) => n + f[2].length, 0);
console.log(`${ALL_FLOWS.length} flow sheets, ${count} screens → design/out/Rarvon-figma-pack.zip (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
