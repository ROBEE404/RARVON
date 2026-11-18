import { engine, isCancelled } from '../../../engine';
import type { AudioInfo, AudioTarget } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatDuration } from '../../../lib/audioUtils';
import { formatBytes } from '../../../lib/imageUtils';
import { ActionBar, OptionCards, SizeDelta } from '../../../components/tool';
import { CompressFlow, LevelSlider, MoreOptions } from '../../../components/tool/CompressFlow';
import { IconTile } from '../../../components/tool/ConvertFlow';
import { tr } from '../../../lib/i18n';

const PRESETS = [
  { bitrate: 128_000, label: 'High', hint: '128 kb/s — music, near-transparent' },
  { bitrate: 96_000, label: 'Balanced', hint: '96 kb/s — music and podcasts' },
  { bitrate: 64_000, label: 'Small', hint: '64 kb/s — speech, voice notes' },
  { bitrate: 32_000, label: 'Smallest', hint: '32 kb/s — speech only' },
];

const LEVELS = [
  { value: 128_000, label: 'Light', hint: 'Music, sounds the same' },
  { value: 96_000, label: 'Balanced', hint: 'Music and podcasts' },
  { value: 64_000, label: 'Strong', hint: 'Speech, voice notes' },
];
const EXT: Record<string, string> = { opus: 'ogg', aac: 'm4a', mp3: 'mp3' };

export default function AudioCompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<AudioInfo | null>(null);
  const [bitrate, setBitrate] = useState(96_000);
  const [codecs, setCodecs] = useState<AudioTarget[]>([]);
  const [codec, setCodec] = useState<AudioTarget>('opus');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void engine.audio.encodableTargets().then((t) => {
      const lossy = (['opus', 'aac', 'mp3'] as const).filter((c) => t.has(c));
      setCodecs(lossy);
      if (lossy.length) setCodec(lossy[0]);
    });
  }, []);

  function reset() {
    abortRef.current?.abort();
    setFile(null);
    setInfo(null);
    setResult(null);
    setError(null);
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    reset();
    try {
      const probed = await engine.audio.probe(f);
      setInfo(probed);
      setFile(f);
    } catch (e) {
      setError(e instanceof Error && e.message.includes('no audio') ? e.message : 'Could not read this audio file. Try MP3, WAV, OGG, FLAC or M4A.');
    }
  }

  async function compress() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const out = await engine.audio.convert(file, { target: codec, bitrate, onProgress: setProgress, signal: controller.signal });
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(out.blob), name: `${base}-compressed.${out.extension}`, size: out.blob.size });
    } catch (e) {
      if (isCancelled(e)) return;
      setError(e instanceof Error ? e.message : 'Could not compress this audio file.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const estimate = info ? (bitrate * info.durationSec) / 8 : 0;

  if (!codecs.length && file) {
    return <ErrorMessage>{tr("This browser can’t encode compressed audio (Opus or AAC). Try a recent version of Chrome, Edge, Firefox or Safari.")}</ErrorMessage>;
  }

  const smaller = result && file ? result.size < file.size : true;
  const pickBitrate = (b: number) => { setBitrate(b); setResult(null); };

  return (
    <div className="space-y-4">
      {!file && <FileDropzone accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav,.aac" onFiles={handleFile} hint={tr("MP3, WAV, OGG, FLAC, M4A or Opus")} />}

      {file && info && (
        <div className="slide-in space-y-4">
          <CompressFlow
            from={{ preview: <IconTile kind="audio" />, name: file.name, detail: tr("{0} · {1} · ~{2} kb/s", { 0: formatBytes(file.size), 1: formatDuration(info.durationSec), 2: Math.round(info.bitrate / 1000) }), format: '' }}
            to={{
              preview: <IconTile kind="audio" tone={result && smaller ? 'signal' : 'workshop'} />,
              name: result?.name ?? `${file.name.replace(/\.[^.]+$/, '')}-compressed.${EXT[codec] ?? codec}`,
              detail: result
                ? <>{formatBytes(result.size)}<SizeDelta before={file.size} after={result.size} /></>
                : tr('about {size}', { size: formatBytes(estimate) }),
              format: '',
            }}
            before={file.size}
            after={result ? result.size : estimate}
            state={busy ? 'busy' : result ? (smaller ? 'done' : 'warn') : 'idle'}
            progress={progress}
            onRemove={reset}
            result={result ? { url: result.url, filename: result.name } : undefined}
          />
          {result && !smaller && (
            <p className="slide-in text-xs text-ink-2">
              {tr("This file is already smaller than that quality setting (")}{formatBytes(result.size)}{' '}{tr("vs.")}{' '}{formatBytes(file.size)}{tr("), so keep your original or pick a lower quality.")}
            </p>
          )}

          <div className="grid gap-3 rounded-xl border border-line bg-elevated p-3 sm:p-4">
            <LevelSlider options={LEVELS} value={LEVELS.some((l) => l.value === bitrate) ? bitrate : null} onChange={pickBitrate} disabled={busy} />
            <MoreOptions>
              <OptionCards legend={tr("Quality")} name="bitrate" disabled={busy} value={bitrate} onChange={pickBitrate} options={PRESETS.map((p) => ({ value: p.bitrate, label: p.label, hint: p.hint }))} />
              {codecs.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-ink-2">
                  {tr("Format")}
                  <select value={codec} disabled={busy} onChange={(e) => { setCodec(e.target.value as AudioTarget); setResult(null); }} className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink">
                    {codecs.includes('opus') && <option value="opus">{tr("Opus (.ogg) — best quality for its size")}</option>}
                    {codecs.includes('aac') && <option value="aac">{tr("AAC (.m4a) — plays everywhere")}</option>}
                    {codecs.includes('mp3') && <option value="mp3">{tr("MP3 — the most compatible")}</option>}
                  </select>
                </label>
              )}
            </MoreOptions>
          </div>

          <ActionBar>
            {busy && <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="sm:ms-auto">{tr("Cancel")}</Button>}
            <Button onClick={compress} disabled={busy} className={busy ? undefined : 'sm:ms-auto'}>{busy ? tr("Compressing…") : tr("Compress")}</Button>
          </ActionBar>
        </div>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
