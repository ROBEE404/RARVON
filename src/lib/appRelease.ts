import { isBenchApp } from '../engine/info';

/**
 * The Rarvon app (beta) download links. Set them at build time, like the
 * support links (see .env.example):
 *   VITE_APP_VERSION=0.1.0
 *   VITE_APP_WINDOWS_URL=https://github.com/you/bench/releases/download/v0.1.0/Rarvon-setup.exe
 *   VITE_APP_LINUX_APPIMAGE_URL=…/Rarvon.AppImage
 *   VITE_APP_LINUX_DEB_URL=…/bench.deb
 * While none is set, nothing on the site points to the app (no dead links);
 * the /app page can still be opened and says the beta is on its way.
 */
export const appRelease = {
  version: (import.meta.env.VITE_APP_VERSION ?? '').trim(),
  windows: (import.meta.env.VITE_APP_WINDOWS_URL ?? '').trim(),
  linuxAppImage: (import.meta.env.VITE_APP_LINUX_APPIMAGE_URL ?? '').trim(),
  linuxDeb: (import.meta.env.VITE_APP_LINUX_DEB_URL ?? '').trim(),
  /** Rough installer size, shown next to the button. */
  sizeMb: 100,
};

/**
 * True once at least one download is set: links to the app appear across the
 * site. Never inside the app itself (no "Get the app" in the app).
 */
export const appAvailable = Boolean(appRelease.windows || appRelease.linuxAppImage || appRelease.linuxDeb) && !isBenchApp();

export type AppSystem = 'windows' | 'linux' | 'other';

/** Which system this visitor is on, to offer the right download first. */
export function detectSystem(): AppSystem {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'other';
}
