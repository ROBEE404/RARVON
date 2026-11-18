import { engine, engineInfo, isCancelled, videoTooBig } from '../../../engine';
import type { VideoInfo, WriteContainer } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import type { VideoCodec } from 'mediabunny';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { ConvertFlow, FormatPills, VideoThumb } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';

type Target = 'mp4' | 'mov' | 'webm' | 'mkv' | 'hevc' | 'av1' | 'gif';

interface TargetInfo {
  value: Target;
  label: string;
  hint: string;
  ext: string;
  /** Not set for GIF, which is made frame by frame instead of by the video encoder. */
  container?: WriteContainer;
  codec?: VideoCodec;
}

const TARGETS: TargetInfo[] = [
  { value: 'mp4', label: 'MP4', hint: 'Plays everywhere', ext: 'mp4', container: 'mp4', codec: 'avc' },
  { value: 'mov', label: 'MOV', hint: 'For Apple devices and editing', ext: 'mov', container: 'mov', codec: 'avc' },
  { value: 'webm', label: 'WebM', hint: 'Smaller, for websites', ext: 'webm', container: 'webm', codec: 'vp9' },
  { value: 'mkv', label: 'MKV', hint: 'Popular for films', ext: 'mkv', container: 'mkv', codec: 'avc' },
  { value: 'hevc', label: 'MP4 · HEVC', hint: 'About half the size, newer devices', ext: 'mp4', container: 'mp4', codec: 'hevc' },
  { value: 'av1', label: 'WebM · AV1', hint: 'Smallest, newest', ext: 'webm', container: 'webm', codec: 'av1' },
  { value: 'gif', label: 'GIF', hint: 'Short, silent animation', ext: 'gif' },
];

const GIF_WIDTHS = [240, 320, 480, 640];

export default function VideoConvertTool() {
  /** Targets this device can actually make (tested, not assumed). */
  const [can, setCan] = useState<Set<Target> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [target, setTarget] = useState<Target>('webm');
  const [gifSeconds, setGifSeconds] = useState(5);
  const [gifStart, setGifStart] = useState(0);
  const [gifWidth, setGifWidth] = useState(480);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); }, [srcUrl]);

  useEffect(() => {
    void Promise.all(TARGETS.map(async (t) => [t.value, t.codec ? await engine.video.canEncode(t.codec) : true] as const)).then((list) => {
      setCan(new Set(list.filter(([, ok]) => ok).map(([v]) => v)));
    });
  }, []);

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
      setSrcUrl(URL.createObjectURL(f));
      setTarget(probed.sourceFormat === 'mp4' ? 'webm' : 'mp4');
      setGifStart(0);
      setGifSeconds(Math.max(1, Math.min(5, Math.floor(probed.durationSec))));
      setGifWidth(GIF_WIDTHS.filter((w) => w <= probed.width).pop() ?? GIF_WIDTHS[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this video.');
    }
  }

  const t = TARGETS.find((x) => x.value === target)!;

  async function convert() {
    const controller = new AbortController();
    if (!file || !info) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    abortRef.current = controller;
    try {
      const blob = t.container
        ? await engine.video.convert(file, { container: t.container, forceVideoCodec: t.codec, onProgress: setProgress, signal: controller.signal })
        : await engine.video.toGif(file, { start: gifStart, seconds: Math.min(gifSeconds, info.durationSec - gifStart), width: gifWidth, fps: 10, onProgress: setProgress, signal: controller.signal });
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}.${t.ext}`, size: blob.size });
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not convert this video.');
    } finally {
      setBusy(false);
    }
  }

  const base = file ? file.name.replace(/\.[^.]+$/, '') : '';
  const remove = () => { abortRef.current?.abort(); setFile(null); setInfo(null); setResult(null); setSrcUrl(null); };
  // Offer every target this device can make, except a copy of exactly what the file already is.
  const sameAsSource = (x: TargetInfo) => x.container === info?.sourceFormat && x.codec === info?.videoCodec;
  const formats = TARGETS.filter((x) => (can ? can.has(x.value) : x.value === 'gif' || x.value === 'mp4' || x.value === 'webm') && !sameAsSource(x));
  const gifHeight = info ? Math.round((gifWidth * info.height) / info.width) : 0;
  const pick = (v: Target) => { setTarget(v); setResult(null); };

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept={engineInfo.videoAccept} onFiles={handleFile} hint={tr(engineInfo.videoHint)} />}

      {file && info && (
        <div className="slide-in space-y-4">
          <ConvertFlow
            from={{
              preview: srcUrl ? <VideoThumb url={srcUrl} file={file} /> : null,
              name: file.name,
              detail: `${formatBytes(file.size)} · ${formatDuration(info.durationSec)} · ${info.width}×${info.height}`,
              format: info.sourceFormat.toUpperCase(),
            }}
            to={{
              preview: srcUrl ? <VideoThumb url={srcUrl} file={file} /> : null,
              name: result?.name ?? `${base}.${t.ext}`,
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></>
                : t.value === 'gif'
                  ? `${formatDuration(Math.min(gifSeconds, info.durationSec - gifStart))} · ${gifWidth}×${gifHeight} · ${tr('no sound')}`
                  : `${formatDuration(info.durationSec)} · ${info.width}×${info.height}`,
              format: t.label,
            }}
            state={busy ? 'busy' : result ? 'done' : 'idle'}
            progress={progress}
            onRemove={remove}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <p className="text-xs font-medium text-ink-2">{tr("Convert to")}</p>
            <FormatPills options={formats} value={target} onChange={pick} disabled={busy} />
            {can && can.size < TARGETS.length && (
              <p className="text-xs text-ink-3">{tr('Some formats are hidden because this browser can’t make them. Chrome and Edge offer the most.')}</p>
            )}

            {target === 'gif' && (
              <div className="slide-in grid gap-3 rounded-lg border border-line bg-paper p-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-ink-2">
                  <span className="flex justify-between"><span>{tr('Start at')}</span><span className="font-mono text-ink">{formatDuration(gifStart)}</span></span>
                  <input type="range" min={0} max={Math.max(0, Math.floor(info.durationSec) - 1)} step={1} value={gifStart} onChange={(e) => { setGifStart(Number(e.target.value)); setResult(null); }} className="accent-[var(--color-workshop)]" />
                </label>
                <label className="grid gap-1 text-xs text-ink-2">
                  <span className="flex justify-between"><span>{tr('Length')}</span><span className="font-mono text-ink">{tr('{n} s', { n: gifSeconds })}</span></span>
                  <input type="range" min={1} max={15} step={1} value={gifSeconds} onChange={(e) => { setGifSeconds(Number(e.target.value)); setResult(null); }} className="accent-[var(--color-workshop)]" />
                </label>
                <label className="grid gap-1 text-xs text-ink-2">
                  {tr('Width')}
                  <select value={gifWidth} onChange={(e) => { setGifWidth(Number(e.target.value)); setResult(null); }} className="rounded-md border border-line bg-elevated px-2 py-1.5 text-sm text-ink">
                    {GIF_WIDTHS.map((w) => <option key={w} value={w}>{w} px</option>)}
                  </select>
                </label>
                <p className="text-xs leading-relaxed text-ink-3 sm:col-span-3">{tr('A GIF is a moving picture, not a real video: it has no sound and only 256 colours, and gets big quickly. Keep it short and small.')}</p>
              </div>
            )}
          </div>

          <ActionBar>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="sm:ms-auto">{tr("Cancel")}</Button>}
            <Button onClick={convert} disabled={busy || !formats.some((x) => x.value === target)} className={busy ? undefined : 'sm:ms-auto'}>
              {busy ? tr("Converting…") : tr("Convert to {0}", { 0: t.label })}
            </Button>
          </ActionBar>
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
