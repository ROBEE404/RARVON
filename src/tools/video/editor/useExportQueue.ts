import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../../lib/videoEditor/types';
import type { ExportSettings } from '../../../lib/videoEditor/exportSettings';
import { extensionFor } from '../../../lib/videoEditor/exportSettings';
import { engine, isCancelled } from '../../../engine';
import { safeFileName } from '../../../lib/videoEditor/storage';
import { tr } from '../../../lib/i18n';

export interface QueueItem {
  id: string;
  name: string;
  settings: ExportSettings;
  /** The project as it was when the item was added; later edits don't change it. */
  project: Project;
  status: 'waiting' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  startedAt?: number;
  result?: { url: string; size: number; fileName: string };
  error?: string;
}

/**
 * The Export tab's queue. Items run one after another (the device's video
 * encoder is shared, so running two at once wouldn't be faster). It lives in
 * the editor workspace, so exports keep going while you switch tabs.
 */
export function useExportQueue(files: Map<string, File>) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const running = useRef<{ id: string; ctrl: AbortController } | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const patch = (id: string, p: Partial<QueueItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const runNext = useCallback(async () => {
    if (running.current) return;
    const next = itemsRef.current.find((i) => i.status === 'waiting');
    if (!next) return;
    const ctrl = new AbortController();
    running.current = { id: next.id, ctrl };
    patch(next.id, { status: 'running', progress: 0, stage: 'Starting', startedAt: Date.now(), error: undefined });
    try {
      const blob = await engine.video.exportProject(next.project, filesRef.current, {
        settings: next.settings,
        signal: ctrl.signal,
        onProgress: (progress, stage) => patch(next.id, { progress, stage }),
      });
      const fileName = `${safeFileName(next.name)}.${extensionFor(next.settings.format)}`;
      patch(next.id, { status: 'done', progress: 1, result: { url: URL.createObjectURL(blob), size: blob.size, fileName } });
    } catch (e) {
      if (isCancelled(e) || ctrl.signal.aborted) patch(next.id, { status: 'cancelled' });
      else patch(next.id, { status: 'error', error: e instanceof Error ? e.message : tr('The export failed.') });
    } finally {
      running.current = null;
      // Let React apply the status change before picking the next item.
      setTimeout(() => void runNext(), 0);
    }
  }, []);

  /** Adds an export; with `start`, it begins right away (after anything already running). */
  const add = useCallback((name: string, settings: ExportSettings, project: Project, start: boolean) => {
    const item: QueueItem = { id: Math.random().toString(36).slice(2), name, settings, project, status: 'waiting', progress: 0, stage: '' };
    setItems((list) => [...list, item]);
    itemsRef.current = [...itemsRef.current, item];
    if (start) setTimeout(() => void runNext(), 0);
    return item.id;
  }, [runNext]);

  const runAll = useCallback(() => {
    setItems((list) => list.map((i) => (i.status === 'cancelled' || i.status === 'error' ? { ...i, status: 'waiting', progress: 0 } : i)));
    setTimeout(() => void runNext(), 0);
  }, [runNext]);

  const cancel = useCallback((id: string) => {
    if (running.current?.id === id) running.current.ctrl.abort();
    else patch(id, { status: 'cancelled' });
  }, []);

  const remove = useCallback((id: string) => {
    if (running.current?.id === id) running.current.ctrl.abort();
    setItems((list) => {
      const it = list.find((i) => i.id === id);
      if (it?.result) URL.revokeObjectURL(it.result.url);
      return list.filter((i) => i.id !== id);
    });
  }, []);

  useEffect(() => () => {
    running.current?.ctrl.abort();
    itemsRef.current.forEach((i) => i.result && URL.revokeObjectURL(i.result.url));
  }, []);

  const busy = items.some((i) => i.status === 'running');
  const waiting = items.filter((i) => i.status === 'waiting').length;
  return { items, add, runAll, cancel, remove, busy, waiting };
}

export type ExportQueue = ReturnType<typeof useExportQueue>;
