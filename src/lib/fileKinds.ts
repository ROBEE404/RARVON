import { getTool } from './toolRegistry';
import type { ToolMeta } from './toolRegistry';

/** Broad kinds of files Rarvon routes between tools. */
export type FileKind = 'pdf' | 'image' | 'video' | 'audio' | 'zip' | 'text' | 'other';

const EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', avif: 'image', svg: 'image',
  heic: 'image', heif: 'image', tif: 'image', tiff: 'image', ico: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', m4v: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', flac: 'audio',
  zip: 'zip',
  txt: 'text', md: 'text', csv: 'text', json: 'text', log: 'text',
};

export function kindOfFile(name: string, mime = ''): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (EXT[ext]) return EXT[ext];
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('zip')) return 'zip';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return 'other';
}

/**
 * Tools that take a file of each kind, most useful first. This drives the
 * home page's "drop a file" suggestions and the "Continue with" buttons under
 * a result. Every key must exist in the registry (checked by a unit test).
 */
export const TOOLS_FOR_KIND: Record<FileKind, string[]> = {
  pdf: [
    'pdf/compress', 'pdf/editor', 'pdf/to-text', 'pdf/merge', 'pdf/split', 'pdf/sign', 'pdf/to-images',
    'pdf/rotate', 'pdf/extract', 'pdf/delete-pages', 'pdf/reorder', 'pdf/page-numbers', 'pdf/watermark',
    'pdf/metadata', 'utilities/archive', 'developer/hash',
  ],
  image: [
    'image/remove-background', 'image/to-text', 'image/compress', 'image/convert', 'image/resize', 'image/crop', 'image/rotate',
    'pdf/from-images', 'image/remove-metadata', 'image/metadata', 'utilities/archive', 'developer/base64',
  ],
  video: ['video/editor', 'video/compress', 'video/trim', 'video/convert', 'video/resolution', 'audio/extract', 'utilities/archive'],
  audio: ['audio/convert', 'audio/compress', 'audio/trim', 'utilities/archive'],
  zip: ['utilities/unzip', 'developer/hash'],
  text: ['utilities/archive', 'developer/hash', 'developer/base64'],
  other: ['utilities/archive', 'developer/hash', 'developer/base64'],
};

/** Available tools for a kind, in suggestion order, optionally excluding one tool. */
export function toolsForKind(kind: FileKind, exclude?: string): ToolMeta[] {
  return TOOLS_FOR_KIND[kind]
    .filter((key) => key !== exclude)
    .map((key) => {
      const [category, slug] = key.split('/');
      return getTool(category, slug);
    })
    .filter((t): t is ToolMeta => Boolean(t) && t!.status !== 'coming-soon');
}

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF', image: 'image', video: 'video', audio: 'audio', zip: 'ZIP archive', text: 'text file', other: 'file',
};
