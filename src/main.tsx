import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted UI fonts (OFL-1.1): no request to Google Fonts. Each file covers
// one unicode-range subset, so browsers only download what a page uses.
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
// The RARVON wordmark in the top bar (Syne ExtraBold, OFL-1.1).
import '@fontsource/syne/800.css'
// Arabic interface font (only downloaded when Arabic text is on screen).
import '@fontsource/noto-sans-arabic/400.css'
import '@fontsource/noto-sans-arabic/500.css'
import '@fontsource/noto-sans-arabic/600.css'
import '@fontsource/noto-sans-arabic/700.css'
import './index.css'
import App from './App.tsx'
import { I18nProvider, loadArabic, storedLang } from './lib/i18n'

// Inside Rarvon for desktop: tell the Rarvon Engine this window is still open, so
// it closes itself once the window is gone (it needs no offline cache either).
const app = window.__BENCH_APP__
if (app) {
  const alive = () => fetch('/__bench/alive', { method: 'POST', headers: { 'X-Rarvon-Key': app.key } }).catch(() => undefined)
  void alive()
  setInterval(alive, 5000)
  // Closing (or reloading) says goodbye at once; a reload says hello again right after.
  window.addEventListener('pagehide', () => navigator.sendBeacon(`/__bench/bye?key=${app.key}`))
}

// Offline support (production builds only; see sw-template.js).
if (import.meta.env.PROD && !app && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

// After a new deploy, an open tab may ask for a tool chunk that no longer
// exists on the server: reload once to pick up the new version.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('bench-reloaded-for-update')) return
    sessionStorage.setItem('bench-reloaded-for-update', '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// The site opens in English; only a visitor who switched to Arabic gets it on load.
async function start() {
  const initialDict = storedLang() === 'ar' ? await loadArabic().catch(() => undefined) : undefined
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider initialDict={initialDict}>
        <App />
      </I18nProvider>
    </StrictMode>,
  )
}
void start()
