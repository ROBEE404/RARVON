import { useState } from 'react';
import JSZip from 'jszip';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { CompressFlow, DocTile, LevelSlider, MoreOptions } from '../../../components/tool/CompressFlow';
import { tr } from '../../../lib/i18n';

interface Entry {
  id: string;
  file: File;
  name: string;
}

type Level = 'none' | 'fast' | 'balanced' | 'best';
const LEVELS: { value: Level; label: string; numeric: number | null }[] = [
  { value: 'none', label: 'None (store only, fastest)', numeric: null },
  { value: 'fast', label: 'Fast', numeric: 1 },
  { value: 'balanced', label: 'Balanced', numeric: 6 },
  { value: 'best', label: 'Best (slowest)', numeric: 9 },
];
const SIMPLE: { value: Level; label: string; hint: string }[] = [
  { value: 'fast', label: 'Light', hint: 'Fastest' },
  { value: 'balanced', label: 'Balanced', hint: 'Best for most' },
  { value: 'best', label: 'Strong', hint: 'Smallest, slowest' },
];

function dedupeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  let candidate = `${base} (${i})${ext}`;
  while (taken.has(candidate)) {
    i++;
    candidate = `${base} (${i})${ext}`;
  }
  return candidate;
}

export default function ArchiveTool() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [archiveName, setArchiveName] = useState('archive.zip');
  const [level, setLevel] = useState<Level>('balanced');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);

  function addFiles(files: File[]) {
    setResult(null);
    setError(null);
    setEntries((prev) => [
      ...prev,
      ...files.map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, name: file.name })),
    ]);
  }

  function removeEntry(id: string) {
    setResult(null);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function renameEntry(id: string, name: string) {
    setResult(null);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  }

  const totalInputSize = entries.reduce((sum, e) => sum + e.file.size, 0);

  async function createZip() {
    if (!entries.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const zip = new JSZip();
      const taken = new Set<string>();
      const levelDef = LEVELS.find((l) => l.value === level)!;

      for (const entry of entries) {
        const finalName = dedupeName(entry.name.trim() || entry.file.name, taken);
        taken.add(finalName);
        if (levelDef.numeric === null) {
          zip.file(finalName, entry.file, { compression: 'STORE' });
        } else {
          zip.file(finalName, entry.file, { compression: 'DEFLATE', compressionOptions: { level: levelDef.numeric } });
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' }, (meta) => setProgress(meta.percent));
      const name = archiveName.trim() || 'archive.zip';
      setResult({ url: URL.createObjectURL(blob), name: name.endsWith('.zip') ? name : `${name}.zip`, size: blob.size });
    } catch {
      setError(tr("Could not build the archive. One of the files may be unreadable."));
    } finally {
      setBusy(false);
    }
  }

  const smaller = result ? result.size < totalInputSize : true;
  const zipName = (() => { const n = archiveName.trim() || 'archive.zip'; return n.endsWith('.zip') ? n : `${n}.zip`; })();
  const clear = () => { setEntries([]); setResult(null); setError(null); };

  return (
    <div className="space-y-4">
      {entries.length === 0 && <FileDropzone multiple onFiles={addFiles} label={tr("Drop files here, or click to browse")} hint={tr("Any file type, any number of files")} />}

      {entries.length > 0 && (
        <div className="slide-in space-y-4">
          <CompressFlow
            from={{ preview: <DocTile kind="files" />, name: entries.length === 1 ? tr('1 file') : tr('{n} files', { n: entries.length }), detail: formatBytes(totalInputSize), format: '' }}
            to={{
              preview: <DocTile kind="files" tone={result ? (smaller ? 'signal' : 'warn') : 'workshop'} />,
              name: result?.name ?? zipName,
              detail: result ? <>{formatBytes(result.size)}<SizeDelta before={totalInputSize} after={result.size} /></> : tr('Size shown after compressing'),
              format: 'ZIP',
            }}
            before={totalInputSize}
            after={result ? result.size : null}
            state={busy ? 'busy' : result ? (smaller ? 'done' : 'warn') : 'idle'}
            progress={busy ? progress / 100 : undefined}
            onRemove={clear}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result && !smaller && (
            <p className="slide-in text-xs text-ink-2">{tr("Already-compressed files (JPG, MP4, another ZIP) won't shrink much no matter the level — ZIP can't compress what's already compressed.")}</p>
          )}

          <div className="rounded-xl border border-line bg-elevated">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="text-xs font-medium text-ink-2">{tr('Files in the ZIP')}</span>
              <label className="cursor-pointer rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:border-ink">
                {tr('+ Add files')}
                <input type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
              </label>
            </div>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto p-2">
              {entries.map((e) => (
                <li key={e.id} className="slide-in flex items-center gap-2 rounded-lg border border-line bg-paper p-2 text-sm">
                  <input
                    value={e.name}
                    onChange={(ev) => renameEntry(e.id, ev.target.value)}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-line focus:border-line"
                    aria-label={tr("Name for {0}", { 0: e.file.name })}
                  />
                  <span className="shrink-0 font-mono text-xs text-ink-3">{formatBytes(e.file.size)}</span>
                  <button onClick={() => removeEntry(e.id)} className="shrink-0 rounded px-1.5 py-1 text-xs text-warn hover:bg-warn-dim" aria-label={tr("Remove {0}", { 0: e.file.name })}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <label className="grid gap-1 text-xs text-ink-2 sm:max-w-xs">
              {tr("Archive name")}
              <input value={archiveName} onChange={(e) => { setArchiveName(e.target.value); setResult(null); }} className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-ink" />
            </label>
            <LevelSlider options={SIMPLE} value={SIMPLE.some((l) => l.value === level) ? level : null} onChange={(l) => { setLevel(l); setResult(null); }} disabled={busy} />
            <MoreOptions defaultOpen={level === 'none'}>
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" checked={level === 'none'} onChange={(e) => { setLevel(e.target.checked ? 'none' : 'balanced'); setResult(null); }} className="accent-[var(--color-workshop)]" />
                {tr("Store only, no compression (fastest)")}
              </label>
              <p className="text-xs text-ink-3">{tr("Already-compressed files (JPG, MP4, another ZIP) won't shrink much no matter the level — ZIP can't compress what's already compressed.")}</p>
            </MoreOptions>
          </div>

          <ActionBar><Button onClick={createZip} disabled={busy} className="sm:ms-auto">{busy ? tr("Building archive…") : tr("Create ZIP")}</Button></ActionBar>
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
