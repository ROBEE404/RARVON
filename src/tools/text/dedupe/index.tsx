import { useMemo, useState } from 'react';
import { InputPane, OutputPane, TextWorkspace, ToggleChip, textStats } from '../../../components/tool/TextPanes';
import type { Mark } from '../../../components/tool/TextPanes';
import { tr } from '../../../lib/i18n';

export default function DedupeTool() {
  const [text, setText] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(true);

  const { output, removed, marks } = useMemo(() => {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const kept: string[] = [];
    const marks: Mark[] = [];
    let at = 0;
    for (const line of lines) {
      const candidate = trim ? line.trim() : line;
      const key = ignoreCase ? candidate.toLowerCase() : candidate;
      if (!seen.has(key)) {
        seen.add(key);
        kept.push(line);
      } else if (line.length) {
        marks.push({ start: at, end: at + line.length });
      }
      at += line.length + 1;
    }
    return { output: text ? kept.join('\n') : '', removed: lines.length - kept.length, marks };
  }, [text, ignoreCase, trim]);

  return (
    <TextWorkspace
      options={
        <>
          <ToggleChip on={ignoreCase} onChange={setIgnoreCase}>{tr("Ignore case")}</ToggleChip>
          <ToggleChip on={trim} onChange={setTrim}>{tr("Ignore leading/trailing whitespace")}</ToggleChip>
        </>
      }
      input={<InputPane value={text} onChange={setText} placeholder={tr("One item per line…")} mono marks={marks} footer={<>{textStats(text)}{removed > 0 && <span className="text-warn"> · {tr('repeats are highlighted')}</span>}</>} />}
      output={
        <OutputPane
          title={tr("Result")}
          text={output}
          mono
          filename="unique.txt"
          tone={removed > 0 ? 'good' : undefined}
          footer={text ? tr(removed === 1 ? '{n} duplicate line removed' : '{n} duplicate lines removed', { n: removed }) : null}
        />
      }
    />
  );
}
