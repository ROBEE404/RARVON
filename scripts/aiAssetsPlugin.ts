import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Serves the Background Remover's AI engine and models from Rarvon itself
 * under /ai/ (no third-party downloads at run time).
 *
 * Some static hosts reject files over 25 MB, so any file larger than PART_SIZE
 * is published as numbered pieces (`file.part0`, `file.part1`…). The browser
 * reads /ai/manifest.json, downloads the pieces and joins them
 * (src/lib/aiAssets.ts).
 *
 * Models come from ./ai-models (see scripts/fetch-ai-models.mjs); the ONNX
 * Runtime WebAssembly engine comes from node_modules/onnxruntime-web.
 */
const PART_SIZE = 19 * 1024 * 1024;

export const AI_ENGINE_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

interface Source {
  path: string; // public path, e.g. "ai/models/x/onnx/model.onnx"
  file: string; // absolute source file
  size: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

function collect(root: string): Source[] {
  const out: Source[] = [];
  const ort = join(root, 'node_modules/onnxruntime-web/dist');
  for (const f of AI_ENGINE_FILES) {
    const file = join(ort, f);
    if (existsSync(file)) out.push({ path: `ai/ort/${f}`, file, size: statSync(file).size });
  }
  const models = join(root, 'ai-models');
  if (existsSync(models)) {
    for (const file of walk(models)) {
      if (file.endsWith('.tmp')) continue;
      out.push({ path: `ai/models/${relative(models, file).split('\\').join('/')}`, file, size: statSync(file).size });
    }
  }
  return out;
}

function manifest(sources: Source[]) {
  const files: Record<string, { size: number; parts: number }> = {};
  for (const s of sources) files[`/${s.path}`] = { size: s.size, parts: s.size > PART_SIZE ? Math.ceil(s.size / PART_SIZE) : 0 };
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  return { version, files };
}

export function aiAssets(): Plugin {
  const root = resolve(import.meta.dirname, '..');
  let warned = false;
  return {
    name: 'bench-ai-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (!url.startsWith('/ai/')) return next();
        const sources = collect(root);
        if (url === '/ai/manifest.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(manifest(sources)));
          return;
        }
        const m = /^(.*)\.part(\d+)$/.exec(url);
        const src = sources.find((s) => `/${s.path}` === (m ? m[1] : url));
        if (!src) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const data = readFileSync(src.file);
        res.setHeader('Content-Type', url.endsWith('.mjs') ? 'text/javascript' : url.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.end(m ? data.subarray(Number(m[2]) * PART_SIZE, (Number(m[2]) + 1) * PART_SIZE) : data);
      });
    },
    generateBundle() {
      const sources = collect(root);
      if (!sources.some((s) => s.path.startsWith('ai/models/')) && !warned) {
        warned = true;
        this.warn('No AI models found in ./ai-models. Run "node scripts/fetch-ai-models.mjs"; the Background Remover will not work in this build.');
      }
      for (const s of sources) {
        const data = readFileSync(s.file);
        if (s.size > PART_SIZE) {
          for (let i = 0; i * PART_SIZE < s.size; i++) {
            this.emitFile({ type: 'asset', fileName: `${s.path}.part${i}`, source: data.subarray(i * PART_SIZE, (i + 1) * PART_SIZE) });
          }
        } else this.emitFile({ type: 'asset', fileName: s.path, source: data });
      }
      this.emitFile({ type: 'asset', fileName: 'ai/manifest.json', source: JSON.stringify(manifest(sources)) });
    },
  };
}
