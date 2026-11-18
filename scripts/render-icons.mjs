// Renders the SVG app icons to the PNG sizes in public/icons (run: node scripts/render-icons.mjs).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const jobs = [
  ['public/icons/icon.svg', 192, 'public/icons/icon-192.png'],
  ['public/icons/icon.svg', 512, 'public/icons/icon-512.png'],
  ['public/icons/icon-maskable.svg', 192, 'public/icons/icon-maskable-192.png'],
  ['public/icons/icon-maskable.svg', 512, 'public/icons/icon-maskable-512.png'],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, size, out] of jobs) {
  const svg = readFileSync(resolve(root, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: resolve(root, out), omitBackground: true });
}
await browser.close();
console.log('icons rendered');
