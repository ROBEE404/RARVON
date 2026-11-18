import { describe, expect, it } from 'vitest';
import { parsePageRange } from '../../src/lib/pageRange';

describe('parsePageRange', () => {
  it.each([
    ['1, 4', 5, [1, 4]],
    ['1-3, 5', 10, [1, 2, 3, 5]],
    ['3-1', 5, [1, 2, 3]],
    ['2 - 4', 5, [2, 3, 4]],
    ['2\u20134', 5, [2, 3, 4]],
    ['4-9', 5, [4, 5]],
    ['0, 6, 2', 5, [2]],
    ['5,5,1-2,2', 5, [1, 2, 5]],
    ['abc, 2', 5, [2]],
    ['', 5, []],
  ] as [string, number, number[]][])('%j of %i pages -> %j', (input, max, expected) => {
    expect(parsePageRange(input, max)).toEqual(expected);
  });
});
