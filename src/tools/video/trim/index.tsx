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
import { Link, useNavigate } from 'react-router-dom';
import { handoff } from '../editor/openLock';
import { tr } from '../../../lib/i18n';

export default function TrimVideoTool() {
  const [file, setFile] = useState<File | null>(null);
  const navigate = useNavigate();
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
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
      setStart(0);
      setEnd(probed.durationSec);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this video.');
    }
  }

  async function trim() {
    const controller = new AbortController();
    if (!file || !info || !info.container) return;
    if (end <= start) {
      setError(tr("End time must be after the start time."));
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    abortRef.current = controller;
    try {
      const blob = await engine.video.convert(file, {
        container: info.container,
        trim: { start, end },
        onProgress: setProgress,
        signal: controller.signal,
      });
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-trimmed.${info.container}` });
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not trim this video.');
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
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs text-ink-2">
              {tr("Start (")}{formatDuration(start)})
              <input type="range" min={0} max={info.durationSec} step={0.1} value={start} onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.1))} className="mt-2 block w-full" />
            </label>
            <label className="text-xs text-ink-2">
              {tr("End (")}{formatDuration(end)})
              <input type="range" min={0} max={info.durationSec} step={0.1} value={end} onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.1))} className="mt-2 block w-full" />
            </label>
          </div>
          <p className="text-xs text-ink-3">{tr("Clip length:")}{' '}{formatDuration(end - start)}{tr(". It copies the existing video directly instead of re-encoding it whenever it can, so the quality stays the same.")}</p>
          <ActionBar>
            <Button onClick={trim} disabled={busy}>{busy ? tr("Trimming…") : tr("Trim video")}</Button>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()}>{tr("Cancel")}</Button>}
          </ActionBar>
          {busy && <ProgressBar value={progress * 100} label={tr("Processing")} />}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3 text-sm" data-testid="editor-link">
        <span className="text-ink-2">{tr("Need to cut out a middle part, join clips or add text and music?")}</span>
        {file ? (
          <button
            onClick={() => {
              handoff.files = [file];
              navigate('/tools/video/editor', { state: { startWithHandoff: true } });
            }}
            className="font-medium text-workshop hover:underline"
          >
            {tr("Open this video in Video Editor →")}
          </button>
        ) : (
          <Link to="/tools/video/editor" className="font-medium text-workshop hover:underline">{tr("Open Video Editor →")}</Link>
        )}
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
