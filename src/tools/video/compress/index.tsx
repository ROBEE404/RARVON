import { engine, engineInfo, isCancelled, videoTooBig, compressionBitrates } from '../../../engine';
import type { VideoInfo } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { CompressFlow, LevelSlider, MoreOptions } from '../../../components/tool/CompressFlow';
import { VideoThumb } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';

type Level = 'high' | 'medium' | 'low';
const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 'high', label: 'Light', hint: 'Looks the same' },
  { value: 'medium', label: 'Balanced', hint: 'About half the size' },
  { value: 'low', label: 'Strong', hint: 'Smallest file' },
];
const MAX_HEIGHTS = [0, 1080, 720, 480, 360, 240];

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

export default function VideoCompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [level, setLevel] = useState<Level>('medium');
  const [maxHeight, setMaxHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); }, [srcUrl]);

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
      setSrcUrl(URL.createObjectURL(f));
      setMaxHeight(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this video.');
    }
  }

  const shortSide = info ? Math.min(info.width, info.height) : 0;
  const resize = info && maxHeight && shortSide > maxHeight
    ? (() => {
      const s = maxHeight / shortSide;
      return { width: even(info.width * s), height: even(info.height * s) };
    })()
    : undefined;
  const rates = info ? compressionBitrates(info, level, resize ? resize.width * resize.height : undefined) : null;
  const estimate = info && rates ? ((rates.video + (rates.audio ?? 0)) * info.durationSec) / 8 : 0;

  async function compress() {
    if (!file || !info || !info.container || !rates) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const blob = await engine.video.convert(file, {
        container: info.container,
        videoBitrate: rates.video,
        audioBitrate: rates.audio,
        resize,
        onProgress: setProgress,
        signal: controller.signal,
      });
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-compressed.${info.container}`, size: blob.size });
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not compress this video.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const smaller = result && file ? result.size < file.size : true;
  const remove = () => { abortRef.current?.abort(); setFile(null); setInfo(null); setResult(null); setSrcUrl(null); };
  const thumb = srcUrl ? <VideoThumb url={srcUrl} file={file} /> : null;
  const out = resize ?? (info ? { width: info.width, height: info.height } : null);

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept={engineInfo.videoAccept} onFiles={handleFile} hint={tr(engineInfo.videoHint)} />}

      {file && info && (
        <div className="slide-in space-y-4">
          <CompressFlow
            from={{ preview: thumb, name: file.name, detail: `${formatBytes(file.size)} · ${formatDuration(info.durationSec)} · ${info.width}×${info.height}`, format: '' }}
            to={{
              preview: thumb,
              name: result?.name ?? `${file.name.replace(/\.[^.]+$/, '')}-compressed.${info.container ?? 'mp4'}`,
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></>
                : <>{tr('about {size}', { size: formatBytes(estimate) })}{out && ` · ${out.width}×${out.height}`}</>,
              format: '',
            }}
            before={file.size}
            after={result ? result.size : estimate}
            state={busy ? 'busy' : result ? (smaller ? 'done' : 'warn') : 'idle'}
            progress={progress}
            onRemove={remove}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result && !smaller && (
            <p className="slide-in text-xs text-ink-2">
              {tr("This video is already efficiently compressed — the re-encoded file came out")}{' '}{formatBytes(result.size)}{tr(", not smaller than the original")}{' '}{formatBytes(file.size)}{tr(". Keep your original, or try “Strong” compression or a lower maximum resolution.")}
            </p>
          )}

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <LevelSlider options={LEVELS} value={level} onChange={(l) => { setLevel(l); setResult(null); }} disabled={busy} />
            <MoreOptions defaultOpen={maxHeight !== 0}>
              <label className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                {tr("Maximum resolution")}
                <select value={maxHeight} disabled={busy} onChange={(e) => { setMaxHeight(Number(e.target.value)); setResult(null); }} className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink">
                  {MAX_HEIGHTS.filter((h) => h === 0 || h < shortSide).map((h) => (
                    <option key={h} value={h}>{h === 0 ? tr("Keep {0}×{1}", { 0: info.width, 1: info.height }) : `${h}p`}</option>
                  ))}
                </select>
                {resize && <span>→ {resize.width}×{resize.height}</span>}
              </label>
              <p className="text-xs text-ink-3">{tr("Re-encoding uses your device’s video encoder and takes a while for long videos.")}</p>
            </MoreOptions>
          </div>

          <ActionBar>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="sm:ms-auto">{tr("Cancel")}</Button>}
            <Button onClick={compress} disabled={busy} className={busy ? undefined : 'sm:ms-auto'}>{busy ? tr("Compressing…") : tr("Compress video")}</Button>
          </ActionBar>
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
