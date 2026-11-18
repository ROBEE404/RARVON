import { useEffect } from 'react';

const SITE_NAME = 'Rarvon';
/** Public origin of the deployed site (e.g. https://bench.example). Optional; enables absolute canonical/OG URLs. */
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function setJsonLd(data: object | null) {
  let script = document.head.querySelector<HTMLScriptElement>('script[data-bench-jsonld]');
  if (!data) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.benchJsonld = '';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export interface PageMetaExtras {
  /** Structured data (schema.org JSON-LD) for this page. */
  jsonLd?: object | null;
}

/**
 * Sets the document title, description, canonical URL, Open Graph/Twitter
 * tags and optional JSON-LD for the current page. A client-only SPA: search
 * engines that run JavaScript (Google, Bing) pick these up; a small effect is
 * enough, without a head-management dependency.
 */
export function usePageMeta(title: string, description: string, extras: PageMetaExtras = {}) {
  const jsonLd = extras.jsonLd ? JSON.stringify(extras.jsonLd) : '';
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
    const url = `${SITE_URL || window.location.origin}${window.location.pathname}`;
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', `${SITE_URL || window.location.origin}/icons/icon-512.png`);
    setMeta('name', 'twitter:card', 'summary');
    setCanonical(url);
    setJsonLd(jsonLd ? JSON.parse(jsonLd) : null);
  }, [title, description, jsonLd]);
}

/** schema.org data for a tool page: a free WebApplication, plus its FAQ when it has one. */
export function toolJsonLd(tool: { name: string; description: string; faq?: { q: string; a: string }[] }, categoryName: string) {
  const origin = SITE_URL || window.location.origin;
  const app = {
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    url: `${origin}${window.location.pathname}`,
    applicationCategory: 'UtilitiesApplication',
    applicationSubCategory: categoryName,
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires JavaScript. Files are processed in the browser.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@type': 'Organization', name: SITE_NAME, url: origin },
  };
  const graph: object[] = [app];
  if (tool.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: tool.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
