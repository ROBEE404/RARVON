// Collects the licence of every Rust crate compiled into Rarvon.exe (normal
// dependencies only; build-time helpers don't ship), with each crate's own
// licence files, so their copyright notices ship with the app.
//   node scripts/rust-licenses.mjs <output file>
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const manifest = join(process.cwd(), 'desktop', 'bench-engine', 'Cargo.toml');
const out = process.argv[2] ?? join(process.cwd(), 'desktop', 'stage', 'licenses', 'rust-crates.txt');
const cargo = (args) => execFileSync('cargo', [...args, '--manifest-path', manifest], { encoding: 'utf8' });

const shipped = new Set(
  cargo(['tree', '-e', 'normal', '--prefix', 'none'])
    .split('\n')
    .map((l) => l.trim().split(' ').slice(0, 2).join(' '))
    .filter((l) => l && !l.startsWith('bench-engine')),
);
const meta = JSON.parse(cargo(['metadata', '--format-version', '1']));
const parts = [
  'Rarvon for desktop: Rust libraries inside Rarvon.exe',
  'Each library below remains under its own licence. Thank you to their authors.',
  '',
];
for (const p of meta.packages.sort((a, b) => a.name.localeCompare(b.name))) {
  if (!shipped.has(`${p.name} v${p.version}`)) continue;
  const dir = dirname(p.manifest_path);
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|copyright|notice)/i.test(f));
  parts.push('='.repeat(78), `${p.name} ${p.version}`, `Licence: ${p.license}`, `Source: ${p.repository ?? 'https://crates.io/crates/' + p.name}`, '');
  for (const f of files) parts.push(`--- ${f} ---`, readFileSync(join(dir, f), 'utf8').trim(), '');
  if (!files.length) parts.push('(No licence file in the crate; licence as declared above.)', '');
}
writeFileSync(out, parts.join('\n'));
console.log(`${shipped.size} crates written to ${out}`);
