// Builds Rarvon for desktop's Windows installer:
//   1. the website (dist) and the Rarvon Engine (release),
//   2. desktop/stage: Rarvon.exe + web/ + ffmpeg/ + notices,
//   3. desktop/out/Rarvon-setup-<version>.exe with Inno Setup.
// FFmpeg must already be in desktop/bench-engine/ffmpeg (see desktop/README.md).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const engine = join(root, 'desktop', 'bench-engine');
const stage = join(root, 'desktop', 'stage');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });

const version = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(engine, 'Cargo.toml'), 'utf8'))[1];
const ffmpeg = join(engine, 'ffmpeg', 'ffmpeg.exe');
if (!existsSync(ffmpeg)) throw new Error(`FFmpeg is missing: ${ffmpeg} (see desktop/README.md)`);
const iscc = process.env.ISCC ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe');
if (!existsSync(iscc)) throw new Error(`Inno Setup is missing: ${iscc} (set ISCC to its ISCC.exe)`);

if (!process.argv.includes('--skip-site')) run('npm', ['run', 'build']);
run('cargo', ['build', '--release', '--manifest-path', join(engine, 'Cargo.toml')]);

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'ffmpeg'), { recursive: true });
cpSync(join(engine, 'target', 'release', 'bench-engine.exe'), join(stage, 'Rarvon.exe'));
cpSync(join(root, 'dist'), join(stage, 'web'), {
  recursive: true,
  // The app serves the pages itself: no offline cache or web-host settings needed.
  filter: (src) => !/[\\/](sw\.js|_headers|_redirects)$/.test(src),
});
cpSync(ffmpeg, join(stage, 'ffmpeg', 'ffmpeg.exe'));
cpSync(join(engine, 'ffmpeg', 'LICENSE.txt'), join(stage, 'ffmpeg', 'LICENSE.txt'));
cpSync(join(root, 'desktop', 'installer', 'license.txt'), join(stage, 'LICENSE.txt'));
// Copyright notices of the Rust libraries compiled into Rarvon.exe.
mkdirSync(join(stage, 'licenses'), { recursive: true });
run('node', [join(root, 'scripts', 'rust-licenses.mjs'), join(stage, 'licenses', 'rust-crates.txt')], { shell: false });

run(iscc, ['/Qp', `/DAppVersion=${version}`, join(root, 'desktop', 'installer', 'bench.iss')], { shell: false });
const out = join(root, 'desktop', 'out', `Rarvon-setup-${version}.exe`);
console.log(`\n${out}\n${(statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
