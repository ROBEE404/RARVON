import { useState } from 'react';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { tr } from '../../../lib/i18n';

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(2);
  const [error, setError] = useState<string | null>(null);

  function format() {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, indent === 0 ? '\t' : indent));
      setError(null);
    } catch (e) {
      setOutput('');
      setError(describeJsonError(e, input));
    }
  }

  function copy() {
    navigator.clipboard.writeText(output);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="json-input" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Paste JSON")}</label>
        <textarea
          id="json-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={tr("{\"example\": true, \"values\": [1, 2, 3]}")}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          {tr("Indent")}
          <select
            value={indent}
            onChange={(e) => setIndent(Number(e.target.value))}
            className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          >
            <option value={2}>{tr("2 spaces")}</option>
            <option value={4}>{tr("4 spaces")}</option>
            <option value={0}>{tr("Tab")}</option>
          </select>
        </label>
        <Button onClick={format} disabled={!input.trim()}>{tr("Format")}</Button>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {output && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">{tr("Result")}</span>
            <button onClick={copy} className="text-xs font-medium text-workshop hover:underline">{tr("Copy")}</button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function describeJsonError(e: unknown, input: string): string {
  const msg = e instanceof Error ? e.message : 'Invalid JSON.';
  const match = msg.match(/position (\d+)/);
  if (match) {
    const pos = Number(match[1]);
    const before = input.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return `Couldn't parse JSON: ${msg} (line ${line}, column ${col})`;
  }
  return `Couldn't parse JSON: ${msg}`;
}
