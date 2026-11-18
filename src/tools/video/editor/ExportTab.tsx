import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Aspect, Project } from '../../../lib/videoEditor/types';
import { ASPECTS, formatTime, totalDuration } from '../../../lib/videoEditor/types';
import type { ExportSettings, ShortSide } from '../../../lib/videoEditor/exportSettings';
import {
  FORMATS, FRAME_RATES, PRESETS, RESOLUTIONS, applyPreset, canEncodeSize, defaultSettings, estimateSize, exportDuration,
  isAudioOnly, sizeFor,
} from '../../../lib/videoEditor/exportSettings';
import { formatBytes } from '../../../lib/imageUtils';
import { tr } from '../../../lib/i18n';
import Preview from './Preview';
import type { ExportQueue } from './useExportQueue';

interface Props {
  project: Project;
  urls: Map<string, string>;
  queue: ExportQueue;
  onSaveSettings: (s: ExportSettings) => void;
}

/** The Export tab (layout C): settings, a large preview, and an export queue. */
export default function ExportTab({ project, urls, queue, onSaveSettings }: Props) {
  const [settings, setSettingsState] = useState<ExportSettings>(() => project.export ?? defaultSettings(project));
  const [name, setName] = useState(project.name);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [support, setSupport] = useState<Record<number, boolean>>({});
  const total = totalDuration(project.timeline);
  const audioOnly = isAudioOnly(settings.format);

  const setSettings = (patch: Partial<ExportSettings>, keepPreset = false) => {
    const next = { ...settings, ...patch, preset: keepPreset ? settings.preset : 'custom' };
    setSettingsState(next);
    onSaveSettings(next);
  };

  // Which resolutions this device can encode, for the current shape, frame rate and format.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(RESOLUTIONS.map(async (r) => {
      const { width, height } = sizeFor(settings.aspect, r.short);
      return [r.short, await canEncodeSize(settings.format, width, height, settings.fps)] as const;
    })).then((list) => !cancelled && setSupport(Object.fromEntries(list)));
    return () => {
      cancelled = true;
    };
  }, [settings.aspect, settings.fps, settings.format]);

  const size = sizeFor(settings.aspect, settings.short);
  const estimate = estimateSize(project, settings);
  const duration = exportDuration(project, settings);
  const unsupported = !audioOnly && support[settings.short] === false;
  const previewProject = useMemo(() => ({ ...project, aspect: settings.aspect }), [project, settings.aspect]);

  const addToQueue = (start: boolean) => {
    if (total <= 0 || unsupported) return;
    queue.add(name.trim() || project.name, settings, project, start);
  };

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto p-3 sm:p-4 lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:overflow-hidden" data-testid="export-tab">
      {/* Settings */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-elevated lg:overflow-y-auto" aria-label={tr('Export settings')}>
        <div className="grid gap-5 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-2">{tr('File name')}</span>
            <span className="flex items-center rounded-md border border-line bg-paper focus-within:border-workshop">
              <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" aria-label={tr('File name')} data-testid="export-name" />
              <span className="pe-3 font-mono text-xs text-ink-3">.{settings.format}</span>
            </span>
          </label>

          <Group title={tr('Preset')}>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const next = applyPreset(settings, p, project);
                    setSettingsState(next);
                    onSaveSettings(next);
                  }}
                  aria-pressed={settings.preset === p.id}
                  className={clsx('rounded-lg border px-2.5 py-2 text-start transition-colors', settings.preset === p.id ? 'border-workshop bg-workshop-dim' : 'border-line hover:border-ink')}
                >
                  <span className={clsx('block text-xs font-semibold', settings.preset === p.id && 'text-workshop')}>{tr(p.name)}</span>
                  <span className="block text-[10px] leading-tight text-ink-3">{tr(p.hint)}</span>
                </button>
              ))}
            </div>
          </Group>

          {!audioOnly && (
            <>
              <Group title={tr('Frame shape')}>
                <Chips
                  value={settings.aspect}
                  options={(Object.keys(ASPECTS) as Aspect[]).map((a) => ({ value: a, label: a }))}
                  onChange={(aspect) => setSettings({ aspect })}
                />
                {settings.aspect !== project.aspect && (
                  <p className="mt-1.5 text-[11px] text-warn">{tr('Your project is {a}. Clips set to “Fill” are cropped to the new shape; others get bars.', { a: project.aspect })}</p>
                )}
              </Group>
              <Group title={tr('Resolution')}>
                <div className="grid gap-1">
                  {RESOLUTIONS.map((r) => {
                    const off = support[r.short] === false;
                    const s = sizeFor(settings.aspect, r.short);
                    return (
                      <button
                        key={r.short}
                        onClick={() => !off && setSettings({ short: r.short as ShortSide })}
                        disabled={off}
                        aria-pressed={settings.short === r.short}
                        title={off ? tr('This device can’t encode this size') : undefined}
                        className={clsx(
                          'flex items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          settings.short === r.short ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink',
                        )}
                      >
                        <span className="font-medium">{tr(r.label)}</span>
                        <span className="font-mono text-[11px] text-ink-3">{off ? tr('Not supported') : `${s.width}×${s.height}`}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>
              <Group title={tr('Frame rate')}>
                <Chips value={settings.fps} options={FRAME_RATES.map((f) => ({ value: f, label: `${f}` }))} onChange={(fps) => setSettings({ fps })} />
              </Group>
            </>
          )}

          <Group title={tr('Quality')}>
            <Chips
              value={settings.quality}
              options={[
                { value: 'small', label: tr('Small file') },
                { value: 'balanced', label: tr('Balanced') },
                { value: 'high', label: tr('High quality') },
              ]}
              onChange={(quality) => setSettings({ quality })}
            />
          </Group>

          <Group title={tr('Format')}>
            <select
              value={settings.format}
              onChange={(e) => setSettings({ format: e.target.value as ExportSettings['format'] })}
              className="w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm"
              aria-label={tr('Format')}
            >
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{tr(f.label)}</option>)}
            </select>
          </Group>

          <Group title={tr('What to export')}>
            <Chips
              value={settings.range ? 'part' : 'whole'}
              options={[{ value: 'whole', label: tr('Whole video') }, { value: 'part', label: tr('A part') }]}
              onChange={(v) => setSettings({ range: v === 'whole' ? null : { from: 0, to: total } }, true)}
            />
            {settings.range && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <TimeField label={tr('From')} value={settings.range.from} max={total} onChange={(from) => setSettings({ range: { from: Math.min(from, settings.range!.to - 0.1), to: settings.range!.to } }, true)} onUsePlayhead={() => setSettings({ range: { from: Math.min(time, settings.range!.to - 0.1), to: settings.range!.to } }, true)} />
                <TimeField label={tr('To')} value={settings.range.to} max={total} onChange={(to) => setSettings({ range: { from: settings.range!.from, to: Math.max(to, settings.range!.from + 0.1) } }, true)} onUsePlayhead={() => setSettings({ range: { from: settings.range!.from, to: Math.max(time, settings.range!.from + 0.1) } }, true)} />
              </div>
            )}
          </Group>
        </div>

        <div className="mt-auto grid gap-2 border-t border-line p-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label={tr('Duration')} value={formatTime(duration, false)} />
            <Stat label={tr('Size')} value={audioOnly ? tr('Sound') : `${size.width}×${size.height}`} />
            <Stat label={tr('Estimate')} value={formatBytes(estimate)} testId="export-estimate" />
          </dl>
          {unsupported && <p className="text-xs text-warn">{tr('This device can’t encode this size. Choose a lower resolution.')}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => addToQueue(false)} disabled={total <= 0 || unsupported} className="h-10 rounded-md border border-line text-sm font-medium hover:border-ink disabled:opacity-40">
              {tr('+ Add to queue')}
            </button>
            <button onClick={() => addToQueue(true)} disabled={total <= 0 || unsupported} className="h-10 rounded-md bg-workshop text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
              {tr('Export now')}
            </button>
          </div>
        </div>
      </section>

      {/* Preview */}
      <section className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-line bg-paper-dim" aria-label={tr('Preview')}>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
          <Preview project={previewProject} urls={urls} time={time} playing={playing} onTime={setTime} onEnded={() => setPlaying(false)} />
        </div>
        <div className="grid gap-2 border-t border-line bg-elevated px-4 py-3">
          <div className="relative" dir="ltr">
            {settings.range && total > 0 && (
              <span
                className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-workshop/30"
                style={{ left: `${(settings.range.from / total) * 100}%`, width: `${((settings.range.to - settings.range.from) / total) * 100}%` }}
                aria-hidden="true"
              />
            )}
            <input
              type="range"
              min={0}
              max={Math.max(0.01, total)}
              step={0.01}
              value={Math.min(time, total)}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
              className="relative w-full accent-[var(--color-workshop)]"
              aria-label={tr('Scrub through the video')}
            />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPlaying((p) => !p)} disabled={total <= 0} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper hover:opacity-90 disabled:opacity-40" aria-label={playing ? tr('Pause') : tr('Play')}>
              {playing
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="rtl:-scale-x-100"><path d="M7 4l13 8-13 8z" /></svg>}
            </button>
            <span className="font-mono text-xs text-ink-2">{formatTime(time)} / {formatTime(total)}</span>
          </div>
          <p className="text-center text-[11px] text-ink-3">{tr('Check the video here before exporting. The export uses the frame shape and part chosen on the left.')}</p>
        </div>
      </section>

      {/* Queue */}
      <section className="flex min-h-0 flex-col rounded-xl border border-line bg-elevated" aria-label={tr('Export queue')}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-semibold">{tr('Export queue')}</h2>
          {queue.items.length > 0 && <span className="font-mono text-xs text-ink-3">{queue.items.length}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {queue.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-5 text-center text-xs text-ink-3">
              {tr('Add exports here to make several versions in one go, for example YouTube and Shorts.')}
            </p>
          ) : (
            <ul className="grid gap-2" data-testid="export-queue">
              {queue.items.map((i) => <QueueRow key={i.id} item={i} queue={queue} />)}
            </ul>
          )}
        </div>
        <div className="border-t border-line p-3">
          <button
            onClick={queue.runAll}
            disabled={!queue.items.some((i) => i.status === 'waiting' || i.status === 'cancelled' || i.status === 'error') || queue.busy}
            className="h-10 w-full rounded-md bg-ink text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
          >
            {queue.busy ? tr('Exporting…') : tr('Export all ({n})', { n: queue.items.filter((i) => i.status !== 'done').length })}
          </button>
        </div>
      </section>
    </div>
  );
}

function QueueRow({ item, queue }: { item: ExportQueue['items'][number]; queue: ExportQueue }) {
  const { width, height } = sizeFor(item.settings.aspect, item.settings.short);
  const audioOnly = isAudioOnly(item.settings.format);
  const eta = item.status === 'running' && item.startedAt && item.progress > 0.03
    ? ((Date.now() - item.startedAt) / item.progress) * (1 - item.progress) / 1000
    : null;
  return (
    <li className="rounded-lg border border-line bg-paper p-3" data-testid="queue-item">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}.{item.settings.format}</p>
          <p className="text-[11px] text-ink-3">{audioOnly ? tr('Sound only') : `${width}×${height} · ${item.settings.fps} fps`}</p>
        </div>
        <button onClick={() => queue.remove(item.id)} className="shrink-0 rounded p-1 text-ink-3 hover:text-warn" aria-label={tr('Remove {name}', { name: item.name })}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {item.status === 'running' && (
        <div className="mt-2 grid gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-dim"><div className="h-full rounded-full bg-workshop transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
          <div className="flex justify-between text-[11px] text-ink-3">
            <span>{tr(item.stage || 'Starting')} · {Math.round(item.progress * 100)}%</span>
            <span>{eta !== null ? tr('~{t} left', { t: formatTime(eta, false) }) : ''}</span>
          </div>
          <button onClick={() => queue.cancel(item.id)} className="justify-self-start text-[11px] text-ink-3 hover:text-warn">{tr('Cancel')}</button>
        </div>
      )}
      {item.status === 'waiting' && <p className="mt-1.5 text-[11px] text-ink-3">{tr('Waiting')}</p>}
      {item.status === 'cancelled' && <p className="mt-1.5 text-[11px] text-ink-3">{tr('Cancelled')}</p>}
      {item.status === 'error' && <p className="mt-1.5 text-[11px] text-warn" role="alert">{item.error}</p>}
      {item.status === 'done' && item.result && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-signal">{tr('Ready')} · {formatBytes(item.result.size)}</span>
          <a href={item.result.url} download={item.result.fileName} className="rounded-md bg-workshop px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">
            {tr('Download')}
          </a>
        </div>
      )}
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink-2">{title}</p>
      {children}
    </div>
  );
}

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx('rounded-full border px-3 py-1 text-xs font-medium transition-colors', value === o.value ? 'border-workshop bg-workshop-dim text-workshop' : 'border-line hover:border-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TimeField({ label, value, max, onChange, onUsePlayhead }: { label: string; value: number; max: number; onChange: (v: number) => void; onUsePlayhead: () => void }) {
  return (
    <div>
      <label className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-sm focus-within:border-workshop">
        <span className="text-[11px] text-ink-3">{label}</span>
        <input type="number" min={0} max={max} step={0.1} value={Number(value.toFixed(1))} onChange={(e) => Number.isFinite(Number(e.target.value)) && onChange(Math.max(0, Math.min(max, Number(e.target.value))))} className="w-full min-w-0 bg-transparent font-mono text-sm outline-none" aria-label={label} />
      </label>
      <button onClick={onUsePlayhead} className="mt-1 text-[11px] text-workshop hover:underline">{tr('Use preview time')}</button>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-md bg-paper-dim px-2 py-1.5">
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="truncate text-xs font-semibold" data-testid={testId}>{value}</dd>
    </div>
  );
}
