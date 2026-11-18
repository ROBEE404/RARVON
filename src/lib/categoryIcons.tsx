import clsx from 'clsx';

/** Stroke paths (24×24) for each category. */
const PATHS: Record<string, string> = {
  pdf: 'M6 2h9l5 5v15H6z M15 2v5h5 M9 13h6 M9 17h4',
  image: 'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M15.5 8.5h.01',
  video: 'M3 5h14v14H3z M17 10l4-3v10l-4-3',
  audio: 'M4 10v4 M8 6v12 M12 3v18 M16 7v10 M20 10v4',
  developer: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.5 4l-3 16',
  text: 'M4 6V4h16v2 M12 4v16 M9 20h6',
  utilities: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 17.5h7 M17.5 14v7',
  recent: 'M12 7v5l3 2 M3 12a9 9 0 1018 0 9 9 0 00-18 0',
};

/** The category's hue as a CSS color (a token from index.css). */
export function categoryColor(category: string) {
  return PATHS[category] && category !== 'recent' ? `var(--color-cat-${category})` : 'var(--color-ink-2)';
}

/**
 * A small tinted tile with the category's icon. The hue is only used here, so
 * categories are recognisable at a glance without competing with the accent.
 */
export function CategoryIcon({ category, size = 32, className }: { category: string; size?: number; className?: string }) {
  const color = categoryColor(category);
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-grid shrink-0 place-items-center rounded-lg', className)}
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 13%, var(--color-paper))` }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={PATHS[category] ?? PATHS.utilities} />
      </svg>
    </span>
  );
}
