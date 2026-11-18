import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Project } from '../../../lib/videoEditor/types';
import { ASPECTS, emptyProject, formatTime, hasEdits, totalDuration } from '../../../lib/videoEditor/types';
import {
  browserStorageSupported, deleteProject, folderSaveSupported, importProject, listProjects, loadMediaFiles,
  pickFolder, projectFileBlob, readProjectFile, readProjectFolder, rememberFolder, safeFileName, saveProjectJson,
  storageEstimate, PROJECT_EXT, OLD_PROJECT_EXT, requestPersistence,
} from '../../../lib/videoEditor/storage';
import { formatBytes } from '../../../lib/imageUtils';
import { useWorkspace } from '../../../lib/workspaceContext';
import { ChoiceButton, ICONS, Modal, NewProjectDialog } from './dialogs';
import type { NewProjectChoice } from './dialogs';
import { handoff, isOpenElsewhere } from './openLock';
import { tr } from '../../../lib/i18n';

const editorPath = (id: string) => `/editor/video/${id}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The Video Editor's start page: new project, open a project file, and the projects saved in this browser. */
export default function VideoEditorProjects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pending } = useWorkspace();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [startFile, setStartFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const supported = browserStorageSupported();

  const refresh = useCallback(async () => {
    setProjects(await listProjects());
    setUsage(await storageEstimate());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Arrived with a video from another tool or the home page drop zone.
  useEffect(() => {
    const state = location.state as { useResult?: boolean; startWithHandoff?: boolean } | null;
    if (state?.startWithHandoff && handoff.files.length) {
      setStartFile(handoff.files[0]);
      handoff.files = [];
      setNewOpen(true);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!state?.useResult || !pending) return;
    void (async () => {
      const blob = await (await fetch(pending.url)).blob();
      setStartFile(new File([blob], pending.filename, { type: blob.type }));
      setNewOpen(true);
    })();
    navigate(location.pathname, { replace: true, state: null });
  }, [location, pending, navigate]);

  const saved = (projects ?? []).filter((p) => p.browserSave);
  // Projects whose browser copy is only a recovery copy and that aren't open in another tab.
  const abandoned = (projects ?? []).filter((p) => !p.browserSave && !isOpenElsewhere(p.id) && hasEdits(p.timeline));
  const recovery = abandoned[0] ?? null;

  // Leftover empty recovery copies are removed quietly.
  useEffect(() => {
    for (const p of projects ?? []) {
      if (!p.browserSave && !hasEdits(p.timeline) && !isOpenElsewhere(p.id)) void deleteProject(p.id);
    }
  }, [projects]);

  const create = async (c: NewProjectChoice) => {
    const p = emptyProject(c.name, c.aspect, c.browserSave, c.folderSave);
    if (c.folderSave) {
      const dir = await pickFolder();
      if (!dir) {
        setError(tr("No folder was picked. Pick one, or turn off “Save to a folder”."));
        return;
      }
      await rememberFolder(p.id, dir);
    }
    await saveProjectJson(p);
    await requestPersistence();
    if (startFile) handoff.files = [startFile];
    setNewOpen(false);
    setStartFile(null);
    navigate(editorPath(p.id));
  };

  const openFile = async (file: File) => {
    setError(null);
    setBusy(tr("Opening project…"));
    try {
      const { project, files } = await readProjectFile(file);
      const p = await importProject(project, files, { browserSave: true, folderSave: false });
      navigate(editorPath(p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This project file couldn't be opened.");
    } finally {
      setBusy(null);
    }
  };

  const openFolder = async () => {
    setError(null);
    const dir = await pickFolder();
    if (!dir) return;
    setBusy(tr("Opening project…"));
    try {
      const { project, files } = await readProjectFolder(dir);
      const p = await importProject(project, files, { browserSave: false, folderSave: true });
      await rememberFolder(p.id, dir);
      navigate(editorPath(p.id));
    } catch {
      setError(tr("That folder doesn't contain a Rarvon video project (project.json)."));
    } finally {
      setBusy(null);
    }
  };

  const downloadFile = async (p: Project) => {
    setBusy(tr("Preparing the project file…"));
    try {
      download(await projectFileBlob(p, await loadMediaFiles(p)), safeFileName(p.name) + PROJECT_EXT);
    } finally {
      setBusy(null);
    }
  };

  if (!supported) {
    return (
      <div className="rounded-lg border border-line bg-paper-dim p-5 text-sm text-ink-2">
        {tr("This browser can’t store video projects. Use a recent version of Chrome, Edge, Firefox or Safari.")}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <button
          onClick={() => setNewOpen(true)}
          className="group flex items-center gap-4 rounded-xl border border-workshop bg-workshop-dim p-5 text-start transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-workshop)]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-workshop text-white" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <span>
            <span className="block font-display text-base font-semibold">{tr("New project")}</span>
            <span className="block text-sm text-ink-2">{tr("Start editing with your videos, pictures and music")}</span>
          </span>
        </button>
        <div className="grid gap-2">
          <button onClick={() => fileInput.current?.click()} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-start text-sm hover:border-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true"><path d="M14 3H6v18h12V7zM14 3v4h4" /></svg>
            <span><span className="font-medium">{tr("Open project file")}</span> <span className="text-ink-3">({PROJECT_EXT})</span></span>
          </button>
          {folderSaveSupported() && (
            <button onClick={() => void openFolder()} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-start text-sm hover:border-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden="true"><path d={ICONS.folder} /></svg>
              <span className="font-medium">{tr("Open project folder")}</span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={`${PROJECT_EXT},${OLD_PROJECT_EXT},application/zip`}
            className="hidden"
            aria-label={tr("Open project file")}
            data-testid="open-project-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void openFile(f);
            }}
          />
        </div>
      </div>

      <p className="-mt-4 text-sm text-ink-2">
        {tr("Just need to cut the start or end off a video?")}{' '}
        <Link to="/tools/video/trim" className="font-medium text-workshop hover:underline">{tr("Quick trim →")}</Link>{' '}
        <span className="text-ink-3">{tr("It’s instant and keeps the original quality.")}</span>
      </p>

      {error && <p className="rounded-md bg-warn-dim p-3 text-sm text-warn" role="alert">{error}</p>}
      {busy && <p className="text-sm text-ink-2" role="status">{busy}</p>}

      <section aria-labelledby="projects-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="projects-heading" className="font-display text-base font-semibold">{tr("Your projects")}</h2>
          {usage && usage.quota > 0 && <span className="text-xs text-ink-3">{formatBytes(usage.used)}{' '}{tr("used on this device")}</span>}
        </div>
        {projects === null ? (
          <p className="mt-3 text-sm text-ink-3">{tr("Loading…")}</p>
        ) : saved.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-3">{tr("Projects you auto-save in this browser show up here.")}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {saved.map((p) => {
              const thumb = p.media.find((m) => m.thumb)?.thumb;
              const size = p.media.reduce((n, m) => n + m.size, 0);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-2 pe-3" data-testid="project-row">
                  <button onClick={() => navigate(editorPath(p.id))} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                    <span className={clsx('grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-paper-dim text-ink-3')}>
                      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">{p.aspect}</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-ink-3">
                        {ASPECTS[p.aspect].label} · {formatTime(totalDuration(p.timeline), false)} · {formatBytes(size)}{' '}{tr("· edited")}{' '}{new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => navigate(editorPath(p.id))} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90">{tr("Open")}</button>
                  <button onClick={() => void downloadFile(p)} className="rounded-md border border-line px-2.5 py-1.5 text-xs hover:border-ink" title={tr("Download project file")}>
                    <span className="sr-only">{tr("Download project file for")}{' '}{p.name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS.download} /></svg>
                  </button>
                  <button onClick={() => setConfirmDelete(p)} className="rounded-md border border-line px-2.5 py-1.5 text-xs hover:border-warn hover:text-warn" title={tr("Delete project")}>
                    <span className="sr-only">{tr("Delete")}{' '}{p.name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS.trash} /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {newOpen && (
        <NewProjectDialog
          startingFile={startFile?.name}
          onClose={() => {
            setNewOpen(false);
            setStartFile(null);
          }}
          onCreate={(c) => void create(c)}
        />
      )}

      {confirmDelete && (
        <Modal title={tr("Delete project?")} onClose={() => setConfirmDelete(null)} labelledBy="delete-title">
          <p className="text-sm text-ink-2">“{confirmDelete.name}{tr("” and its media will be deleted from this browser. This can’t be undone.")}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="rounded-md border border-line px-4 py-2 text-sm hover:border-ink">{tr("Cancel")}</button>
            <button
              onClick={async () => {
                await deleteProject(confirmDelete.id);
                setConfirmDelete(null);
                void refresh();
              }}
              className="rounded-md bg-warn px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {tr("Delete")}
            </button>
          </div>
        </Modal>
      )}

      {recovery && !newOpen && (
        <Modal title={tr("You left a project without saving")} locked labelledBy="recovery-title">
          <p className="mb-4 text-sm text-ink-2">
            “{recovery.name}{tr("” has changes you didn’t save. Rarvon kept a copy. Choose what to do with it before you continue.")}
          </p>
          <div className="grid gap-2">
            <ChoiceButton tone="primary" icon={ICONS.restore} title={tr("Restore and keep editing")} onClick={() => navigate(editorPath(recovery.id))} />
            <ChoiceButton
              icon={ICONS.save}
              title={tr("Save project")}
              detail="Keep it in this browser under “Your projects”."
              onClick={async () => {
                await saveProjectJson({ ...recovery, browserSave: true, pendingChoice: false });
                void refresh();
              }}
            />
            <ChoiceButton
              icon={ICONS.download}
              title={tr("Download project file")}
              onClick={async () => {
                await downloadFile(recovery);
                await deleteProject(recovery.id);
                void refresh();
              }}
            />
            <ChoiceButton
              tone="danger"
              icon={ICONS.trash}
              title={tr("Discard project")}
              detail="Delete the copy. This can’t be undone."
              onClick={async () => {
                await deleteProject(recovery.id);
                void refresh();
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
