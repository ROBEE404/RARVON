import { useState } from 'react';
import Button from '../../../components/Button';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

export default function UuidTool() {
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [ids, setIds] = useState<string[]>(() => [crypto.randomUUID()]);

  function generate() {
    const list = Array.from({ length: count }, () => crypto.randomUUID());
    setIds(uppercase ? list.map((u) => u.toUpperCase()) : list);
  }

  const text = ids.join('\n');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          {tr("Count")}
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))}
            className="w-16 rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} />
          {tr("Uppercase")}
        </label>
        <Button onClick={generate}>{tr("Generate")}</Button>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">{ids.length}{' '}{tr("UUID")}{ids.length !== 1 ? 's' : ''}</span>
          <CopyButton text={text} label={tr("Copy all")} />
        </div>
        <pre className="max-h-72 overflow-auto rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  );
}
