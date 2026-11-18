import { useMemo, useState } from 'react';
import type JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import ProgressBar from '../../../components/ProgressBar';
import { formatBytes } from '../../../lib/imageUtils';
import { useWorkspace } from '../../../lib/workspaceContext';
import { tools } from '../../../lib/toolRegistry';
import { tr } from '../../../lib/i18n';

interface Entry {
  path: string;
  name: string;
  folder: string;
  size: number | null;
  date: Date;
  obj: JSZip.JSZipObject;
}

/** Fallback encodings for archives whose file names aren't UTF-8 (typical of ZIPs made on Windows). */
const ENCODINGS = [
  { value: 'windows-1256', label: 'Arabic (Windows-1256)' },
  { value: 'windows-1252', label: 'Western (Windows-1252)' },
  { value: 'windows-1251', label: 'Cyrillic (Windows-1251)' },
  { value: 'windows-1254', label: 'Turkish (Windows-1254)' },
  { value: 'ibm866', label: 'DOS Cyrillic (CP866)' },
  { value: 'shift_jis', label: 'Japanese (Shift-JIS)' },
  { value: 'gbk', label: 'Chinese (GBK)' },
  { value: 'euc-kr', label: 'Korean (EUC-KR)' },
] as const;

function defaultEncoding() {
  const lang = (navigator.language || '').toLowerCase();
  if (/^(ar|fa|ur)/.test(lang)) return 'windows-1256';
  if (/^(ru|uk|bg)/.test(lang)) return 'windows-1251';
  if (lang.startsWith('tr')) return 'windows-1254';
  if (lang.startsWith('ja')) return 'shift_jis';
  if (lang.startsWith('zh')) return 'gbk';
  if (lang.startsWith('ko')) return 'euc-kr';
  return 'windows-1252';
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  ogg: 'audio/ogg', txt: 'text/plain', json: 'application/json', csv: 'text/csv', html: 'text/html', zip: 'application/zip',
};
const mimeFor = (name: string) => MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type DirHandle = { getDirectoryHandle(n: string, o: { create: boolean }): Promise<DirHandle>; getFileHandle(n: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }> };
const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export default function UnzipTool() {
  const navigate = useNavigate();
  const { setPending } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [encoding, setEncoding] = useState<string>(defaultEncoding);
  const [hadNonUtf8, setHadNonUtf8] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  async function open(f: File, enc = encoding) {
    setError(null);
    setNotice(null);
    setEntries([]);
    setBusy(true);
    try {
      const { default: JSZipLib } = await import('jszip');
      let nonUtf8 = false;
      const zip = await JSZipLib.loadAsync(f, {
        decodeFileName: (bytes) => {
          const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes as string[], (c) => (typeof c === 'string' ? c.charCodeAt(0) : Number(c)));
          try {
            return new TextDecoder('utf-8', { fatal: true }).decode(arr);
          } catch {
            nonUtf8 = true;
            return new TextDecoder(enc).decode(arr);
          }
        },
      });
      const list: Entry[] = [];
      zip.forEach((path, obj) => {
        if (obj.dir) return;
        if (/(^|\/)__MACOSX\//.test(path) || /(^|\/)\.DS_Store$/.test(path)) return; // macOS metadata
        const i = path.lastIndexOf('/');
        const size = (obj as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
        list.push({ path, name: path.slice(i + 1), folder: i >= 0 ? path.slice(0, i) : '', size: typeof size === 'number' ? size : null, date: obj.date, obj });
      });
      list.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      setFile(f);
      setEntries(list);
      setHadNonUtf8(nonUtf8);
      if (!list.length) setError(tr("This archive is empty."));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setFile(null);
      setError(
        /encrypt/i.test(msg)
          ? 'This ZIP is password-protected. Encrypted archives can’t be opened in the browser yet.'
          : 'This file couldn’t be opened as a ZIP archive. It may be damaged, or in another format (RAR and 7z aren’t supported).',
      );
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? entries.filter((e) => e.path.toLowerCase().includes(q)) : entries;
  }, [entries, filter]);
  const total = entries.reduce((s, e) => s + (e.size ?? 0), 0);

  async function blobOf(e: Entry) {
    return new Blob([(await e.obj.async('uint8array')) as BlobPart], { type: mimeFor(e.name) });
  }

  async function downloadOne(e: Entry) {
    try {
      saveBlob(await blobOf(e), e.name);
    } catch {
      setError(tr("Couldn’t extract {0}. The archive may be damaged.", { 0: e.path }));
    }
  }

  async function openInTool(e: Entry, path: string) {
    const blob = await blobOf(e);
    setPending({ url: URL.createObjectURL(blob), filename: e.name, source: '/tools/utilities/unzip' });
    navigate(path);
  }

  async function extractAll() {
    setError(null);
    setNotice(null);
    setBusy(true);
    setProgress(0);
    try {
      if (canPickFolder) {
        let root: DirHandle;
        try {
          root = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' });
        } catch {
          return; // picker dismissed
        }
        let done = 0;
        for (const e of entries) {
          let dir = root;
          for (const part of e.folder.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create: true });
          const handle = await dir.getFileHandle(e.name, { create: true });
          const w = await handle.createWritable();
          await w.write(await blobOf(e));
          await w.close();
          setProgress(++done / entries.length);
        }
        setNotice(tr("Extracted {0} file{1} into the folder you chose.", { 0: entries.length, 1: entries.length === 1 ? '' : 's' }));
      } else {
        let done = 0;
        for (const e of entries) {
          saveBlob(await blobOf(e), e.path.replace(/\//g, '_'));
          setProgress(++done / entries.length);
          await new Promise((r) => setTimeout(r, 150)); // browsers drop rapid-fire downloads
        }
        setNotice(tr("Your browser saves each file to your Downloads folder (folder structure is kept in the file names)."));
      }
    } catch {
      setError(tr("Extraction stopped: a file couldn’t be written. Check the folder permissions and free space."));
    } finally {
      setBusy(false);
    }
  }

  const ext = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
  function toolsFor(name: string) {
    const e = ext(name);
    if (e === 'pdf') return [['PDF Editor', '/tools/pdf/editor'], ['PDF to Text', '/tools/pdf/to-text']];
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(e)) return [['Image to Text', '/tools/image/to-text'], ['Compress', '/tools/image/compress']];
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(e)) return [['Convert', '/tools/audio/convert']];
    if (['mp4', 'webm', 'mov', 'mkv'].includes(e)) return [['Compress', '/tools/video/compress']];
    return [];
  }
  const knownPaths = new Set(tools.map((t) => `/tools/${t.category}/${t.slug}`));

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept=".zip,application/zip,application/x-zip-compressed" onFiles={(f) => void open(f[0])} hint={tr("ZIP archives — files are listed and extracted on your device")} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">
            {file.name} · {formatBytes(file.size)} · {entries.length}{' '}{tr("file")}{entries.length === 1 ? '' : 's'}
            {total > 0 && tr(", {0} uncompressed", { 0: formatBytes(total) })}
          </span>
          <button onClick={() => { setFile(null); setEntries([]); setError(null); setNotice(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {file && hadNonUtf8 && (
        <label className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper-dim px-3 py-2 text-xs text-ink-2">
          {tr("Some file names weren’t stored as Unicode. If they look garbled, choose the language they were written in:")}
          <select
            value={encoding}
            onChange={(e) => {
              setEncoding(e.target.value);
              void open(file, e.target.value);
            }}
            aria-label={tr("File name encoding")}
            className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
          >
            {ENCODINGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}

      {entries.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void extractAll()} disabled={busy}>
              {canPickFolder ? tr("Extract all to a folder…") : tr("Download all {0} files", { 0: entries.length })}
            </Button>
            {entries.length > 8 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={tr("Filter files")}
                aria-label={tr("Filter files")}
                className="min-w-[10rem] flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm"
              />
            )}
          </div>
          {busy && progress > 0 && <ProgressBar value={progress * 100} label={tr("Extracting")} />}
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line" aria-label={tr("Files in the archive")}>
            {visible.map((e) => (
              <li key={e.path} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate" dir="auto" title={e.path}>{e.name}</p>
                  <p className="truncate text-xs text-ink-3" dir="auto">
                    {e.folder ? `${e.folder}/ · ` : ''}{e.size !== null ? formatBytes(e.size) : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {toolsFor(e.name).filter(([, p]) => knownPaths.has(p)).map(([label, p]) => (
                    <button key={p} onClick={() => void openInTool(e, p)} className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                      {label}
                    </button>
                  ))}
                  <button onClick={() => void downloadOne(e)} aria-label={tr("Download {0}", { 0: e.path })} className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper hover:bg-workshop">
                    {tr("Download")}
                  </button>
                </div>
              </li>
            ))}
            {!visible.length && <li className="px-3 py-4 text-center text-xs text-ink-3">{tr("No files match “")}{filter}”.</li>}
          </ul>
        </>
      )}

      {busy && !entries.length && <p className="text-sm text-ink-3">{tr("Reading archive…")}</p>}
      {notice && <p role="status" className="rounded-md border border-signal/30 bg-signal-dim px-4 py-3 text-sm text-signal">{notice}</p>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
