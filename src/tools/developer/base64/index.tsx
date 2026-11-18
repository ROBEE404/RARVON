import { useState } from 'react';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import FileDropzone from '../../../components/FileDropzone';
import DownloadButton from '../../../components/DownloadButton';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function Base64Tool() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileResult, setFileResult] = useState<{ url: string; name: string } | null>(null);
  const [binary, setBinary] = useState<{ url: string; size: number } | null>(null);

  function encode() {
    try {
      setOutput(btoa(unescape(encodeURIComponent(input))));
      setError(null);
    } catch {
      setError(tr("Could not encode this text."));
    }
  }

  function decode() {
    setBinary(null);
    let bytes: Uint8Array;
    try {
      // Accept URL-safe Base64 (-, _) and missing padding as well.
      const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
      bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    } catch {
      setOutput('');
      setError(tr("That doesn't look like valid Base64."));
      return;
    }
    try {
      setOutput(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      setError(null);
    } catch {
      // Valid Base64, but the data isn't text (an image, a PDF…): offer it as a file.
      setOutput('');
      setError(null);
      setBinary({ url: URL.createObjectURL(new Blob([bytes as BlobPart])), size: bytes.length });
    }
  }

  function handleFile(files: File[]) {
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string; // data:...;base64,XXXX
      const base64 = result.split(',')[1] ?? '';
      const blob = new Blob([base64], { type: 'text/plain' });
      setFileResult({ url: URL.createObjectURL(blob), name: `${file.name}.base64.txt` });
      setError(null);
    };
    reader.onerror = () => setError(tr("Could not read that file."));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border border-line bg-paper-dim p-1 text-xs font-medium">
        {(['text', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-3 py-1.5 capitalize transition-colors ${mode === m ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
          >
            {tr(m)}
          </button>
        ))}
      </div>

      {mode === 'text' ? (
        <>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={tr("Text or Base64 to convert")}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
          />
          <div className="flex gap-2">
            <Button onClick={encode} disabled={!input}>{tr("Encode")}</Button>
            <Button variant="secondary" onClick={decode} disabled={!input}>{tr("Decode")}</Button>
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {binary && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper-dim p-3 text-sm">
              <span>{tr("Decoded")}{' '}{binary.size.toLocaleString()}{' '}{tr("bytes of binary data (not text).")}</span>
              <DownloadButton url={binary.url} filename="decoded.bin" label={tr("Download decoded file")} />
            </div>
          )}
          {output && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-ink-2">{tr("Result")}</span>
                <CopyButton text={output} label={tr("Copy")} />
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">
                {output}
              </pre>
            </div>
          )}
        </>
      ) : (
        <>
          <FileDropzone onFiles={handleFile} hint={tr("Any file type")} />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {fileResult && <DownloadButton url={fileResult.url} filename={fileResult.name} label={tr("Download .base64.txt")} />}
        </>
      )}
    </div>
  );
}
