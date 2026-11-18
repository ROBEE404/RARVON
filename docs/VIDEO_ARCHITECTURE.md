# Video processing architecture — technical investigation

Status: **implemented.** The investigation below informed the decision (WebCodecs via Mediabunny,
not FFmpeg-WASM) and the four-tool MVP (Trim, Change Resolution, Convert, Compress) has since been
built at `src/tools/video/`. The bundle-size figure in §6/§8 was corrected after the fact to the
real, measured number from the production build, rather than left at the earlier estimate.

Researched August 2026. Cited sources are linked inline; version numbers and bundle sizes will drift
over time and should be re-checked before implementation.

---

## 1. Why FFmpeg-WASM needs `SharedArrayBuffer` — and why it might not

FFmpeg-WASM ships **two different cores**, and this distinction is the single most important fact
in this whole investigation:

| Core | Package | Needs `SharedArrayBuffer` / COOP+COEP? | Speed |
|---|---|---|---|
| Single-thread | `@ffmpeg/core` | **No** | Baseline (1×) |
| Multi-thread | `@ffmpeg/core-mt` | **Yes** | ~2× faster, uses multiple Web Workers |

The multi-thread core needs `SharedArrayBuffer` because that's how it shares one block of WASM
linear memory across several Web Workers so they can cooperate on one encode. Browsers disabled
`SharedArrayBuffer` by default after the 2018 Spectre disclosure, because it makes high-resolution
timing side-channel attacks easier — and re-enabled it only for pages that opt into **cross-origin
isolation** (COOP + COEP), which structurally prevents a malicious cross-origin document from
sharing a browsing context with yours.

**The single-thread core needs none of this.** It runs FFmpeg in one Web Worker with ordinary
`ArrayBuffer`s. It's slower — the maintainers' own numbers put it at roughly half the speed of the
multi-thread core — but it works in any modern browser with zero header changes.

**This changes the recommendation below:** we don't have to choose between "FFmpeg-WASM" and
"no video tools." We can ship the single-thread core with no hosting changes at all, and treat the
multi-thread core as a later, optional performance upgrade gated behind the header change.

## 2. Exact headers required (for the multi-thread core / any future SharedArrayBuffer use)

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Both must be present on the **document response** (the HTML page itself), not just on the WASM
file. `crossOriginIsolated` on `window` reports `true` only when both are set correctly; FFmpeg's
multi-thread core checks this and refuses to initialize otherwise.

A softer variant, `Cross-Origin-Embedder-Policy: credentialless`, exists and is less disruptive
(same-origin credentialed requests still work; only cross-origin ones need to opt in), but has
weaker browser support than `require-corp` and isn't universally accepted by every WASM-threading
library yet.

## 3. How these headers affect the rest of the application

`Cross-Origin-Opener-Policy: same-origin` isolates the page's browsing context group — no other
origin's window can hold a reference to it (breaks certain OAuth popup flows and cross-origin
`postMessage` patterns that rely on `window.opener`).

`Cross-Origin-Embedder-Policy: require-corp` is the more disruptive one: **every cross-origin
subresource the page loads — images, fonts, scripts, iframes — must explicitly opt in**, either via
a `Cross-Origin-Resource-Policy` response header from that resource's own server, or a CORS
response plus a `crossorigin` attribute on the tag loading it. Anything that doesn't opt in gets
silently blocked, not degraded — a blocked Google Font is a blank font-family fallback, a blocked
iframe is empty, a blocked image is a broken-image icon. This is the header that "quietly breaks
YouTube embeds, Stripe Checkout, and Google Sign-In" that keeps coming up in cross-origin-isolation
writeups, and it's the one that would actually bite us.

## 4. Can the current hosting/deployment setup support these headers?

The repo currently ships two static-hosting configs: `public/_redirects` (Netlify) and
`vercel.json` (Vercel). Both platforms support arbitrary custom response headers:

- **Netlify** — via a `_headers` file or `netlify.toml` `[[headers]]` blocks. Supported today,
  no changes needed to switch hosts.
- **Vercel** — via the existing `vercel.json`'s `headers` array (currently only has `rewrites`;
  adding a `headers` block is a small diff).
- **Cloudflare Pages** — via a `_headers` file, same syntax as Netlify.
- **GitHub Pages — does not support custom response headers at all**, and there's no roadmap
  commitment to add it (open feature request since at least 2022, still unresolved as of this
  writing). The only workaround is a service-worker trick (`coi-serviceworker`) that intercepts
  the *second* page load to inject the headers in software — it doesn't work on first load, adds
  its own service-worker complexity, and multiple implementers describe it as "hacky." **If this
  project is ever deployed to GitHub Pages, the multi-thread core and any other
  `SharedArrayBuffer`-dependent code must be avoided entirely,** or accept the service-worker
  workaround's rough edges.

Conclusion: **if we stick to Netlify, Vercel, or Cloudflare Pages, headers are not a blocker.**
If GitHub Pages is ever a target, they are.

## 5. Compatibility problems with the rest of the app

Checked against what the app actually does today:

- **External resources** — the app currently loads Google Fonts from `fonts.googleapis.com` /
  `fonts.gstatic.com` in `index.html`. Google Fonts does **not** send
  `Cross-Origin-Resource-Policy`, so under `require-corp` these requests would be blocked and the
  fonts would silently fail to load, falling back to system fonts. **Fix:** self-host the three
  font files (they're small, already used with `font-display: swap`) instead of relying on the
  Google Fonts CDN. This removes the dependency either way, which is good practice regardless.
- **Fonts (icon fonts / CDN fonts)** — none currently used beyond the above; SVG icons are inline,
  which is COEP-safe by construction.
- **Images** — all images are either same-origin (canvas-rendered) or user-provided blob URLs, both
  fine under COEP.
- **PWA / service worker** — not yet implemented (Priority 6). COEP and a service worker can
  coexist, but the service worker's own responses must also carry the right headers if it's
  intercepting navigation requests — something to build correctly from day one when we get to
  Priority 6, not retrofit.
- **Donation/support links** — these are plain `<a target="_blank">` navigations to external sites
  (Ko-fi, GitHub Sponsors, etc.), not embedded iframes or fetched resources, so COEP does not
  affect them at all.
- **Any future analytics** — a third-party analytics script loaded via `<script src="...">` from
  another origin would need that origin to serve `Cross-Origin-Resource-Policy: cross-origin`, or
  it gets blocked under COEP. Privacy-respecting, self-hosted, or first-party analytics (if ever
  added, per the "no tracking, no analytics unless genuinely necessary and privacy-respecting" rule
  already in place) avoids this entirely — another reason to keep analytics first-party if it's
  ever added.

**None of these are blockers, but self-hosting the fonts is a prerequisite** before any
`SharedArrayBuffer`-dependent code ships, not an afterthought.

## 6. Expected bundle size and loading impact

- **FFmpeg-WASM core (either single- or multi-thread): ~25–32 MB**, dominated by the compiled
  `ffmpeg-core.wasm` binary (`libavcodec`, `libavformat`, `libavfilter`, `libswscale`,
  `libswresample` all bundled in). This is two to three orders of magnitude larger than every other
  per-tool chunk in the app today — the largest existing chunk (`pdfjs`) is ~427 KB.
- This is why FFmpeg must be **lazy-loaded only on the video tool pages that need it**, cached
  after first load (the browser's HTTP cache handles this automatically; IndexedDB caching of the
  fetched WASM bytes is an extra optimization worth doing given the size), and never referenced
  from `toolComponents.tsx` in a way that could pull it into a shared chunk.
- By contrast, a **WebCodecs + Mediabunny** approach (see §8) has no comparable native binary
  payload. The real, measured number (see §8's update) is 423 KB / 105.75 KB gzipped as its own
  lazy-loaded chunk — comparable to the existing `pdfjs` chunk, not the "single-digit KB" this
  section originally speculated before the tool was actually built. Still roughly a 60-75×
  difference versus FFmpeg-WASM's ~25-32 MB, which is the comparison that actually matters for
  someone on a slow connection.

## 7. Expected RAM/CPU usage, especially on mobile

- FFmpeg-WASM has no streaming/chunked input path for most operations — **the entire input file
  must fit in WASM linear memory at once.** A few hundred MB input file is already a real risk on
  memory-constrained mobile devices; a 1–2 GB 4K file reliably crashes the tab on typical phones.
  WASM's hard memory ceiling is 4 GB (historically 1 GB in FFmpeg-WASM specifically), which a
  mobile browser will often refuse to grant in full anyway.
- The multi-thread core additionally pre-allocates a large **fixed 1 GB memory arena** on start
  (documented behavior — thread-safe memory growth isn't supported the way it is for single-thread
  WASM), which is a meaningful chunk of a phone's total RAM before any processing has happened.
- CPU-wise, FFmpeg-WASM runs entirely on the CPU with no GPU acceleration, so a phone's mobile SoC
  does real work per frame — noticeably hot, battery-draining, and slow compared to the same
  operation done with hardware-accelerated **WebCodecs**, which is reported at roughly 3–10× faster
  for common codecs like H.264 because it hands frames to the device's hardware encoder/decoder
  instead of a software-only WASM build.
- **Practical implication:** any FFmpeg-WASM-based tool needs an explicit file-size ceiling (e.g.
  reject or warn above ~150–250 MB) and a clear in-UI warning that very large files may fail or
  freeze the tab, rather than letting someone's phone silently choke on a birthday video.

## 8. Could WebCodecs handle the planned operations without FFmpeg-WASM?

**Yes, for the tools we actually need — and this is the most consequential finding of this
investigation.** WebCodecs (`VideoEncoder`/`VideoDecoder`, `AudioEncoder`/`AudioDecoder`) exposes
the browser's own hardware-accelerated codecs directly, with no `SharedArrayBuffer` or COOP/COEP
requirement at all — because it's a native browser API, not threaded WASM. Browser support is now
broad: Chrome/Edge 94+, Firefox 133+ (a comparatively recent addition), Safari 16.4+ for the core
API with codec coverage still expanding on Apple platforms.

The catch: WebCodecs is a **low-level primitive**. It decodes/encodes raw frames but has **no
built-in muxer or demuxer** — turning encoded chunks into a playable MP4/WebM file, or reading one
back out, is left entirely to userland. Hand-rolling that is a real project.

This is where **Mediabunny** (mediabunny.dev) fits in: a from-scratch, zero-dependency,
pure-TypeScript library built specifically to be the muxing/demuxing/orchestration layer on top of
WebCodecs. It reads and writes MP4, WebM, MOV, MP3, WAV, OGG, FLAC and more, and ships a
purpose-built **conversion API covering transcoding, resizing, rotation, cropping, resampling, and
trimming** — i.e. essentially the full list of tools this project wants.

**Update after actually building with it (real measurement, not estimate):** the earlier version of
this document repeated a community-sourced claim of "single-digit KB" for narrow usage. That was
wrong, or at least not what we got. After building the four MVP tools and running the real
production build, the shared `videoEngine.ts` module (which wraps `Input`/`Output`/`Conversion`
from Mediabunny) bundles to **423 KB (105.75 KB gzipped)** as its own lazy-loaded chunk — comparable
in size to the `pdfjs` chunk this project already ships (427 KB / 127 KB gzipped). The npm
package's own minified bundle is 658 KB, so some tree-shaking clearly happened, but MP4/WebM
demuxing and muxing, WebCodecs orchestration, and the conversion pipeline is inherently substantial
code, not a few kilobytes. The comparison that actually matters is unchanged: **423 KB vs. FFmpeg-WASM's
~25-32 MB binary payload is still roughly a 60-75x difference**, and this chunk only loads on the
four video tool pages (confirmed via the lazy `import()` pattern already used for every other
per-tool dependency), not on the homepage or any other route.

**Recommendation: use WebCodecs via Mediabunny as the primary video engine, not FFmpeg-WASM,
for the tools in the minimum viable set (§13 below).** This sidesteps essentially every problem
raised in §1–7: no header changes, no font/CDN compatibility fallout, dramatically smaller download
than FFmpeg-WASM (even if larger than initially estimated), hardware-accelerated (faster, cooler,
better battery life on mobile), and no FFmpeg licensing question to navigate (see §12). FFmpeg-WASM's
remaining edge is genuine codec breadth — formats or codecs WebCodecs doesn't expose on a given
browser/OS (some AV1 encode paths, some older or more obscure containers) — which matters for a
"handle absolutely anything" tool but not for the focused MVP set below.

## 9. Which containers/codecs can realistically be supported client-side

Via WebCodecs (hardware-dependent, varies by browser/OS/device — always feature-detect, never
assume):

- **Video decode:** H.264/AVC (near-universal), VP8/VP9 (near-universal), AV1 (broad decode
  support), HEVC/H.265 (Apple platforms strong, elsewhere inconsistent and license-encumbered)
- **Video encode:** H.264 (near-universal), VP8/VP9 (broad), AV1 (hardware encoder support still
  catching up across devices), HEVC (mostly Apple platforms, and it's patent-encumbered — avoid
  building around it)
- **Audio (already covered in the Audio category we shipped):** Opus (best default), AAC (broad),
  MP3 decode (broad; encode is the thing we deliberately deferred — see §14), Vorbis, FLAC
- **Containers, via Mediabunny:** MP4/MOV read+write, WebM read+write, WAV, MP3, OGG, FLAC, and
  HLS reading

Given WebCodecs' hardware dependency, **the honest UX move is to feature-detect at runtime**
(`VideoEncoder.isConfigSupported(...)`) and show a specific "this codec isn't available on your
device/browser" message rather than a generic failure — the same pattern already used for
`MediaRecorder`/`captureStream` in the Audio category.

## 10. Which operations should stay "Coming Soon"

Given everything above, operations that should **not** ship yet:

- **Anything requiring HEVC encoding** — patent/licensing complexity plus inconsistent hardware
  support outside Apple platforms.
- **AV1 encoding** — hardware encoder support is still uneven enough across real-world devices
  (especially older or budget Android phones) that it would fail unpredictably.
- **Arbitrary/exotic container support** (e.g. MKV, obscure legacy codecs) — Mediabunny's format
  list is generous but not universal, and this is exactly the "some formats need FFmpeg's breadth"
  gap noted in §8. Not worth pulling in FFmpeg-WASM's 30 MB for the long tail.
- **Very large files** (rough ceiling ~150–250 MB, see §7) — should be blocked with a clear message
  rather than silently attempted.
- **Anything genuinely requiring the multi-thread FFmpeg-WASM core** — since that's the one part of
  this whole investigation that *does* require the COOP/COEP header change. Not worth doing until
  there's a concrete operation WebCodecs/Mediabunny can't handle that justifies it.

## 11. Loading video-processing code only on video pages

The existing architecture already solves this generically — `src/lib/toolComponents.tsx` maps
`category/slug` to a `React.lazy()`-wrapped import, so a tool's code (and anything it imports, like
`pdfjs-dist` for PDF tools) only loads when that tool's route is visited. The same pattern applies
directly to video: `import('../tools/video/trim')` pulls in Mediabunny only when someone opens the
Trim Video page, exactly like `import('../tools/pdf/merge')` pulls in `pdf-lib` today. No changes
to the routing/lazy-loading architecture are needed — this part is already future-proof.

The one new consideration: if the multi-thread FFmpeg-WASM core is ever added later, the
COOP/COEP headers would have to apply **site-wide** (they're response headers on every document,
not something a single route can opt into alone in a client-rendered SPA), so that decision affects
the whole app's font/resource strategy the moment it's made — worth deferring until there's a
concrete reason.

## 12. Licensing

- **Mediabunny** — verified directly against the published npm package (not just secondary
  research): **MPL-2.0** (Mozilla Public License 2.0), confirmed via `npm view mediabunny license`
  and by checking `node_modules/mediabunny/package.json` after installing. `npm ls mediabunny` shows
  it has **zero transitive runtime dependencies** — its only two listed `dependencies` are
  `@types/dom-webcodecs` and `@types/dom-mediacapture-transform`, both MIT, both ambient TypeScript
  type declarations that contribute no runtime code to the bundle. MPL-2.0 is a *file-level weak
  copyleft* license: free to use in closed-source/commercial products; the copyleft only triggers if
  you modify Mediabunny's own source files and distribute that modified version, in which case those
  specific modified files (not your surrounding app) must stay MPL-2.0. Using it unmodified as an
  npm dependency, as this project does, has no impact on how the rest of the codebase can be
  licensed. This is compatible with a future commercial version.
- **FFmpeg-WASM (`@ffmpeg/ffmpeg` wrapper)** — MIT. But the actual **compiled FFmpeg core
  (`@ffmpeg/core` / `@ffmpeg/core-mt`) follows FFmpeg's own upstream licensing, which is LGPL by
  default and GPL if certain non-default codecs are compiled in.** This needs the same
  "unmodified, separately-loadable dependency" treatment described for MP3 in §14 if it's ever
  added — not a blocker, but not a "just add it" MIT dependency either. Worth re-checking exactly
  which FFmpeg build config a chosen `@ffmpeg/core` package used before shipping it commercially.
- **WebCodecs itself** — a browser API, not a library; no license to consider.

## 13. Recommended approach

1. **Do not add FFmpeg-WASM.** Use **WebCodecs via Mediabunny** for the video tools in the MVP set.
   No COOP/COEP header change, no 30 MB download, hardware-accelerated, MPL-2.0 (commercial-safe).
2. **Self-host the three Google Fonts files** before shipping any video tool, regardless of the
   above — it's a prerequisite for staying COEP-compatible if we ever do add
   `SharedArrayBuffer`-dependent code later, and it's a minor reliability improvement either way.
3. **Feature-detect codec support per operation** (`VideoEncoder.isConfigSupported`) and show a
   specific, honest message when a device/browser combination can't do what was asked, the same
   pattern already used for the Audio category's `MediaRecorder` checks.
4. **Enforce a file-size ceiling** (~150–250 MB) with a clear message, given the "whole file must
   fit in memory" constraint that applies to both approaches.
5. **Leave HEVC encode, AV1 encode, and exotic containers as "Coming Soon"** with the real reason
   stated, not attempted and silently degraded.
6. **Revisit FFmpeg-WASM only if a specific, real operation genuinely needs its codec/container
   breadth** — and if so, reach for the **single-thread core first** (`@ffmpeg/core`, no headers
   needed at all), only escalating to the multi-thread core (and the site-wide COOP/COEP change)
   if the single-thread core's speed is demonstrably a problem in practice.

## Risks

- **Hardware/browser inconsistency is the main ongoing risk**, not licensing or bundle size — the
  same operation can succeed on one person's laptop and fail on another's older phone, purely based
  on what hardware codecs are exposed. This needs to be surfaced honestly in the UI, every time,
  not hidden.
- **Mediabunny is a comparatively young, single-maintainer-funded-by-sponsors project** (per its own
  README) relative to FFmpeg's decades of hardening — worth monitoring for maintenance health
  before leaning on it heavily, though its zero-dependency, from-scratch design and MPL-2.0 license
  make it low-risk to vendor or fork if that ever became necessary.
- **Large files remain a hard limit either way** — no client-side approach here changes the "whole
  file in memory" constraint; a genuine "handle huge 4K files" feature would need a server, which
  is explicitly out of scope for this product.

## Minimum viable video tool set (first pass, pending your go-ahead)

In rough order of how directly they map to what Mediabunny's conversion API already does:

1. **Trim Video** — cut to a start/end point, no re-encode needed for many cases (can remux at
   keyframes), falls back to re-encode when a frame-accurate cut is requested.
2. **Change Video Resolution** — decode → scale → re-encode via WebCodecs.
3. **Video Converter** (a focused subset: MP4 ⇄ WebM, H.264/VP9) — not "any format to any format,"
   explicitly scoped to the containers/codecs from §9.
4. **Video Compressor** — re-encode at a lower bitrate/resolution, same pattern as the Audio
   Compressor already shipped.

Deliberately **not** in the first pass: Extract Frames and anything implying more advanced editing
(already partially covered by the existing Audio → Extract Audio tool for the audio-only case) —
worth a second pass once the above four are proven out.

---

## 14. Revisiting the MP3 decision from the Audio batch

The earlier claim ("MP3 encoders are LGPL, therefore can't be used commercially") was an
overstatement. Here's the specific landscape:

**Encoders considered:**

| Package | What it is | License |
|---|---|---|
| `lamejs` / `@breezystack/lamejs` | Pure-JS transpile of LAME | **LGPL-3.0** |
| `lamejs-node` / `iso-lamejs` | Same lineage, packaged differently | **LGPL-3.0** |
| `mp3-lame-encoder-js` (higuma) | LAME compiled via Emscripten | **LGPL** (follows LAME) |
| `@mediabunny/mp3-encoder` | MPL-2.0 wrapper *around* a WASM build of LAME | Wrapper: **MPL-2.0**; encoder engine inside: **LGPL** |

Every realistic client-side MP3 *encoder* traces back to the LAME codebase, and LAME is LGPL. There
isn't a permissively-licensed MP3 encoder to route around this — the LGPL exposure is inherent to
"encode MP3 in the browser," not a specific package's choice.

**What LGPL actually requires (it is not "no commercial use"):** LGPL permits use in closed-source,
commercial products. The obligations are about how the LGPL-licensed component itself is
distributed, not about the rest of the application:

- The LGPL component must remain separately identifiable and swappable — i.e. don't bundle/minify
  it into the same file as proprietary code such that it can't be told apart or replaced. Loading
  it as its own lazy-loaded chunk (which is exactly how this project already lazy-loads every
  per-tool dependency) satisfies this naturally.
- Its source (or a pointer to where to get it) must be made available.
- Users must be able to replace the LGPL component with a modified version and still have the
  application work with it (practically: don't obfuscate it beyond recognition or hard-code
  assumptions that prevent swapping it).
- Attribution/notice requirements from the license text.

This is the same model commercial products have used for decades with dynamically-linked LGPL
libraries (e.g. shipping FFmpeg itself, which is LGPL by default). The JS-module equivalent of
"dynamic linking" is importing it as an unmodified npm dependency in its own chunk — which is how
this project already structures every tool.

**Decision: still not adding MP3 for now, per your instruction** — but not because of an absolute
licensing bar. If it's added later, the concrete path is: `@mediabunny/mp3-encoder` (or equivalent),
kept as an unmodified dependency in its own lazy-loaded chunk (already the app's pattern), with a
license/attribution note added to the eventual `THIRD_PARTY_LICENSES` list this project doesn't
have yet but should before shipping any LGPL component. That's a small, well-understood task
whenever it's prioritized — not a redesign.
