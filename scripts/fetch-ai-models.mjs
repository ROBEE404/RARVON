// Downloads the Background Remover's AI models into ./ai-models (not committed
// to git). The build then serves them from Rarvon itself, split into pieces
// small enough for any static host (see aiAssets() in vite.config.ts).
//
// Each model is pinned to an exact Hugging Face commit, recorded in
// ai-models.lock.json (committed), so every build ships the same files.
// Files already present with the right size are skipped.
//
//   node scripts/fetch-ai-models.mjs           download missing files
//   node scripts/fetch-ai-models.mjs --update  move to the newest commit of each model

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'ai-models');
const LOCK = join(ROOT, 'ai-models.lock.json');

export const MODELS = [
  {
    id: 'Xenova/slimsam-77-uniform', // Apache-2.0
    files: ['config.json', 'preprocessor_config.json', 'onnx/vision_encoder_quantized.onnx', 'onnx/prompt_encoder_mask_decoder_quantized.onnx'],
  },
  {
    id: 'onnx-community/BiRefNet_lite-ONNX', // MIT
    files: ['config.json', 'preprocessor_config.json', 'onnx/model_fp16.onnx'],
  },
];

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
const update = process.argv.includes('--update');

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

for (const model of MODELS) {
  let entry = lock[model.id];
  if (!entry || update) {
    const info = await json(`https://huggingface.co/api/models/${model.id}?blobs=true`);
    const sizes = Object.fromEntries((info.siblings ?? []).map((s) => [s.rfilename, s.size]));
    entry = { revision: info.sha, license: info.cardData?.license ?? info.tags?.find((t) => t.startsWith('license:'))?.slice(8) ?? 'unknown', files: {} };
    for (const f of model.files) {
      if (sizes[f] === undefined) throw new Error(`${model.id} has no file ${f}`);
      entry.files[f] = sizes[f];
    }
    lock[model.id] = entry;
  }
  for (const f of model.files) {
    const dest = join(OUT, model.id, f);
    const size = entry.files[f];
    if (existsSync(dest) && (size == null || statSync(dest).size === size)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const url = `https://huggingface.co/${model.id}/resolve/${entry.revision}/${f}`;
    process.stdout.write(`Downloading ${model.id}/${f} (${size ? (size / 1048576).toFixed(1) + ' MB' : '?'})… `);
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(dest + '.tmp'));
    if (size != null && statSync(dest + '.tmp').size !== size) throw new Error(`${f}: size mismatch`);
    renameSync(dest + '.tmp', dest);
    console.log('done');
  }
}

writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log('AI models ready in ai-models/');
