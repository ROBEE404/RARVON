import { describe, expect, it } from 'vitest';
import { COLLECTIONS, resolveCollection } from '../../src/lib/collections';
import { getTool } from '../../src/lib/toolRegistry';
import { HOME_TOP_COLLECTION } from '../../src/lib/homeTools';

describe('Convert and Compress collections', () => {
  for (const c of Object.values(COLLECTIONS)) {
    it(`${c.slug}: every entry is a real, available tool listed once`, () => {
      const keys = c.groups.flatMap((g) => g.entries.map((e) => e.key));
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        const [cat, slug] = key.split('/');
        const tool = getTool(cat, slug);
        expect(tool, key).toBeTruthy();
        expect(tool!.status, key).not.toBe('coming-soon');
      }
      expect(resolveCollection(c).flatMap((g) => g.entries)).toHaveLength(keys.length);
    });
  }

  it('home cards only feature tools from their own collection', () => {
    for (const [slug, keys] of Object.entries(HOME_TOP_COLLECTION)) {
      const inColl = COLLECTIONS[slug as 'convert' | 'compress'].groups.flatMap((g) => g.entries.map((e) => e.key));
      expect(keys).toHaveLength(4);
      for (const k of keys) expect(inColl, k).toContain(k);
    }
  });
});
