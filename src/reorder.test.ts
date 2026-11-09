import { describe, expect, it } from 'vitest';

import { moveItem } from './reorder';

describe('moveItem', () => {
  it.each([
    { from: 0, to: 1, want: ['b', 'a', 'c', 'd'] },
    { from: 3, to: 2, want: ['a', 'b', 'd', 'c'] },
    { from: 0, to: 3, want: ['b', 'c', 'd', 'a'] },
    { from: 3, to: 0, want: ['d', 'a', 'b', 'c'] },
    { from: 2, to: 2, want: ['a', 'b', 'c', 'd'] },
    { from: 0, to: -1, want: ['a', 'b', 'c', 'd'] },
    { from: 3, to: 4, want: ['a', 'b', 'c', 'd'] },
    { from: 7, to: 0, want: ['a', 'b', 'c', 'd'] },
  ])('moves the item at $from to $to', ({ from, to, want }) => {
    expect(moveItem(['a', 'b', 'c', 'd'], from, to)).toEqual(want);
  });

  it('leaves the list it was given as it was', () => {
    const list = [1, 2, 3];
    moveItem(list, 0, 2);
    expect(list).toEqual([1, 2, 3]);
  });

  it('moves nothing in an empty list', () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
