/// <reference lib="webworker" />
/**
 * Background Remover AI, in a worker so the page stays responsive.
 *
 * - SlimSAM (Segment Anything, Apache-2.0): "click to select" and the quick
 *   automatic mode. The picture is encoded once; every click then only runs
 *   the small decoder.
 * - BiRefNet lite (MIT): high-quality automatic background removal.
 *
 * All model and engine files come from this site's /ai/ folder (aiAssets.ts);
 * nothing is fetched from anywhere else and the picture never leaves the device.
 */
import { env, SamModel, AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';
import type { PreTrainedModel, Processor, Tensor } from '@huggingface/transformers';
import { getAiFile } from './aiAssets';

export const SAM_ID = 'Xenova/slimsam-77-uniform';
export const HQ_ID = 'onnx-community/BiRefNet_lite-ONNX';
const ENGINE_MJS = '/ai/ort/ort-wasm-simd-threaded.asyncify.mjs';
const ENGINE_WASM = '/ai/ort/ort-wasm-simd-threaded.asyncify.wasm';

export type WorkerRequest =
  | { type: 'load'; id: number; model: 'sam' | 'hq' }
  | { type: 'image'; id: number; image: ImageBitmap }
  | { type: 'select'; id: number; points: { x: number; y: number; positive: boolean }[] }
  | { type: 'auto'; id: number }
  | { type: 'auto-hq'; id: number };

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'done'; id: number; mask?: Uint8Array; width?: number; height?: number; device?: string }
  | { type: 'error'; id: number; message: string };

const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

// ---- Environment: local files only, served through our cache.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/ai/models/';
env.useBrowserCache = false;
env.useWasmCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(key: string | Request) {
    const url = typeof key === 'string' ? key : key.url;
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    if (!path.startsWith('/ai/')) return undefined;
    const blob = await getAiFile(path, (loaded, total, file) => post({ type: 'progress', file, loaded, total }));
    return new Response(blob);
  },
  async put() {
    /* aiAssets.ts already stores the files */
  },
} as unknown as typeof env.customCache;

let engineReady: Promise<void> | null = null;
function prepareEngine() {
  engineReady ??= (async () => {
    const wasm = await getAiFile(ENGINE_WASM, (loaded, total, file) => post({ type: 'progress', file, loaded, total }));
    const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; wasmBinary?: ArrayBuffer; numThreads?: number } };
    if (onnx.wasm) {
      onnx.wasm.wasmBinary = await wasm.arrayBuffer();
      onnx.wasm.wasmPaths = { mjs: ENGINE_MJS };
      // Without cross-origin isolation browsers allow only one thread.
      if (!(self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated) onnx.wasm.numThreads = 1;
    }
  })();
  return engineReady;
}

/** WebGPU with half-precision support (the high-quality model is stored in fp16). */
async function hasWebGpuF16() {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    return Boolean(adapter?.features.has('shader-f16'));
  } catch {
    return false;
  }
}

let sam: { model: PreTrainedModel; processor: Processor } | null = null;
let hq: { model: PreTrainedModel; processor: Processor; device: string } | null = null;
let image: RawImage | null = null;
let embedded: { inputs: Record<string, unknown>; embeddings: Record<string, Tensor> } | null = null;

async function loadSam() {
  if (sam) return sam;
  await prepareEngine();
  const [model, processor] = await Promise.all([
    SamModel.from_pretrained(SAM_ID, { dtype: 'q8', device: 'wasm' }),
    AutoProcessor.from_pretrained(SAM_ID),
  ]);
  sam = { model, processor };
  return sam;
}

async function loadHq() {
  if (hq) return hq;
  await prepareEngine();
  const gpu = await hasWebGpuF16();
  const device = gpu ? 'webgpu' : 'wasm';
  const [model, processor] = await Promise.all([
    AutoModel.from_pretrained(HQ_ID, {
      dtype: 'fp16',
      device,
      // On the processor, keep peak memory down (WebAssembly is limited to 4 GB).
      session_options: gpu ? undefined : { enableCpuMemArena: false, enableMemPattern: false, graphOptimizationLevel: 'basic' },
    } as never),
    AutoProcessor.from_pretrained(HQ_ID),
  ]);
  hq = { model, processor, device };
  return hq;
}

function toRawImage(bmp: ImageBitmap) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  bmp.close();
  return new RawImage(new Uint8ClampedArray(data.buffer), c.width, c.height, 4).rgb();
}

async function embed() {
  if (embedded || !image) return embedded;
  const s = await loadSam();
  const inputs = await (s.processor as unknown as (img: RawImage) => Promise<Record<string, unknown>>)(image);
  const embeddings = await (s.model as unknown as { get_image_embeddings: (i: unknown) => Promise<Record<string, Tensor>> }).get_image_embeddings(inputs);
  embedded = { inputs, embeddings };
  return embedded;
}

/** Runs SAM with prompts and returns the best mask as 0/255 bytes. */
async function segment(points: { x: number; y: number; positive: boolean }[], pickLargestReasonable = false) {
  if (!image) throw new Error('No picture loaded.');
  const s = await loadSam();
  await embed();
  const prompts = await (s.processor as unknown as (img: RawImage, o: object) => Promise<Record<string, Tensor>>)(image, {
    input_points: [[points.map((p) => [p.x, p.y])]],
    input_labels: [[points.map((p) => (p.positive ? 1 : 0))]],
  });
  const out = await (s.model as unknown as (i: object) => Promise<{ pred_masks: Tensor; iou_scores: Tensor }>)({
    ...embedded!.embeddings,
    input_points: prompts.input_points,
    input_labels: prompts.input_labels,
  });
  const inputs = embedded!.inputs as { original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] };
  const masks = await (s.processor as unknown as { post_process_masks: (...a: unknown[]) => Promise<Tensor[]> }).post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes, { binarize: false });
  const m = masks[0]; // [1, 3, H, W]
  const [, , H, W] = m.dims as number[];
  const scores = Array.from(out.iou_scores.data as Float32Array);
  const logits = m.data as Float32Array;
  const data = new Uint8Array(logits.length);
  for (let i = 0; i < logits.length; i++) data[i] = logits[i] > 0 ? 1 : 0;
  const plane = H * W;
  const areas = scores.map((_, k) => {
    let area = 0;
    for (let i = k * plane; i < (k + 1) * plane; i++) area += data[i];
    return area / plane;
  });
  let best = 0;
  let bestScore = -Infinity;
  for (let k = 0; k < scores.length; k++) {
    let score = scores[k];
    if (pickLargestReasonable && (areas[k] < 0.02 || areas[k] > 0.97)) score -= 1; // nearly empty or the whole picture
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  // One click usually means "this whole thing": among the guesses the model is
  // nearly as sure about, take the largest (the bottle, not just its label).
  if (points.length === 1 && !pickLargestReasonable) {
    for (let k = 0; k < scores.length; k++) {
      if (scores[k] >= bestScore - 0.2 && areas[k] > areas[best] && areas[k] < 0.97) best = k;
    }
  }
  const mask = new Uint8Array(plane);
  // Keep the model's soft edge (smoothly upscaled scores) instead of hard yes/no pixels.
  for (let i = 0; i < plane; i++) {
    const v = 255 / (1 + Math.exp(-2 * logits[best * plane + i]));
    // Very faint values would leave a haze over the background; snap the extremes.
    mask[i] = v < 24 ? 0 : v > 232 ? 255 : Math.round(v);
  }
  return { mask, width: W, height: H };
}

async function autoHq() {
  if (!image) throw new Error('No picture loaded.');
  const h = await loadHq();
  const { pixel_values } = await (h.processor as unknown as (img: RawImage) => Promise<{ pixel_values: Tensor }>)(image);
  const { output_image } = await (h.model as unknown as (i: object) => Promise<{ output_image: Tensor[] }>)({ input_image: pixel_values });
  const t = (output_image[0] as unknown as { sigmoid: () => { mul: (n: number) => { to: (t: string) => Tensor } } }).sigmoid().mul(255).to('uint8');
  const small = RawImage.fromTensor(t as never);
  const resized = await small.resize(image.width, image.height);
  const src = resized.data as Uint8ClampedArray;
  const mask = new Uint8Array(image.width * image.height);
  const ch = resized.channels;
  for (let i = 0; i < mask.length; i++) mask[i] = src[i * ch];
  return { mask, width: image.width, height: image.height, device: h.device };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      if (msg.model === 'sam') await loadSam();
      else await loadHq();
      post({ type: 'done', id: msg.id });
    } else if (msg.type === 'image') {
      image = toRawImage(msg.image);
      embedded = null;
      post({ type: 'done', id: msg.id });
    } else if (msg.type === 'select') {
      const r = await segment(msg.points);
      post({ type: 'done', id: msg.id, ...r }, [r.mask.buffer]);
    } else if (msg.type === 'auto') {
      if (!image) throw new Error('No picture loaded.');
      const { width: w, height: h } = image;
      // The main subject is usually in the middle and the corners are background.
      const r = await segment([
        { x: w / 2, y: h / 2, positive: true },
        { x: w * 0.03, y: h * 0.03, positive: false },
        { x: w * 0.97, y: h * 0.03, positive: false },
        { x: w * 0.03, y: h * 0.97, positive: false },
        { x: w * 0.97, y: h * 0.97, positive: false },
      ], true);
      post({ type: 'done', id: msg.id, ...r }, [r.mask.buffer]);
    } else if (msg.type === 'auto-hq') {
      const r = await autoHq();
      post({ type: 'done', id: msg.id, ...r }, [r.mask.buffer]);
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
