import type { Project } from './types';
import { tr } from '../i18n';

/**
 * Where Video Editor projects live.
 *
 * 1. The browser copy, in the Origin Private File System (a private folder the
 *    browser keeps for this site on the device's disk; nothing is uploaded):
 *      video-projects/<id>/project.json
 *      video-projects/<id>/media/<mediaId>
 *    Every project always has one. With auto-save on it *is* the saved
 *    project; with auto-save off it is only a recovery copy, kept until the
 *    person decides what to do with the project.
 * 2. Optionally, a folder on the computer (File System Access API, Chrome and
 *    Edge) with the same layout, written on every change.
 * 3. A downloadable project file (.rarvonvideo, a ZIP with the same layout) that
 *    can be opened again in any browser.
 */

const ROOT = 'video-projects';
export const PROJECT_EXT = '.rarvonvideo';
/** Project files saved before the rename (Bench) still open. */
export const OLD_PROJECT_EXT = '.benchvideo';

type DirHandle = FileSystemDirectoryHandle;

export function browserStorageSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
}

export function folderSaveSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function root(): Promise<DirHandle> {
  const base = await navigator.storage.getDirectory();
  return base.getDirectoryHandle(ROOT, { create: true });
}

async function projectDir(id: string, create = false): Promise<DirHandle> {
  return (await root()).getDirectoryHandle(id, { create });
}

async function writeFile(dir: DirHandle, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readText(dir: DirHandle, name: string) {
  return (await (await dir.getFileHandle(name)).getFile()).text();
}

/** Asks the browser not to clear Rarvon's storage when the disk gets full. Best effort. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* not supported */
  }
}

// ---------- Browser copy ----------

export async function listProjects(): Promise<Project[]> {
  if (!browserStorageSupported()) return [];
  const out: Project[] = [];
  try {
    const r = await root();
    for await (const [name, handle] of (r as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      if (handle.kind !== 'directory') continue;
      try {
        out.push(JSON.parse(await readText(handle as DirHandle, 'project.json')) as Project);
      } catch {
        // A half-created project without project.json: remove it.
        await r.removeEntry(name, { recursive: true }).catch(() => undefined);
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProjectJson(p: Project) {
  const dir = await projectDir(p.id, true);
  await writeFile(dir, 'project.json', JSON.stringify(p));
}

export async function saveMediaFile(projectId: string, mediaId: string, file: Blob) {
  const dir = await (await projectDir(projectId, true)).getDirectoryHandle('media', { create: true });
  await writeFile(dir, mediaId, file);
}

export async function loadProject(id: string): Promise<Project> {
  return JSON.parse(await readText(await projectDir(id), 'project.json')) as Project;
}

/** The stored media files of a project (OPFS files are read from disk on demand, not loaded into memory). */
export async function loadMediaFiles(p: Project): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  const dir = await (await projectDir(p.id)).getDirectoryHandle('media', { create: true });
  for (const m of p.media) {
    try {
      files.set(m.id, await (await dir.getFileHandle(m.id)).getFile());
    } catch {
      /* missing media: the editor shows it as offline */
    }
  }
  return files;
}

export async function deleteProject(id: string) {
  await (await root()).removeEntry(id, { recursive: true }).catch(() => undefined);
  await forgetFolder(id);
}

export async function projectBytes(p: Project) {
  return p.media.reduce((n, m) => n + m.size, 0);
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

// ---------- Folder on the computer ----------

// Folder handles are kept in IndexedDB so the link survives a reload; the
// browser asks for permission again before Rarvon can write to it.
const DB = 'bench-video-editor';
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('folders');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('folders', mode);
    const req = fn(tx.objectStore('folders'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(projectId: string, dir: DirHandle) {
  await idbDo('readwrite', (s) => s.put(dir, projectId));
}
export async function getFolder(projectId: string): Promise<DirHandle | null> {
  try {
    return ((await idbDo('readonly', (s) => s.get(projectId))) as DirHandle | undefined) ?? null;
  } catch {
    return null;
  }
}
async function forgetFolder(projectId: string) {
  try {
    await idbDo('readwrite', (s) => s.delete(projectId));
  } catch {
    /* ignore */
  }
}

type PermissionHandle = DirHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export async function folderPermission(dir: DirHandle, ask: boolean): Promise<boolean> {
  const h = dir as PermissionHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!ask || !h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function pickFolder(): Promise<DirHandle | null> {
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
    return await picker({ mode: 'readwrite', id: 'bench-video-project' });
  } catch {
    return null; // cancelled
  }
}

export async function writeProjectToFolder(dir: DirHandle, p: Project, files: Map<string, File>, onlyJson = false) {
  await writeFile(dir, 'project.json', JSON.stringify(p, null, 1));
  if (onlyJson) return;
  const media = await dir.getDirectoryHandle('media', { create: true });
  for (const m of p.media) {
    const f = files.get(m.id);
    if (!f) continue;
    try {
      const existing = await (await media.getFileHandle(m.id)).getFile();
      if (existing.size === f.size) continue;
    } catch {
      /* not there yet */
    }
    await writeFile(media, m.id, f);
  }
}

export async function writeMediaToFolder(dir: DirHandle, mediaId: string, file: Blob) {
  const media = await dir.getDirectoryHandle('media', { create: true });
  await writeFile(media, mediaId, file);
}

export async function readProjectFolder(dir: DirHandle): Promise<{ project: Project; files: Map<string, File> }> {
  const project = JSON.parse(await readText(dir, 'project.json')) as Project;
  validate(project);
  const files = new Map<string, File>();
  const media = await dir.getDirectoryHandle('media', { create: true });
  for (const m of project.media) {
    try {
      files.set(m.id, await (await media.getFileHandle(m.id)).getFile());
    } catch {
      /* missing */
    }
  }
  return { project, files };
}

// ---------- Project file (.rarvonvideo) ----------

export async function projectFileBlob(p: Project, files: Map<string, File>, onProgress?: (f: number) => void): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify({ ...p, pendingChoice: false }, null, 1));
  for (const m of p.media) {
    const f = files.get(m.id);
    if (f) zip.file(`media/${m.id}`, f);
  }
  // Video and audio are already compressed, so store them as they are (fast).
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' }, (meta) => onProgress?.(meta.percent / 100));
}

export async function readProjectFile(file: File): Promise<{ project: Project; files: Map<string, File> }> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(tr("This isn't a Rarvon project file. Project files end in {0}.", { 0: PROJECT_EXT }));
  }
  const json = zip.file('project.json');
  if (!json) throw new Error(tr("This isn't a Rarvon project file. Project files end in {0}.", { 0: PROJECT_EXT }));
  const project = JSON.parse(await json.async('string')) as Project;
  validate(project);
  const files = new Map<string, File>();
  for (const m of project.media) {
    const entry = zip.file(`media/${m.id}`);
    if (entry) files.set(m.id, new File([await entry.async('blob')], m.name, { type: m.mime }));
  }
  return { project, files };
}

function validate(p: Project) {
  if (!p || p.version !== 1 || !p.timeline || !Array.isArray(p.media)) {
    throw new Error(tr("This project was made with a newer or unknown version of the editor."));
  }
}

/** Copies an opened project (from a file or folder) into the browser under a new id so it can be edited. */
export async function importProject(src: Project, files: Map<string, File>, opts: { browserSave: boolean; folderSave: boolean }) {
  const p: Project = { ...src, id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), browserSave: opts.browserSave, folderSave: opts.folderSave, pendingChoice: false, updatedAt: Date.now() };
  for (const m of p.media) {
    const f = files.get(m.id);
    if (f) await saveMediaFile(p.id, m.id, f);
  }
  await saveProjectJson(p);
  return p;
}

export function safeFileName(name: string) {
  return (name.trim() || 'Untitled project').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}
