import { getTool } from './toolRegistry';
import type { ToolMeta } from './toolRegistry';

/**
 * Cross-category shortcuts: every Convert tool and every Compress tool in one
 * place. Tools stay in their own categories too — these only link to them.
 * `formats` is the short "from → to" line shown under each tool.
 */
export interface CollectionEntry {
  key: string; // "category/slug"
  formats: string;
}
export interface CollectionGroup {
  title: string;
  entries: CollectionEntry[];
}
export interface Collection {
  slug: 'convert' | 'compress';
  title: string;
  intro: string;
  groups: CollectionGroup[];
  note?: string;
}

export const COLLECTIONS: Record<'convert' | 'compress', Collection> = {
  convert: {
    slug: 'convert',
    title: 'Convert',
    intro: 'Change a file into another format: documents, images, video, audio, text and data.',
    groups: [
      {
        title: 'Images',
        entries: [
          { key: 'image/convert', formats: 'JPG, PNG, WebP, TIFF, TGA, SVG… → PNG, JPEG, WebP, GIF, TIFF, ICO, PSD and more' },
          { key: 'image/to-text', formats: 'Image → editable text (OCR)' },
          { key: 'pdf/from-images', formats: 'JPG, PNG → PDF' },
        ],
      },
      {
        title: 'Documents',
        entries: [
          { key: 'pdf/to-images', formats: 'PDF → PNG, JPG, WebP, GIF, BMP, TIFF' },
          { key: 'pdf/to-text', formats: 'PDF → TXT, Markdown' },
        ],
      },
      {
        title: 'Video and audio',
        entries: [
          { key: 'video/convert', formats: 'MOV, MKV, MP4, WebM → MP4, MOV, WebM, MKV, GIF' },
          { key: 'audio/convert', formats: 'MP3, WAV, FLAC, M4A, OGG → MP3, AAC, Opus, WAV' },
          { key: 'audio/extract', formats: 'Video → MP3, AAC, Opus, WAV' },
        ],
      },
      {
        title: 'Text and data',
        entries: [
          { key: 'text/case-converter', formats: 'UPPER, lower, Title, camelCase, snake_case' },
          { key: 'developer/base64', formats: 'Text or file ⇄ Base64' },
          { key: 'developer/url-encode', formats: 'Text ⇄ URL encoding' },
          { key: 'developer/timestamp', formats: 'Unix time ⇄ date' },
          { key: 'developer/color', formats: 'HEX ⇄ RGB ⇄ HSL' },
        ],
      },
    ],
  },
  compress: {
    slug: 'compress',
    title: 'Compress',
    intro: 'Make files smaller. You always see the real before and after size before you download.',
    groups: [
      {
        title: 'Documents and images',
        entries: [
          { key: 'pdf/compress', formats: 'PDF, best for scans and photos' },
          { key: 'image/compress', formats: 'JPG, PNG, WebP' },
        ],
      },
      {
        title: 'Video and audio',
        entries: [
          { key: 'video/compress', formats: 'MP4, MOV, WebM, MKV' },
          { key: 'audio/compress', formats: 'Any audio → MP3, AAC, Opus' },
        ],
      },
      {
        title: 'Files and data',
        entries: [
          { key: 'utilities/archive', formats: 'Any files → one ZIP' },
          { key: 'developer/json-minifier', formats: 'JSON, whitespace removed' },
        ],
      },
    ],
    note: 'JPEG, MP4 and ZIP are already compressed formats, so they may only shrink a little. If a result isn’t smaller, the tool tells you so you can keep your original.',
  },
};

export interface ResolvedEntry {
  tool: ToolMeta;
  formats: string;
}

/** The collection's tools (available ones only), grouped. */
export function resolveCollection(c: Collection): { title: string; entries: ResolvedEntry[] }[] {
  return c.groups
    .map((g) => ({
      title: g.title,
      entries: g.entries
        .map((e) => {
          const [category, slug] = e.key.split('/');
          const tool = getTool(category, slug);
          return tool && tool.status !== 'coming-soon' ? { tool, formats: e.formats } : null;
        })
        .filter((e): e is ResolvedEntry => Boolean(e)),
    }))
    .filter((g) => g.entries.length > 0);
}

export function collectionSize(c: Collection) {
  return resolveCollection(c).reduce((n, g) => n + g.entries.length, 0);
}
