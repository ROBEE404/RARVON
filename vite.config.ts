import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { creditsDevServer, licenseReport, workerLicenses } from './scripts/licensePlugin.ts'
import type { ModelLicense } from './scripts/licensePlugin.ts'
import { aiAssets } from './scripts/aiAssetsPlugin.ts'

function aiModelLicenses(): ModelLicense[] {
  const lock = resolve(import.meta.dirname, 'ai-models.lock.json')
  if (!existsSync(lock)) return []
  const data = JSON.parse(readFileSync(lock, 'utf8')) as Record<string, { revision: string; license: string }>
  return Object.entries(data).map(([id, m]) => ({ id, license: m.license, revision: m.revision }))
}

/**
 * Self-hosts everything the Image → Text (OCR) tool needs under /ocr/, so OCR
 * never touches a CDN: the tesseract.js worker, the LSTM WebAssembly cores,
 * and one gzipped traineddata file per installed @tesseract.js-data/<lang>
 * package. Nothing here is part of the app bundle — files are only fetched
 * when someone runs OCR, then cached by the browser (and by tesseract.js in
 * IndexedDB).
 */
/** Packages whose files ocrAssets() copies into the build (for the license report). */
const ocrPackages: string[] = ['tesseract.js', 'tesseract.js-core']

function ocrAssets(): Plugin {
  const nm = resolve(import.meta.dirname, 'node_modules')
  const files = new Map<string, string>() // public path (no leading slash) -> absolute source path
  files.set('ocr/worker.min.js', join(nm, 'tesseract.js/dist/worker.min.js'))
  for (const f of readdirSync(join(nm, 'tesseract.js-core'))) {
    if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) files.set(`ocr/core/${f}`, join(nm, 'tesseract.js-core', f))
  }
  const dataDir = join(nm, '@tesseract.js-data')
  if (existsSync(dataDir)) {
    for (const lang of readdirSync(dataDir)) {
      const src = join(dataDir, lang, '4.0.0_best_int', `${lang}.traineddata.gz`)
      if (existsSync(src)) {
        files.set(`ocr/lang/${lang}.traineddata.gz`, src)
        ocrPackages.push(`@tesseract.js-data/${lang}`)
      }
    }
  }

  return {
    name: 'bench-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        const src = files.get(path)
        if (!src) return next()
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        createReadStream(src).pipe(res)
      })
    },
    generateBundle() {
      for (const [fileName, src] of files) this.emitFile({ type: 'asset', fileName, source: readFileSync(src) })
    },
  }
}

/**
 * Offline support: emits /sw.js (from src/sw-template.js) with the list of
 * every hashed JS/CSS/font/WASM asset of this build to precache, so any tool
 * works offline after the first visit. The large /ocr/ files are excluded
 * (cached on first use instead). Only the production build gets a worker.
 */
function benchPwa(): Plugin {
  return {
    name: 'bench-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      // ONNX Runtime (inside transformers.js) keeps a fallback reference to its
      // 25.6 MB engine as a hashed asset. Rarvon always hands it the engine itself
      // (from /ai/ort, see backgroundRemoval.worker.ts), so that copy is never
      // fetched: drop it, or offline mode would download it on every first visit
      // and some hosts (Cloudflare Pages) refuse files over 25 MB.
      for (const f of Object.keys(bundle)) if (/^assets\/ort-wasm-simd-threaded\..*\.wasm$/.test(f)) delete bundle[f]
      // .woff duplicates of .woff2 fonts are skipped (cached on first use if ever needed).
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/') && !f.endsWith('.map') && !f.endsWith('.woff')).sort()
      const ocr = Object.keys(bundle).filter((f) => f.startsWith('ocr/')).sort()
      const hash = (list: string[]) => createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12)
      const template = readFileSync(resolve(import.meta.dirname, 'src/sw-template.js'), 'utf8')
      const source = template
        .replace("'__VERSION__'", JSON.stringify(hash(files)))
        .replace('__PRECACHE__', JSON.stringify(files.map((f) => `/${f}`)))
        .replace('__OCR_VERSION__', hash(ocr.map((f) => `${f}:${(bundle[f] as { source?: { length: number } }).source?.length ?? 0}`)))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/**
 * robots.txt always; sitemap.xml when VITE_SITE_URL (the public origin) is
 * set at build time, listing the home, category, action and every available
 * tool page from the registry.
 */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'bench-seo',
    apply: 'build',
    async generateBundle() {
      const origin = siteUrl.replace(/\/$/, '')
      const robots = ['User-agent: *', 'Allow: /', ...(origin ? [`Sitemap: ${origin}/sitemap.xml`] : [])].join('\n') + '\n'
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      if (!origin) return
      const { tools, categories, actionMeta } = await import('./src/lib/toolRegistry.ts')
      const paths = [
        '/', '/about', '/privacy',
        ...categories.map((c) => `/tools/${c.slug}`),
        ...actionMeta.map((a) => `/${a.value}`),
        ...tools.filter((t) => t.status !== 'coming-soon').map((t) => `/tools/${t.category}/${t.slug}`),
      ]
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')}
</urlset>
`
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ocrAssets(), aiAssets(), benchPwa(), licenseReport(() => [...ocrPackages, 'onnxruntime-web'], aiModelLicenses), creditsDevServer(), seoFiles(loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '')],
  worker: {
    format: 'es',
    plugins: () => [workerLicenses()],
  },
}))
