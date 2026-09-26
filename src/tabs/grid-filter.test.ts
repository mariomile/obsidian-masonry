import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TabCard } from './types.ts';
import {
  isGridSort,
  matchesQuery,
  resolveSort,
  sortCards,
} from './grid-filter.ts';

function card(
  title: string,
  over: Partial<{ folder: string; tags: string[]; mtime: number | null }> = {},
): TabCard {
  return {
    entry: { title } as TabCard['entry'],
    folder: over.folder ?? '',
    tags: over.tags ?? [],
    mtime: over.mtime ?? null,
  };
}

test('resolveSort validates and falls back', () => {
  assert.equal(isGridSort('title-asc'), true);
  assert.equal(isGridSort('nope'), false);
  assert.equal(resolveSort('title-desc'), 'title-desc');
  assert.equal(resolveSort('bogus'), 'tab-order');
});

test('matchesQuery searches title, folder and tags (accent-folded)', () => {
  const c = card('Città Note', { folder: 'Active/Projects', tags: ['domain/career'] });
  assert.equal(matchesQuery(c, ''), true);
  assert.equal(matchesQuery(c, 'citta'), true); // accent-insensitive
  assert.equal(matchesQuery(c, 'projects'), true);
  assert.equal(matchesQuery(c, 'career'), true);
  assert.equal(matchesQuery(c, 'zzz'), false);
});

test('sortCards tab-order preserves input order', () => {
  const cards = [card('B'), card('A'), card('C')];
  assert.deepEqual(
    sortCards(cards, 'tab-order').map((c) => c.entry.title),
    ['B', 'A', 'C'],
  );
});

test('sortCards title-asc / title-desc', () => {
  const cards = [card('B'), card('A'), card('C')];
  assert.deepEqual(
    sortCards(cards, 'title-asc').map((c) => c.entry.title),
    ['A', 'B', 'C'],
  );
  assert.deepEqual(
    sortCards(cards, 'title-desc').map((c) => c.entry.title),
    ['C', 'B', 'A'],
  );
});

test('sortCards by mtime pushes null-mtime tabs last in both directions', () => {
  const cards = [
    card('old', { mtime: 100 }),
    card('none', { mtime: null }),
    card('new', { mtime: 300 }),
  ];
  assert.deepEqual(
    sortCards(cards, 'modified-desc').map((c) => c.entry.title),
    ['new', 'old', 'none'],
  );
  assert.deepEqual(
    sortCards(cards, 'modified-asc').map((c) => c.entry.title),
    ['old', 'new', 'none'],
  );
});
