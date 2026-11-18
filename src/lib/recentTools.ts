const KEY = 'bench-recent-tools';
const MAX = 6;

/** Tool keys ("category/slug") the user opened most recently, newest first. Stored only in this browser. */
export function getRecentTools(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordToolVisit(key: string) {
  try {
    const next = [key, ...getRecentTools().filter((k) => k !== key)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode, blocked) — recents are a convenience only
  }
}
