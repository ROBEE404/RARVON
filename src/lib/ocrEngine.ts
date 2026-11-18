import type { Worker as TesseractWorker, RecognizeResult } from 'tesseract.js';

/**
 * Languages offered by Image → Text. Only languages whose trained data is
 * actually installed (@tesseract.js-data/<code>, self-hosted under /ocr/lang/)
 * are listed — Sorani Kurdish (ckb) is deliberately absent because no
 * packaged LSTM model for it is available.
 */
import { OCR_LANGUAGES } from './ocrLanguages';
import type { OcrLanguage } from './ocrLanguages';
export { OCR_LANGUAGES };
export type { OcrLanguage };

export type OcrLayout = 'auto' | 'block' | 'line';

export interface OcrProgress {
  stage: 'loading' | 'recognizing';
  /** 0..1 */
  fraction: number;
}

export interface OcrResult {
  text: string;
  /** Mean word confidence, 0..100. */
  confidence: number;
  ms: number;
}

let workerPromise: Promise<TesseractWorker> | null = null;
let loadedLangs = '';
let progressListener: ((p: OcrProgress) => void) | null = null;

function onLog(m: { status: string; progress: number }) {
  if (!progressListener) return;
  if (m.status === 'recognizing text') progressListener({ stage: 'recognizing', fraction: m.progress });
  else progressListener({ stage: 'loading', fraction: m.progress });
}

async function getWorker(langs: string): Promise<TesseractWorker> {
  if (!workerPromise) {
    loadedLangs = langs;
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker(langs.split('+'), OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/core',
        langPath: '/ocr/lang',
        logger: onLog,
      });
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  const worker = await workerPromise;
  if (langs !== loadedLangs) {
    const { OEM } = await import('tesseract.js');
    await worker.reinitialize(langs, OEM.LSTM_ONLY);
    loadedLangs = langs;
  }
  return worker;
}

const PSM: Record<OcrLayout, string> = { auto: '3', block: '6', line: '7' };

/**
 * Runs OCR off the main thread. `langs` is a list of codes from OCR_LANGUAGES;
 * the first is the primary language. One worker is kept alive and re-used,
 * switching languages only when the selection changes.
 */
export async function recognizeText(
  image: HTMLCanvasElement | Blob,
  langs: string[],
  options: { layout?: OcrLayout; onProgress?: (p: OcrProgress) => void } = {},
): Promise<OcrResult> {
  const started = performance.now();
  progressListener = options.onProgress ?? null;
  const layout = options.layout ?? 'auto';
  try {
    const runWith = async (codes: string[], mode: OcrLayout) => {
      const worker = await getWorker(codes.join('+'));
      await worker.setParameters({
        tessedit_pageseg_mode: PSM[mode] as never,
        // '0' measured clearly better for Arabic: with '1', the space before
        // the last word of a line was regularly dropped (11% vs 0.7% CER on
        // mixed Arabic/English test images).
        preserve_interword_spaces: '0',
        // Images are already scaled into Tesseract's preferred range during
        // preprocessing; a fixed DPI skips its resolution guess, which
        // otherwise logs a console error on every run.
        user_defined_dpi: '300',
      });
      const result: RecognizeResult = await worker.recognize(image, {}, { text: true, blocks: true });
      let confidentLatinWords = 0;
      for (const block of result.data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            for (const word of line.words) if (/[A-Za-z]/.test(word.text) && word.confidence >= 75) confidentLatinWords++;
          }
        }
      }
      return { text: cleanOcrText(result.data.text), confidence: result.data.confidence, confidentLatinWords };
    };

    let out = await runWith(langs, layout);
    // Automatic page segmentation sometimes finds no text block at all on a
    // sparse image (a single short line, a small label); a uniform-block pass
    // recovers those.
    if (!out.text && layout === 'auto') out = await runWith(langs, 'block');

    // RTL primary + Latin helper language (e.g. Arabic + English): the extra
    // model is needed for mixed text but, on purely Arabic text, it invents a
    // few low-confidence Latin "words" and costs accuracy (3.9% vs 0.5% CER).
    // Real Latin words came back at 90+ confidence in testing, invented ones
    // at 40-65, so if no Latin word is confidently read, re-read with the
    // primary language alone.
    const primary = OCR_LANGUAGES.find((l) => l.code === langs[0]);
    if (out.text && primary?.rtl && langs.length > 1 && out.confidentLatinWords === 0) {
      const alone = await runWith([langs[0]], layout);
      if (alone.text && alone.confidence >= out.confidence - 3) out = alone;
    }
    return { text: out.text, confidence: out.confidence, ms: Math.round(performance.now() - started) };
  } finally {
    progressListener = null;
  }
}

/** Stops the worker (used on cancel; the next run starts a fresh one). */
export async function terminateOcr() {
  const p = workerPromise;
  workerPromise = null;
  loadedLangs = '';
  if (p) await (await p).terminate().catch(() => undefined);
}

/** Collapses runs of spaces Tesseract leaves between words and trims blank-line noise. */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\r/g, '')
    // Tesseract wraps Latin runs inside RTL lines in invisible LRM/RLM marks;
    // they break search and copy-paste, and the UI handles direction itself.
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
