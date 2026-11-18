import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_SETTINGS, PRESETS, actionForCombo, bindingsOf, comboFromEvent, parseCombo, rebind } from '../../src/lib/videoEditor/shortcuts';

const key = (k: string, code: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) =>
  comboFromEvent({ key: k, code, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, altKey: !!mods.alt });

describe('key combos', () => {
  it('builds combos from key presses', () => {
    expect(key('s', 'KeyS')).toBe('S');
    expect(key('z', 'KeyZ', { ctrl: true, shift: true })).toBe('Ctrl+Shift+Z');
    expect(key('b', 'KeyB', { meta: true })).toBe('Ctrl+B'); // ⌘ on a Mac counts as Ctrl
    expect(key(' ', 'Space')).toBe('Space');
    expect(key('ArrowLeft', 'ArrowLeft', { shift: true })).toBe('Shift+Left');
    expect(key('Shift', 'ShiftLeft', { shift: true })).toBeNull();
  });

  it('uses the physical key, so other keyboard layouts and Shift still match', () => {
    expect(key('س', 'KeyS')).toBe('S'); // Arabic layout
    expect(key('$', 'Digit4', { shift: true })).toBe('Shift+4');
    expect(key('+', 'Equal', { ctrl: true, shift: false })).toBe('Ctrl+=');
  });

  it('parses combos', () => {
    expect(parseCombo('Ctrl+Shift+Z')).toEqual({ key: 'Z', ctrl: true, shift: true, alt: false });
    expect(parseCombo('Ctrl+-')).toMatchObject({ key: '-', ctrl: true });
  });
});

describe('presets', () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    it(`${p.label}: every action has a key and no key is used twice`, () => {
      const combos = ACTIONS.map((a) => p.bindings[a.id]);
      expect(combos.every(Boolean), id).toBe(true);
      expect(new Set(combos).size, id).toBe(combos.length);
    });
  }

  it('Premiere and DaVinci styles use their familiar split keys', () => {
    expect(PRESETS.premiere.bindings.split).toBe('Ctrl+K');
    expect(PRESETS.resolve.bindings.split).toBe('Ctrl+B');
  });
});

describe('changing a key', () => {
  it('a free key is simply assigned, and the preset becomes Custom', () => {
    const s = rebind(DEFAULT_SETTINGS, 'split', 'Ctrl+K', null);
    expect(s.preset).toBe('custom');
    expect(bindingsOf(s).split).toBe('Ctrl+K');
  });

  it('a taken key is swapped, so two actions never share a key', () => {
    const s = rebind(DEFAULT_SETTINGS, 'split', 'Ctrl+Z', 'S');
    const b = bindingsOf(s);
    expect(b.split).toBe('Ctrl+Z');
    expect(b.undo).toBe('S');
    expect(actionForCombo(b, 'Ctrl+Z')).toBe('split');
  });

  it('or the other action loses it', () => {
    const b = bindingsOf(rebind(DEFAULT_SETTINGS, 'split', 'Ctrl+Z', null));
    expect(b.undo).toBe('');
  });
});
