import { useMemo, useState } from 'react';
import { ChoicePills, InputPane, OutputPane, TextWorkspace, ToggleChip, textStats } from '../../../components/tool/TextPanes';
import { tr } from '../../../lib/i18n';

type Mode = 'alpha' | 'alpha-desc' | 'numeric' | 'length' | 'random';

export default function SortLinesTool() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('alpha');
  const [removeEmpty, setRemoveEmpty] = useState(true);
  // Bumping this reshuffles.
  const [shuffle, setShuffle] = useState(0);

  const output = useMemo(() => {
    if (!text) return '';
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    let lines = text.split('\n');
    if (removeEmpty) lines = lines.filter((l) => l.trim() !== '');
    switch (mode) {
      case 'alpha':
        lines.sort(collator.compare);
        break;
      case 'alpha-desc':
        lines.sort((a, b) => collator.compare(b, a));
        break;
      case 'numeric':
        lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
        break;
      case 'length':
        lines.sort((a, b) => a.length - b.length);
        break;
      case 'random':
        for (let i = lines.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [lines[i], lines[j]] = [lines[j], lines[i]];
        }
        break;
    }
    return lines.join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode, removeEmpty, shuffle]);

  return (
    <TextWorkspace
      options={
        <>
          <ChoicePills
            label={tr('Sort order')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'alpha', label: 'A → Z' },
              { value: 'alpha-desc', label: 'Z → A' },
              { value: 'numeric', label: tr("Numeric") },
              { value: 'length', label: tr("By length") },
              { value: 'random', label: tr("Shuffle") },
            ]}
          />
          <ToggleChip on={removeEmpty} onChange={setRemoveEmpty}>{tr("Remove empty lines")}</ToggleChip>
          {mode === 'random' && text && (
            <button type="button" onClick={() => setShuffle((n) => n + 1)} className="slide-in rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold hover:border-ink">
              {tr('Shuffle again')}
            </button>
          )}
        </>
      }
      input={<InputPane value={text} onChange={setText} placeholder={tr("One item per line…")} mono footer={textStats(text)} />}
      output={<OutputPane title={tr("Result")} text={output} mono filename="sorted.txt" footer={output ? textStats(output) : null} />}
    />
  );
}
