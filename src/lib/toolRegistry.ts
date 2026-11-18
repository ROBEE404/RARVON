export type ToolStatus = 'available' | 'coming-soon' | 'experimental';

/** Shown wherever a tool is flagged experimental — kept in one place so the wording stays consistent. */
export const EXPERIMENTAL_NOTE = 'This tool works, but hasn\u2019t been verified across every browser and device yet \u2014 results may vary depending on your specific browser\u2019s hardware video support.';

export type ToolAction = 'convert' | 'compress' | 'edit' | 'resize' | 'extract' | 'generate' | 'optimize' | 'analyze';

/** In the Rarvon app: which videos the video tools read. */
const APP_VIDEO_FORMATS = 'Almost any video: MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG, 3GP and more, at any size. In the Rarvon app, FFmpeg does the work on your computer, using your graphics card\u2019s video encoder when it has one.';
const APP_FORMATS_FAQ = { q: 'Which formats work?', a: APP_VIDEO_FORMATS };

export interface ToolMeta {
  slug: string;
  category: string;
  name: string;
  shortDescription: string;
  description: string;
  status: ToolStatus;
  comingSoonReason?: string;
  keywords: string[];
  /** Primary user intents this tool serves, used for cross-category search grouping (e.g. searching "compress" surfaces every compress-tagged tool regardless of category). */
  actions: ToolAction[];
  /** 'wide' opts a tool page out of the standard max-w-3xl article layout for tools that need a full document-workspace canvas (e.g. the PDF Editor). */
  layout?: 'wide';
  faq?: { q: string; a: string }[];
  /** In the Rarvon app, where FFmpeg does the work: text that differs from the website's. */
  app?: { description?: string; faq?: { q: string; a: string }[] };
}

export const actionMeta: { value: ToolAction; label: string; description: string }[] = [
  { value: 'convert', label: 'Convert', description: 'Change a file from one format to another.' },
  { value: 'compress', label: 'Compress', description: 'Make a file smaller.' },
  { value: 'edit', label: 'Edit', description: 'Modify, rearrange or annotate a file.' },
  { value: 'resize', label: 'Resize', description: 'Change dimensions or scale.' },
  { value: 'extract', label: 'Extract', description: 'Pull specific content out of a file.' },
  { value: 'generate', label: 'Generate', description: 'Create something new from scratch.' },
  { value: 'optimize', label: 'Optimize', description: 'Clean up or streamline a file.' },
  { value: 'analyze', label: 'Analyze', description: 'Inspect or understand a file\u2019s contents.' },
];

export interface CategoryMeta {
  slug: string;
  name: string;
  description: string;
  /** The description inside the Rarvon app, when it differs. */
  appDescription?: string;
}

export const categories: CategoryMeta[] = [
  { slug: 'pdf', name: 'PDF', description: 'Merge, split, compress and edit PDF files entirely in your browser.' },
  { slug: 'image', name: 'Image', description: 'Convert, compress, resize and edit images without uploading them anywhere.' },
  { slug: 'video', name: 'Video', description: 'Video processing tools. Most require heavier browser tech and are being rolled out carefully.', appDescription: 'Convert, compress, trim and resize videos on your computer, at any size.' },
  { slug: 'audio', name: 'Audio', description: 'Convert, trim and compress audio, or pull the soundtrack out of a video — all in your browser.', appDescription: 'Convert, trim and compress audio, or pull the soundtrack out of a video, all on your computer.' },
  { slug: 'developer', name: 'Developer', description: 'Everyday utilities for formatting, encoding and generating data.' },
  { slug: 'text', name: 'Text', description: 'Clean up, count and reshape text instantly.' },
  { slug: 'utilities', name: 'Utilities', description: 'Small, focused tools for everyday tasks.' },
];

export const tools: ToolMeta[] = [
  // PDF
  {
    slug: 'editor', category: 'pdf', name: 'PDF Editor',
    shortDescription: 'Annotate, sign, redact and rearrange a PDF — text in any direction, shapes, images and notes.',
    description: 'PDF Editor is a lightweight document editor: reorder, rotate, duplicate, delete or insert blank pages, and add text (including Arabic and other right-to-left scripts), freehand drawing, highlights, underlines, shapes and arrows, images, sticky-note comments and a signature, or redact sensitive areas — all in one place, entirely in your browser.',
    status: 'available', keywords: ['edit pdf', 'annotate pdf', 'pdf redaction', 'sign pdf online', 'pdf whiteout', 'add image to pdf', 'pdf comments', 'insert blank page', 'arabic pdf text'],
    actions: ['edit'],
    layout: 'wide',
    faq: [
      { q: 'Does this edit the original PDF text?', a: 'No. This adds new content \u2014 text boxes, drawings, highlights, a signature \u2014 on top of your PDF, the same way a sticky note or a printed annotation would. Rewriting the PDF\u2019s own existing text isn\u2019t supported yet; that\u2019s a much harder problem this tool doesn\u2019t pretend to solve.' },
      { q: 'Can I add Arabic or other non-Latin text?', a: 'Yes. Latin, Cyrillic and Greek text is embedded as real, selectable text. Arabic, Persian and Urdu are shaped exactly as your browser shows them — joined letters, right-to-left order, mixed with English words and numbers — and embedded as vector outlines, so they print sharply but can’t be selected as text. Scripts without a bundled font (Chinese, Japanese, Korean, Hindi…) are embedded as a high-resolution image of the text.' },
      { q: 'What happens to sticky notes?', a: 'They are saved as standard PDF comments, so Acrobat, browser PDF viewers and most other readers show them as a note icon that opens to your text.' },
      { q: 'Is redaction actually secure?', a: 'Yes, for any page you redact: that page is flattened into an image on export, so the blacked-out content can\u2019t be recovered by selecting or extracting text from it. The trade-off is that the whole page\u2019s text stops being selectable, not just the redacted part \u2014 other pages are unaffected.' },
    ],
  },
  {
    slug: 'merge', category: 'pdf', name: 'Merge PDF',
    shortDescription: 'Combine multiple PDFs into one file.',
    description: 'Merge PDF joins several PDF files into a single document, in the order you arrange them. Your files are read and combined entirely on your device.',
    status: 'available', keywords: ['combine pdf', 'join pdf'],
    actions: ['edit'],
    faq: [{ q: 'Are my files uploaded anywhere?', a: 'No. Merging happens in your browser using WebAssembly-backed PDF libraries, so the files never leave your device.' }],
  },
  {
    slug: 'split', category: 'pdf', name: 'Split PDF',
    shortDescription: 'Break a PDF into individual pages or ranges.',
    description: 'Split PDF extracts each page, or a page range you choose, into separate PDF files you can download individually.',
    status: 'available', keywords: ['split pdf pages'],
    actions: ['edit', 'extract'],
  },
  {
    slug: 'compress', category: 'pdf', name: 'Compress PDF',
    shortDescription: 'Shrink file size by re-rendering pages at a lower quality.',
    description: 'Compress PDF re-renders each page as a compressed JPEG and rebuilds the PDF around it, trading a little sharpness for a smaller file. Best for scans and image-heavy documents; text stops being selectable in the output.',
    status: 'available', keywords: ['reduce pdf size', 'shrink pdf'],
    actions: ['compress'],
  },
  {
    slug: 'rotate', category: 'pdf', name: 'Rotate PDF',
    shortDescription: 'Rotate one or all pages of a PDF.',
    description: 'Rotate PDF lets you turn individual pages or the whole document by 90, 180 or 270 degrees.',
    status: 'available', keywords: ['turn pdf pages'],
    actions: ['edit'],
  },
  {
    slug: 'extract', category: 'pdf', name: 'Extract PDF Pages',
    shortDescription: 'Pull specific pages out into a new PDF.',
    description: 'Extract PDF Pages creates a new PDF containing only the pages you select from the original document.',
    status: 'available', keywords: ['extract pages'],
    actions: ['extract'],
  },
  {
    slug: 'delete-pages', category: 'pdf', name: 'Delete PDF Pages',
    shortDescription: 'Remove specific pages and keep the rest.',
    description: 'Delete PDF Pages removes the pages you choose and saves a new PDF with everything else intact and in order.',
    status: 'available', keywords: ['remove pdf pages'],
    actions: ['edit'],
  },
  {
    slug: 'reorder', category: 'pdf', name: 'Reorder PDF Pages',
    shortDescription: 'Drag pages into a new order.',
    description: 'Reorder PDF Pages lets you drag and drop thumbnails to change page order, then export the result.',
    status: 'available', keywords: ['rearrange pdf pages'],
    actions: ['edit'],
  },
  {
    slug: 'to-images', category: 'pdf', name: 'PDF to Images',
    shortDescription: 'Export each page as a PNG or JPG image.',
    description: 'PDF to Images renders every page of a PDF to a standalone image file you can download.',
    status: 'available', keywords: ['pdf to jpg', 'pdf to png'],
    actions: ['convert'],
  },
  {
    slug: 'to-text', category: 'pdf', name: 'PDF to Text',
    shortDescription: 'Extract the text of a PDF — with OCR for scanned pages.',
    description: 'PDF to Text pulls the text out of every page, keeping lines and paragraphs, and lets you edit, copy or download it as TXT or Markdown. Scanned pages with no text layer can be read with OCR — including Arabic — entirely on your device.',
    status: 'available', keywords: ['pdf to txt', 'extract text from pdf', 'copy text from pdf', 'scanned pdf ocr', 'arabic pdf text', 'تحويل pdf إلى نص'],
    actions: ['extract', 'convert'],
    faq: [
      { q: 'Why is the text from my scanned PDF empty?', a: 'Scanned PDFs are pictures of pages — there’s no text inside to extract. Use “Read scanned pages with OCR”: each scanned page is rendered and its text recognized on your device.' },
      { q: 'Does it keep the layout?', a: 'It keeps reading order, line breaks and paragraphs. Columns, tables and exact positioning become plain text; for those, the PDF Editor or PDF to Images keep the visual layout.' },
    ],
  },
  {
    slug: 'from-images', category: 'pdf', name: 'Images to PDF',
    shortDescription: 'Combine images into a single PDF.',
    description: 'Images to PDF lays out one or more images, one per page, into a new PDF file.',
    status: 'available', keywords: ['jpg to pdf', 'png to pdf'],
    actions: ['convert'],
  },
  {
    slug: 'metadata', category: 'pdf', name: 'PDF Metadata Viewer/Editor',
    shortDescription: 'View and edit title, author and other PDF metadata.',
    description: 'PDF Metadata Viewer/Editor reads the document information dictionary of a PDF and lets you edit and re-save it.',
    status: 'available', keywords: ['pdf properties', 'pdf author title'],
    actions: ['edit', 'analyze'],
  },
  {
    slug: 'page-numbers', category: 'pdf', name: 'Add Page Numbers',
    shortDescription: 'Stamp page numbers onto every page.',
    description: 'Add Page Numbers draws a page number in the corner or footer of every page, with a starting number and format you choose.',
    status: 'available', keywords: ['paginate pdf', 'number pdf pages'],
    actions: ['edit', 'generate'],
  },
  {
    slug: 'watermark', category: 'pdf', name: 'Add Watermark',
    shortDescription: 'Stamp repeating or centered text over every page.',
    description: 'Add Watermark overlays text — like "DRAFT" or "CONFIDENTIAL" — across every page, with control over size, angle, opacity and color.',
    status: 'available', keywords: ['stamp pdf', 'draft watermark'],
    actions: ['edit'],
  },
  {
    slug: 'sign', category: 'pdf', name: 'Sign PDF',
    shortDescription: 'Draw or upload a signature and place it on a page.',
    description: 'Sign PDF lets you draw a signature (or upload an image of one) and place it on any page. This adds a visual signature image to the document — it is not a cryptographic digital signature and doesn\u2019t provide legal signing guarantees.',
    status: 'available', keywords: ['esign pdf', 'add signature'],
    actions: ['edit'],
    faq: [{ q: 'Is this a legally binding digital signature?', a: 'No. This places an image of a signature onto the page, the same as printing, signing and rescanning a document. It doesn\u2019t use certificate-based cryptographic signing, so it won\u2019t satisfy processes that specifically require that.' }],
  },

  // Image
  {
    slug: 'convert', category: 'image', name: 'Image Converter',
    shortDescription: 'Convert JPG, PNG, WebP, TIFF, SVG and more to 13 formats.',
    description: 'Image Converter opens JPG, PNG, WebP, GIF, BMP, ICO, SVG, TIFF, TGA, PPM and ICNS files (plus AVIF, and HEIC in Safari) and saves them as PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF, ICO, ICNS, PSD, EPS, PS or ODG, all on your device.',
    status: 'available', keywords: ['jpg to png', 'png to jpg', 'webp converter', 'avif converter', 'heic to jpg', 'svg to png', 'tiff to jpg', 'png to ico', 'image to psd', 'tga to png', 'png to eps'],
    actions: ['convert'],
    faq: [
      { q: 'Why isn\u2019t my output format in the list?', a: 'A few formats are made by the browser itself (JPEG, PNG, WebP, AVIF), so they only appear where your browser can make them. AVIF in particular depends on the browser and its version. The rest (GIF, BMP, TIFF, ICO, ICNS, PSD, EPS, PS, ODG) are written by Rarvon and work everywhere.' },
      { q: 'Can I convert a photo to SVG?', a: 'No. SVG is a vector format and a photo is pixel data \u2014 turning one into the other isn\u2019t a format conversion, it\u2019s image tracing, which this tool doesn\u2019t attempt. SVG works the other direction: as an input, rendered to a raster format at a resolution you choose.' },
      { q: 'Why did my HEIC file fail to open?', a: 'Only Safari can open HEIC photos; Chrome, Edge and Firefox can\u2019t decode them yet. Exporting to JPEG from your phone\u2019s photo app first works around it. TIFF, TGA, PPM and ICNS open everywhere: Rarvon reads them itself.' },
    ],
  },
  {
    slug: 'compress', category: 'image', name: 'Image Compressor',
    shortDescription: 'Reduce image file size with adjustable quality.',
    description: 'Image Compressor re-encodes JPG, PNG or WebP images at a quality level you choose, so you can balance size against clarity.',
    status: 'available', keywords: ['reduce image size'],
    actions: ['compress'],
  },
  {
    slug: 'resize', category: 'image', name: 'Image Resizer',
    shortDescription: 'Resize images with a live preview and instant size estimate.',
    description: 'Image Resizer shows a live preview you can drag to resize, with exact width/height fields, percentage scaling, resolution and social-media presets, and an instantly updating file size estimate \u2014 computed by actually re-encoding at your current settings, not guessed.',
    status: 'available', keywords: ['scale image', 'resize photo', 'social media image size'],
    actions: ['resize'],
    faq: [
      { q: 'Is the file size shown exact?', a: 'It\u2019s a real encode of your image at the current width, height, format and quality \u2014 the same operation the download uses \u2014 so it\u2019s accurate for those settings. It\u2019s labeled an estimate only because it updates a moment after you stop adjusting, rather than on every single pixel of a drag.' },
    ],
  },
  {
    slug: 'crop', category: 'image', name: 'Image Cropper',
    shortDescription: 'Crop an image to a custom or fixed-ratio region.',
    description: 'Image Cropper lets you drag a selection over an image and export just that region.',
    status: 'available', keywords: ['cut image'],
    actions: ['resize', 'edit'],
  },
  {
    slug: 'rotate', category: 'image', name: 'Image Rotator',
    shortDescription: 'Rotate or flip an image.',
    description: 'Image Rotator turns an image by 90-degree increments or flips it horizontally or vertically.',
    status: 'available', keywords: ['flip image', 'turn image'],
    actions: ['edit'],
  },
  {
    slug: 'metadata', category: 'image', name: 'Image Metadata Viewer',
    shortDescription: 'Inspect EXIF and file metadata.',
    description: 'Image Metadata Viewer reads EXIF data (camera, GPS, timestamps) embedded in JPG files and displays it, without uploading the image anywhere.',
    status: 'available', keywords: ['exif viewer'],
    actions: ['analyze'],
  },
  {
    slug: 'remove-metadata', category: 'image', name: 'Remove EXIF Metadata',
    shortDescription: 'Strip EXIF data and download a cleaned copy.',
    description: 'Remove EXIF Metadata re-encodes an image without its EXIF block — camera model, GPS location, timestamps and the rest — and gives you a cleaned copy to download.',
    status: 'available', keywords: ['strip exif', 'remove gps data', 'scrub metadata'],
    actions: ['optimize', 'edit'],
    faq: [{ q: 'Does this guarantee every trace of metadata is gone?', a: 'It removes the EXIF/XMP/IPTC metadata blocks by re-drawing the image onto a canvas and re-encoding it, which strips this metadata by construction, since canvas output never carries it. It doesn\u2019t alter pixel data.' }],
  },

  {
    slug: 'remove-background', category: 'image', name: 'Background Remover',
    shortDescription: 'Cut out a person or object and get a transparent PNG.',
    description: 'Background Remover cuts the main object out of a photo automatically, or keeps exactly what you click, with a brush to fix edges by hand. Download a transparent PNG, put the object on a solid colour, or crop to it. The AI runs on your device; the picture is never uploaded.',
    status: 'experimental', layout: 'wide',
    keywords: ['remove background', 'background remover', 'transparent background', 'cut out', 'cutout', 'remove bg', 'png transparent', 'object extractor', 'إزالة الخلفية', 'حذف خلفية الصورة'],
    actions: ['edit'],
    faq: [
      { q: 'Is my picture uploaded?', a: 'No. The AI models run in your browser. The first time you use the tool, Rarvon downloads its model files from this site once and keeps them for offline use.' },
      { q: 'What is “High quality”?', a: 'A larger model that handles hair, fur and fine edges better. It downloads once (about 110 MB) and needs a browser and graphics card with WebGPU half-precision support, such as a recent Chrome or Edge on most computers. Where it isn’t available, the regular mode and the brush still work.' },
      { q: 'Which AI models does it use?', a: 'SlimSAM (a compact Segment Anything model, Apache-2.0) for automatic and click-to-select cut-outs, and BiRefNet lite (MIT) for high quality. Both are listed under Credits and licenses at the bottom of every page.' },
    ],
  },
  {
    slug: 'to-text', category: 'image', name: 'Image to Text (OCR)',
    shortDescription: 'Extract editable text from screenshots, scans and photos — Arabic, English and 15 more languages.',
    description: 'Image to Text reads the text in a screenshot, scanned page or photo of a document and gives it back as editable text you can review, search, copy or download. Arabic is fully supported, including right-to-left paragraphs mixed with English. Recognition runs on your device — the image is never uploaded.',
    status: 'available', keywords: ['ocr', 'image to text', 'extract text from image', 'arabic ocr', 'screenshot to text', 'scan to text', 'استخراج النص من الصورة', 'تحويل الصورة إلى نص'],
    actions: ['extract', 'convert'],
    layout: 'wide',
    faq: [
      { q: 'Is my image uploaded anywhere?', a: 'No. Text recognition (Tesseract, compiled to WebAssembly) runs in your browser. The first time you use a language, its recognition data (about 1–15 MB depending on the language) is downloaded from this site and then cached on your device.' },
      { q: 'How good is Arabic recognition?', a: 'On clear screenshots and scans, Arabic is read very accurately, including headings, punctuation, Western digits and English words mixed into Arabic sentences. Tilted images are straightened automatically. Two known weak spots: Eastern Arabic digits (٠–٩) are often misread, and handwriting is not supported. Very small or blurry text loses accuracy — a sharper or closer photo helps most.' },
      { q: 'Which languages are supported?', a: 'Arabic, English, Persian, Urdu, Kurdish (Kurmanji, Latin script), Turkish, French, German, Spanish, Italian, Portuguese, Russian, Chinese (Simplified and Traditional), Japanese, Korean and Hindi. Sorani Kurdish is not available yet because the recognition engine has no packaged model for it.' },
      { q: 'My image is sideways or upside down.', a: 'Use the rotate buttons above the image, then Re-run OCR. Small tilts are corrected automatically.' },
    ],
  },

  // Video
  {
    slug: 'trim', category: 'video', name: 'Trim Video',
    shortDescription: 'Cut a video down to a start and end point.',
    description: 'Trim Video cuts an MP4, MOV, WebM or MKV video to a start and end time using WebCodecs, entirely in your browser. When possible it copies the existing encoded video without re-compressing it, so quality is unchanged.',
    status: 'experimental', keywords: ['cut video', 'video clip'],
    actions: ['edit'],
    app: {
      description: 'Trim Video cuts a video to a start and end time on your computer. When it can, it copies the existing video without re-compressing it, so quality is unchanged.',
      faq: [APP_FORMATS_FAQ, { q: 'Why does my clip start a little early?', a: 'When the video is copied without re-compressing, a cut can only start on a full picture (a keyframe), so Rarvon starts at the one just before your start time. Videos usually have one every few seconds.' }],
    },
    faq: [{ q: 'Which formats work?', a: 'MP4, MOV, WebM and MKV files with the codecs your browser can decode \u2014 in practice H.264, VP8, VP9 and AV1 video almost everywhere, HEVC mostly on Apple devices. This uses WebCodecs, the browser\u2019s own hardware-accelerated encoders, instead of a 30 MB FFmpeg download; the trade-off is that a few exotic codecs (and very large files over 250 MB) aren\u2019t supported.' }],
  },
  {
    slug: 'editor', category: 'video', name: 'Video Editor',
    shortDescription: 'Cut, join and caption videos on a simple timeline.',
    description: 'Video Editor is a simple timeline editor: put videos and pictures in order, trim and split clips, remove or lower a clip’s sound, add music and text, change speed, fade in and out, pick 16:9, 9:16 or 1:1, and export an MP4. Projects auto-save in your browser or to a folder, and can be downloaded as a project file.',
    status: 'experimental', keywords: ['video editor', 'edit video', 'cut video', 'join videos', 'merge videos', 'remove audio from video', 'mute video', 'add music to video', 'add text to video', 'timeline'],
    actions: ['edit'],
    faq: [
      { q: 'Where are my projects saved?', a: 'With auto-save on, in a private storage area this browser keeps for Rarvon on your device, until you delete the project or clear the browser’s site data. In Chrome and Edge you can also save to a folder on your computer, and in any browser you can download a .rarvonvideo project file to open later.' },
      { q: 'What happens if I close the tab?', a: 'If you changed the project, the browser asks before closing. If you leave anyway, Rarvon keeps a recovery copy and asks what to do with it the next time you open the Video Editor.' },
      { q: 'Which files can I use?', a: 'MP4, MOV, WebM and MKV videos with codecs your browser can decode, common picture formats, and MP3, M4A, WAV, FLAC or OGG audio. Exports are MP4 (H.264 and AAC) at 720p or 1080p, 30 frames per second.' },
    ],
  },
  {
    slug: 'resolution', category: 'video', name: 'Change Video Resolution',
    shortDescription: 'Scale a video up or down.',
    description: 'Change Video Resolution re-encodes an MP4, MOV, WebM or MKV video at a new width and height using WebCodecs, with common presets or exact dimensions.',
    status: 'experimental', keywords: ['downscale video', 'video resize'],
    actions: ['resize'],
    app: {
      description: 'Change Video Resolution re-encodes a video at a new width and height on your computer, with common presets or exact dimensions.',
      faq: [APP_FORMATS_FAQ],
    },
  },
  {
    slug: 'convert', category: 'video', name: 'Video Converter',
    shortDescription: 'Convert MOV, MKV, MP4 and WebM to MP4, MOV, WebM, MKV or GIF.',
    description: 'Video Converter turns MOV, MKV, MP4 or WebM videos into MP4 (plays everywhere), MOV, WebM, MKV, smaller MP4 with HEVC or WebM with AV1, or a short animated GIF. Each format appears only if this browser can actually make it.',
    status: 'experimental', keywords: ['mp4 to webm', 'webm to mp4', 'mov to mp4', 'mkv to mp4', 'mp4 to mov', 'mp4 to mkv', 'video to gif', 'mp4 to gif', 'hevc', 'av1'],
    actions: ['convert'],
    app: {
      description: 'Video Converter turns almost any video (MP4, MOV, MKV, WebM, AVI, WMV and more) into MP4 (plays everywhere), MOV, WebM, MKV, smaller MP4 with HEVC or WebM with AV1, or a short animated GIF.',
      faq: [APP_FORMATS_FAQ, { q: 'Is GIF a video?', a: 'Not really: a GIF is a moving picture with no sound and only 256 colours, and it gets big quickly. It\u2019s great for short clips, reactions and memes. Pick a start, a length up to 15 seconds and a width, and Rarvon makes it frame by frame.' }],
    },
    faq: [{ q: 'Which formats work?', a: 'MP4, MOV, WebM and MKV files with the codecs your browser can decode \u2014 in practice H.264, VP8, VP9 and AV1 video almost everywhere, HEVC mostly on Apple devices. This uses WebCodecs, the browser\u2019s own hardware-accelerated encoders, instead of a 30 MB FFmpeg download; the trade-off is that a few exotic codecs (and very large files over 250 MB) aren\u2019t supported.' }, { q: 'Is GIF a video?', a: 'Not really: a GIF is a moving picture with no sound and only 256 colours, and it gets big quickly. It\u2019s great for short clips, reactions and memes. Pick a start, a length up to 15 seconds and a width, and Rarvon makes it frame by frame.' }],
  },
  {
    slug: 'compress', category: 'video', name: 'Video Compressor',
    shortDescription: 'Shrink a video with a size estimate before you start.',
    description: 'Video Compressor re-encodes an MP4, MOV, WebM or MKV video at a bitrate derived from the original (and optionally a lower resolution) using your device\u2019s video encoder, so the result is reliably smaller \u2014 with a size estimate up front.',
    status: 'experimental', keywords: ['shrink video', 'reduce video size'],
    actions: ['compress'],
    app: { faq: [APP_FORMATS_FAQ] },
  },

  // Developer
  {
    slug: 'json-formatter', category: 'developer', name: 'JSON Formatter',
    shortDescription: 'Pretty-print and validate JSON.',
    description: 'JSON Formatter indents and validates JSON, and points out the exact location of syntax errors.',
    status: 'available', keywords: ['json beautify', 'json validator'],
    actions: ['edit'],
  },
  {
    slug: 'json-minifier', category: 'developer', name: 'JSON Minifier',
    shortDescription: 'Strip whitespace from JSON.',
    description: 'JSON Minifier removes all unnecessary whitespace from JSON to produce the smallest valid output.',
    status: 'available', keywords: ['json compress'],
    actions: ['compress', 'optimize'],
  },
  {
    slug: 'base64', category: 'developer', name: 'Base64 Encoder/Decoder',
    shortDescription: 'Encode or decode Base64 text and files.',
    description: 'Base64 Encoder/Decoder converts text or files to and from Base64.',
    status: 'available', keywords: ['base64 converter'],
    actions: ['convert'],
  },
  {
    slug: 'url-encode', category: 'developer', name: 'URL Encoder/Decoder',
    shortDescription: 'Percent-encode or decode a URL or string.',
    description: 'URL Encoder/Decoder converts text to and from percent-encoded (URL-safe) form.',
    status: 'available', keywords: ['uri encode', 'percent encoding'],
    actions: ['convert'],
  },
  {
    slug: 'uuid', category: 'developer', name: 'UUID Generator',
    shortDescription: 'Generate random UUID v4 values.',
    description: 'UUID Generator creates one or many RFC-4122 version 4 UUIDs using the browser\u2019s cryptographically secure random number generator.',
    status: 'available', keywords: ['guid generator'],
    actions: ['generate'],
  },
  {
    slug: 'hash', category: 'developer', name: 'Hash Generator',
    shortDescription: 'Generate SHA-1, SHA-256 or SHA-512 hashes.',
    description: 'Hash Generator computes cryptographic hashes of text or files using the Web Crypto API.',
    status: 'available', keywords: ['sha256 generator', 'checksum'],
    actions: ['generate', 'analyze'],
  },
  {
    slug: 'timestamp', category: 'developer', name: 'Timestamp Converter',
    shortDescription: 'Convert between Unix timestamps and dates.',
    description: 'Timestamp Converter translates Unix timestamps to human-readable dates and back, in any timezone.',
    status: 'available', keywords: ['unix time converter'],
    actions: ['convert'],
  },
  {
    slug: 'color', category: 'developer', name: 'Color Converter',
    shortDescription: 'Convert colors between HEX, RGB and HSL.',
    description: 'Color Converter translates a color between HEX, RGB and HSL notation and shows a live preview.',
    status: 'available', keywords: ['hex to rgb', 'rgb to hsl'],
    actions: ['convert'],
  },
  {
    slug: 'jwt-decoder', category: 'developer', name: 'JWT Decoder',
    shortDescription: 'Decode a JSON Web Token\u2019s header and payload.',
    description: 'JWT Decoder splits a JSON Web Token into its header and payload and pretty-prints both as JSON. It does not verify the signature — it only decodes what\u2019s already readable without a secret key.',
    status: 'available', keywords: ['jwt decode', 'json web token', 'bearer token'],
    actions: ['analyze'],
    faq: [{ q: 'Does this verify the signature?', a: 'No. Verifying a signature needs the secret or public key used to sign it, which this tool never asks for. It only decodes the header and payload, which are just Base64URL-encoded JSON, not encrypted.' }],
  },
  {
    slug: 'regex-tester', category: 'developer', name: 'Regex Tester',
    shortDescription: 'Test a regular expression against sample text.',
    description: 'Regex Tester highlights matches and capture groups for a regular expression against text you provide, live as you type.',
    status: 'available', keywords: ['regular expression', 'regex match'],
    actions: ['analyze'],
  },

  // Text
  {
    slug: 'word-counter', category: 'text', name: 'Word Counter',
    shortDescription: 'Count words, characters, sentences and paragraphs.',
    description: 'Word Counter gives you a live count of words, characters, sentences, paragraphs and estimated reading time.',
    status: 'available', keywords: ['character counter'],
    actions: ['analyze'],
  },
  {
    slug: 'case-converter', category: 'text', name: 'Case Converter',
    shortDescription: 'Convert text to upper, lower, title or sentence case.',
    description: 'Case Converter switches text between UPPERCASE, lowercase, Title Case, Sentence case and camelCase.',
    status: 'available', keywords: ['uppercase lowercase'],
    actions: ['convert'],
  },
  {
    slug: 'text-cleaner', category: 'text', name: 'Text Cleaner',
    shortDescription: 'Strip extra whitespace, line breaks and formatting.',
    description: 'Text Cleaner trims extra spaces, collapses repeated line breaks and removes invisible formatting characters.',
    status: 'available', keywords: ['remove extra spaces'],
    actions: ['optimize'],
  },
  {
    slug: 'dedupe', category: 'text', name: 'Remove Duplicate Lines',
    shortDescription: 'Remove repeated lines from a list.',
    description: 'Remove Duplicate Lines de-duplicates a list of lines, optionally ignoring case and whitespace.',
    status: 'available', keywords: ['unique lines'],
    actions: ['optimize'],
  },
  {
    slug: 'sort-lines', category: 'text', name: 'Line Sorter',
    shortDescription: 'Sort lines alphabetically, numerically or by length.',
    description: 'Line Sorter reorders the lines of a text block alphabetically, numerically, by length, or randomly.',
    status: 'available', keywords: ['alphabetize lines'],
    actions: ['edit'],
  },

  // Audio
  {
    slug: 'trim', category: 'audio', name: 'Trim Audio',
    shortDescription: 'Cut an audio clip down to a start and end point.',
    description: 'Trim Audio lets you pick a start and end time and exports just that section as a lossless WAV file.',
    status: 'available', keywords: ['cut audio', 'audio clip'],
    actions: ['edit'],
  },
  {
    slug: 'convert', category: 'audio', name: 'Audio Converter',
    shortDescription: 'Convert audio to MP3, AAC (.m4a), Opus (.ogg) or WAV.',
    description: 'Audio Converter turns MP3, WAV, OGG, FLAC, M4A or Opus files into MP3, AAC (.m4a), Opus (.ogg) or lossless WAV on your device \u2014 typically in a second or two, not in real time.',
    status: 'available', keywords: ['audio format converter', 'wav to mp3', 'm4a to mp3', 'flac to mp3', 'mp3 converter'],
    actions: ['convert'],
    app: { faq: [{ q: 'How does MP3 export work without a server?', a: 'In the Rarvon app, FFmpeg makes the MP3 on your computer with the open-source LAME encoder. AAC and Opus sound a little better at the same size.' }] },
    faq: [{ q: 'How does MP3 export work without a server?', a: 'Browsers can play MP3 but have no built-in MP3 encoder, so Rarvon loads the open-source LAME encoder (compiled to WebAssembly) the first time you export an MP3. It runs entirely on your device (LAME is LGPL-licensed; see /licenses/LAME-LGPL-2.0.txt). AAC and Opus use the browser\u2019s own encoders and sound a little better at the same size.' }],
  },
  {
    slug: 'compress', category: 'audio', name: 'Audio Compressor',
    shortDescription: 'Shrink an audio file by re-encoding it at a lower bitrate.',
    description: 'Audio Compressor re-encodes an audio file as Opus, AAC or MP3 at a bitrate you choose \u2014 from near-transparent music quality down to small voice notes \u2014 with a size estimate before you start.',
    status: 'available', keywords: ['reduce audio size', 'shrink mp3'],
    actions: ['compress'],
  },
  {
    slug: 'extract', category: 'audio', name: 'Extract Audio',
    shortDescription: 'Pull the soundtrack out of a video file.',
    description: 'Extract Audio saves the soundtrack of an MP4, MOV, WebM or MKV video as an audio file. By default the audio is copied out without re-encoding \u2014 instant and identical in quality \u2014 or you can convert it to AAC, Opus or WAV.',
    status: 'available', keywords: ['video to audio', 'get audio from video', 'video to mp3', 'mp4 to m4a'],
    actions: ['extract'],
    app: {
      description: 'Extract Audio saves the soundtrack of almost any video as an audio file. By default the audio is copied out without re-encoding (instant and identical in quality), or you can convert it to AAC, Opus, MP3 or WAV.',
      faq: [{ q: 'Is the audio re-encoded?', a: 'Not with \u201cOriginal audio\u201d: the audio track is copied out of the video as-is (AAC into .m4a, Opus or Vorbis into .ogg, MP3 into .mp3), so it\u2019s instant and loses nothing. Other kinds of sound are saved as Opus.' }],
    },
    faq: [{ q: 'Is the audio re-encoded?', a: 'Not with \u201cOriginal audio\u201d: the audio track is copied out of the video as-is (AAC into .m4a, Opus or Vorbis into .ogg, MP3 into .mp3), so it\u2019s instant and loses nothing. For unusual video formats the browser can play but not unpack, it falls back to recording the audio while the video plays, which takes as long as the video.' }],
  },

  // Utilities
  {
    slug: 'qr', category: 'utilities', name: 'QR Code Generator',
    shortDescription: 'Turn text or a URL into a downloadable QR code.',
    description: 'QR Code Generator creates a scannable QR code from any text or URL, rendered directly in your browser.',
    status: 'available', keywords: ['generate qr code'],
    actions: ['generate'],
  },
  {
    slug: 'password', category: 'utilities', name: 'Password Generator',
    shortDescription: 'Generate strong random passwords.',
    description: 'Password Generator creates random passwords with the length and character sets you choose, using a cryptographically secure random source.',
    status: 'available', keywords: ['random password'],
    actions: ['generate'],
  },
  {
    slug: 'random-number', category: 'utilities', name: 'Random Number Generator',
    shortDescription: 'Generate random numbers in a range.',
    description: 'Random Number Generator produces one or many random integers or decimals within a range you set, using a cryptographically secure random source.',
    status: 'available', keywords: ['rng', 'random integer', 'dice roll'],
    actions: ['generate'],
  },
  {
    slug: 'url-shortener', category: 'utilities', name: 'URL Shortener',
    shortDescription: 'Shorten a long URL.',
    description: 'URL Shortener creates a short link for a long URL.',
    status: 'coming-soon',
    comingSoonReason: 'A real short link has to resolve from somewhere, which means a lookup server. We built the interface and the architecture to plug in a backend later, rather than faking a shortener that only works on your own device.',
    keywords: ['shorten link'],
    actions: ['generate'],
  },
  {
    slug: 'unzip', category: 'utilities', name: 'ZIP Extractor',
    shortDescription: 'Open a ZIP, see what’s inside and extract files.',
    description: 'ZIP Extractor opens a .zip archive on your device, lists every file with its folder and size, and lets you download single files, extract everything into a folder, or send a file straight to another Rarvon tool. Archives with Arabic or other non-Unicode file names from Windows are supported.',
    status: 'available', keywords: ['unzip', 'extract zip', 'open zip', 'zip viewer', 'فك الضغط', 'استخراج zip'],
    actions: ['extract'],
    faq: [
      { q: 'Can it open RAR, 7z or password-protected ZIPs?', a: 'Not yet. It reads standard ZIP archives (including .zip files created by Windows, macOS and most apps). Encrypted ZIPs, RAR and 7z need decoders that aren’t included.' },
      { q: 'Why are some file names garbled?', a: 'Older ZIP tools on Windows store names in the computer’s local encoding instead of Unicode. When that happens, pick the language the names were written in (for example Arabic) and the list is re-read.' },
    ],
  },
  {
    slug: 'archive', category: 'utilities', name: 'File Compressor',
    shortDescription: 'Bundle multiple files into a ZIP archive.',
    description: 'File Compressor adds any files you choose into a single ZIP archive, with an adjustable compression level, entirely in your browser. It won\u2019t shrink already-compressed formats much \u2014 ZIP can\u2019t compress what\u2019s already compressed \u2014 but it\u2019s useful for bundling files together regardless.',
    status: 'available', keywords: ['zip files', 'create zip', 'archive creator', 'compress files'],
    actions: ['compress', 'generate'],
    faq: [
      { q: 'Will this make my files much smaller?', a: 'It depends what\u2019s in them. Plain text, JSON, or uncompressed formats shrink well. Photos, videos, PDFs and other ZIPs are already compressed internally, so bundling them saves little beyond convenience \u2014 having one file instead of many.' },
      { q: 'What if two files have the same name?', a: 'If you don\u2019t rename one yourself, a number is added automatically (e.g. "photo (1).jpg") so both are kept in the archive rather than one silently overwriting the other.' },
    ],
  },
];

export function getTool(category: string, slug: string): ToolMeta | undefined {
  return tools.find((t) => t.category === category && t.slug === slug);
}

export function getCategory(slug: string): CategoryMeta | undefined {
  return categories.find((c) => c.slug === slug);
}

export function toolsForCategory(category: string): ToolMeta[] {
  return tools.filter((t) => t.category === category);
}

export function relatedTools(tool: ToolMeta, max = 3): ToolMeta[] {
  return tools
    .filter((t) => t.category === tool.category && !(t.category === tool.category && t.slug === tool.slug) && t.status !== 'coming-soon')
    .slice(0, max);
}

export const popularToolKeys = [
  'image/to-text', 'pdf/merge', 'pdf/compress', 'image/convert', 'image/compress',
  'developer/json-formatter', 'utilities/qr',
];
