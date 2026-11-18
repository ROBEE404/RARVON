import { useEffect, useState } from 'react';

/**
 * Video Editor keyboard shortcuts and editing defaults.
 *
 * Shortcuts are data: an action id -> a key combo like "Ctrl+Shift+Z". The
 * editor resolves every key press through this table, so presets, custom
 * keys and the Settings tab's keyboard map all come from one place.
 * Settings are stored on this device (localStorage), for every project.
 */

export type ActionId =
  | 'playPause' | 'shuttleBack' | 'shuttleStop' | 'shuttleForward'
  | 'split' | 'delete' | 'rippleDelete' | 'undo' | 'redo' | 'addText' | 'toggleAudio' | 'deselect'
  | 'frameBack' | 'frameForward' | 'secondBack' | 'secondForward' | 'goStart' | 'goEnd' | 'markIn' | 'markOut'
  | 'zoomIn' | 'zoomOut' | 'zoomFit'
  | 'tabEdit' | 'tabAudio' | 'tabExport' | 'tabSettings' | 'export';

export type ActionGroup = 'playback' | 'editing' | 'move' | 'view' | 'tabs';

export interface ActionInfo {
  id: ActionId;
  label: string;
  group: ActionGroup;
}

export const ACTIONS: ActionInfo[] = [
  { id: 'playPause', label: 'Play / Pause', group: 'playback' },
  { id: 'shuttleBack', label: 'Jump back 2 seconds', group: 'playback' },
  { id: 'shuttleStop', label: 'Pause', group: 'playback' },
  { id: 'shuttleForward', label: 'Play', group: 'playback' },
  { id: 'split', label: 'Split at playhead', group: 'editing' },
  { id: 'delete', label: 'Delete clip', group: 'editing' },
  { id: 'rippleDelete', label: 'Delete and close the gap', group: 'editing' },
  { id: 'undo', label: 'Undo', group: 'editing' },
  { id: 'redo', label: 'Redo', group: 'editing' },
  { id: 'addText', label: 'Add text', group: 'editing' },
  { id: 'toggleAudio', label: 'Remove or restore a clip’s audio', group: 'editing' },
  { id: 'deselect', label: 'Deselect', group: 'editing' },
  { id: 'frameBack', label: 'One frame back', group: 'move' },
  { id: 'frameForward', label: 'One frame forward', group: 'move' },
  { id: 'secondBack', label: 'One second back', group: 'move' },
  { id: 'secondForward', label: 'One second forward', group: 'move' },
  { id: 'goStart', label: 'Go to start', group: 'move' },
  { id: 'goEnd', label: 'Go to end', group: 'move' },
  { id: 'markIn', label: 'Mark export start', group: 'move' },
  { id: 'markOut', label: 'Mark export end', group: 'move' },
  { id: 'zoomIn', label: 'Zoom timeline in', group: 'view' },
  { id: 'zoomOut', label: 'Zoom timeline out', group: 'view' },
  { id: 'zoomFit', label: 'Fit timeline to window', group: 'view' },
  { id: 'tabEdit', label: 'Go to Edit tab', group: 'tabs' },
  { id: 'tabAudio', label: 'Go to Audio tab', group: 'tabs' },
  { id: 'tabExport', label: 'Go to Export tab', group: 'tabs' },
  { id: 'tabSettings', label: 'Go to Settings tab', group: 'tabs' },
  { id: 'export', label: 'Export', group: 'tabs' },
];

export const GROUPS: { id: ActionGroup; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'editing', label: 'Editing' },
  { id: 'move', label: 'Moving around' },
  { id: 'view', label: 'Timeline view' },
  { id: 'tabs', label: 'Tabs' },
];

export type Bindings = Record<ActionId, string>;
export type PresetId = 'bench' | 'premiere' | 'resolve' | 'custom';

const COMMON: Bindings = {
  playPause: 'Space', shuttleBack: 'J', shuttleStop: 'K', shuttleForward: 'L',
  split: 'S', delete: 'Delete', rippleDelete: 'Shift+Delete', undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z',
  addText: 'T', toggleAudio: 'M', deselect: 'Escape',
  frameBack: 'Left', frameForward: 'Right', secondBack: 'Shift+Left', secondForward: 'Shift+Right',
  goStart: 'Home', goEnd: 'End', markIn: 'I', markOut: 'O',
  zoomIn: '=', zoomOut: '-', zoomFit: '\\',
  tabEdit: 'Alt+1', tabAudio: 'Alt+2', tabExport: 'Alt+3', tabSettings: 'Alt+4', export: 'Ctrl+E',
};

/** Presets follow the familiar default keys of those editors for the actions Rarvon has. */
export const PRESETS: Record<Exclude<PresetId, 'custom'>, { label: string; bindings: Bindings }> = {
  bench: { label: 'Rarvon', bindings: COMMON },
  premiere: {
    label: 'Premiere Pro style',
    bindings: { ...COMMON, split: 'Ctrl+K', addText: 'Ctrl+T', toggleAudio: 'Shift+M', deselect: 'Ctrl+Shift+A', export: 'Ctrl+M' },
  },
  resolve: {
    label: 'DaVinci Resolve style',
    bindings: {
      ...COMMON, split: 'Ctrl+B', delete: 'Backspace', rippleDelete: 'Delete', zoomIn: 'Ctrl+=', zoomOut: 'Ctrl+-', zoomFit: 'Shift+Z',
      toggleAudio: 'Ctrl+Shift+M', deselect: 'Ctrl+Shift+A', tabEdit: 'Shift+4', tabAudio: 'Shift+7', tabExport: 'Shift+8', tabSettings: 'Shift+9', export: 'Ctrl+Shift+R',
    },
  },
};

export interface EditorSettings {
  preset: PresetId;
  /** Only used when preset is 'custom'. */
  custom: Bindings;
  imageDuration: number;
  textDuration: number;
  snapping: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = { preset: 'bench', custom: COMMON, imageDuration: 3, textDuration: 3, snapping: true };

export function bindingsOf(s: EditorSettings): Bindings {
  return s.preset === 'custom' ? { ...COMMON, ...s.custom } : PRESETS[s.preset].bindings;
}

// ---------- Key combos ----------

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Esc: 'Escape', '+': '=',
};

/** The combo for a key press, e.g. "Ctrl+Shift+Z"; null for a lone modifier. */
export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return null;
  // Use the physical key for letters, digits and symbols, so Shift and other layouts (e.g. Arabic) still match.
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') key = '=';
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') key = '-';
  else if (e.code === 'Backslash') key = '\\';
  else key = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** Splits "Ctrl+Shift+Z" into modifiers and key. */
export function parseCombo(combo: string) {
  const parts = combo.split('+');
  // "Ctrl+=" and "Ctrl+-" end with the key itself.
  const key = combo.endsWith('++') ? '+' : parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  return { key, ctrl: mods.includes('Ctrl'), shift: mods.includes('Shift'), alt: mods.includes('Alt') };
}

/** How a combo is shown to people (Mac users see ⌘ instead of Ctrl). */
export function displayCombo(combo: string) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const names: Record<string, string> = { Left: '←', Right: '→', Up: '↑', Down: '↓', Escape: 'Esc', Delete: 'Del', Backspace: '⌫' };
  return combo.split('+').map((p) => (p === 'Ctrl' && mac ? '⌘' : names[p] ?? p));
}

export function actionForCombo(b: Bindings, combo: string): ActionId | null {
  for (const a of ACTIONS) if (b[a.id] === combo) return a.id;
  return null;
}

// ---------- Store ----------

const KEY = 'bench-video-editor-settings';
const listeners = new Set<(s: EditorSettings) => void>();
let current: EditorSettings = load();

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<EditorSettings>;
    return { ...DEFAULT_SETTINGS, ...s, custom: { ...COMMON, ...(s.custom ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getEditorSettings() {
  return current;
}

export function setEditorSettings(next: EditorSettings) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: keep for this visit */
  }
  listeners.forEach((l) => l(next));
}

export function useEditorSettings() {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/** Sets one action's combo; any other action that used it gets `swapWith` (or nothing). Switches to Custom. */
export function rebind(s: EditorSettings, action: ActionId, combo: string, swapWith: string | null): EditorSettings {
  const b = { ...bindingsOf(s) };
  const other = actionForCombo(b, combo);
  if (other && other !== action) b[other] = swapWith ?? '';
  b[action] = combo;
  return { ...s, preset: 'custom', custom: b };
}
