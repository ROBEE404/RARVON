import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar } from '../../../components/tool';
import { ConvertFlow } from '../../../components/tool/ConvertFlow';
import { DocTile } from '../../../components/tool/CompressFlow';
import { PageGrid } from '../../../components/tool/PageGrid';
import { tr } from '../../../lib/i18n';

interface Item {
  id: string;
  file: File;
  url: string;
}

const isSupported = (f: File) => f.type === 'image/jpeg' || f.type === 'image/png';

/** Up to three pictures fanned out like a small stack. */
function Stack({ urls }: { urls: string[] }) {
  return (
    <div className="relative h-full w-full bg-paper-dim">
      {urls.slice(0, 3).reverse().map((u, k, arr) => {
        const depth = arr.length - 1 - k;
        return (
          <img
            key={u}
            src={u}
            alt=""
            className="absolute h-[70%] w-[62%] rounded border-2 border-paper object-cover shadow-sm"
            style={{ insetInlineStart: `${10 + depth * 9}%`, top: `${8 + depth * 7}%` }}
          />
        );
      })}
    </div>
  );
}

export default function FromImages() {
  const [items, setItems] = useState<Item[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);

  // Release thumbnail URLs when pictures are removed or the page is left.
  const urls = useRef(new Set<string>());
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function addFiles(newFiles: File[]) {
    const ok = newFiles.filter(isSupported);
    setSkipped(newFiles.length - ok.length);
    setItems((prev) => [
      ...prev,
      ...ok.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, url };
      }),
    ]);
    setResult(null);
  }

  function move(from: number, to: number) {
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    setResult(null);
  }

  function remove(id: string) {
    setItems((list) => {
      const gone = list.find((i) => i.id === id);
      if (gone) { URL.revokeObjectURL(gone.url); urls.current.delete(gone.url); }
      return list.filter((i) => i.id !== id);
    });
    setResult(null);
  }

  function clear() {
    items.forEach((i) => { URL.revokeObjectURL(i.url); urls.current.delete(i.url); });
    setItems([]);
    setResult(null);
    setError(null);
    setSkipped(0);
  }

  async function build() {
    if (!items.length) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await PDFDocument.create();
      for (const { file } of items) {
        const bytes = await file.arrayBuffer();
        const image = file.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      const outBytes = await doc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      setResult({ url: URL.createObjectURL(blob), name: 'images.pdf', size: blob.size });
    } catch {
      setError(tr("Could not build a PDF from these images. Only JPG and PNG are supported."));
    } finally {
      setBusy(false);
    }
  }

  const total = items.reduce((n, i) => n + i.file.size, 0);
  const pages = (n: number) => (n === 1 ? tr('1 page') : tr('{n} pages', { n }));

  return (
    <div className="space-y-4">
      {!items.length && <FileDropzone accept="image/jpeg,image/png" multiple onFiles={addFiles} hint={tr("JPG or PNG, one page per image")} />}

      {items.length > 0 && (
        <div className="slide-in space-y-4">
          <ConvertFlow
            from={{
              preview: <Stack urls={items.map((i) => i.url)} />,
              name: items.length === 1 ? tr('1 image') : tr('{n} images', { n: items.length }),
              detail: formatBytes(total),
              format: '',
            }}
            to={{
              preview: result ? <DocTile kind="pdf" tone="signal" /> : <DocTile kind="pdf" />,
              name: result?.name ?? 'images.pdf',
              detail: result ? `${pages(items.length)} · ${formatBytes(result.size)}` : pages(items.length),
              format: 'PDF',
            }}
            state={busy ? 'busy' : result ? 'done' : 'idle'}
            onRemove={clear}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />

          <div className="grid gap-2 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <p className="text-xs text-ink-2">{tr('Drag pages to change their order. Each picture becomes one page of its own size.')}</p>
            <PageGrid
              items={items.map((i) => ({ id: i.id, src: i.url, caption: i.file.name }))}
              onMove={move}
              onRemove={remove}
              onAdd={addFiles}
              addAccept="image/jpeg,image/png"
            />
            {skipped > 0 && <p className="slide-in text-xs text-warn">{tr('Skipped {n} file(s): only JPG and PNG can go into the PDF.', { n: skipped })}</p>}
          </div>

          <ActionBar><Button onClick={build} disabled={busy} className="sm:ms-auto">{busy ? tr("Building…") : tr("Create PDF")}</Button></ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
