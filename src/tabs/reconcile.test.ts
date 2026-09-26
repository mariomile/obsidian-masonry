import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardSignature, planReconcile } from './reconcile.ts';

test('planReconcile treats no change as a (no-op) removal', () => {
  const plan = planReconcile(['a', 'b', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(plan, { kind: 'remove', removed: [] });
});

test('planReconcile detects a pure removal from the middle', () => {
  // Closing tab "b" leaves the survivors in the same relative order.
  const plan = planReconcile(['a', 'b', 'c'], ['a', 'c']);
  assert.deepEqual(plan, { kind: 'remove', removed: ['b'] });
});

test('planReconcile detects removal of several tabs at once', () => {
  const plan = planReconcile(['a', 'b', 'c', 'd'], ['b', 'd']);
  assert.deepEqual(plan, { kind: 'remove', removed: ['a', 'c'] });
});

test('planReconcile falls back to full when a tab is added', () => {
  const plan = planReconcile(['a', 'b'], ['a', 'b', 'c']);
  assert.deepEqual(plan, { kind: 'full' });
});

test('planReconcile falls back to full when survivors are reordered', () => {
  // Sort/search can reshuffle order → not a surgical removal.
  const plan = planReconcile(['a', 'b', 'c'], ['c', 'a']);
  assert.deepEqual(plan, { kind: 'full' });
});

test('planReconcile falls back to full on an add+remove mix', () => {
  const plan = planReconcile(['a', 'b'], ['a', 'c']);
  assert.deepEqual(plan, { kind: 'full' });
});

test('planReconcile handles an empty next list as removing everything', () => {
  const plan = planReconcile(['a', 'b'], []);
  assert.deepEqual(plan, { kind: 'remove', removed: ['a', 'b'] });
});

test('cardSignature changes with presentation but not with focus', () => {
  const card = {
    entry: { title: 'A', icon: 'file', filePath: 'A.md', active: false },
    folder: '',
    mtime: 1,
    tags: [],
  } as unknown as Parameters<typeof cardSignature>[0];
  const active = { ...card, entry: { ...card.entry, active: true } };
  assert.equal(
    cardSignature(card, true, true, 'compact'),
    cardSignature(active, true, true, 'compact'),
  );
  assert.notEqual(
    cardSignature(card, true, true, 'compact'),
    cardSignature(card, true, true, 'visual'),
  );
});
