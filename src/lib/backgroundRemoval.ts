import type { WorkerRequest, WorkerResponse } from './backgroundRemoval.worker';
import { aiDownloadStatus } from './aiAssets';

/** Files each AI mode needs, for the "downloads X MB once" notes. */
export const ENGINE_FILES = ['/ai/ort/ort-wasm-simd-threaded.asyncify.wasm', '/ai/ort/ort-wasm-simd-threaded.asyncify.mjs'];
export const SAM_FILES = [
  '/ai/models/Xenova/slimsam-77-uniform/onnx/vision_encoder_quantized.onnx',
  '/ai/models/Xenova/slimsam-77-uniform/onnx/prompt_encoder_mask_decoder_quantized.onnx',
];
export const HQ_FILES = ['/ai/models/onnx-community/BiRefNet_lite-ONNX/onnx/model_fp16.onnx'];

export function downloadStatus(mode: 'standard' | 'hq') {
  return aiDownloadStatus(mode === 'hq' ? [...ENGINE_FILES, ...HQ_FILES] : [...ENGINE_FILES, ...SAM_FILES]);
}

/** Longest side the AI works at; masks are scaled up to the full picture afterwards. */
export { WORK_SIZE } from './aiConstants';

export interface MaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  device?: string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Pending = { resolve: (r: MaskResult | void) => void; reject: (e: Error) => void };

export class BackgroundRemover {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private files = new Map<string, { loaded: number; total: number }>();
  onProgress?: (loaded: number, total: number) => void;

  constructor() {
    this.worker = new Worker(new URL('./backgroundRemoval.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.type === 'progress') {
        this.files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0;
        let total = 0;
        this.files.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        this.onProgress?.(loaded, total);
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(friendly(m.message)));
      else p.resolve(m.mask ? { mask: m.mask, width: m.width!, height: m.height!, device: m.device } : undefined);
    };
    this.worker.onerror = (e) => {
      const err = new Error(friendly(e.message || 'The AI engine stopped unexpectedly.'));
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
  }

  private send<T extends MaskResult | void>(msg: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    this.files.clear();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as Pending['resolve'], reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  load(model: 'sam' | 'hq') {
    return this.send<void>({ type: 'load', model });
  }
  setImage(image: ImageBitmap) {
    return this.send<void>({ type: 'image', image }, [image]);
  }
  select(points: { x: number; y: number; positive: boolean }[]) {
    return this.send<MaskResult>({ type: 'select', points });
  }
  auto() {
    return this.send<MaskResult>({ type: 'auto' });
  }
  autoHq() {
    return this.send<MaskResult>({ type: 'auto-hq' });
  }
  dispose() {
    this.worker.terminate();
    this.pending.clear();
  }
}

function friendly(message: string) {
  if (/memory|allocation|OOM/i.test(message)) return 'Your device ran out of memory for this picture. Try a smaller picture or close other tabs.';
  if (/aren't available|Missing AI file|404/i.test(message)) return 'The AI model files are missing from this site.';
  return message;
}
