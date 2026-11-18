// Configure optional support/donation links here. Leave any value as an
// empty string to hide that option — the SupportButton and Support page
// only render links that are actually configured. Nothing in the product
// requires these to be set.
//
// Links can be set two ways, in priority order:
//   1. Environment variables at build time (recommended for deployment):
//        VITE_SUPPORT_DONATION_URL=https://ko-fi.com/yourname
//        VITE_SUPPORT_SPONSORSHIP_URL=https://github.com/sponsors/yourname
//        VITE_SUPPORT_OTHER_URL=https://paypal.me/yourname
//   2. Editing the fallback strings below directly.
//
// This intentionally does not hard-code any specific provider (Ko-fi,
// Buy Me a Coffee, GitHub Sponsors, Patreon, PayPal...) — any URL works.
export const supportLinks = {
  /** Your Ko-fi page, e.g. https://ko-fi.com/yourname (VITE_SUPPORT_KOFI_URL). */
  kofi: import.meta.env.VITE_SUPPORT_KOFI_URL ?? '',
  donation: import.meta.env.VITE_SUPPORT_DONATION_URL ?? '',
  sponsorship: import.meta.env.VITE_SUPPORT_SPONSORSHIP_URL ?? '',
  other: import.meta.env.VITE_SUPPORT_OTHER_URL ?? '',
};

export function hasAnySupportLink(): boolean {
  return Object.values(supportLinks).some((v) => v.trim() !== '');
}

/**
 * The project's public code repository (VITE_PROJECT_REPO_URL), e.g.
 * https://github.com/you/bench. When set, the Support page offers
 * "Report a bug or ask for a tool" and "Star it on GitHub".
 */
export const projectRepo: string = (import.meta.env.VITE_PROJECT_REPO_URL ?? '').replace(/\/+$/, '');

/** Who makes Rarvon, shown on the About page. */
export const maker = {
  name: 'ROBEE',
  url: 'https://github.com/ROBEE404',
};

/**
 * Where people can email bug reports and tool requests (VITE_FEEDBACK_EMAIL),
 * e.g. bench.feedback@example.com. It is shown publicly, so use an address
 * made for Rarvon. When empty, the feedback pop-up offers GitHub only.
 */
export const feedbackEmail: string = (import.meta.env.VITE_FEEDBACK_EMAIL ?? '').trim();
