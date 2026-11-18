import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { tools, categories, actionMeta, EXPERIMENTAL_NOTE } from '../../src/lib/toolRegistry';
import { COLLECTIONS } from '../../src/lib/collections';
import { ar } from '../../src/lib/i18n/ar';

/** Text that is the same in both languages on purpose (sample data, file formats, product names). */
const SAME_IN_BOTH = new Set([
  'Rarvon', 'Tab', 'UUID', 'PNG', 'JPG', 'VP9', 'UTC:', 'ISO 8601:', '{total}', 'undefined',
  '{"example": true, "values": [1, 2, 3]}', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....',
  'https://example.com/search?q=hello world', 'https://example.com/a/very/long/path',
]);

describe('Arabic interface', () => {
  it('translates every tool, category, action and collection text', () => {
    const texts = [EXPERIMENTAL_NOTE];
    for (const c of categories) texts.push(c.name, c.description, ...(c.appDescription ? [c.appDescription] : []));
    for (const a of actionMeta) texts.push(a.label, a.description);
    for (const t of tools) {
      texts.push(t.name, t.shortDescription, t.description, ...(t.faq ?? []).flatMap((f) => [f.q, f.a]));
      if (t.comingSoonReason) texts.push(t.comingSoonReason);
      // The Rarvon app's own texts for the tools FFmpeg runs.
      if (t.app?.description) texts.push(t.app.description);
      texts.push(...(t.app?.faq ?? []).flatMap((f) => [f.q, f.a]));
    }
    for (const c of Object.values(COLLECTIONS)) {
      texts.push(c.title, c.intro, ...(c.note ? [c.note] : []));
      for (const g of c.groups) texts.push(g.title, ...g.entries.map((e) => e.formats));
    }
    const missing = texts.filter((s) => !ar[s]);
    expect(missing).toEqual([]);
  });

  it('keeps every named placeholder in the Arabic text', () => {
    const broken = Object.entries(ar).filter(([en, translated]) => {
      // Singular forms ("{n} page", only used when n is 1) say "one page" in Arabic instead of a number.
      if (/^\{n\} /.test(en) && /واحد/.test(translated)) return false;
      const names = en.match(/\{[a-z]\w*\}/g) ?? [];
      return names.some((p) => !translated.includes(p));
    });
    expect(broken).toEqual([]);
  });

  it('has Arabic for every string the code passes to tr()', () => {
    const out = execFileSync('node', ['scripts/i18n-missing.mjs', '--json'], { encoding: 'utf8' });
    const missing = (JSON.parse(out) as string[]).filter((s) => !SAME_IN_BOTH.has(s));
    expect(missing).toEqual([]);
  });

  it('never translates into an empty string', () => {
    expect(Object.entries(ar).filter(([, v]) => !v.trim())).toEqual([]);
  });
});
