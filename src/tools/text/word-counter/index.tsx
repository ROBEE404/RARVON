import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { InputPane, OutputPane, TextWorkspace } from '../../../components/tool/TextPanes';
import { tr } from '../../../lib/i18n';

export default function WordCounter() {
  const [text, setText] = useState('');

  const stats = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    const sentences = text.trim() ? (text.match(/[.!?؟。！？]+(\s|$)/g)?.length ?? (text.trim() ? 1 : 0)) : 0;
    const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
    const readingMinutes = words ? Math.max(1, Math.round(words / 200)) : 0;
    const speakingMinutes = words ? Math.max(1, Math.round(words / 130)) : 0;
    return { words, characters, charactersNoSpaces, sentences, paragraphs, readingMinutes, speakingMinutes };
  }, [text]);

  const n = (v: number) => v.toLocaleString();
  const small: [string, string][] = [
    ['Characters', n(stats.characters)],
    ['Characters (no spaces)', n(stats.charactersNoSpaces)],
    ['Sentences', n(stats.sentences)],
    ['Paragraphs', n(stats.paragraphs)],
    ['Reading time', tr('{n} min', { n: stats.readingMinutes })],
    ['Speaking time', tr('{n} min', { n: stats.speakingMinutes })],
  ];

  return (
    <TextWorkspace
      input={<InputPane value={text} onChange={setText} placeholder={tr("Start typing or paste your text here…")} rows={14} />}
      output={
        <OutputPane title={tr('Counts')} footer={tr('Updates as you type. Reading at 200 words a minute, speaking at 130.')}>
          <div className="grid gap-2.5 p-3">
            <div className="rounded-xl border border-workshop/30 bg-workshop-dim p-4">
              <p className="text-xs font-medium text-workshop">{tr('Words')}</p>
              <p key={stats.words} className="stat-pop font-display text-5xl font-semibold leading-tight text-ink">{n(stats.words)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {small.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-elevated p-3">
                  <p className="text-xs text-ink-3">{tr(label)}</p>
                  <p key={value} className={clsx('stat-pop font-display text-xl font-semibold')}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </OutputPane>
      }
    />
  );
}
