/**
 * Loads the self-hosted AI files under /ai/ (see scripts/aiAssetsPlugin.ts).
 * Large files are published in pieces; this joins them back together and keeps
 * the result in the browser's Cache Storage, so each file downloads only once
 * and works offline afterwards. Works in pages and in workers.
 */

interface Manifest {
  version: string;
  files: Record<string, { size: number; parts: number }>;
}

let manifestPromise: Promise<Manifest> | null = null;

export function aiManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/ai/manifest.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('missing');
      return r.json() as Promise<Manifest>;
    })
    .catch((e) => {
      manifestPromise = null;
      throw new Error(`The AI model files aren't available on this site (${e instanceof Error ? e.message : e}).`);
    });
  return manifestPromise;
}

const CACHE_PREFIX = 'bench-ai-';

async function cacheFor(m: Manifest) {
  if (typeof caches === 'undefined') return null;
  const name = CACHE_PREFIX + m.version;
  try {
    // Drop caches of older model versions.
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== name) void caches.delete(key);
    return await caches.open(name);
  } catch {
    return null;
  }
}

/** Total bytes of the given /ai/ files and how many are already stored on this device. */
export async function aiDownloadStatus(paths: string[]) {
  const m = await aiManifest();
  const cache = await cacheFor(m);
  let total = 0;
  let missing = 0;
  for (const p of paths) {
    const size = m.files[p]?.size ?? 0;
    total += size;
    if (!cache || !(await cache.match(p))) missing += size;
  }
  return { total, missing };
}

export type ProgressFn = (loaded: number, total: number, file: string) => void;

async function readWithProgress(res: Response, onChunk: (n: number) => void): Promise<Blob> {
  if (!res.body) return res.blob();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as unknown as BlobPart);
    onChunk(value.byteLength);
  }
  return new Blob(chunks);
}

/** Returns one /ai/ file as a Blob, downloading (and joining) it the first time. */
export async function getAiFile(path: string, onProgress?: ProgressFn): Promise<Blob> {
  const m = await aiManifest();
  const info = m.files[path];
  if (!info) throw new Error(`Missing AI file ${path}.`);
  const cache = await cacheFor(m);
  const hit = await cache?.match(path);
  if (hit) {
    onProgress?.(info.size, info.size, path);
    return hit.blob();
  }
  let loaded = 0;
  const tick = (n: number) => {
    loaded += n;
    onProgress?.(loaded, info.size, path);
  };
  let blob: Blob;
  if (info.parts > 0) {
    const parts: Blob[] = [];
    for (let i = 0; i < info.parts; i++) {
      const r = await fetch(`${path}.part${i}`);
      if (!r.ok) throw new Error(`Couldn't download ${path} (part ${i + 1} of ${info.parts}).`);
      parts.push(await readWithProgress(r, tick));
    }
    blob = new Blob(parts);
  } else {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Couldn't download ${path}.`);
    blob = await readWithProgress(r, tick);
  }
  if (blob.size !== info.size) throw new Error(`${path} was incomplete. Check your connection and try again.`);
  try {
    await cache?.put(path, new Response(blob, { headers: { 'Content-Length': String(blob.size) } }));
  } catch {
    /* storage full: still usable this time */
  }
  return blob;
}

/** Removes every downloaded AI file from this device. */
export async function clearAiFiles() {
  if (typeof caches === 'undefined') return;
  for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
}
