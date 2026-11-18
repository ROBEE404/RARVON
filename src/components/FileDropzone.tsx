import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import clsx from 'clsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace, isLikelyCompatible, pendingResultToFile } from '../lib/workspaceContext';
import { tr } from '../lib/i18n';

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}

export default function FileDropzone({ accept, multiple = false, label, hint, onFiles }: FileDropzoneProps) {
  const [isOver, setIsOver] = useState(false);
  const { pending, clearPending } = useWorkspace();
  const [loadingPending, setLoadingPending] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;
  const autoUsed = useRef(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(multiple ? files : [files[0]]);
    },
    [onFiles, multiple],
  );

  // Offer the last result to *other* tools only: a tool's own output fed back
  // into itself is never what the user wants (and during a page transition
  // the outgoing tool's banner could catch the click meant for the next one).
  const showChainBanner = pending && pending.source !== pathname && isLikelyCompatible(pending.filename, accept);

  // Arriving from a "Continue with" button: load the result straight away.
  const wantsResult = Boolean((location.state as { useResult?: boolean } | null)?.useResult);
  useEffect(() => {
    if (!wantsResult || !showChainBanner || autoUsed.current) return;
    autoUsed.current = true;
    navigate(pathname, { replace: true, state: null });
    void loadChainedFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResult, showChainBanner]);

  async function loadChainedFile() {
    if (!pending) return;
    setLoadingPending(true);
    try {
      const file = await pendingResultToFile(pending);
      onFiles([file]);
      clearPending();
    } catch {
      // If the blob URL is somehow gone, just fall through to a normal upload — no harm done.
    } finally {
      setLoadingPending(false);
    }
  }

  return (
    <div className="space-y-2">
      {showChainBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-workshop/30 bg-workshop-dim px-3 py-2 text-xs">
          <span className="text-ink-2">
            {tr('Continue with')} <span className="font-medium text-ink">{pending!.filename}</span>{tr(', your last result?')}
          </span>
          <div className="flex shrink-0 gap-2">
            <button onClick={loadChainedFile} disabled={loadingPending} className="rounded-md bg-ink px-2.5 py-1 font-medium text-paper hover:bg-workshop disabled:opacity-50">
              {loadingPending ? tr('Loading…') : tr('Use this file')}
            </button>
            <button onClick={clearPending} className="rounded-md px-2 py-1 font-medium text-ink-3 hover:text-ink">
              {tr('Dismiss')}
            </button>
          </div>
        </div>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
          isOver ? 'border-workshop bg-workshop-dim' : 'border-line bg-paper-dim hover:border-ink',
        )}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-display text-sm font-medium">
          {label ? tr(label) : tr(multiple ? 'Drop files here, or click to browse' : 'Drop a file here, or click to browse')}
        </span>
        {hint && <span className="text-xs text-ink-3">{tr(hint)}</span>}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
