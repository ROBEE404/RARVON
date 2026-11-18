// A project open in the editor refreshes a timestamp every few seconds, so the
// projects page (maybe in another tab) doesn't treat it as abandoned.
const KEY = 'bench-video-open:';
const FRESH_MS = 12_000;

export function markOpen(id: string) {
  try {
    localStorage.setItem(KEY + id, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

export function clearOpen(id: string) {
  try {
    localStorage.removeItem(KEY + id);
  } catch {
    /* storage blocked */
  }
}

export function isOpenElsewhere(id: string) {
  try {
    const t = Number(localStorage.getItem(KEY + id));
    return Boolean(t) && Date.now() - t < FRESH_MS;
  } catch {
    return false;
  }
}

/** Files handed from the projects page to a new project (for "start a project with this video"). */
export const handoff: { files: File[] } = { files: [] };
