import { useEffect } from 'react';

/**
 * Colours the page's scroll bars with a category's colour while this page is
 * shown (e.g. orange on PDF tools), and puts the default back when it leaves.
 */
export function useScrollTint(category: string | undefined) {
  useEffect(() => {
    if (!category) return;
    const root = document.documentElement;
    root.style.setProperty('--scroll-tint', `var(--color-cat-${category})`);
    root.setAttribute('data-scroll-tint', category);
    return () => {
      root.style.removeProperty('--scroll-tint');
      root.removeAttribute('data-scroll-tint');
    };
  }, [category]);
}
