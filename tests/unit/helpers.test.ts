import { describe, expect, it } from 'vitest';
import { isLikelyCompatible } from '../../src/lib/workspaceContext';
import { formatDuration } from '../../src/lib/audioUtils';
import { formatBytes, extensionFor } from '../../src/lib/imageUtils';

describe('isLikelyCompatible (tool chaining)', () => {
  const cases: [string, string | undefined, boolean][] = [
    ['a.pdf', 'application/pdf', true],
    ['a.pdf', 'image/*', false],
    ['a.png', 'image/*', true],
    ['a.png', 'image/jpeg,image/png', true],
    ['a.mp4', 'video/mp4,video/webm', true],
    ['a.webm', 'video/mp4,video/webm', true],
    ['a.webm', 'audio/*', true],
    ['a.wav', 'video/*', false],
    ['a.zip', 'application/pdf', false],
    ['a.heic', 'image/*,.heic,.heif', true],
    ['a.unknownext', 'application/pdf', true], // unknown types are left to the user
    ['a.pdf', undefined, true],
  ];
  it.each(cases)('%s vs %s -> %s', (name, accept, expected) => {
    expect(isLikelyCompatible(name, accept)).toBe(expected);
  });
});

describe('formatting helpers', () => {
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
  it('extensionFor', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
  });
});

// The video size limit is now the engine's: see engine.test.ts.
