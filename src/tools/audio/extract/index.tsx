import { engine, engineInfo, isCancelled, AUDIO_TARGETS } from '../../../engine';
import type { AudioInfo, AudioTarget } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar } from '../../../components/tool';
import { ConvertFlow, FormatPills, IconTile, VideoThumb } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';


type Choice = AudioTarget | 'original';

/** File extension the original audio track is saved with. */
const ORIGINAL_EXT: Record<string, string> = { aac: 'm4a', opus: 'ogg', vorbis: 'ogg', mp3: 'mp3', flac: 'flac' };

export default function ExtractAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<AudioInfo | null>(null);
  /** True when the container can't be read directly and the real-time capture fallback is used. */
  const [useCapture, setUseCapture] = useState(false);
  const [targets, setTargets] = useState<Set<AudioTarget>>(new Set(['wav']));
  const [choice, setChoice] = useState<Choice>('original');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number; note?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  useEffect(() => () => { if (srcUrl) URL.revokeObjectURL(srcUrl); }, [srcUrl]);

  useEffect(() => {
    void engine.audio.encodableTargets().then(setTargets);
  }, []);

  function reset() {
    abortRef.current?.abort();
    setFile(null);
    setInfo(null);
    setUseCapture(false);
    setResult(null);
    setError(null);
    setSrcUrl(null);
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    reset();
    setSrcUrl(URL.createObjectURL(f));
    try {
      setInfo(await engine.audio.probe(f));
      setFile(f);
    } catch (e) {
      if (e instanceof Error && e.message.includes('no audio')) {
        setError(tr("This video has no audio track to extract."));
      } else if (engine.audio.captureFromVideo) {
        setUseCapture(true);
        setFile(f);
      } else {
        setError(tr("This video format can’t be read in this browser. MP4, MOV, WebM and MKV work best."));
      }
    }
  }

  async function extract() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    const base = file.name.replace(/\.[^.]+$/, '');
    try {
      if (useCapture) {
        const blob = await engine.audio.captureFromVideo!(file, setProgress);
        const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
        setResult({ url: URL.createObjectURL(blob), name: `${base}-audio.${ext}`, size: blob.size });
      } else {
        const out = await engine.audio.convert(file, { target: choice, bitrate: 160_000, onProgress: setProgress, signal: controller.signal });
        setResult({
          url: URL.createObjectURL(out.blob),
          name: `${base}-audio.${out.extension}`,
          size: out.blob.size,
          note: out.copied ? 'Copied without re-encoding — identical to the audio in the video.' : undefined,
        });
      }
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not extract audio from this video.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const options: { value: Choice; label: string }[] = [
    { value: 'original', label: 'Original — no re-encoding, instant, best quality' },
    ...AUDIO_TARGETS.filter((t) => targets.has(t.value)).map((t) => ({ value: t.value as Choice, label: t.label })),
  ];

  const target = AUDIO_TARGETS.find((t) => t.value === choice);
  const dur = info?.durationSec ?? 0;
  const ext = useCapture ? 'webm' : choice === 'original' ? ORIGINAL_EXT[info?.codec ?? ''] ?? 'm4a' : target?.extension ?? 'wav';
  const format = useCapture ? 'WEBM' : choice === 'original' ? (info?.codec ?? '').toUpperCase() || tr('Original') : target?.label.split(' ')[0] ?? '';
  const estimate = !info ? null
    : choice === 'original' ? (info.bitrate * dur) / 8
    : target?.lossless ? dur * info.sampleRate * info.channels * 2 + 44
    : (dur * 160_000) / 8;
  const base = file ? file.name.replace(/\.[^.]+$/, '') : '';
  const pick = (c: Choice) => { setChoice(c); setResult(null); };

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept={engineInfo.kind === 'native' ? engineInfo.videoAccept : "video/*,.mkv,.mov"} onFiles={handleFile} hint={engineInfo.kind === 'native' ? tr(engineInfo.videoHint) : tr("MP4, MOV, WebM, MKV or any video your browser can play")} />}

      {file && (
        <div className="slide-in space-y-4">
          <ConvertFlow
            from={{
              preview: srcUrl ? <VideoThumb url={srcUrl} file={file} /> : <IconTile kind="video" />,
              name: file.name,
              detail: info ? `${formatBytes(file.size)} · ${formatDuration(info.durationSec)}` : formatBytes(file.size),
              format: tr('Video'),
            }}
            to={{
              preview: <IconTile kind="audio" tone={result ? 'signal' : 'workshop'} />,
              name: result?.name ?? `${base}-audio.${ext}`,
              detail: result ? formatBytes(result.size) : estimate ? tr('about {size}', { size: formatBytes(estimate) }) : tr('Audio only'),
              format,
            }}
            state={busy ? 'busy' : result ? 'done' : 'idle'}
            progress={progress}
            onRemove={reset}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result?.note && (
            <p className="slide-in flex items-center gap-1.5 text-xs text-signal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
              {tr(result.note)}
            </p>
          )}

          {!useCapture ? (
            <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
              <p className="text-xs font-medium text-ink-2">{tr("Save as")}</p>
              <FormatPills
                label="Save as"
                options={options.map((o) => { const [label, hint] = o.label.split(' — '); return { value: o.value, label: tr(label), hint }; })}
                value={choice}
                onChange={pick}
                disabled={busy}
              />
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-elevated p-3 text-xs text-ink-2">
              {tr("This video’s format can’t be read directly, so its audio is captured while it plays in the background — this takes about as long as the video itself.")}
            </p>
          )}

          <ActionBar>
            {busy && !useCapture && <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="sm:ms-auto">{tr("Cancel")}</Button>}
            <Button onClick={extract} disabled={busy} className={busy && !useCapture ? undefined : 'sm:ms-auto'}>{busy ? tr("Extracting…") : tr("Extract audio")}</Button>
          </ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
