import { describe, expect, it } from 'vitest';
import { cropTimeline, estimateSize, sizeFor, applyPreset, PRESETS, defaultSettings } from '../../src/lib/videoEditor/exportSettings';
import type { Project, Timeline } from '../../src/lib/videoEditor/types';
import { emptyProject, totalDuration } from '../../src/lib/videoEditor/types';

describe('export sizes', () => {
  it('turns a frame shape and short side into even pixel sizes', () => {
    expect(sizeFor('16:9', 1080)).toEqual({ width: 1920, height: 1080 });
    expect(sizeFor('16:9', 2160)).toEqual({ width: 3840, height: 2160 });
    expect(sizeFor('9:16', 1080)).toEqual({ width: 1080, height: 1920 });
    expect(sizeFor('1:1', 720)).toEqual({ width: 720, height: 720 });
    expect(sizeFor('16:9', 480)).toEqual({ width: 854, height: 480 });
  });
});

describe('cropping the timeline to a part', () => {
  const tl: Timeline = {
    video: [
      { id: 'a', mediaId: 'm', in: 0, out: 4, speed: 1, volume: 1, muted: false, fit: 'contain', fadeIn: 1, fadeOut: 1 },
      { id: 'b', mediaId: 'm', in: 10, out: 16, speed: 2, volume: 1, muted: false, fit: 'contain', fadeIn: 0, fadeOut: 0 },
    ],
    text: [{ id: 't', start: 1, duration: 4, text: 'Hi', size: 0.08, color: '#fff', position: 'bottom', box: false, fadeIn: 0, fadeOut: 0 }],
    audio: [{ id: 'm1', mediaId: 'mu', start: 2, in: 0, out: 10, volume: 1, fadeIn: 0, fadeOut: 0 }],
  };

  it('keeps only what falls inside, starting at zero', () => {
    // Video track: a = 0–4 s, b = 4–7 s (6 s of source at 2× speed). Crop 3–5 s.
    const out = cropTimeline(tl, 3, 5);
    expect(totalDuration(out)).toBeCloseTo(2, 5);
    expect(out.video.map((c) => [c.id, c.in, c.out])).toEqual([['a', 3, 4], ['b', 10, 12]]);
    expect(out.video[0].fadeIn).toBe(0); // cut in the middle: no fade-in
    expect(out.text[0]).toMatchObject({ start: 0, duration: 2 });
    expect(out.audio[0]).toMatchObject({ start: 0, in: 1, out: 3 });
  });

  it('drops clips completely outside the part', () => {
    const out = cropTimeline(tl, 5, 6);
    expect(out.video.map((c) => c.id)).toEqual(['b']);
    expect(out.text).toEqual([]);
  });
});

describe('presets and estimates', () => {
  const project: Project = { ...emptyProject('P', '16:9', true, false), timeline: { video: [{ id: 'a', mediaId: 'm', in: 0, out: 60, speed: 1, volume: 1, muted: false, fit: 'contain', fadeIn: 0, fadeOut: 0 }], text: [], audio: [] } };

  it('a preset sets the frame shape and size, and a manual change does not touch other presets', () => {
    const shorts = applyPreset(defaultSettings(project), PRESETS.find((p) => p.id === 'shorts')!, project);
    expect(shorts).toMatchObject({ aspect: '9:16', short: 1080, format: 'mp4', preset: 'shorts' });
    const audio = applyPreset(defaultSettings(project), PRESETS.find((p) => p.id === 'audio')!, project);
    expect(audio.format).toBe('mp3');
  });

  it('estimates grow with resolution and quality, and audio-only is far smaller', () => {
    const base = defaultSettings(project);
    const s720 = estimateSize(project, { ...base, short: 720 });
    const s1080 = estimateSize(project, { ...base, short: 1080 });
    const high = estimateSize(project, { ...base, short: 1080, quality: 'high' });
    const mp3 = estimateSize(project, { ...base, format: 'mp3' });
    expect(s1080).toBeGreaterThan(s720);
    expect(high).toBeGreaterThan(s1080);
    expect(mp3).toBeLessThan(s720 / 5);
    // A minute of balanced 1080p30 lands in a realistic range (tens of MB).
    expect(s1080 / 1e6).toBeGreaterThan(15);
    expect(s1080 / 1e6).toBeLessThan(60);
  });
});
