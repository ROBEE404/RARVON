# Rarvon

A free, ad-free, account-free toolbox for everyday file and text tasks — PDF, image, developer, text and utility
tools that run entirely in your browser.

## Philosophy

- **Free forever** — no subscriptions, no paywalls
- **No ads** — no banners, popups, or "watch an ad to download"
- **No account** — nothing to sign up for
- **Local-first** — files are processed in your browser and never uploaded, whenever that's technically possible
- **Honest about limits** — if a tool genuinely needs a server (an FFmpeg-in-WASM pipeline, a real URL shortener),
  it's labeled "Coming Soon" with the real reason, instead of faking it or quietly uploading your file

## Stack

- **React 19 + TypeScript + Vite** — one lazy-loaded chunk per tool, so the homepage stays light and heavy
  libraries (pdfjs, the video engine) only load on the pages that use them
- **React Router** — one route per tool (`/tools/pdf/merge`), plus action pages (`/compress`, `/convert`, ...)
- **Tailwind CSS v4** — design tokens and light/dark themes in `src/index.css`
- **pdf-lib** (MIT) — create/edit PDFs · **pdfjs-dist** (Apache-2.0) — render PDF pages
- **@pdf-lib/fontkit** (MIT) + **bidi-js** (MIT) + **Noto Sans / Noto Sans Arabic** (OFL-1.1, via fontsource) — font
  shaping, bidirectional layout and fonts for PDF Editor text in any direction
- **@mediabunny/mp3-encoder** (MPL-2.0 wrapper around LAME, LGPL) — MP3 export, its own lazily-loaded chunk
- **mediabunny** (MPL-2.0) — MP4/WebM demux/mux on top of the browser's WebCodecs, for the video tools
- **tesseract.js** + **tesseract.js-core** (Apache-2.0) — OCR engine (WebAssembly) for Image to Text, with
  language models from **@tesseract.js-data/*** (Apache-2.0, Tesseract `tessdata_best` integer models)
- **upng-js** (MIT) + **pako** (MIT) — PNG palette compression, in a Web Worker
- **jszip** (MIT), **qrcode** (MIT), **exifr** (MIT) — ZIP creation, QR codes, EXIF reading

No backend. Every tool runs in the browser.

## Tools

| Category | Tools |
|---|---|
| PDF | Editor (text incl. Arabic/RTL, draw, highlight, underline, shapes/arrows, images, sticky-note comments, signature, redact; reorder/rotate/duplicate/delete/insert blank pages), Merge, Split, Compress, **PDF→Text (with OCR for scans)**, Rotate, Extract pages, Delete pages, Reorder, PDF→Images, Images→PDF, Metadata, Page numbers, Watermark, Sign |
| Image | **Image to Text (OCR)**, Convert, Compress (JPEG/WebP quality, PNG palette reduction), Resize (interactive), Crop, Rotate/flip, Metadata viewer, Remove EXIF |
| Video (experimental) | Trim, Change resolution, Convert (MOV/MKV/MP4/WebM → MP4 or WebM), Compress (source-relative bitrate, optional resolution cap) — WebCodecs via Mediabunny, cancellable, 250 MB limit |
| Audio | Trim (WAV), Convert (MP3 / AAC .m4a / Opus .ogg / WAV), Compress (Opus, AAC or MP3, 32–128 kb/s), Extract audio from video (direct copy or re-encode) — Mediabunny + WebCodecs, much faster than real time |
| Developer | JSON format/minify, Base64, URL encode, UUID, Hash, Timestamp, Color, JWT decoder, Regex tester |
| Text | Word counter, Case converter, Text cleaner, Remove duplicate lines, Line sorter |
| Utilities | File Compressor (create ZIP), ZIP Extractor (incl. legacy Arabic/Windows file names), QR code, Password, Random number, URL shortener (UI only — needs a server) |

Cross-cutting features: global search (⌘K), action pages, a Compress hub, light/dark/system theme, and **tool
chaining** — a tool's last result can be picked up by the next tool without re-uploading
(`src/lib/workspaceContext.tsx` + `DownloadButton`).

### Image to Text (OCR)

`src/lib/ocrEngine.ts` (Tesseract in a Web Worker, LSTM models) and `src/lib/ocrPreprocess.ts` (rotation, scaling,
grayscale/contrast, dark-background inversion, automatic deskew). All OCR files — worker, WASM cores and one
`<lang>.traineddata.gz` per installed `@tesseract.js-data/<lang>` package — are self-hosted under `/ocr/` by the
`ocrAssets` plugin in `vite.config.ts` and only downloaded when OCR runs (1–15 MB per language, then cached).
To add a language: `npm i -D @tesseract.js-data/<code>` and add it to `OCR_LANGUAGES`.

Arabic is handled as a first-class case: Arabic + English is read together for mixed text, and pure Arabic is
re-read with the Arabic model alone when no confident Latin words are found. Character error rates measured on
rendered test images: clean Arabic 0.5–1.5%, mixed Arabic/English 0.7%, tilted noisy photos 1–5%, dark-mode
screenshots ~4%, English 0%. Eastern Arabic digits (٠–٩) are a known weak spot of the Arabic model (~14% CER on a
digit-heavy sample); handwriting is not supported; Sorani Kurdish has no packaged model.

### Known limitations

- PDF Editor: Arabic-script text is exported as shaped vector outlines (exact, but not selectable); CJK/Devanagari
  text as an image of the text. Existing PDF text can't be edited, only annotated on top.
- Compress PDF rasterizes pages (text stops being selectable) and helps mainly with scanned/image-heavy PDFs.
- Video tools have been verified in Chromium only.



## Support / donations

Optional, never required, and it never unlocks anything. Set `VITE_SUPPORT_KOFI_URL` (your Ko-fi page) and,
optionally, `VITE_PROJECT_REPO_URL` (this repository, for "Report a bug" and "Ask for a tool") — see
`.env.example`. Without a Ko-fi link the Support page shows a calm "coming soon" note instead of a button.



## License

Rarvon is free to use, but it is **not open source**. Copyright (c) 2026 ROBEE — all rights reserved; see
[LICENSE](LICENSE). The code is public so people can see how it works and report bugs or ask for tools in the
issues; it may not be copied, modified or republished without permission, and pull requests are not accepted.

Rarvon is built on open-source libraries, which keep their own licenses: see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (also shipped at `/licenses/third-party.txt`).
