import assert from 'node:assert/strict';
import test from 'node:test';

import { columnCountFor, shortestColumn } from './columns.ts';

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
