import { useMemo, useState } from 'react';
import Button from '../../../components/Button';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

/** Unbiased random integer in [0, n) from the CSPRNG (rejection sampling). */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

function generate(length: number, sets: (keyof typeof SETS)[]): string {
  const pool = sets.map((s) => SETS[s]).join('');
  if (!pool) return '';
  const chars = Array.from({ length }, () => pool[randomIndex(pool.length)]);
  // Guarantee at least one character from every selected set, at random positions.
  const positions = Array.from({ length }, (_, i) => i);
  sets.forEach((s, k) => {
    if (k >= length) return;
    const j = k + randomIndex(length - k);
    [positions[k], positions[j]] = [positions[j], positions[k]];
    chars[positions[k]] = SETS[s][randomIndex(SETS[s].length)];
  });
  return chars.join('');
}

function estimateStrength(length: number, sets: (keyof typeof SETS)[]) {
  const poolSize = sets.reduce((sum, s) => sum + SETS[s].length, 0);
  const bits = poolSize > 0 ? Math.log2(poolSize) * length : 0;
  if (bits < 40) return { label: 'Weak', color: 'bg-warn' };
  if (bits < 70) return { label: 'Okay', color: 'bg-workshop' };
  return { label: 'Strong', color: 'bg-signal' };
}

export default function PasswordTool() {
  const [length, setLength] = useState(20);
  const [sets, setSets] = useState<(keyof typeof SETS)[]>(['lower', 'upper', 'digits', 'symbols']);
  const [password, setPassword] = useState(() => generate(20, ['lower', 'upper', 'digits', 'symbols']));

  const strength = useMemo(() => estimateStrength(length, sets), [length, sets]);

  function toggle(set: keyof typeof SETS) {
    const next = sets.includes(set) ? sets.filter((x) => x !== set) : [...sets, set];
    setSets(next);
    // Keep the shown password in sync with the settings (and strength label).
    setPassword(generate(length, next.length ? next : ['lower']));
  }
  function changeLength(n: number) {
    setLength(n);
    setPassword(generate(n, sets.length ? sets : ['lower']));
  }

  function regenerate() {
    setPassword(generate(length, sets.length ? sets : ['lower']));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-line bg-paper-dim p-4">
        <p className="break-all font-mono text-lg">{password || '—'}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-dim">
          <div className={`h-full rounded-full ${strength.color}`} style={{ width: `${Math.min(100, (length / 32) * 100)}%` }} />
        </div>
        <span className="text-xs font-medium text-ink-2">{tr(strength.label)}</span>
      </div>

      <label className="flex items-center gap-3 text-xs text-ink-2">
        {tr("Length")}
        <input type="range" min={6} max={64} value={length} onChange={(e) => changeLength(Number(e.target.value))} className="flex-1" />
        <span className="w-6 text-end font-mono">{length}</span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        {[
          ['lower', 'Lowercase (a-z)'],
          ['upper', 'Uppercase (A-Z)'],
          ['digits', 'Digits (0-9)'],
          ['symbols', 'Symbols (!@#…)'],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={sets.includes(key as keyof typeof SETS)} onChange={() => toggle(key as keyof typeof SETS)} />
            {tr(label)}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={regenerate}>{tr("Generate new password")}</Button>
        <CopyButton variant="button" text={password} label={tr("Copy")} disabled={!password} />
      </div>
    </div>
  );
}
