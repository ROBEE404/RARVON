import { useState } from 'react';
import FileDropzone from '../../../components/FileDropzone';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { decodeAudioFile, audioBufferToWavBlob, trimAudioBuffer, formatDuration } from '../../../lib/audioUtils';
import { ResultCard, ActionBar } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function TrimAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setResult(null);
    setError(null);
    setBuffer(null);
    setPreviewUrl(URL.createObjectURL(f));
    try {
      const buf = await decodeAudioFile(f);
      setBuffer(buf);
      setStart(0);
      setEnd(buf.duration);
    } catch {
      setError(tr("Could not decode this audio file. Try a WAV, MP3 or OGG file."));
    }
  }

  function trim() {
    if (!file || !buffer) return;
    if (end <= start) {
      setError(tr("End time must be after the start time."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmed = trimAudioBuffer(buffer, start, end);
      const blob = audioBufferToWavBlob(trimmed);
      const base = file.name.replace(/\.[^.]+$/, '');
      setResult({ url: URL.createObjectURL(blob), name: `${base}-trimmed.wav` });
    } catch {
      setError(tr("Could not trim this audio."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDropzone accept="audio/*" onFiles={handleFile} hint={tr("WAV, MP3, OGG or M4A")} />
      ) : (
        <div className="flex items-center justify-between rounded-md border border-line bg-paper-dim p-3 text-sm">
          <span className="truncate">{file.name}{buffer && ` · ${formatDuration(buffer.duration)}`}</span>
          <button onClick={() => { setFile(null); setBuffer(null); setResult(null); }} className="text-xs font-medium text-workshop hover:underline">{tr("Remove")}</button>
        </div>
      )}

      {buffer && (
        <>
          <audio src={previewUrl ?? undefined} controls className="w-full" />
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs text-ink-2">
              {tr("Start (")}{formatDuration(start)})
              <input
                type="range" min={0} max={buffer.duration} step={0.1}
                value={start}
                onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.1))}
                className="mt-2 block w-full"
              />
            </label>
            <label className="text-xs text-ink-2">
              {tr("End (")}{formatDuration(end)})
              <input
                type="range" min={0} max={buffer.duration} step={0.1}
                value={end}
                onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.1))}
                className="mt-2 block w-full"
              />
            </label>
          </div>
          <p className="text-xs text-ink-3">{tr("Clip length:")}{' '}{formatDuration(end - start)}</p>
          <ActionBar><Button onClick={trim} disabled={busy}>{busy ? tr("Trimming…") : tr("Trim & export as WAV")}</Button></ActionBar>
        </>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {result && (
        <ResultCard url={result.url} filename={result.name}>{result.name}</ResultCard>
      )}
    </div>
  );
}
