import { degrees } from 'pdf-lib';
import type { Color, PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import latinUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import latinExtUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';
import cyrillicUrl from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?url';
import greekUrl from '@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff?url';
import vietnameseUrl from '@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff?url';
import arabicUrl from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff?url';

/**
 * Draws Unicode text into a PDF as real, selectable text:
 *  - fonts: Noto Sans (Latin, Latin Extended, Cyrillic, Greek, Vietnamese)
 *    and Noto Sans Arabic (Arabic, Persian, Urdu, Kurdish Sorani letters),
 *    embedded as subsets so only used glyphs are stored;
 *  - Arabic-script runs are shaped by fontkit (letter joining, lam-alef
 *    ligatures, marks) and drawn as vector glyph outlines. pdf-lib's own
 *    font encoding garbles shaped Arabic glyphs (missing/wrong forms were
 *    measured in testing), so outlines are the reliable path: exact shapes,
 *    sharp at any zoom, but not selectable as text. Latin, Cyrillic and
 *    Greek runs are embedded as real, selectable text;
 *  - mixed-direction text (Arabic with English words or numbers) is split
 *    into visual runs with the Unicode Bidirectional Algorithm (bidi-js),
 *    so "تم إصدار Rarvon 2.1" lays out exactly as a browser would show it.
 * Text using a script none of these fonts covers (CJK, Devanagari, emoji…)
 * reports `false` from canDraw(), and the caller falls back to an image.
 */

const FONT_URLS = { arabic: arabicUrl, latin: latinUrl, latinExt: latinExtUrl, cyrillic: cyrillicUrl, greek: greekUrl, vietnamese: vietnameseUrl };
type FontKey = keyof typeof FONT_URLS;
// Arabic-script code points prefer the Arabic font; everything else tries
// the Latin-family fonts first.
const ORDER: FontKey[] = ['latin', 'latinExt', 'cyrillic', 'greek', 'vietnamese', 'arabic'];
const isArabicScript = (cp: number) =>
  (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x08a0 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);

interface PathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: number[];
}
interface FontkitFont {
  unitsPerEm: number;
  hasGlyphForCodePoint(cp: number): boolean;
  layout(text: string, features?: string[], script?: string, language?: string, direction?: 'ltr' | 'rtl'): { glyphs: { path: { commands: PathCommand[] } }[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
}

/** Shapes `text` and returns one SVG path (y-down, origin at the baseline start) plus its advance width. */
function shapedOutline(font: FontkitFont, text: string, size: number, rtl: boolean): { d: string; width: number } {
  // Direction comes from the bidi algorithm, not the script: Arabic-Indic
  // digits are Arabic script but run left-to-right.
  const run = font.layout(text, undefined, undefined, undefined, rtl ? 'rtl' : 'ltr');
  const k = size / font.unitsPerEm;
  let pen = 0;
  const parts: string[] = [];
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const ox = pen + pos.xOffset * k;
    const oy = pos.yOffset * k;
    const pt = (x: number, y: number) => `${f(ox + x * k)} ${f(-(oy + y * k))}`;
    for (const c of g.path.commands) {
      const a = c.args;
      if (c.command === 'moveTo') parts.push(`M${pt(a[0], a[1])}`);
      else if (c.command === 'lineTo') parts.push(`L${pt(a[0], a[1])}`);
      else if (c.command === 'quadraticCurveTo') parts.push(`Q${pt(a[0], a[1])} ${pt(a[2], a[3])}`);
      else if (c.command === 'bezierCurveTo') parts.push(`C${pt(a[0], a[1])} ${pt(a[2], a[3])} ${pt(a[4], a[5])}`);
      else parts.push('Z');
    }
    pen += pos.xAdvance * k;
  });
  return { d: parts.join(''), width: pen };
}

export interface DrawTextOptions {
  /** Baseline start point in PDF user space (left end of the line as displayed). */
  x: number;
  y: number;
  size: number;
  color: Color;
  /** Counter-clockwise rotation in degrees (matches the page's /Rotate so text appears upright). */
  rotate: number;
}

export interface TextDrawer {
  canDraw(text: string): boolean;
  draw(page: PDFPage, text: string, opts: DrawTextOptions): Promise<void>;
  widthOf(text: string, size: number): Promise<number>;
}

type BidiApi = ReturnType<typeof import('bidi-js').default>;

export async function createTextDrawer(doc: PDFDocument): Promise<TextDrawer> {
  const [{ default: fontkit }, { default: bidiFactory }] = await Promise.all([import('@pdf-lib/fontkit'), import('bidi-js')]);
  doc.registerFontkit(fontkit);
  const bidi: BidiApi = bidiFactory();

  const bytes = new Map<FontKey, ArrayBuffer>();
  const parsed = new Map<FontKey, FontkitFont>();
  const embedded = new Map<FontKey, PDFFont>();
  await Promise.all(
    (Object.keys(FONT_URLS) as FontKey[]).map(async (k) => {
      const res = await fetch(FONT_URLS[k]);
      if (!res.ok) throw new Error(`Font ${k} failed to load`);
      const buf = await res.arrayBuffer();
      bytes.set(k, buf);
      parsed.set(k, fontkit.create(new Uint8Array(buf)) as unknown as FontkitFont);
    }),
  );

  async function pdfFont(k: FontKey): Promise<PDFFont> {
    let f = embedded.get(k);
    if (!f) {
      f = await doc.embedFont(bytes.get(k)!, { subset: true });
      embedded.set(k, f);
    }
    return f;
  }

  function fontFor(cp: number, prefer: FontKey | null): FontKey | null {
    if (prefer && parsed.get(prefer)!.hasGlyphForCodePoint(cp)) return prefer;
    if (isArabicScript(cp) && parsed.get('arabic')!.hasGlyphForCodePoint(cp)) return 'arabic';
    for (const k of ORDER) if (parsed.get(k)!.hasGlyphForCodePoint(cp)) return k;
    return null;
  }

  interface Run {
    /** Logical (reading-order) text, for shaping. */
    text: string;
    /** Same characters in left-to-right visual order, for plain text drawing. */
    visual: string;
    font: FontKey;
    rtl: boolean;
  }

  /** Splits a single line into runs in left-to-right visual order. */
  function layoutRuns(text: string): Run[] | null {
    if (/[\uD800-\uDFFF]/.test(text)) return null; // astral chars (emoji etc.) → image fallback
    const { levels } = bidi.getEmbeddingLevels(text);
    const visual = Array.from({ length: text.length }, (_, i) => i);
    for (const [start, end] of bidi.getReorderSegments(text, { levels, paragraphs: [{ start: 0, end: text.length - 1, level: levels[0] & 1 }] })) {
      const slice = visual.slice(start, end + 1).reverse();
      visual.splice(start, slice.length, ...slice);
    }

    // Assign fonts in logical order so neutral characters (spaces,
    // punctuation) stick with the script around them.
    const fonts: (FontKey | null)[] = [];
    let prev: FontKey | null = null;
    for (let i = 0; i < text.length; i++) {
      const cp = text.charCodeAt(i);
      const f = fontFor(cp, isArabicScript(cp) ? null : prev);
      if (!f) return null;
      fonts.push(f);
      if (!/\s/.test(text[i])) prev = f;
    }

    const runs: { idx: number[]; rtl: boolean; font: FontKey }[] = [];
    for (const i of visual) {
      const rtl = (levels[i] & 1) === 1;
      const last = runs[runs.length - 1];
      const contiguous = last && Math.abs(last.idx[last.idx.length - 1] - i) === 1;
      if (last && last.rtl === rtl && last.font === fonts[i] && contiguous) last.idx.push(i);
      else runs.push({ idx: [i], rtl, font: fonts[i]! });
    }
    return runs.map((r) => {
      // Fontkit shapes in logical order and itself reverses RTL glyph runs.
      const logical = [...r.idx].sort((a, b) => a - b);
      const ch = (i: number) => (r.rtl ? bidi.getMirroredCharacter(text[i]) ?? text[i] : text[i]);
      return { text: logical.map(ch).join(''), visual: r.idx.map(ch).join(''), font: r.font, rtl: r.rtl };
    });
  }

  // Runs in the Arabic font are drawn as outlines; others as real text.
  const outlined = (k: FontKey) => k === 'arabic';

  return {
    canDraw: (text) => layoutRuns(text) !== null,
    async widthOf(text, size) {
      const runs = layoutRuns(text);
      if (!runs) return 0;
      let w = 0;
      for (const r of runs) {
        w += outlined(r.font) ? shapedOutline(parsed.get(r.font)!, r.text, size, r.rtl).width : (await pdfFont(r.font)).widthOfTextAtSize(r.visual, size);
      }
      return w;
    },
    async draw(page, text, opts) {
      const runs = layoutRuns(text);
      if (!runs) throw new Error('Unsupported characters');
      const rad = (opts.rotate * Math.PI) / 180;
      let advance = 0;
      for (const r of runs) {
        const x = opts.x + Math.cos(rad) * advance;
        const y = opts.y + Math.sin(rad) * advance;
        if (outlined(r.font)) {
          const { d, width } = shapedOutline(parsed.get(r.font)!, r.text, opts.size, r.rtl);
          if (d) page.drawSvgPath(d, { x, y, color: opts.color, rotate: degrees(opts.rotate), borderWidth: 0 });
          advance += width;
        } else {
          const font = await pdfFont(r.font);
          // Non-shaped runs are drawn in visual order (a right-to-left run
          // here is only neutrals like ": " or ") " between Arabic words).
          page.drawText(r.visual, { x, y, size: opts.size, font, color: opts.color, rotate: degrees(opts.rotate) });
          advance += font.widthOfTextAtSize(r.visual, opts.size);
        }
      }
    },
  };
}
