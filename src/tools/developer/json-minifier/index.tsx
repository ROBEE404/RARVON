import { useState } from 'react';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function JsonMinifier() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function minify() {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError(null);
    } catch (e) {
      setOutput('');
      setError(e instanceof Error ? `Couldn't parse JSON: ${e.message}` : 'Invalid JSON.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="json-min-input" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Paste JSON")}</label>
        <textarea
          id="json-min-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
        />
      </div>
      <Button onClick={minify} disabled={!input.trim()}>{tr("Minify")}</Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {output && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">
              {tr('Result — {n} characters', { n: output.length.toLocaleString() })}
            </span>
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
