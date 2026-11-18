import type { Plugin, Rollup } from 'vite'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

interface PkgInfo {
  name: string
  version: string
  license: string
  repository: string
  text: string
}

const NOTES: Record<string, string> = {
  '@mediabunny/mp3-encoder': 'Contains the LAME MP3 encoder (GNU LGPL 2.0) compiled to WebAssembly; shipped unmodified in its own replaceable file (assets/mediabunny-mp3-encoder-*.js). LGPL text: /licenses/LAME-LGPL-2.0.txt. Source: https://lame.sourceforge.io/',
  mediabunny: 'Used unmodified under the Mozilla Public License 2.0. Its source code is available at the repository linked here.',
  jszip: 'Dual-licensed (MIT or GPL-3.0-or-later); Rarvon uses it under the MIT license.',
}

/** The language packages are MIT, but the recognition models inside them come from Google's Tesseract project. */
const TESSDATA_NOTE = 'The trained language model inside comes from tesseract-ocr/tessdata_best (https://github.com/tesseract-ocr/tessdata_best), licensed under Apache-2.0.';
const noteFor = (name: string) => NOTES[name] ?? (name.startsWith('@tesseract.js-data/') ? TESSDATA_NOTE : '');

/**
 * Packages found in worker bundles. Vite builds each worker as its own bundle
 * (before the main bundle finishes), so the worker plugin records what it saw
 * here and the main plugin adds it to the report.
 */
const workerPackages = new Set<string>()

/** Returns the package name for a path inside node_modules, or null. */
function packageOf(file: string): string | null {
  const norm = file.split(sep).join('/')
  const i = norm.lastIndexOf('/node_modules/')
  if (i < 0) return null
  const rest = norm.slice(i + '/node_modules/'.length).split('/')
  return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
}

function readPkg(root: string, name: string): PkgInfo | null {
  const dir = join(root, 'node_modules', name)
  const pj = join(dir, 'package.json')
  if (!existsSync(pj)) return null
  const pkg = JSON.parse(readFileSync(pj, 'utf8'))
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? ''
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  return {
    name,
    version: pkg.version ?? '',
    license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see package',
    repository: String(repo).replace(/^git\+/, '').replace(/\.git$/, ''),
    text: licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : '',
  }
}

/**
 * Lists every npm package whose code or files end up in the production build
 * (JS modules, fonts, OCR engine/language data), then emits
 * /licenses/third-party.txt with each package's license text and refreshes the
 * summary table in THIRD_PARTY_LICENSES.md.
 */
export interface ModelLicense {
  id: string
  license: string
  revision: string
}

function collect(bundle: Rollup.OutputBundle, root: string, into: Set<string>) {
  for (const item of Object.values(bundle)) {
    if (item.type === 'chunk') {
      for (const id of Object.keys(item.modules)) {
        const n = packageOf(id.replace(/^\0/, '').split('?')[0])
        if (n) into.add(n)
      }
    } else {
      for (const f of item.originalFileNames ?? []) {
        const n = packageOf(resolve(root, f))
        if (n) into.add(n)
      }
    }
  }
}

/** Add to `worker.plugins` so packages used only inside Web Workers are credited too. */
export function workerLicenses(): Plugin {
  const root = resolve(import.meta.dirname, '..')
  return {
    name: 'bench-licenses-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      collect(bundle, root, workerPackages)
    },
  }
}

/** Where the last build's credits are kept, so the Credits page also works in development. */
const SNAPSHOT = 'scripts/credits-snapshot.json'

/** Serves /licenses/credits.json from the last build's snapshot while developing. */
export function creditsDevServer(): Plugin {
  const root = resolve(import.meta.dirname, '..')
  return {
    name: 'bench-credits-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/licenses/credits.json', (_req, res) => {
        const file = join(root, SNAPSHOT)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(existsSync(file) ? readFileSync(file, 'utf8') : '{"packages":[],"models":[]}')
      })
    },
  }
}

export function licenseReport(extraPackages: () => string[], models: () => ModelLicense[] = () => []): Plugin {
  const root = resolve(import.meta.dirname, '..')
  return {
    name: 'bench-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const names = new Set<string>([...extraPackages(), ...workerPackages])
      collect(bundle, root, names)
      const pkgs = [...names].sort().map((n) => readPkg(root, n)).filter((p): p is PkgInfo => Boolean(p))

      const txt = [
        'Rarvon — third-party software included in this site',
        '='.repeat(52),
        '',
        ...pkgs.flatMap((p) => [
          `${p.name} ${p.version}`,
          `License: ${p.license}${p.repository ? `  ·  ${p.repository}` : ''}`,
          ...(noteFor(p.name) ? [`Note: ${noteFor(p.name)}`] : []),
          '',
          p.text || '(No license file in the package; see the license field above.)',
          '',
          '-'.repeat(72),
          '',
        ]),
        ...(models().length
          ? [
              'AI models (Background Remover), served from this site',
              '='.repeat(52),
              '',
              ...models().flatMap((m) => [`${m.id} @ ${m.revision.slice(0, 10)}`, `License: ${m.license}  ·  https://huggingface.co/${m.id}`, '']),
            ]
          : []),
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: 'licenses/third-party.txt', source: txt })

      // The same list as data for the /credits page.
      const credits = JSON.stringify({
        packages: pkgs.map((p) => ({ name: p.name, version: p.version, license: p.license, repository: p.repository.replace(/^git:\/\//, 'https://'), note: noteFor(p.name), text: p.text })),
        models: models().map((m) => ({ id: m.id, revision: m.revision.slice(0, 10), license: m.license, url: `https://huggingface.co/${m.id}` })),
      })
      this.emitFile({ type: 'asset', fileName: 'licenses/credits.json', source: credits })
      writeFileSync(join(root, SNAPSHOT), credits + '\n')

      const mdPath = join(root, 'THIRD_PARTY_LICENSES.md')
      const marker = '<!-- generated-table -->'
      const head = existsSync(mdPath) ? readFileSync(mdPath, 'utf8').split(marker)[0].trimEnd() : '# Third-party licenses'
      const table = [
        marker,
        '',
        '## All packages in the production build',
        '',
        'Generated by `scripts/licensePlugin.ts` on every `npm run build`. Full license texts ship with the site at',
        '`/licenses/third-party.txt`.',
        '',
        '| Package | Version | License |',
        '|---|---|---|',
        ...pkgs.map((p) => `| ${p.repository ? `[${p.name}](${p.repository.replace(/^git:\/\//, 'https://')})` : p.name} | ${p.version} | ${p.license} |`),
        '',
        ...(models().length
          ? [
              '## AI models',
              '',
              'Used by the Background Remover. Downloaded by `scripts/fetch-ai-models.mjs` (pinned in `ai-models.lock.json`) and served from the site itself.',
              '',
              '| Model | Revision | License |',
              '|---|---|---|',
              ...models().map((m) => `| [${m.id}](https://huggingface.co/${m.id}) | ${m.revision.slice(0, 10)} | ${m.license} |`),
              '',
            ]
          : []),
      ].join('\n')
      writeFileSync(mdPath, `${head}\n\n${table}`)
    },
  }
}
