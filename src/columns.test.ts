import assert from 'node:assert/strict';
import test from 'node:test';

import { columnCountFor, packColumns, shortestColumn } from './columns.ts';

const base = { gap: 18, cardWidth: 300, presentation: 'editorial' as const };

test('phone width: one column, two for compact', () => {
  assert.equal(columnCountFor({ ...base, containerWidth: 390, gridWidth: 366 }), 1);
  assert.equal(
    columnCountFor({
      ...base,
      presentation: 'compact',
      cardWidth: 200,
      gap: 14,
      containerWidth: 390,
      gridWidth: 366,
    }),
    2,
  );
});

test('wide pane follows column-width arithmetic', () => {
  // (1000 + 18) / (300 + 18) = 3.2 -> 3
  assert.equal(columnCountFor({ ...base, containerWidth: 1040, gridWidth: 1000 }), 3);
  // just under two cards wide -> 1
  assert.equal(columnCountFor({ ...base, containerWidth: 640, gridWidth: 610 }), 1);
});

test('compact clamps card width to 46% of the container', () => {
  assert.equal(
    columnCountFor({
      presentation: 'compact',
      cardWidth: 200,
      gap: 14,
      containerWidth: 600,
      gridWidth: 570,
    }),
    2,
  );
});

test('a hidden pane (zero width) still gets one column', () => {
  assert.equal(columnCountFor({ ...base, containerWidth: 0, gridWidth: 0 }), 1);
});

test('shortestColumn picks the lowest height, leftmost on ties', () => {
  assert.equal(shortestColumn([120, 80, 80]), 1);
  assert.equal(shortestColumn([0, 0]), 0);
  assert.equal(shortestColumn([300]), 0);
});

test('packColumns fills the shortest column card by card', () => {
  const heights = [0, 0];
  assert.deepEqual(packColumns(heights, [100, 40, 40, 30]), [0, 1, 1, 1]);
  assert.deepEqual(heights, [100, 110]);
});

test('packColumns continues from the heights already in the columns', () => {
  const heights = [50, 0, 20];
  assert.deepEqual(packColumns(heights, [30, 30, 30]), [1, 2, 1]);
  assert.deepEqual(heights, [50, 60, 50]);
});

test('packColumns matches placing one card at a time and re-measuring', () => {
  // The old path: append, read the column back as offsetHeight (whole
  // pixels), pick the next shortest.
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  for (let round = 0; round < 400; round += 1) {
    const columnCount = 2 + (round % 7);
    // Card heights carry sub-pixel fractions (measured: .172, .18), and steps
    // of 20 make columns land within a pixel of each other: the tie cases.
    const extents = Array.from(
      { length: 72 },
      () => 80 + Math.floor(random() * 6) * 20 + [0, 0.172, 0.18][Math.floor(random() * 3)]!,
    );
    const start = Array.from({ length: columnCount }, () => Math.floor(random() * 3) * 20);
    const exact = [...start];
    const offsetHeights = start.map((height) => Math.round(height));
    const expected = extents.map((extent) => {
      const index = shortestColumn(offsetHeights);
      exact[index] = (exact[index] ?? 0) + extent;
      offsetHeights[index] = Math.round(exact[index] ?? 0);
      return index;
    });
    const heights = [...start];
    assert.deepEqual(packColumns(heights, extents), expected);
    assert.deepEqual(heights, exact);
  }
});

test('packColumns treats columns a sub-pixel apart as tied, leftmost wins', () => {
  // 100.18 and 100.172 both read back as 100 px: the left column takes it.
  assert.deepEqual(packColumns([100.18, 100.172], [50]), [0]);
});
