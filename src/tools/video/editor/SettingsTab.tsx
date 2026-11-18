import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import type { ActionGroup, ActionId, EditorSettings, PresetId } from '../../../lib/videoEditor/shortcuts';
import {
  ACTIONS, DEFAULT_SETTINGS, GROUPS, PRESETS, actionForCombo, bindingsOf, comboFromEvent, displayCombo, parseCombo, rebind,
  setEditorSettings, useEditorSettings,
} from '../../../lib/videoEditor/shortcuts';
import { tr } from '../../../lib/i18n';

type Layer = 'plain' | 'Ctrl' | 'Shift' | 'Alt' | 'Ctrl+Shift';
const LAYERS: Layer[] = ['plain', 'Ctrl', 'Shift', 'Alt', 'Ctrl+Shift'];
const PRESET_IDS: PresetId[] = ['bench', 'premiere', 'resolve', 'custom'];

/** Colour per kind of action (reuses the site's category colours). */
const GROUP_COLOR: Record<ActionGroup, string> = {
  playback: 'var(--color-cat-video)',
  editing: 'var(--color-cat-pdf)',
  move: 'var(--color-cat-image)',
  view: 'var(--color-cat-developer)',
  tabs: 'var(--color-cat-utilities)',
};

// The on-screen keyboard: [key name used in combos, label, width in units].
const ROWS: [string, string, number][][] = [
  [['Escape', 'Esc', 1.3], ['1', '1', 1], ['2', '2', 1], ['3', '3', 1], ['4', '4', 1], ['5', '5', 1], ['6', '6', 1], ['7', '7', 1], ['8', '8', 1], ['9', '9', 1], ['0', '0', 1], ['-', '-', 1], ['=', '=', 1], ['Backspace', '⌫', 1.7]],
  [['Q', 'Q', 1], ['W', 'W', 1], ['E', 'E', 1], ['R', 'R', 1], ['T', 'T', 1], ['Y', 'Y', 1], ['U', 'U', 1], ['I', 'I', 1], ['O', 'O', 1], ['P', 'P', 1], ['[', '[', 1], [']', ']', 1], ['\\', '\\', 1.5]],
  [['A', 'A', 1], ['S', 'S', 1], ['D', 'D', 1], ['F', 'F', 1], ['G', 'G', 1], ['H', 'H', 1], ['J', 'J', 1], ['K', 'K', 1], ['L', 'L', 1], [';', ';', 1], ["'", "'", 1]],
  [['Z', 'Z', 1], ['X', 'X', 1], ['C', 'C', 1], ['V', 'V', 1], ['B', 'B', 1], ['N', 'N', 1], ['M', 'M', 1], [',', ',', 1], ['.', '.', 1], ['/', '/', 1]],
  [['Space', 'Space', 6]],
];
const NAV: [string, string][] = [['Delete', 'Del'], ['Home', 'Home'], ['End', 'End'], ['Up', '↑'], ['Left', '←'], ['Down', '↓'], ['Right', '→']];

const actionInfo = new Map(ACTIONS.map((a) => [a.id, a]));

/** Settings tab (layout B): keyboard map, shortcut list and editing defaults. */
export default function SettingsTab() {
  const settings = useEditorSettings();
  const bindings = bindingsOf(settings);
  const [layer, setLayer] = useState<Layer>('plain');
  const [heldLayer, setHeldLayer] = useState<Layer | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [conflict, setConflict] = useState<{ action: ActionId; combo: string; other: ActionId } | null>(null);
  const [query, setQuery] = useState('');
  const [presetWave, setPresetWave] = useState(0);
  const shownLayer = heldLayer ?? layer;

  const save = (next: EditorSettings) => setEditorSettings(next);

  // Live keyboard: light up keys as they're pressed, and show the layer for held modifiers.
  useEffect(() => {
    const layerOf = (e: KeyboardEvent): Layer | null => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey) return 'Ctrl+Shift';
      if (ctrl) return 'Ctrl';
      if (e.shiftKey) return 'Shift';
      if (e.altKey) return 'Alt';
      return null;
    };
    const down = (e: KeyboardEvent) => {
      if (recording || (e.target as HTMLElement).closest('input, textarea, select')) return;
      setHeldLayer(layerOf(e));
      const combo = comboFromEvent(e);
      if (combo) setPressed(parseCombo(combo).key);
    };
    const up = (e: KeyboardEvent) => {
      setHeldLayer(layerOf(e));
      setPressed(null);
    };
    const blur = () => {
      setHeldLayer(null);
      setPressed(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [recording]);

  // Recording a new combo: captured before the editor's own shortcuts see the key.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      const other = actionForCombo(bindings, combo);
      setRecording(null);
      if (other && other !== recording) setConflict({ action: recording, combo, other });
      else save(rebind(settings, recording, combo, null));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, bindings]);

  const comboFor = (key: string, l: Layer = shownLayer) => (l === 'plain' ? key : `${l}+${key}`);
  const choosePreset = (id: PresetId) => {
    if (id === settings.preset) return;
    save(id === 'custom' ? { ...settings, preset: 'custom', custom: bindings } : { ...settings, preset: id });
    setPresetWave((w) => w + 1);
  };

  const presetIndex = PRESET_IDS.indexOf(settings.preset);
  const usedInLayer = useMemo(() => {
    const out = new Map<string, ActionId>();
    for (const a of ACTIONS) {
      const c = bindings[a.id];
      if (!c) continue;
      const p = parseCombo(c);
      const l: Layer = p.ctrl && p.shift ? 'Ctrl+Shift' : p.ctrl ? 'Ctrl' : p.shift ? 'Shift' : p.alt ? 'Alt' : 'plain';
      if (l === shownLayer) out.set(p.key, a.id);
    }
    return out;
  }, [bindings, shownLayer]);

  const selCombo = selectedKey ? comboFor(selectedKey) : null;
  const selAction = selCombo ? actionForCombo(bindings, selCombo) : null;

  const q = query.trim().toLowerCase();
  const visibleActions = ACTIONS.filter((a) => !q || tr(a.label).toLowerCase().includes(q) || a.label.toLowerCase().includes(q) || (bindings[a.id] ?? '').toLowerCase().includes(q));

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4" data-testid="settings-tab">
      <div className="mx-auto grid max-w-6xl gap-4">
        {/* Preset switch with a sliding highlight */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{tr('Keyboard shortcuts')}</h2>
            <p className="text-sm text-ink-2">{tr('Edit with the keys you already know. Press any key to see what it does.')}</p>
          </div>
          <div className="relative grid w-full grid-cols-4 rounded-xl border border-line bg-paper-dim p-1 sm:w-auto sm:min-w-[560px]" role="radiogroup" aria-label={tr('Shortcut preset')}>
            <span
              className="absolute inset-y-1 rounded-lg bg-elevated shadow-sm ring-1 ring-workshop/40 transition-[inset-inline-start] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ insetInlineStart: `calc(${presetIndex * 25}% + 4px)`, width: 'calc(25% - 8px)' }}
              aria-hidden="true"
            />
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.preset === id}
                onClick={() => choosePreset(id)}
                data-testid={`preset-${id}`}
                className={clsx('relative z-10 rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:text-sm', settings.preset === id ? 'text-workshop' : 'text-ink-2 hover:text-ink')}
              >
                {id === 'custom' ? tr('Custom') : tr(PRESETS[id].label)}
              </button>
            ))}
          </div>
        </div>

        {/* Keyboard map */}
        <section className="rounded-2xl border border-line bg-elevated p-4" aria-label={tr('Keyboard map')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-2">{tr('Show keys with')}</span>
            {LAYERS.map((l) => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                aria-pressed={shownLayer === l}
                className={clsx('rounded-full border px-3 py-1 font-mono text-xs transition-all', shownLayer === l ? 'scale-105 border-workshop bg-workshop-dim text-workshop' : 'border-line text-ink-2 hover:border-ink')}
              >
                {l === 'plain' ? tr('No modifier') : displayCombo(`${l}+x`).slice(0, -1).join('+')}
              </button>
            ))}
            <span className="ms-auto flex flex-wrap gap-3">
              {GROUPS.map((g) => (
                <span key={g.id} className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLOR[g.id] }} aria-hidden="true" />
                  {tr(g.label)}
                </span>
              ))}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div dir="ltr" className="overflow-x-auto pb-1">
              <div className="grid min-w-[620px] gap-1.5" key={`${presetWave}-${shownLayer}`}>
                {ROWS.map((row, r) => (
                  <div key={r} className="flex gap-1.5" style={{ paddingInlineStart: `${[0, 0.5, 0.8, 1.3, 3][r] * 2.6}rem` }}>
                    {row.map(([key, label, w], c) => (
                      <Keycap
                        key={key + (usedInLayer.get(key) ?? '')}
                        label={key === 'Space' ? tr('Space') : label}
                        width={w}
                        action={usedInLayer.get(key) ?? null}
                        pressed={pressed === key}
                        selected={selectedKey === key}
                        delay={(r + c) * 18}
                        onClick={() => setSelectedKey(key === selectedKey ? null : key)}
                      />
                    ))}
                  </div>
                ))}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {NAV.map(([key, label], c) => (
                    <Keycap key={key + (usedInLayer.get(key) ?? '')} label={label} width={1.3} action={usedInLayer.get(key) ?? null} pressed={pressed === key} selected={selectedKey === key} delay={(5 + c) * 18} onClick={() => setSelectedKey(key === selectedKey ? null : key)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Selected key */}
            <div className="rounded-xl border border-line bg-paper p-3" aria-live="polite">
              {selCombo ? (
                <div className="grid gap-3 key-panel-in" key={selCombo}>
                  <div className="flex flex-wrap items-center gap-1">{displayCombo(selCombo).map((k, i) => <Kbd key={i}>{k}</Kbd>)}</div>
                  <p className="text-sm">
                    {selAction ? (
                      <><span className="text-ink-3">{tr('Does:')}</span> <span className="font-semibold">{tr(actionInfo.get(selAction)!.label)}</span></>
                    ) : (
                      <span className="text-ink-3">{tr('Not used yet.')}</span>
                    )}
                  </p>
                  <label className="text-xs text-ink-2">
                    {tr('Give this key an action')}
                    <select
                      value={selAction ?? ''}
                      onChange={(e) => {
                        const a = e.target.value as ActionId;
                        if (!a) return;
                        save(rebind(settings, a, selCombo, bindings[a] || null));
                      }}
                      className="mt-1 block w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-sm"
                    >
                      <option value="">{tr('Choose an action…')}</option>
                      {GROUPS.map((g) => (
                        <optgroup key={g.id} label={tr(g.label)}>
                          {ACTIONS.filter((a) => a.group === g.id).map((a) => <option key={a.id} value={a.id}>{tr(a.label)}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {selAction && (
                    <button onClick={() => save({ ...settings, preset: 'custom', custom: { ...bindings, [selAction]: '' } })} className="justify-self-start text-xs text-ink-3 hover:text-warn">
                      {tr('Remove this shortcut')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid h-full place-items-center p-4 text-center text-xs text-ink-3">
                  {tr('Click a key on the keyboard to see or change what it does. Hold Ctrl, Shift or Alt to see those layers.')}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Action list */}
          <section className="rounded-2xl border border-line bg-elevated p-4" aria-label={tr('All shortcuts')}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-semibold">{tr('All shortcuts')}</h3>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('Search… e.g. split')}
                className="ms-auto w-48 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
                aria-label={tr('Search shortcuts')}
              />
            </div>
            {conflict && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn-dim p-3 text-sm text-warn key-panel-in" role="alert">
                <span className="me-auto">
                  {tr('{key} is already used by “{action}”.', { key: displayCombo(conflict.combo).join('+'), action: tr(actionInfo.get(conflict.other)!.label) })}
                </span>
                <button onClick={() => { save(rebind(settings, conflict.action, conflict.combo, bindings[conflict.action] || null)); setConflict(null); }} className="rounded-md bg-warn px-3 py-1 text-xs font-semibold text-white">{tr('Swap them')}</button>
                <button onClick={() => { save(rebind(settings, conflict.action, conflict.combo, null)); setConflict(null); }} className="rounded-md border border-warn/50 px-3 py-1 text-xs font-semibold">{tr('Use it here instead')}</button>
                <button onClick={() => setConflict(null)} className="px-2 py-1 text-xs">{tr('Cancel')}</button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {GROUPS.map((g) => {
                const list = visibleActions.filter((a) => a.group === g.id);
                if (!list.length) return null;
                return (
                  <div key={g.id}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      <span className="h-2 w-2 rounded-sm" style={{ background: GROUP_COLOR[g.id] }} aria-hidden="true" />
                      {tr(g.label)}
                    </p>
                    <ul className="grid gap-1">
                      {list.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => { setConflict(null); setRecording(recording === a.id ? null : a.id); }}
                            className={clsx('flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors', recording === a.id ? 'bg-workshop-dim' : 'hover:bg-paper-dim')}
                            data-testid={`action-${a.id}`}
                          >
                            <span className="min-w-0 truncate">{tr(a.label)}</span>
                            {recording === a.id ? (
                              <span className="recording-pulse shrink-0 rounded-md border border-workshop px-2 py-0.5 text-[11px] font-semibold text-workshop">{tr('Press keys…')}</span>
                            ) : bindings[a.id] ? (
                              <span className="flex shrink-0 gap-0.5">{displayCombo(bindings[a.id]).map((k, i) => <Kbd key={i}>{k}</Kbd>)}</span>
                            ) : (
                              <span className="shrink-0 text-[11px] text-ink-3">{tr('Not set')}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-3">{tr('Click an action, then press the new keys. Esc cancels.')}</p>
          </section>

          {/* Editing defaults */}
          <section className="grid content-start gap-4 rounded-2xl border border-line bg-elevated p-4" aria-label={tr('Editing defaults')}>
            <h3 className="font-display text-sm font-semibold">{tr('Editing defaults')}</h3>
            <Slider label={tr('Picture duration')} value={settings.imageDuration} min={1} max={15} step={0.5} unit="s" onChange={(v) => save({ ...settings, imageDuration: v })} />
            <Slider label={tr('Text duration')} value={settings.textDuration} min={1} max={15} step={0.5} unit="s" onChange={(v) => save({ ...settings, textDuration: v })} />
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">{tr('Snapping')}</span>
                <span className="block text-xs text-ink-3">{tr('Clips jump to the playhead and to other clips’ edges while dragging.')}</span>
              </span>
              <Toggle on={settings.snapping} onChange={(snapping) => save({ ...settings, snapping })} label={tr('Snapping')} />
            </label>
            <div className="border-t border-line pt-3">
              <button
                onClick={() => {
                  if (confirm(tr('Reset all editor settings and shortcuts to the defaults?'))) {
                    save(DEFAULT_SETTINGS);
                    setPresetWave((w) => w + 1);
                  }
                }}
                className="text-xs font-medium text-ink-3 hover:text-warn"
              >
                {tr('Reset everything to defaults')}
              </button>
              <p className="mt-1 text-[11px] text-ink-3">{tr('Settings are saved on this device and apply to all your projects.')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Keycap({ label, width, action, pressed, selected, delay, onClick }: {
  label: string; width: number; action: ActionId | null; pressed: boolean; selected: boolean; delay: number; onClick: () => void;
}) {
  const info = action ? actionInfo.get(action)! : null;
  const color = info ? GROUP_COLOR[info.group] : null;
  const style: CSSProperties = {
    flex: `${width} ${width} 0`,
    animationDelay: `${delay}ms`,
    ...(color ? { background: `color-mix(in srgb, ${color} 16%, var(--color-paper))`, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` } : {}),
  };
  return (
    <button
      onClick={onClick}
      title={info ? tr(info.label) : undefined}
      aria-label={info ? `${label}: ${tr(info.label)}` : label}
      aria-pressed={selected}
      className={clsx(
        'keycap relative flex h-14 min-w-0 flex-col items-start justify-between overflow-hidden rounded-lg border border-b-[3px] px-1.5 pb-1 pt-1 text-start transition-all duration-150',
        info ? 'keycap-pop' : 'border-line bg-paper',
        pressed && 'translate-y-[2px] border-b ring-2 ring-workshop',
        selected && 'ring-2 ring-ink ring-offset-1 ring-offset-elevated',
        'hover:-translate-y-0.5 hover:shadow-sm active:translate-y-[1px]',
      )}
      style={style}
    >
      <span className="font-mono text-xs font-semibold" style={color ? { color } : undefined}>{label}</span>
      {info && <span className="w-full truncate text-[9px] leading-tight text-ink-2">{tr(info.label)}</span>}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line border-b-2 bg-paper px-1.5 py-0.5 font-mono text-[11px] font-semibold">{children}</kbd>;
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex justify-between font-medium">
        {label}
        <span className="font-mono text-xs text-ink-2">{value} {unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-workshop)]" aria-label={label} />
    </label>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-workshop' : 'bg-line')}
    >
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-200', on ? 'start-[22px]' : 'start-0.5')} />
    </button>
  );
}
