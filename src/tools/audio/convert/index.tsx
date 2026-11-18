import { engine, isCancelled, AUDIO_TARGETS } from '../../../engine';
import type { AudioInfo, AudioTarget } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { audioBufferToWavBlob, decodeAudioFile, formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, SizeDelta } from '../../../components/tool';
import { ConvertFlow, FormatPills, IconTile } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';

const CODEC_LABELS: Record<string, string> = {
  aac: 'AAC', opus: 'Opus', mp3: 'MP3', vorbis: 'Vorbis', flac: 'FLAC', alac: 'ALAC',
  'pcm-s16': 'WAV', 'pcm-s24': 'WAV', 'pcm-s32': 'WAV', 'pcm-f32': 'WAV', 'pcm-u8': 'WAV',
};

const BITRATE = 160_000;

export default function AudioConvertTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<AudioInfo | null>(null);
  /** Files the engine can't demux but the browser can decode: WAV output only. */
  const [fallback, setFallback] = useState<AudioBuffer | null>(null);
  const [targets, setTargets] = useState<Set<AudioTarget>>(new Set(['wav']));
  const [target, setTarget] = useState<AudioTarget>('wav');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void engine.audio.encodableTargets().then((t) => {
      setTargets(t);
      setTarget(t.has('mp3') ? 'mp3' : t.has('aac') ? 'aac' : t.has('opus') ? 'opus' : 'wav');
    });
  }, []);

  function reset() {
    abortRef.current?.abort();
    setFile(null);
    setInfo(null);
    setFallback(null);
    setResult(null);
    setError(null);
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    reset();
    try {
      setInfo(await engine.audio.probe(f));
      setFile(f);
    } catch (e) {
      try {
        setFallback(await decodeAudioFile(f));
        setFile(f);
      } catch {
        setError(e instanceof Error && e.message.includes('no audio') ? e.message : 'Could not read this audio file. Try MP3, WAV, OGG, FLAC or M4A.');
      }
    }
  }

  async function convert() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    const base = file.name.replace(/\.[^.]+$/, '');
    try {
      if (fallback) {
        const blob = audioBufferToWavBlob(fallback);
        setResult({ url: URL.createObjectURL(blob), name: `${base}.wav`, size: blob.size });
      } else {
        const out = await engine.audio.convert(file, { target, bitrate: BITRATE, onProgress: setProgress, signal: controller.signal });
        setResult({ url: URL.createObjectURL(out.blob), name: `${base}.${out.extension}`, size: out.blob.size });
      }
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not convert this audio file.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const duration = info?.durationSec ?? fallback?.duration ?? 0;
  const sourceLabel = info?.codec ? CODEC_LABELS[info.codec] ?? info.codec.toUpperCase() : file?.name.split('.').pop()?.toUpperCase() ?? '';
  const options = fallback ? AUDIO_TARGETS.filter((t) => t.value === 'wav') : AUDIO_TARGETS.filter((t) => targets.has(t.value));

  const targetInfo = AUDIO_TARGETS.find((t) => t.value === (fallback ? 'wav' : target));
  const sampleRate = info?.sampleRate ?? fallback?.sampleRate ?? 44_100;
  const channels = info?.channels ?? fallback?.numberOfChannels ?? 2;
  // WAV is raw 16-bit samples; the others are encoded at a fixed bitrate.
  const estimate = targetInfo?.lossless ? duration * sampleRate * channels * 2 + 44 : (duration * BITRATE) / 8;
  const base = file ? file.name.replace(/\.[^.]+$/, '') : '';
  const pick = (t: AudioTarget) => { setTarget(t); setResult(null); };

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav,.aac" onFiles={handleFile} hint={tr("MP3, WAV, OGG, FLAC, M4A or Opus")} />}

      {file && targetInfo && (
        <div className="slide-in space-y-4">
          <ConvertFlow
            from={{ preview: <IconTile kind="audio" />, name: file.name, detail: `${formatBytes(file.size)} · ${formatDuration(duration)}`, format: sourceLabel }}
            to={{
              preview: <IconTile kind="audio" tone={result ? 'signal' : 'workshop'} />,
              name: result?.name ?? `${base}.${targetInfo.extension}`,
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></>
                : duration ? tr('about {size}', { size: formatBytes(estimate) }) : '…',
              format: targetInfo.label.split(' ')[0],
            }}
            state={busy ? 'busy' : result ? 'done' : 'idle'}
            progress={progress}
            onRemove={reset}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <p className="text-xs font-medium text-ink-2">{tr("Convert to")}</p>
            <FormatPills
              options={options.map((o) => { const [label, hint] = o.label.split(' — '); return { value: o.value, label, hint }; })}
              value={fallback ? 'wav' : target}
              onChange={pick}
              disabled={busy}
            />
            {fallback && <p className="text-xs text-ink-3">{tr("This file can be decoded but not re-packaged by the converter, so only WAV output is available for it.")}</p>}
            {target === 'mp3' && !fallback && (
              <p className="slide-in text-xs text-ink-3">{tr("The first MP3 export downloads the MP3 encoder once (about 120 KB compressed); it runs on your device like everything else.")}</p>
            )}
          </div>

          <ActionBar>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="sm:ms-auto">{tr("Cancel")}</Button>}
            <Button onClick={convert} disabled={busy} className={busy ? undefined : 'sm:ms-auto'}>{busy ? tr("Converting…") : tr("Convert")}</Button>
          </ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
