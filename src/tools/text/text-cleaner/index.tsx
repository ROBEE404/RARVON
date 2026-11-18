import { useMemo, useState } from 'react';
import { InputPane, OutputPane, TextWorkspace, ToggleChip, textStats } from '../../../components/tool/TextPanes';
import type { Mark } from '../../../components/tool/TextPanes';
import { tr } from '../../../lib/i18n';

type Options = { trimLines: boolean; collapseSpaces: boolean; collapseBlankLines: boolean; removeInvisible: boolean };

const RULES: { key: keyof Options; label: string }[] = [
  { key: 'trimLines', label: 'Trim line edges' },
  { key: 'collapseSpaces', label: 'Collapse extra spaces' },
  { key: 'collapseBlankLines', label: 'Collapse blank lines' },
  { key: 'removeInvisible', label: 'Remove invisible characters' },
];

function clean(text: string, o: Options) {
  let result = text;
  if (o.removeInvisible) result = result.replace(/[​-‍﻿]/g, '');
  if (o.trimLines) result = result.split('\n').map((l) => l.trim()).join('\n');
  if (o.collapseSpaces) result = result.replace(/[ \t]{2,}/g, ' ');
  if (o.collapseBlankLines) result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

/** What each rule would remove from the original text, for the highlight. */
function findMarks(text: string, o: Options): Mark[] {
  const marks: Mark[] = [];
  const add = (re: RegExp, keep = 0) => {
    for (const m of text.matchAll(re)) if (m[0].length > keep) marks.push({ start: m.index! + keep, end: m.index! + m[0].length });
  };
  if (o.trimLines) add(/^[ \t]+|[ \t]+$/gm);
  if (o.collapseSpaces) add(/[ \t]{2,}/g, 1);
  if (o.collapseBlankLines) add(/\n{3,}/g, 2);
  if (o.removeInvisible) add(/[​-‍﻿]/g);
  // Merge overlaps so each character is marked once.
  marks.sort((a, b) => a.start - b.start);
  const merged: Mark[] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else merged.push({ ...m });
  }
  return merged;
}

export default function TextCleaner() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Options>({ trimLines: true, collapseSpaces: true, collapseBlankLines: true, removeInvisible: true });

  const output = useMemo(() => (text ? clean(text, options) : ''), [text, options]);
  const marks = useMemo(() => findMarks(text, options), [text, options]);
  const removed = text.length - output.length;

  return (
    <TextWorkspace
      options={RULES.map((r) => (
        <ToggleChip key={r.key} on={options[r.key]} onChange={(v) => setOptions((o) => ({ ...o, [r.key]: v }))}>{tr(r.label)}</ToggleChip>
      ))}
      input={<InputPane value={text} onChange={setText} placeholder={tr("Paste messy text here…")} marks={marks} footer={<>{textStats(text)}{marks.length > 0 && <span className="text-warn"> · {tr('{n} spots to fix (highlighted)', { n: marks.length })}</span>}</>} />}
      output={
        <OutputPane
          title={tr("Result")}
          text={output}
          filename="cleaned.txt"
          tone={removed > 0 ? 'good' : undefined}
          footer={text ? (removed > 0 ? tr('{n} characters removed', { n: removed.toLocaleString() }) : tr('Already clean')) : null}
        />
      }
    />
  );
}
