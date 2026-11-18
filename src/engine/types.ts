/**
 * The engine: everything a tool asks to have done to a file, separated from
 * the tool's screen. The website runs the browser engine (WebCodecs, Web
 * Audio, WebAssembly). The Rarvon app will run a native engine with the same
 * shape (FFmpeg and friends on the user's own hardware), so every tool page
 * works unchanged in both.
 *
 * Tools import from `src/engine`, never from the engine's internals in
 * `src/lib`, so swapping engines touches no tool code.
 */
import type { AudioInfo, AudioJobOptions, AudioTarget } from '../lib/audioEngine';
import type { GifOptions, RunConversionOptions, VideoInfo } from '../lib/videoEngine';
import type { ExportOptions } from '../lib/videoEditor/exporter';
import type { Project } from '../lib/videoEditor/types';
import type { VideoCodec } from 'mediabunny';
import type { ImageFormatOption } from '../lib/imageFormatSupport';
import type { PdfPageText } from '../lib/pdfjs';
import type { OcrLanguage, OcrLayout, OcrProgress, OcrResult } from '../lib/ocrEngine';
import type { BackgroundRemover } from '../lib/backgroundRemoval';

export type EngineKind = 'browser' | 'native';

export interface VideoEngine {
  /** Reads a video's size, length, codecs and container. */
  probe(file: File): Promise<VideoInfo>;
  /** Converts, trims, resizes or compresses a video in one pass. */
  convert(file: File, options: RunConversionOptions): Promise<Blob>;
  /** Turns part of a video into an animated GIF. */
  toGif(file: File, options: GifOptions): Promise<Blob>;
  /** Whether this engine can encode a video codec on this device. */
  canEncode(codec: VideoCodec): Promise<boolean>;
  /**
   * A still picture from the video, for previews of files the browser can't
   * play (null: previews use the browser's own video player).
   */
  thumbnail: ((file: File) => Promise<Blob>) | null;
  /** Renders a Video Editor project to a file. */
  exportProject(project: Project, files: Map<string, File>, options: ExportOptions): Promise<Blob>;
}

export interface AudioEngine {
  probe(file: File): Promise<AudioInfo>;
  /** Converts or compresses audio (also pulls the sound out of a video). */
  convert(file: File, options: AudioJobOptions): Promise<{ blob: Blob; extension: string; mime: string; copied: boolean }>;
  /** Which audio formats this engine can write on this device. */
  encodableTargets(): Promise<Set<AudioTarget>>;
  /**
   * Fallback for videos whose container can't be read directly: records the
   * sound while the video plays (browser only; null when not available).
   */
  captureFromVideo: ((file: File, onProgress: (fraction: number) => void) => Promise<Blob>) | null;
}

export interface ImageEngine {
  /** Every format this engine can save a picture as (browser-made first). */
  outputFormats(): ImageFormatOption[];
  /** Formats the browser's own canvas can write (for tools that only need those). */
  canvasFormats(): ImageFormatOption[];
  /** Saves a drawn picture in a format (`mime` from outputFormats). */
  encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob>;
  /** Opens a picture the usual way (formats the platform itself understands). */
  load(file: File): Promise<{ image: HTMLImageElement; url: string }>;
  /** True when this file needs the engine's own readers (the browser can't open it). */
  needsReader(file: File): Promise<boolean>;
  /** Opens such a file as a picture the tool can draw. */
  open(file: File): Promise<{ url: string; width: number; height: number }>;
}

/** A PDF opened for drawing its pages; destroy it when done. */
export interface PdfDocument {
  numPages: number;
  renderPage(pageNumber: number, scale: number): Promise<{ canvas: HTMLCanvasElement; widthPt: number; heightPt: number }>;
  destroy(): Promise<void>;
}

export interface PdfEngine {
  pageCount(data: ArrayBuffer): Promise<number>;
  /** Draws one page (1-based) at a scale (1 = 72 dpi). */
  renderPage(data: ArrayBuffer, pageNumber: number, scale: number): Promise<HTMLCanvasElement>;
  open(data: ArrayBuffer): Promise<PdfDocument>;
  /** Small pictures of every page, as data URLs. */
  thumbnails(data: ArrayBuffer, scale?: number): Promise<string[]>;
  /** The text of every page, with its layout. */
  extractText(data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<PdfPageText[]>;
}

export interface OcrEngine {
  languages: OcrLanguage[];
  recognize(image: HTMLCanvasElement | Blob, langs: string[], options?: { layout?: OcrLayout; onProgress?: (p: OcrProgress) => void }): Promise<OcrResult>;
  /** Frees the text-recognition engine (it's large). */
  stop(): Promise<void>;
}

export interface AiEngine {
  /** Longest side, in pixels, the background models work at. */
  workSize: number;
  /** A background remover; it keeps its models loaded until disposed. */
  backgroundRemover(): Promise<BackgroundRemover>;
  /** How much of each model still has to be downloaded. */
  downloadStatus(mode: 'standard' | 'hq'): Promise<{ missing: number }>;
}

export interface Engine {
  kind: EngineKind;
  /**
   * Largest video file this engine accepts, in bytes (null = no limit). The
   * browser has to hold the whole file in a tab's memory; the app doesn't.
   */
  maxVideoBytes: number | null;
  /**
   * Whether tools marked "experimental" should show their warning. The
   * warning is about browser limits, so the native engine turns it off.
   */
  showsBrowserWarnings: boolean;
  video: VideoEngine;
  audio: AudioEngine;
  image: ImageEngine;
  pdf: PdfEngine;
  ocr: OcrEngine;
  ai: AiEngine;
}
