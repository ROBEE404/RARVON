/**
 * Parses a page selection like "1-3, 5, 8-6" into sorted, unique 1-based page
 * numbers within 1..max. Reversed ranges are accepted ("8-6" = 6,7,8); parts
 * that aren't numbers or ranges are ignored, as are pages outside the document.
 */
export function parsePageRange(input: string, max: number): number[] {
  const pages = new Set<number>();
  for (const part of input.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*[-\u2013]\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const [start, end] = a <= b ? [a, b] : [b, a];
    for (let p = Math.max(1, start); p <= Math.min(max, end); p++) pages.add(p);
  }
  return Array.from(pages).sort((x, y) => x - y);
}
