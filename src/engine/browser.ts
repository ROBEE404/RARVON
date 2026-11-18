import type { Engine } from './types';
import { getSupportedEncodeFormats } from '../lib/imageFormatSupport';
import { OCR_LANGUAGES } from '../lib/ocrLanguages';
import { WORK_SIZE } from '../lib/aiConstants';
import { imageOutputFormats } from './imageFormats';
import { BROWSER_INFO } from './info';

/**
 * The engine the website uses: WebCodecs (through Mediabunny) for video and
 * audio, pdf.js, Tesseract and ONNX Runtime, everything inside the browser.
 *
 * Every page imports the engine (tool cards ask it whether to show warnings),
 * so the heavy libraries are loaded only when a tool actually calls them:
 * the home page stays light.
 */
const video = () => import('../lib/videoEngine');
const audio = () => import('../lib/audioEngine');
const editor = () => import('../lib/videoEditor/exporter');
const capture = () => import('../lib/videoAudioCapture');
const pdf = () => import('../lib/pdfjs');
/**
 * OCR keeps one shared worker, so stop and start must happen in the order
 * they're called. Once the OCR code is loaded both run immediately (as a
 * direct call would); before that, no worker can exist, so stop has nothing
 * to do. (Making stop wait for the code to load let a late stop shut down the
 * worker a new job was waiting on, and the job hung on "Loading…".)
 */
let ocrModule: typeof import('../lib/ocrEngine') | null = null;
const ocr = async () => (ocrModule ??= await import('../lib/ocrEngine'));
const image = () => import('./browserImage');
const formats = () => import('../lib/imageFormatSupport');
const ai = () => import('../lib/backgroundRemoval');


const canCapture =
  typeof HTMLVideoElement !== 'undefined' &&
  ('captureStream' in HTMLVideoElement.prototype || 'mozCaptureStream' in HTMLVideoElement.prototype);

export const browserEngine: Engine = {
  ...BROWSER_INFO,
  video: {
    probe: async (file) => (await video()).probeVideo(file),
    convert: async (file, options) => (await video()).runVideoConversion(file, options),
    toGif: async (file, options) => (await video()).videoToGif(file, options),
    canEncode: async (codec) => (await video()).canEncodeVideoCodec(codec),
    thumbnail: null,
    exportProject: async (project, files, options) => (await editor()).exportProject(project, files, options),
  },
  audio: {
    probe: async (file) => (await audio()).probeAudio(file),
    convert: async (file, options) => (await audio()).convertAudio(file, options),
    encodableTargets: async () => (await audio()).encodableAudioTargets(),
    captureFromVideo: canCapture ? async (file, onProgress) => (await capture()).extractAudioFromVideo(file, onProgress) : null,
  },
  image: {
    outputFormats: imageOutputFormats,
    canvasFormats: getSupportedEncodeFormats,
    encode: async (canvas, mime, quality) => (await image()).encodeImage(canvas, mime, quality),
    load: async (file) => (await formats()).tryDecodeImage(file),
    needsReader: async (file) => (await image()).needsBenchReader(file),
    open: async (file) => (await image()).openWithBench(file),
  },
  pdf: {
    pageCount: async (data) => (await pdf()).getPdfPageCount(data),
    renderPage: async (data, n, scale) => (await pdf()).renderPdfPageToCanvas(data, n, scale),
    open: async (data) => (await pdf()).openPdfForRendering(data),
    thumbnails: async (data, scale) => (await pdf()).renderAllThumbnails(data, scale),
    extractText: async (data, onProgress) => (await pdf()).extractPdfText(data, onProgress),
  },
  ocr: {
    languages: OCR_LANGUAGES,
    recognize: (img, langs, options) => (ocrModule ? ocrModule.recognizeText(img, langs, options) : ocr().then((m) => m.recognizeText(img, langs, options))),
    stop: async () => {
      if (ocrModule) await ocrModule.terminateOcr();
    },
  },
  ai: {
    workSize: WORK_SIZE,
    backgroundRemover: async () => new (await ai()).BackgroundRemover(),
    downloadStatus: async (mode) => (await ai()).downloadStatus(mode),
  },
};
