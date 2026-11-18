import { engine, engineInfo, isCancelled, videoTooBig } from '../../../engine';
import type { VideoInfo } from '../../../engine';
import { useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import ProgressBar from '../../../components/ProgressBar';
import { formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

const PRESETS = [
  { label: '1080p', height: 1080 },
  { label: '720p', height: 720 },
  { label: '480p', height: 480 },
  { label: '360p', height: 360 },
];

export default function VideoResolutionTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setResult(null);
    setError(null);
    setInfo(null);
    const sizeError = videoTooBig(f);
    if (sizeError) {
      setError(sizeError);
      return;
    }
    try {
      const probed = await engine.video.probe(f);
      setFile(f);
      setInfo(probed);
      setWidth(probed.width);
      setHeight(probed.height);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this video.');
    }
  }

  function applyPreset(targetHeight: number) {
    if (!info) return;
    const ratio = info.width / info.height;
    setHeight(targetHeight);
    setWidth(Math.round(targetHeight * ratio / 2) * 2); // even width, most encoders require it
  }

  async function apply() {
    const controller = new AbortController();
    if (!file || !info || !info.container) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    abortRef.current = controller;
    try {
      const blob = await engine.video.convert(file, {
        container: info.container,
        resize: { width, height },
        onProgress: setProgress,
        signal: controller.signal,
      });
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-${width}x${height}.${info.container}` });
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not resize this video.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept={engineInfo.videoAccept} onFiles={handleFile} hint={tr(engineInfo.videoHint)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">
            {file.name} · {formatBytes(file.size)}
            {info && ` · ${info.width}×${info.height} · ${formatDuration(info.durationSec)}`}
          </span>
          <button onClick={() => { setFile(null); setInfo(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {info && (
        <>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.height)} className="rounded-md border border-line bg-paper-dim px-3 py-1.5 text-xs hover:border-ink">
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-ink-2">
              {tr("Width")}
              <input type="number" value={width} onChange={(e) => setWidth(Math.max(2, Number(e.target.value)))} className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-ink-2">
              {tr("Height")}
              <input type="number" value={height} onChange={(e) => setHeight(Math.max(2, Number(e.target.value)))} className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
            </label>
          </div>
          <ActionBar>
            <Button onClick={apply} disabled={busy || width < 2 || height < 2}>{busy ? tr("Processing…") : tr("Change resolution")}</Button>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()}>{tr("Cancel")}</Button>}
          </ActionBar>
          {busy && <ProgressBar value={progress * 100} label={tr("Re-encoding")} />}
        </>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
