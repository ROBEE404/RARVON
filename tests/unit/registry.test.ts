import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tools, categories, actionMeta, popularToolKeys, relatedTools } from '../../src/lib/toolRegistry';

const root = join(import.meta.dirname, '../../src');
const componentsSource = readFileSync(join(root, 'lib/toolComponents.tsx'), 'utf8');
const registeredKeys = new Set([...componentsSource.matchAll(/'([a-z-]+\/[a-z0-9-]+)':\s*lazy/g)].map((m) => m[1]));

describe('tool registry', () => {
  it('has unique category/slug keys', () => {
    const keys = tools.map((t) => `${t.category}/${t.slug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only uses known categories and actions', () => {
    const cats = new Set(categories.map((c) => c.slug));
    const actions = new Set(actionMeta.map((a) => a.value));
    for (const t of tools) {
      expect(cats.has(t.category), `${t.slug} category`).toBe(true);
      expect(t.actions.length, `${t.slug} actions`).toBeGreaterThan(0);
      for (const a of t.actions) expect(actions.has(a), `${t.slug} action ${a}`).toBe(true);
    }
  });

  it('gives every usable tool a lazy component and a source folder', () => {
    for (const t of tools.filter((x) => x.status !== 'coming-soon')) {
      const key = `${t.category}/${t.slug}`;
      expect(registeredKeys.has(key), `${key} missing from toolComponents.tsx`).toBe(true);
      expect(statSync(join(root, 'tools', t.category, t.slug, 'index.tsx')).isFile()).toBe(true);
    }
  });

  it('has no component registered for an unknown tool', () => {
    const known = new Set(tools.map((t) => `${t.category}/${t.slug}`));
    for (const key of registeredKeys) expect(known.has(key), `${key} has no registry entry`).toBe(true);
  });

  it('has no orphan tool folders', () => {
    for (const cat of readdirSync(join(root, 'tools'))) {
      for (const slug of readdirSync(join(root, 'tools', cat))) {
        expect(registeredKeys.has(`${cat}/${slug}`), `src/tools/${cat}/${slug} is not registered`).toBe(true);
      }
    }
  });

  it('gives coming-soon tools a reason and popular tools a real target', () => {
    for (const t of tools.filter((x) => x.status === 'coming-soon')) expect(t.comingSoonReason).toBeTruthy();
    const known = new Set(tools.map((t) => `${t.category}/${t.slug}`));
    for (const key of popularToolKeys) expect(known.has(key), key).toBe(true);
  });

  it('relatedTools never includes the tool itself or coming-soon tools', () => {
    for (const t of tools) {
      for (const r of relatedTools(t)) {
        expect(r === t).toBe(false);
        expect(r.status).not.toBe('coming-soon');
      }
    }
  });
});

describe('file-kind routing', async () => {
  const { TOOLS_FOR_KIND, kindOfFile } = await import('../../src/lib/fileKinds');
  it('only routes to tools that exist', () => {
    const known = new Set(tools.map((t) => `${t.category}/${t.slug}`));
    for (const [kind, keys] of Object.entries(TOOLS_FOR_KIND)) for (const k of keys) expect(known.has(k), `${kind} -> ${k}`).toBe(true);
  });
  it('detects kinds by extension and MIME type', () => {
    expect(kindOfFile('a.PDF')).toBe('pdf');
    expect(kindOfFile('photo.heic')).toBe('image');
    expect(kindOfFile('clip.mov')).toBe('video');
    expect(kindOfFile('voice.opus')).toBe('audio');
    expect(kindOfFile('bundle.zip')).toBe('zip');
    expect(kindOfFile('blob', 'image/png')).toBe('image');
    expect(kindOfFile('data.bin')).toBe('other');
  });
});

describe('home page top tools', async () => {
  const { HOME_TOP_TOOLS } = await import('../../src/lib/homeTools');
  it('lists exactly 4 existing, available tools per category', () => {
    for (const c of categories) {
      const slugs = HOME_TOP_TOOLS[c.slug];
      expect(slugs, c.slug).toHaveLength(4);
      for (const s of slugs) {
        const t = tools.find((x) => x.category === c.slug && x.slug === s);
        expect(t && t.status !== 'coming-soon', `${c.slug}/${s}`).toBe(true);
      }
    }
  });
});
