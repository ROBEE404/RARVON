import { useMemo, useState } from 'react';
import { tr } from '../../../lib/i18n';

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export default function ColorTool() {
  const [hex, setHex] = useState('#5b56e8');

  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : '#000000'}
          onChange={(e) => setHex(e.target.value)}
          className="h-14 w-14 cursor-pointer rounded-md border border-line bg-transparent"
          aria-label={tr("Pick a color")}
        />
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder="#5b56e8"
          className="w-40 rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm focus:border-workshop"
        />
      </div>

      {rgb && hsl ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'HEX', value: rgbToHex(rgb.r, rgb.g, rgb.b) },
            { label: 'RGB', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
            { label: 'HSL', value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` },
          ].map((f) => (
            <div key={f.label} className="rounded-md border border-line bg-paper-dim p-3">
              <p className="text-xs font-medium text-ink-3">{f.label}</p>
              <button
                onClick={() => navigator.clipboard.writeText(f.value)}
                className="mt-1 font-mono text-sm hover:text-workshop"
                title={tr("Copy")}
              >
                {f.value}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-warn">{tr("Enter a valid hex color like #5b56e8.")}</p>
      )}
    </div>
  );
}
