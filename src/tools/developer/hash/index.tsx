import { useState } from 'react';
import Button from '../../../components/Button';
import FileDropzone from '../../../components/FileDropzone';
import ErrorMessage from '../../../components/ErrorMessage';
import { tr } from '../../../lib/i18n';

const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

async function hashBuffer(algo: string, data: BufferSource) {
  const digest = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function HashTool() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [input, setInput] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function hashText() {
    const encoded = new TextEncoder().encode(input);
    const next: Record<string, string> = {};
    for (const algo of algorithms) next[algo] = await hashBuffer(algo, encoded);
    setResults(next);
    setError(null);
  }

  async function hashFile(files: File[]) {
    const file = files[0];
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const next: Record<string, string> = {};
      for (const algo of algorithms) next[algo] = await hashBuffer(algo, buffer);
      setResults(next);
      setError(null);
    } catch {
      setError(tr("Could not hash that file."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border border-line bg-paper-dim p-1 text-xs font-medium">
        {(['text', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setResults({});
            }}
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
            rows={5}
            spellCheck={false}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
          />
          <Button onClick={hashText} disabled={!input}>{tr("Generate hashes")}</Button>
        </>
      ) : (
        <>
          <FileDropzone onFiles={hashFile} hint={tr("Any file type")} />
          {fileName && <p className="text-xs text-ink-3">{tr("Hashed:")}{' '}{fileName}</p>}
        </>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {Object.keys(results).length > 0 && (
        <div className="space-y-2">
          {algorithms.map((algo) => (
            <div key={algo} className="rounded-md border border-line bg-paper-dim p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">{algo}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(results[algo])}
                  className="text-xs font-medium text-workshop hover:underline"
                >
                  {tr("Copy")}
                </button>
              </div>
              <p className="break-all font-mono text-xs text-ink-2">{results[algo]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
