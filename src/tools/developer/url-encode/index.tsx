import { useState } from 'react';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function UrlEncodeTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function encode() {
    setOutput(encodeURIComponent(input));
    setError(null);
  }
  function decode() {
    try {
      setOutput(decodeURIComponent(input));
      setError(null);
    } catch {
      setOutput('');
      setError(tr("That doesn't look like validly percent-encoded text."));
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={tr("https://example.com/search?q=hello world")}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
      />
      <div className="flex gap-2">
        <Button onClick={encode} disabled={!input}>{tr("Encode")}</Button>
        <Button variant="secondary" onClick={decode} disabled={!input}>{tr("Decode")}</Button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
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
    </div>
  );
}
