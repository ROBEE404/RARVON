import { test, expect } from './helpers';
import { tools, categories, actionMeta } from '../src/lib/toolRegistry';

/**
 * A pass over every page of the site, checking things a visitor would notice
 * (or a screen reader would trip on). Console errors and uncaught exceptions
 * already fail any test through `helpers`.
 */
const pages = [
  '/', '/tools', '/about', '/privacy', '/support', '/credits',
  ...categories.map((c) => `/tools/${c.slug}`),
  ...actionMeta.map((a) => `/${a.value}`),
  ...tools.map((t) => `/tools/${t.category}/${t.slug}`),
];

test.describe.configure({ timeout: 300_000 });

test('every page: real links, named buttons, described images, no failed requests', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === new URL(page.url() || 'http://x').origin) failed.push(`${r.status()} ${r.url()}`);
  });
  const known = new Set(pages);
  const problems: string[] = [];

  for (const path of pages) {
    await page.goto(path);
    await expect(page.locator('h1').first(), path).toBeVisible();
    // Give lazy parts (tool pages load their own code) a moment to settle.
    await page.waitForLoadState('networkidle');

    const found = await page.evaluate(() => {
      const out: { links: string[]; unnamed: string[]; noAlt: string[]; notFound: boolean } = { links: [], unnamed: [], noAlt: [], notFound: false };
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const u = new URL(a.href, location.href);
        if (u.origin === location.origin && !/\.(txt|json|xml|webmanifest|png|svg)$/.test(u.pathname)) out.links.push(u.pathname);
      }
      for (const b of Array.from(document.querySelectorAll<HTMLElement>('button, [role=button], [role=radio], [role=switch], [role=tab], a[href]'))) {
        if (b.closest('[hidden], [aria-hidden="true"]')) continue;
        const name = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
        const labelled = b.getAttribute('aria-labelledby');
        if (!name && !labelled) out.unnamed.push(b.outerHTML.slice(0, 120));
      }
      for (const img of Array.from(document.querySelectorAll('img'))) {
        if (!img.hasAttribute('alt')) out.noAlt.push(img.src.slice(0, 80));
      }
      out.notFound = /This page doesn’t exist/.test(document.body.textContent ?? '');
      return out;
    });
    if (found.notFound) problems.push(`${path}: shows the "page doesn't exist" screen`);
    for (const l of found.links) if (!known.has(l) && !l.startsWith('/editor/')) known.add(l), (await linkWorks(l)) || problems.push(`${path}: link to ${l} is broken`);
    for (const u of found.unnamed) problems.push(`${path}: unnamed control ${u}`);
    for (const i of found.noAlt) problems.push(`${path}: image without alt ${i}`);
  }

  async function linkWorks(path: string) {
    const p = await page.context().newPage();
    try {
      await p.goto(path);
      await p.locator('h1').first().waitFor();
      return !/This page doesn’t exist/.test((await p.textContent('body')) ?? '');
    } finally {
      await p.close();
    }
  }

  expect(failed, 'requests that failed').toEqual([]);
  expect(problems).toEqual([]);
});

test('every page fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  const wide: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    await expect(page.locator('h1').first(), path).toBeVisible();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 360) wide.push(`${path}: ${w}px wide`);
  }
  expect(wide).toEqual([]);
});

test('the first download stays small (home page budget)', async () => {
  // Everything the browser must fetch before showing any page: the entry
  // script, its preloads and the stylesheet, measured compressed. Tool code,
  // PDF/OCR/AI/video libraries must load later, only when a tool needs them.
  const { readFileSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  const html = readFileSync('dist/index.html', 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const kb = files.reduce((n, f) => n + gzipSync(readFileSync(`dist/${f}`)).length, 0) / 1024;
  console.log(`First download: ${kb.toFixed(1)} KB compressed (${files.join(', ')})`);
  expect(kb, 'KB compressed before the first page shows').toBeLessThan(150);
});

test('offline mode stays a light download, and no file is too big to host', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  // What the offline worker fetches in the background on a first visit.
  const sw = readFileSync('dist/sw.js', 'utf8');
  const list: string[] = JSON.parse(sw.match(/\["\/[^\]]+\]/)![0]);
  const mb = list.reduce((n, p) => n + statSync(`dist${p}`).size, 0) / 1048576;
  console.log(`Offline download: ${list.length} files, ${mb.toFixed(1)} MB`);
  expect(mb, 'MB the offline worker downloads on a first visit').toBeLessThan(12);
  // Hosts limit single files (Cloudflare Pages: 25 MiB); big AI files are split into parts.
  const tooBig: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (s.size > 24 * 1048576) tooBig.push(`${p} (${(s.size / 1048576).toFixed(1)} MB)`);
    }
  };
  walk('dist');
  expect(tooBig).toEqual([]);
});
