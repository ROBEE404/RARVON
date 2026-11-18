import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface PendingResult {
  url: string;
  filename: string;
  /** Route of the tool that produced it — never offered back to that same tool. */
  source?: string;
}

interface WorkspaceContextValue {
  pending: PendingResult | null;
  setPending: (result: PendingResult) => void;
  clearPending: () => void;
  /** Marks a result URL as in use (e.g. by a mounted DownloadButton). */
  retainUrl: (url: string) => void;
  /** Releases a result URL; blob: URLs are revoked once nothing uses them. */
  releaseUrl: (url: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [pending, setPendingState] = useState<PendingResult | null>(null);
  // Reference counts for result blob: URLs. A URL stays alive while a
  // DownloadButton shows it or while it's the chaining "pending" result,
  // and is revoked once neither holds it — otherwise every processed file
  // stays in memory until the tab closes.
  const refCounts = useRef(new Map<string, number>());

  const retainUrl = useCallback((url: string) => {
    refCounts.current.set(url, (refCounts.current.get(url) ?? 0) + 1);
  }, []);

  const releaseUrl = useCallback((url: string) => {
    const next = (refCounts.current.get(url) ?? 0) - 1;
    if (next > 0) {
      refCounts.current.set(url, next);
      return;
    }
    refCounts.current.delete(url);
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  // Side effects (retain/release) live outside the state updater so React's
  // StrictMode double-invocation of updaters can't double-count.
  const pendingRef = useRef<PendingResult | null>(null);

  const setPending = useCallback(
    (result: PendingResult) => {
      const prev = pendingRef.current;
      if (prev && prev.url === result.url && prev.filename === result.filename) return;
      retainUrl(result.url);
      if (prev) releaseUrl(prev.url);
      pendingRef.current = result;
      setPendingState(result);
    },
    [retainUrl, releaseUrl],
  );

  const clearPending = useCallback(() => {
    const prev = pendingRef.current;
    if (!prev) return;
    pendingRef.current = null;
    releaseUrl(prev.url);
    setPendingState(null);
  }, [releaseUrl]);

  const value = useMemo(
    () => ({ pending, setPending, clearPending, retainUrl, releaseUrl }),
    [pending, setPending, clearPending, retainUrl, releaseUrl],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

/** Fetches a previously-created blob: URL back into a real File, so it can
 * be handed to another tool's onFiles callback exactly like a fresh upload. */
export async function pendingResultToFile(result: PendingResult): Promise<File> {
  const res = await fetch(result.url);
  const blob = await res.blob();
  return new File([blob], result.filename, { type: blob.type });
}

/** Light compatibility check so a tool only offers to continue with a
 * result that's actually plausible for it — e.g. don't offer a PDF on an
 * image-only tool. Category-based on file extension, not exact MIME
 * matching, since we deliberately don't fetch the blob just to check this. */
const EXTENSION_CATEGORY: Record<string, string[]> = {
  jpg: ['image'], jpeg: ['image'], png: ['image'], webp: ['image'], avif: ['image'],
  gif: ['image'], bmp: ['image'], ico: ['image'], tif: ['image'], tiff: ['image'],
  heic: ['image'], heif: ['image'], svg: ['image'],
  pdf: ['application/pdf'],
  wav: ['audio'], mp3: ['audio'], ogg: ['audio'], m4a: ['audio'], aac: ['audio'], flac: ['audio'], opus: ['audio'],
  webm: ['audio', 'video'],
  mp4: ['video'], mov: ['video'], avi: ['video'], mkv: ['video'],
  txt: ['text'], json: ['text'], csv: ['text'],
  zip: ['application/zip'],
};

export function isLikelyCompatible(filename: string, accept?: string): boolean {
  if (!accept) return true;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const kinds = EXTENSION_CATEGORY[ext];
  if (!kinds) return true; // unrecognized extension — don't block on it, let the user judge

  const patterns = accept.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  return patterns.some((p) => {
    if (p.startsWith('.')) return p.slice(1) === ext; // '.svg' style
    if (kinds.includes(p)) return true; // exact match, e.g. 'application/pdf'
    const family = p.split('/')[0]; // 'image/*' or 'video/mp4' -> 'image' / 'video'
    return kinds.includes(family);
  });
}
