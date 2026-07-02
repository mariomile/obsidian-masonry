import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedNumber,
  createRefreshSignal,
  createScanText,
  hasActiveFilters,
  formatRelativeDate,
  isRenderableViewport,
  matchesGalleryItem,
  normalizeText,
  ROOT_FOLDER_FILTER,
  sortGalleryItems,
  topLevelFolder,
} from './utils.ts';
import type { GalleryItem } from './types.ts';

const fileStub = {} as GalleryItem['file'];

function item(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    file: fileStub,
    path: 'Projects/Example.md',
    title: 'Sustainable growth',
    folder: 'Projects',
    topFolder: 'Projects',
    tags: ['domain/product', 'status/active'],
    mtime: 20,
    ctime: 10,
    ...overrides,
  };
}

test('normalizeText makes searches case and accent insensitive', () => {
  assert.equal(normalizeText('Caffè Èlite'), 'caffe elite');
});

test('matchesGalleryItem combines text, folder, and tag filters', () => {
  const candidate = item();
  assert.equal(
    matchesGalleryItem(candidate, {
      query: 'GROWTH product',
      folder: 'Projects',
      tag: 'status/active',
    }),
    true,
  );
  assert.equal(
    matchesGalleryItem(candidate, {
      query: '',
      folder: 'Resources',
      tag: '',
    }),
    false,
  );
  assert.equal(
    matchesGalleryItem(item({ path: 'README.md', topFolder: '' }), {
      query: '',
      folder: ROOT_FOLDER_FILTER,
      tag: '',
    }),
    true,
  );
});

test('sortGalleryItems preserves source data and applies requested order', () => {
  const source = [
    item({ title: 'Beta', mtime: 1 }),
    item({ title: 'Alpha', mtime: 3 }),
  ];
  const sorted = sortGalleryItems(source, 'modified-desc');
  assert.deepEqual(
    sorted.map((entry) => entry.title),
    ['Alpha', 'Beta'],
  );
  assert.deepEqual(
    source.map((entry) => entry.title),
    ['Beta', 'Alpha'],
  );
});

test('scan text removes document chrome and keeps readable link labels', () => {
  const markdown = [
    '---',
    'type: reference',
    '---',
    '# Other',
    '',
    '> [!note] Title',
    '> Body with [[Target|label]] and **emphasis**.',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```ts',
    'const x = 1;',
    '```',
    '',
    '![[cover.png]]',
    '<div>Hidden wrapper</div>',
  ].join('\n');

  assert.equal(
    createScanText(markdown, 'Other', 200),
    'Title Body with label and emphasis. A B 1 2 Hidden wrapper',
  );
});

test('active filters ignore an empty query and detect selected values', () => {
  assert.equal(
    hasActiveFilters({ query: '  ', folder: '', tag: '' }),
    false,
  );
  assert.equal(
    hasActiveFilters({ query: '', folder: 'Projects', tag: '' }),
    true,
  );
});

test('topLevelFolder identifies vault-root notes and nested notes', () => {
  assert.equal(topLevelFolder('Projects/Example.md'), 'Projects');
  assert.equal(topLevelFolder('README.md'), '');
});

test('hidden zero-sized surfaces are not renderable viewports', () => {
  assert.equal(isRenderableViewport({ width: 0, height: 640 }), false);
  assert.equal(isRenderableViewport({ width: 960, height: 0 }), false);
  assert.equal(isRenderableViewport({ width: 960, height: 640 }), true);
});

test('persisted numeric settings are constrained to safe bounds', () => {
  assert.equal(boundedNumber(0, 48, 1, 120), 1);
  assert.equal(boundedNumber(10_000, 48, 1, 120), 120);
  assert.equal(boundedNumber(Number.NaN, 48, 1, 120), 48);
  assert.equal(boundedNumber('48', 24, 1, 120), 24);
});

test('relative dates use English public UI copy', () => {
  const now = Date.UTC(2026, 6, 2, 12);
  assert.equal(formatRelativeDate(now - 30_000, now), 'just now');
  assert.equal(formatRelativeDate(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatRelativeDate(now - 3 * 3_600_000, now), '3 hr ago');
  assert.equal(formatRelativeDate(now - 2 * 86_400_000, now), '2 days ago');
});

test('refresh signals notify active listeners and support cleanup', () => {
  const signal = createRefreshSignal();
  let calls = 0;
  const unsubscribe = signal.subscribe(() => {
    calls += 1;
  });

  signal.emit();
  unsubscribe();
  signal.emit();

  assert.equal(calls, 1);
});
