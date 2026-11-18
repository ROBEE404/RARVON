import { useMemo, useState } from 'react';
import ErrorMessage from '../../../components/ErrorMessage';
import { tr } from '../../../lib/i18n';

const FLAG_OPTIONS = [
  { flag: 'g', label: 'Global' },
  { flag: 'i', label: 'Ignore case' },
  { flag: 'm', label: 'Multiline' },
  { flag: 's', label: 'Dot matches newline' },
] as const;

export default function RegexTester() {
  const [pattern, setPattern] = useState('\\b[\\w.-]+@[\\w.-]+\\.\\w+\\b');
  const [flags, setFlags] = useState<Set<string>>(new Set(['g']));
  const [text, setText] = useState('Contact us at hello@example.com or support@example.org for help.');

  function toggleFlag(f: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  const { regex, error } = useMemo(() => {
    try {
      return { regex: new RegExp(pattern, Array.from(flags).join('')), error: null };
    } catch (e) {
      return { regex: null, error: e instanceof Error ? e.message : 'Invalid regular expression.' };
    }
  }, [pattern, flags]);

  const matches = useMemo(() => {
    if (!regex) return [];
    const results: RegExpExecArray[] = [];
    if (flags.has('g')) {
      const re = new RegExp(pattern, Array.from(flags).join(''));
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) !== null && guard < 5000) {
        results.push(m);
        if (m[0] === '') re.lastIndex++;
        guard++;
      }
    } else {
      const m = regex.exec(text);
      if (m) results.push(m);
    }
    return results;
  }, [regex, text, pattern, flags]);

  const highlighted = useMemo(() => {
    if (!matches.length) return [{ text, isMatch: false }];
    const parts: { text: string; isMatch: boolean }[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.index > cursor) parts.push({ text: text.slice(cursor, m.index), isMatch: false });
      parts.push({ text: m[0], isMatch: true });
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), isMatch: false });
    return parts;
  }, [matches, text]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="regex-pattern" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Pattern")}</label>
        <div className="flex items-center gap-1 rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm focus-within:border-workshop">
          <span className="text-ink-3">/</span>
          <input
            id="regex-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            className="w-full bg-transparent outline-none"
          />
          <span className="text-ink-3">/{Array.from(flags).join('')}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {FLAG_OPTIONS.map((f) => (
          <label key={f.flag} className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={flags.has(f.flag)} onChange={() => toggleFlag(f.flag)} />
            {tr(f.label)} ({f.flag})
          </label>
        ))}
      </div>

      <div>
        <label htmlFor="regex-text" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Test text")}</label>
        <textarea
          id="regex-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
        />
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {!error && (
        <>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-2">
              {tr(matches.length === 1 ? '{n} match' : '{n} matches', { n: matches.length })}
            </p>
            <pre className="whitespace-pre-wrap break-all rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">
              {highlighted.map((p, i) =>
                p.isMatch ? (
                  <mark key={i} className="rounded bg-workshop/30 px-0.5 text-ink">{p.text}</mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </pre>
          </div>

          {matches.length > 0 && matches.some((m) => m.length > 1) && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">{tr("Capture groups")}</p>
              <div className="space-y-2">
                {matches.map((m, i) => (
                  <div key={i} className="rounded-md border border-line bg-paper-dim p-2.5 text-xs">
                    <span className="text-ink-3">{tr("Match")}{' '}{i + 1}:</span>{' '}
                    {Array.from(m).slice(1).map((g, gi) => (
                      <span key={gi} className="me-3 font-mono">
                        ${gi + 1}: {g ?? <span className="text-ink-3">{tr("undefined")}</span>}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
