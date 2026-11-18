import { useId } from 'react';

/**
 * Rarvon's mark: an R whose bowl is a raven's head (amber beak, angry amber
 * eye with a white glint and a flicked brow), cut from three paper layers
 * (amber, violet, then the face). The face follows the theme through
 * --logo-body and --logo-shine (index.css): dark on light pages, light with a
 * white shine on dark pages. Matches design/brand/rarvon-final.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const lid = `rarvon-lid-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 68 68" aria-hidden="true" className={className}>
      <g fill="#F2A33A" transform="translate(3 3.2)"><Shape /></g>
      <g fill="#9B85FF" transform="translate(1.5 1.6)"><Shape /></g>
      <g fill="var(--logo-body)"><Shape /></g>
      <path d="M49 20 L62 25 L46 29 Z" fill="#F2A33A" />
      <path d="M11 10 H35 L44 18.5 L33 14.6 L19 13.4 L17 10 Z" fill="var(--logo-shine)" />
      <defs>
        <clipPath id={lid}><path d="M20 13.8 L46 21.6 V40 H20 Z" /></clipPath>
      </defs>
      <g clipPath={`url(#${lid})`}>
        <circle cx="34" cy="21" r="4.8" fill="#9B85FF" />
        <circle cx="33" cy="20" r="4.8" fill="#F2A33A" />
      </g>
      <circle cx="31.6" cy="19.8" r="1.35" fill="#ffffff" />
      <path d="M25.4 13.2 L28.6 15.4 Q34 15.8 39.8 19.5 Q33 17.6 27.4 16.2 Z" fill="#F2A33A" />
    </svg>
  );
}

function Shape() {
  return (
    <>
      <rect x="9" y="8" width="10" height="48" rx="2.5" />
      <path d="M9 8 H36 L49 20 L62 25 L46 29 L38 36 H9 Z" />
      <path d="M27 34 H39 L53 56 H41 Z" />
    </>
  );
}
