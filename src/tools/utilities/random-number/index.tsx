import { useState } from 'react';
import Button from '../../../components/Button';
import ErrorMessage from '../../../components/ErrorMessage';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

function secureRandomInt(min: number, max: number): number {
  // Inclusive of both min and max. Uses rejection sampling over a
  // cryptographically secure source to avoid modulo bias.
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;
  const bytes = new Uint8Array(bytesNeeded);
  let value: number;
  do {
    crypto.getRandomValues(bytes);
    value = bytes.reduce((acc, b, i) => acc + b * 256 ** i, 0);
  } while (value > maxValid);
  return min + (value % range);
}

function secureRandomFloat(min: number, max: number, decimals: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const fraction = buf[0] / 4294967296;
  const value = min + fraction * (max - min);
  return Number(value.toFixed(decimals));
}

export default function RandomNumberTool() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<'integer' | 'decimal'>('integer');
  const [decimals, setDecimals] = useState(2);
  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [results, setResults] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    if (min > max) {
      setError(tr("Minimum must be less than or equal to maximum."));
      return;
    }
    if (mode === 'integer' && !allowDuplicates && max - min + 1 < count) {
      setError(tr("The range is too small to generate that many unique numbers."));
      return;
    }
    setError(null);

    if (mode === 'decimal') {
      setResults(Array.from({ length: count }, () => secureRandomFloat(min, max, decimals)));
      return;
    }

    if (allowDuplicates) {
      setResults(Array.from({ length: count }, () => secureRandomInt(Math.ceil(min), Math.floor(max))));
    } else {
      const pool: number[] = [];
      for (let i = Math.ceil(min); i <= Math.floor(max); i++) pool.push(i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setResults(pool.slice(0, count));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border border-line bg-paper-dim p-1 text-xs font-medium">
        {(['integer', 'decimal'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-3 py-1.5 capitalize transition-colors ${mode === m ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
          >
            {tr(m)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-2">
          {tr("Min")}
          <input type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-ink-2">
          {tr("Max")}
          <input type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-ink-2">
          {tr("How many")}
          <input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value))))} className="mt-1 block w-24 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
        </label>
        {mode === 'decimal' && (
          <label className="text-xs text-ink-2">
            {tr("Decimals")}
            <input type="number" min={0} max={10} value={decimals} onChange={(e) => setDecimals(Number(e.target.value))} className="mt-1 block w-20 rounded-md border border-line bg-paper px-2 py-1.5 text-sm" />
          </label>
        )}
      </div>

      {mode === 'integer' && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={allowDuplicates} onChange={(e) => setAllowDuplicates(e.target.checked)} />
          {tr("Allow duplicate values")}
        </label>
      )}

      <Button onClick={generate}>{tr("Generate")}</Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {results.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">{tr(results.length === 1 ? '{n} number' : '{n} numbers', { n: results.length })}</span>
            <CopyButton text={results.join('\n')} label={tr("Copy all")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {results.map((n, i) => (
              <span key={i} className="rounded-md border border-line bg-paper-dim px-3 py-1.5 font-mono text-sm">{n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
