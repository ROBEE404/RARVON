import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem, Project, Timeline } from '../../../lib/videoEditor/types';
import { hasEdits } from '../../../lib/videoEditor/types';
import {
  loadProject, loadMediaFiles, saveProjectJson, saveMediaFile, getFolder, folderPermission,
  writeProjectToFolder, writeMediaToFolder, rememberFolder, pickFolder,
} from '../../../lib/videoEditor/storage';
import { probeMedia } from '../../../lib/videoEditor/media';
import { markOpen, clearOpen } from './openLock';

export type FolderStatus = 'off' | 'ok' | 'needs-permission' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const HISTORY_LIMIT = 100;

/** Editor state for one project: loading, undo/redo, auto-save and folder sync. */
export function useEditor(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [folderStatus, setFolderStatus] = useState<FolderStatus>('off');
  const [dirty, setDirty] = useState(false); // edited during this visit
  const [importing, setImporting] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const past = useRef<Timeline[]>([]);
  const future = useRef<Timeline[]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const folder = useRef<FileSystemDirectoryHandle | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;
  const filesRef = useRef(files);
  filesRef.current = files;

  // ---- Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await loadProject(projectId);
        const f = await loadMediaFiles(p);
        if (cancelled) return;
        const u = new Map<string, string>();
        f.forEach((file, id) => u.set(id, URL.createObjectURL(file)));
        setFiles(f);
        setUrls(u);
        setProject(p);
        setSaveStatus('saved');
        if (p.folderSave) {
          const dir = await getFolder(p.id);
          if (!dir) setFolderStatus('needs-permission');
          else if (await folderPermission(dir, false)) {
            folder.current = dir;
            setFolderStatus('ok');
          } else {
            folder.current = dir;
            setFolderStatus('needs-permission');
          }
        }
      } catch {
        if (!cancelled) setLoadError("This project couldn't be opened. It may have been deleted or the browser cleared its storage.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Object URLs live as long as the editor is open (clips keep using them); release them on leave.
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Tell other tabs this project is open, so they don't offer to "recover" it.
  useEffect(() => {
    markOpen(projectId);
    const t = window.setInterval(() => markOpen(projectId), 4000);
    return () => {
      window.clearInterval(t);
      clearOpen(projectId);
    };
  }, [projectId]);

  // ---- Persist (debounced) to the browser copy and the folder.
  const saveTimer = useRef<number | undefined>(undefined);
  const persist = useCallback((p: Project) => {
    window.clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = window.setTimeout(async () => {
      try {
        await saveProjectJson(p);
        if (p.folderSave && folder.current && folderStatusRef.current === 'ok') {
          await writeProjectToFolder(folder.current, p, filesRef.current, true).catch(() => setFolderStatus('error'));
        }
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 400);
  }, []);
  const folderStatusRef = useRef(folderStatus);
  folderStatusRef.current = folderStatus;

  /** Writes the project now (used before leaving). */
  const flush = useCallback(async (p: Project) => {
    window.clearTimeout(saveTimer.current);
    await saveProjectJson(p);
    if (p.folderSave && folder.current && folderStatusRef.current === 'ok') await writeProjectToFolder(folder.current, p, filesRef.current, true);
    setSaveStatus('saved');
  }, []);

  const update = useCallback((fn: (p: Project) => Project, opts: { edit?: boolean } = {}) => {
    const cur = projectRef.current;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: Date.now() };
    if (opts.edit !== false) {
      next.pendingChoice = true;
      setDirty(true);
    }
    projectRef.current = next;
    setProject(next);
    persist(next);
  }, [persist]);

  // ---- Timeline edits with undo/redo. `commit: false` is for live drags (one history step on release).
  const dragBase = useRef<Timeline | null>(null);
  const setTimeline = useCallback((tl: Timeline, commit = true) => {
    const cur = projectRef.current;
    if (!cur) return;
    if (!commit) {
      dragBase.current ??= cur.timeline;
    } else {
      const base = dragBase.current ?? cur.timeline;
      dragBase.current = null;
      if (base !== tl) {
        past.current = [...past.current.slice(-HISTORY_LIMIT + 1), base];
        future.current = [];
      }
    }
    update((p) => ({ ...p, timeline: tl }));
    setHist({ undo: past.current.length, redo: future.current.length });
  }, [update]);

  const undo = useCallback(() => {
    const cur = projectRef.current;
    const prev = past.current.pop();
    if (!cur || !prev) return;
    future.current.push(cur.timeline);
    update((p) => ({ ...p, timeline: prev }));
    setHist({ undo: past.current.length, redo: future.current.length });
  }, [update]);

  const redo = useCallback(() => {
    const cur = projectRef.current;
    const next = future.current.pop();
    if (!cur || !next) return;
    past.current.push(cur.timeline);
    update((p) => ({ ...p, timeline: next }));
    setHist({ undo: past.current.length, redo: future.current.length });
  }, [update]);

  // ---- Media import
  const importFiles = useCallback(async (list: File[]): Promise<MediaItem[]> => {
    const added: MediaItem[] = [];
    setImportErrors([]);
    for (const file of list) {
      setImporting((s) => [...s, file.name]);
      try {
        const item = await probeMedia(file);
        const p = projectRef.current!;
        await saveMediaFile(p.id, item.id, file);
        if (p.folderSave && folder.current && folderStatusRef.current === 'ok') {
          await writeMediaToFolder(folder.current, item.id, file).catch(() => setFolderStatus('error'));
        }
        setFiles((m) => new Map(m).set(item.id, file));
        setUrls((m) => new Map(m).set(item.id, URL.createObjectURL(file)));
        update((pp) => ({ ...pp, media: [...pp.media, item] }), { edit: true });
        added.push(item);
      } catch (e) {
        setImportErrors((errs) => [...errs, e instanceof Error ? e.message : `“${file.name}” couldn't be added.`]);
      } finally {
        setImporting((s) => s.filter((n) => n !== file.name));
      }
    }
    return added;
  }, [update]);

  const removeMedia = useCallback((mediaId: string) => {
    const cur = projectRef.current;
    if (!cur) return;
    const tl = cur.timeline;
    const nextTl: Timeline = {
      ...tl,
      video: tl.video.filter((c) => c.mediaId !== mediaId),
      audio: tl.audio.filter((c) => c.mediaId !== mediaId),
    };
    if (nextTl.video.length !== tl.video.length || nextTl.audio.length !== tl.audio.length) setTimeline(nextTl);
    update((p) => ({ ...p, media: p.media.filter((m) => m.id !== mediaId) }));
  }, [setTimeline, update]);

  // ---- Folder
  const connectFolder = useCallback(async (pickNew: boolean) => {
    const cur = projectRef.current;
    if (!cur) return false;
    let dir = pickNew ? null : folder.current ?? (await getFolder(cur.id));
    if (!dir) dir = await pickFolder();
    if (!dir) return false;
    if (!(await folderPermission(dir, true))) {
      setFolderStatus('needs-permission');
      return false;
    }
    folder.current = dir;
    await rememberFolder(cur.id, dir);
    setFolderStatus('ok');
    folderStatusRef.current = 'ok';
    const next = { ...cur, folderSave: true };
    projectRef.current = next;
    setProject(next);
    try {
      setSaveStatus('saving');
      await writeProjectToFolder(dir, next, filesRef.current);
      await saveProjectJson(next);
      setSaveStatus('saved');
    } catch {
      setFolderStatus('error');
    }
    return true;
  }, []);

  return {
    project, files, urls, loadError, saveStatus, folderStatus, dirty, importing, importErrors,
    canUndo: hist.undo > 0, canRedo: hist.redo > 0,
    update, setTimeline, undo, redo, importFiles, removeMedia, connectFolder, flush,
    setImportErrors,
    /** The latest project, including edits made earlier in the same event. */
    current: () => projectRef.current,
    edited: project ? dirty && hasEdits(project.timeline) : false,
  };
}
