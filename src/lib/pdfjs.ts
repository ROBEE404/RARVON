import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { tr } from './i18n';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * One pdf.js worker shared by every document. Without this, each
 * getDocument() call spawns its own Web Worker (~300 ms start-up), and
 * `doc.cleanup()` never terminates it — every thumbnail, page render and page
 * count leaked a worker thread.
 */
let sharedWorker: pdfjsLib.PDFWorker | null = null;
function worker() {
  sharedWorker ??= new pdfjsLib.PDFWorker();
  return sharedWorker;
}

/** Opens a document on the shared worker; always call `destroy()` when done. */
function open(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data, worker: worker() });
}

export async function renderPdfPageToCanvas(
  data: ArrayBuffer,
  pageNumber: number,
  scale = 1.5,
): Promise<HTMLCanvasElement> {
  const task = open(data);
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas;
  } finally {
    void task.destroy();
  }
}

/**
 * Opens a PDF once and renders pages from it on demand, instead of re-parsing
 * the whole document for every page. Returns each page's canvas plus its
 * displayed size in PDF points (crop box and embedded rotation applied), so
 * callers can rebuild pages at their real physical size.
 */
export async function openPdfForRendering(data: ArrayBuffer) {
  const task = open(data);
  const doc = await task.promise;
  return {
    numPages: doc.numPages,
    async renderPage(pageNumber: number, scale: number) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      page.cleanup();
      return { canvas, widthPt: base.width, heightPt: base.height };
    },
    destroy: () => task.destroy(),
  };
}

export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const task = open(data);
  try {
    return (await task.promise).numPages;
  } finally {
    void task.destroy();
  }
}

export async function renderAllThumbnails(data: ArrayBuffer, scale = 0.3): Promise<string[]> {
  const task = open(data);
  try {
    const doc = await task.promise;
    const urls: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr("Canvas is not supported in this browser."));
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      urls.push(canvas.toDataURL('image/png'));
      page.cleanup();
    }
    return urls;
  } finally {
    void task.destroy();
  }
}

export interface PdfPageText {
  page: number;
  text: string;
}

/**
 * Extracts each page's text layer, rebuilding line breaks from the text
 * positions (pdf.js returns runs of text, not lines) and keeping blank lines
 * between paragraphs. Pages that are only images (scans) come back empty.
 * Throws `PasswordRequired` for encrypted PDFs.
 */
import { PasswordRequired } from './jobErrors';
export { PasswordRequired };

export async function extractPdfText(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<PdfPageText[]> {
  const task = open(data);
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PasswordException') throw new PasswordRequired();
      throw e;
    }
    const out: PdfPageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      let lastY: number | null = null;
      let lastH = 0;
      let lastXEnd: number | null = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const [, , , d, x, y] = item.transform;
        const h = Math.abs(d) || item.height || 10;
        if (lastY !== null && item.str.trim()) {
          const dy = Math.abs(y - lastY);
          const lineH = Math.max(h, lastH);
          if (dy > lineH * 0.5) {
            // New line; a gap of more than ~1.7 lines means a new paragraph.
            text = text.replace(/[ \t]+$/, '');
            const wanted = dy > lineH * 1.7 ? '\n\n' : '\n';
            if (!text.endsWith(wanted)) text = text.replace(/\n*$/, '') + wanted;
            lastXEnd = null;
          } else if (lastXEnd !== null && item.dir !== 'rtl' && x - lastXEnd > h * 0.2 && !/\s$/.test(text) && !/^\s/.test(item.str)) {
            text += ' '; // separate runs on one line with a visible gap between them
          }
        }
        text += item.str;
        if (item.hasEOL) text += '\n';
        if (item.str.trim()) {
          lastY = y;
          lastH = h;
          lastXEnd = x + item.width;
        }
      }
      out.push({ page: n, text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() });
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    return out;
  } finally {
    void task.destroy();
  }
}
