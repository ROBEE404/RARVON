# Rarvon for desktop (beta)

`bench-engine/` is the **Rarvon Engine**, a small Rust program (about 0.5 MB) with
no window of its own. It:

1. serves Rarvon's own pages from this computer, with no internet needed;
2. opens them in an Edge or Chrome **app window** (no tabs, no address bar);
3. runs the video and audio tools in **FFmpeg** on this computer, using the graphics card's encoder when
   there is one. Any size, and many more formats (AVI, WMV, FLV, MPEG…);
4. exits by itself when that window is closed.

## Run it

```bash
npm run build
```

```bash
cd desktop/bench-engine && cargo run --release
```

It finds the pages in a `web` folder next to the program, or `BENCH_WEB_DIR`,
or the site's `dist` folder while developing. It finds FFmpeg in an `ffmpeg` folder next to the program (or
in `bench-engine/ffmpeg/` while developing). Without FFmpeg, every tool runs the browser way.

## FFmpeg

FFmpeg isn't stored in this repository. Rarvon uses the **LGPL v3** Windows build from
[FFmpeg-Builds](https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases) (`ffmpeg-n9.0-latest-win64-lgpl-9.0.zip`).
Only `bin/ffmpeg.exe` and `LICENSE.txt` go in `bench-engine/ffmpeg/`. That build has no GPL parts (no x264
or x265). It makes H.264 with the graphics card (NVIDIA, AMD or Intel), Windows' own encoder, or OpenH264.
Rarvon keeps FFmpeg as a separate program, which the LGPL allows for closed-source software. The installer
must include FFmpeg's license and say where its source code is available.

## The Windows installer

```bash
npm run build:desktop
```

This builds the site and the engine, gathers them in `desktop/stage` (`Rarvon.exe`, `web/`, `ffmpeg/`,
`LICENSE.txt`), and makes `desktop/out/Rarvon-setup-<version>.exe` with
[Inno Setup 6](https://jrsoftware.org/isinfo.php). Inno Setup is a free build tool and isn't shipped
inside Rarvon. The version comes from `bench-engine/Cargo.toml`. The installer:

- installs for the current user only (`%LOCALAPPDATA%\Programs\Rarvon`), so no administrator prompt;
- adds a Start menu shortcut, an optional desktop shortcut, and "Rarvon (beta)" in Settings → Apps;
- offers its wizard in English or Arabic;
- shows `installer/license.txt` (free to use, all rights reserved, FFmpeg's LGPL notice);
- closes a running Rarvon before an update or uninstall. Uninstalling leaves nothing behind.

Opening Rarvon while it's already running opens another window of the same Rarvon.

To show the download buttons on the website, upload the installer (for example to GitHub Releases) and
build the site with `VITE_APP_VERSION` and `VITE_APP_WINDOWS_URL` set (see `src/lib/appRelease.ts`).
To preview them with pretend links, run `npx vite --mode appdemo` with a `.env.appdemo` file.

## Tests

```bash
npm run test:desktop
```

This builds the site and the engine, starts the engine without a window, and runs the real tool pages
against FFmpeg (`desktop/e2e`). AVI files go in, MP4, GIF and audio come out.

## Safety

- Listens on `127.0.0.1` only, so other computers can't reach it. It uses port 47821 when that's free (so the
  window remembers theme and language) and otherwise any free port.
- Answers only requests addressed exactly to `127.0.0.1:<port>`. This blocks "DNS rebinding", where a
  website pretends to be this computer.
- Serves files only from Rarvon's own folder. `..` and encoded tricks are refused.
- Every command ("still open", "goodbye", the FFmpeg jobs) needs a secret key, created fresh at every start
  and given only to Rarvon's own page.
- The page never sends FFmpeg commands or file paths. It sends a short job description, every field
  is checked against a fixed list (unknown fields are refused), and the engine builds the FFmpeg command
  itself.
- Files reach the engine only when you choose them in a tool. They're kept in one private temporary folder,
  known by random ids, and the folder is deleted when Rarvon closes. Results are deleted once handed over.
- Never reads files on its own.

## How it knows the window closed

The page sends "still open" every 5 seconds and "goodbye" as it closes. The engine exits 8 seconds
after a goodbye, unless the page says hello again (a reload). If the window goes silent for 3
minutes, the engine also exits; a minimized window may only check in once a minute. If no window
ever opens, it gives up after 90 seconds.

## Still to come

The website-connection question in the installer (off by default; it comes with that feature), signed
installers and updates, Linux packages, and
the app-only features: whole folders, the right-click menu, "Open with Rarvon", and saving beside the original.
