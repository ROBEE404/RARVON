import { useRef, useState } from 'react';
import clsx from 'clsx';
import type { MediaItem, Project } from '../../../lib/videoEditor/types';
import { formatTime, usedMediaIds } from '../../../lib/videoEditor/types';
import { ACCEPT } from '../../../lib/videoEditor/media';
import { formatBytes } from '../../../lib/imageUtils';
import { MEDIA_DRAG_TYPE } from './Timeline';
import { tr } from '../../../lib/i18n';

interface Props {
  project: Project;
  importing: string[];
  errors: string[];
  onDismissErrors: () => void;
  onImport: (files: File[]) => void;
  onAdd: (m: MediaItem) => void;
  onRemove: (m: MediaItem) => void;
}

const TYPE_ICON: Record<MediaItem['type'], string> = {
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 100-.01',
  audio: 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
};

export default function MediaBin({ project, importing, errors, onDismissErrors, onImport, onAdd, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const used = usedMediaIds(project.timeline);

  return (
    <div
      className={clsx('flex h-full flex-col', over && 'bg-workshop-dim')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        onImport([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold">{tr("Media")}</h2>
        <button onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-paper hover:opacity-90">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {tr("Import")}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          aria-label={tr("Import media files")}
          data-testid="editor-import"
          onChange={(e) => {
            if (e.target.files?.length) onImport([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {errors.length > 0 && (
          <div className="mb-3 rounded-md border border-warn/40 bg-warn-dim p-2 text-xs text-warn" role="alert">
            {errors.map((e) => <p key={e}>{e}</p>)}
            <button onClick={onDismissErrors} className="mt-1 underline">{tr("Dismiss")}</button>
          </div>
        )}
        {project.media.length === 0 && importing.length === 0 && (
          <button
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-ink-3 hover:border-ink hover:text-ink-2"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5M4 20h16" /></svg>
            {tr("Drop videos, pictures or music here, or click to choose")}
          </button>
        )}
        <ul className="grid gap-2">
          {project.media.map((m) => (
            <li
              key={m.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_DRAG_TYPE, m.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="group flex cursor-grab items-center gap-2 rounded-lg border border-line bg-paper p-1.5 hover:border-ink"
              data-testid="media-item"
            >
              <div className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded bg-paper-dim text-ink-3">
                {m.thumb ? (
                  <img src={m.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TYPE_ICON[m.type]} /></svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={m.name}>{m.name}</p>
                <p className="font-mono text-[10px] text-ink-3">
                  {m.type === 'image' ? `${m.width}×${m.height}` : formatTime(m.duration, false)} · {formatBytes(m.size)}
                  {used.has(m.id) && <span className="ms-1 text-signal">{tr("· in use")}</span>}
                </p>
              </div>
              <button
                onClick={() => onAdd(m)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-ink-2 hover:border-workshop hover:bg-workshop-dim hover:text-workshop"
                aria-label={tr("Add {0} to the timeline", { 0: m.name })}
                title={tr("Add to the timeline")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button
                onClick={() => onRemove(m)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 opacity-0 hover:text-warn focus:opacity-100 group-hover:opacity-100"
                aria-label={tr("Remove {0}", { 0: m.name })}
                title={tr("Remove from project")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
          {importing.map((n) => (
            <li key={n} className="flex items-center gap-2 rounded-lg border border-dashed border-line p-2 text-xs text-ink-3">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-workshop" aria-hidden="true" />
              {tr("Adding")}{' '}{n}…
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
