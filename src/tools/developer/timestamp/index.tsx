import { useState } from 'react';
import Button from '../../../components/Button';
import { tr } from '../../../lib/i18n';

export default function TimestampTool() {
  const [unixInput, setUnixInput] = useState(String(Math.floor(Date.now() / 1000)));
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 19));
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds');

  const parsedMs = (() => {
    const n = Number(unixInput);
    if (Number.isNaN(n)) return null;
    return unit === 'seconds' ? n * 1000 : n;
  })();
  const dateFromUnix = parsedMs !== null ? new Date(parsedMs) : null;

  const dateFromInput = (() => {
    const d = new Date(dateInput);
    return Number.isNaN(d.getTime()) ? null : d;
  })();

  function useNow() {
    const now = Date.now();
    setUnixInput(unit === 'seconds' ? String(Math.floor(now / 1000)) : String(now));
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="font-display text-sm font-semibold">{tr("Unix timestamp → date")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={unixInput}
            onChange={(e) => setUnixInput(e.target.value)}
            className="w-48 rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm focus:border-workshop"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'seconds' | 'milliseconds')}
            className="rounded-md border border-line bg-paper px-2 py-2 text-xs"
          >
            <option value="seconds">{tr("Seconds")}</option>
            <option value="milliseconds">{tr("Milliseconds")}</option>
          </select>
          <Button variant="secondary" onClick={useNow}>{tr("Use now")}</Button>
        </div>
        {dateFromUnix ? (
          <div className="rounded-md border border-line bg-paper-dim p-3 text-sm">
            <p><span className="text-ink-3">{tr("UTC:")}</span> {dateFromUnix.toUTCString()}</p>
            <p><span className="text-ink-3">{tr("Local:")}</span> {dateFromUnix.toString()}</p>
            <p><span className="text-ink-3">{tr("ISO 8601:")}</span> {dateFromUnix.toISOString()}</p>
          </div>
        ) : (
          <p className="text-xs text-warn">{tr("Not a valid number.")}</p>
        )}
      </div>

      <div className="space-y-3 border-t border-line pt-6">
        <h2 className="font-display text-sm font-semibold">{tr("Date → Unix timestamp")}</h2>
        <input
          type="datetime-local"
          step={1}
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-workshop"
        />
        {dateFromInput ? (
          <div className="rounded-md border border-line bg-paper-dim p-3 text-sm font-mono">
            <p>{Math.floor(dateFromInput.getTime() / 1000)} <span className="text-ink-3">{tr("seconds")}</span></p>
            <p>{dateFromInput.getTime()} <span className="text-ink-3">{tr("milliseconds")}</span></p>
          </div>
        ) : (
          <p className="text-xs text-warn">{tr("Enter a valid date.")}</p>
        )}
      </div>
    </div>
  );
}
