import { describe, expect, it } from 'vitest';
import { STEP, applyCuts, autoThreshold, findSilences, keptRanges, mergeRanges } from '../../src/lib/videoEditor/audioAnalysis';
import type { SoundAnalysis } from '../../src/lib/videoEditor/audioAnalysis';
import type { Timeline } from '../../src/lib/videoEditor/types';

/** A loudness curve from [seconds, dB] segments. */
function curve(parts: [number, number][]): SoundAnalysis {
  const total = parts.reduce((n, [d]) => n + d, 0);
  const db = new Float32Array(Math.round(total / STEP));
  let i = 0;
  for (const [d, level] of parts) for (let k = 0; k < Math.round(d / STEP); k++) db[i++] = level;
  return { duration: total, db, preview: new Float32Array(1), previewRate: 8000 };
}

// Talk 1.5 s, pause 1.2 s, talk 1 s, breath 0.3 s, talk 1 s, pause 1.5 s, talk 1 s.
const speech = curve([[1.5, -20], [1.2, -70], [1, -22], [0.3, -70], [1, -21], [1.5, -70], [1, -20]]);

describe('silence detection', () => {
  it('puts the automatic quiet level between the background and the voice', () => {
    const t = autoThreshold(speech.db, 0, speech.duration);
    expect(t).toBeGreaterThan(-70);
    expect(t).toBeLessThan(-22);
  });

  it('finds long pauses, ignores short breaths, and keeps breathing room', () => {
    const { silences } = findSilences(speech, 0, speech.duration, { thresholdDb: null, minPause: 0.5, padding: 0.15 });
    expect(silences).toHaveLength(2);
    expect(silences[0].start).toBeCloseTo(1.65, 1);
    expect(silences[0].end).toBeCloseTo(2.55, 1);
    expect(silences[1].start).toBeCloseTo(5.15, 1);
    expect(silences[1].end).toBeCloseTo(6.35, 1);
  });

  it('a lower shortest-pause setting also catches the breath', () => {
    const { silences } = findSilences(speech, 0, speech.duration, { thresholdDb: null, minPause: 0.2, padding: 0 });
    expect(silences).toHaveLength(3);
  });

  it('only looks inside the clip’s range', () => {
    const { silences } = findSilences(speech, 3, speech.duration, { thresholdDb: null, minPause: 0.5, padding: 0.15 });
    expect(silences).toHaveLength(1);
  });
});

describe('cutting', () => {
  it('merges overlapping cuts and returns what is kept', () => {
    expect(mergeRanges([{ start: 2, end: 3 }, { start: 1, end: 2.5 }])).toEqual([{ start: 1, end: 3 }]);
    expect(keptRanges(0, 10, [{ start: 2, end: 3 }, { start: 5, end: 6 }])).toEqual([
      { start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 10 },
    ]);
  });

  const base: Timeline = {
    video: [{ id: 'v1', mediaId: 'm', in: 0, out: 10, speed: 1, volume: 1, muted: false, fit: 'contain', fadeIn: 0.5, fadeOut: 0.5 }],
    text: [],
    audio: [{ id: 'a1', mediaId: 'mus', start: 4, in: 0, out: 10, volume: 1, fadeIn: 0, fadeOut: 0 }],
  };
  const cuts = [{ start: 2, end: 3 }, { start: 5, end: 6 }];

  it('cutting a video clip together with its picture removes the parts', () => {
    const tl = applyCuts(base, 'video', 'v1', cuts, true);
    expect(tl.video.map((c) => [c.in, c.out])).toEqual([[0, 2], [3, 5], [6, 10]]);
    expect(tl.video[0].id).toBe('v1');
    expect(tl.video[0].fadeIn).toBe(0.5);
    expect(tl.video[1].fadeIn).toBe(0);
    expect(tl.video[2].fadeOut).toBe(0.5);
  });

  it('cutting only the sound keeps the picture and mutes the cut parts', () => {
    const tl = applyCuts(base, 'video', 'v1', cuts, false);
    expect(tl.video.map((c) => [c.in, c.out, c.muted])).toEqual([
      [0, 2, false], [2, 3, true], [3, 5, false], [5, 6, true], [6, 10, false],
    ]);
  });

  it('cutting music closes the gaps from where the clip started', () => {
    const tl = applyCuts(base, 'audio', 'a1', cuts, true);
    expect(tl.audio.map((c) => [c.start, c.in, c.out])).toEqual([[4, 0, 2], [6, 3, 5], [8, 6, 10]]);
  });
});
