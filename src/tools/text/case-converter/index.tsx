import { useState } from 'react';
import { CopyButton } from '../../../components/tool';
import { InputPane, OutputPane, TextWorkspace, textStats } from '../../../components/tool/TextPanes';
import { tr } from '../../../lib/i18n';

const converters: Record<string, (s: string) => string> = {
  UPPERCASE: (s) => s.toUpperCase(),
  lowercase: (s) => s.toLowerCase(),
  // Unicode-aware (\p{L}/\p{N}) so accented and non-Latin letters are words too.
  'Title Case': (s) => s.toLowerCase().replace(/(^|[\s\-–—/(["“])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase()),
  'Sentence case': (s) =>
    s.toLowerCase().replace(/(^\s*|[.!?؟。]\s+)(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase()),
  camelCase: (s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+(\p{L}|\p{N})/gu, (_, c) => c.toUpperCase())
      .replace(/[^\p{L}\p{N}]+/gu, ''),
  'snake_case': (s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, ''),
};

export default function CaseConverter() {
  const [text, setText] = useState('');

  return (
    <TextWorkspace
      input={<InputPane value={text} onChange={setText} placeholder={tr("Type or paste text here…")} footer={textStats(text)} />}
      output={
        <OutputPane title={tr('Every case')} footer={tr('Copy the one you need.')}>
          <ul className="divide-y divide-line">
            {Object.entries(converters).map(([label, fn], i) => {
              const result = text ? fn(text) : '';
              return (
                <li key={label} className="page-in group grid gap-1 px-3 py-2.5 transition-colors hover:bg-elevated" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-workshop-dim px-1.5 py-0.5 font-mono text-[11px] font-semibold text-workshop">{label}</span>
                    {result && <CopyButton text={result} label={tr("Copy")} />}
                  </div>
                  <p className="min-h-5 break-words text-sm">{result || <span className="text-ink-3">—</span>}</p>
                </li>
              );
            })}
          </ul>
        </OutputPane>
      }
    />
  );
}
