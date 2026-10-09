import assert from 'node:assert/strict';
import test from 'node:test';

import { revealScrollLeft } from './reveal-tab.ts';

const strip = { left: 306, right: 890 };

test('a tab already in view does not move the strip', () => {
  assert.equal(revealScrollLeft(100, strip, { left: 400, right: 529 }), 100);
});

test('a tab past the right edge scrolls just enough to show it whole', () => {
  // Measured in the vault: active tab at 1026..1156 with the strip at scrollLeft 756.
  assert.equal(revealScrollLeft(756, strip, { left: 1026, right: 1156 }), 1022);
});

test('a tab past the left edge scrolls back to its start', () => {
  assert.equal(revealScrollLeft(500, strip, { left: 200, right: 329 }), 394);
});

test('a tab wider than the strip shows its start', () => {
  assert.equal(revealScrollLeft(0, strip, { left: 700, right: 1400 }), 394);
});
