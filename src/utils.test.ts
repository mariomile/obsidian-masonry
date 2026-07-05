import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedNumber,
  createRefreshSignal,
  createScanText,
  formatPropertyValue,
  hasActiveFilters,
  formatRelativeDate,
  isPathExcluded,
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
    matchesGalleryItem(item({ path: 'README.md', folder: '', topFolder: '' }), {
      query: '',
      folder: ROOT_FOLDER_FILTER,
      tag: '',
    }),
    true,
  );
});

test('the folder filter matches nested subfolders as a path prefix', () => {
  const nested = item({
    path: 'Active/Projects/Exo/context.md',
    folder: 'Active/Projects/Exo',
    topFolder: 'Active',
  });
  // Selecting a parent folder includes descendants…
  assert.equal(
    matchesGalleryItem(nested, { query: '', folder: 'Active', tag: '' }),
    true,
  );
  // …and selecting the exact subfolder matches too.
  assert.equal(
    matchesGalleryItem(nested, {
      query: '',
      folder: 'Active/Projects/Exo',
      tag: '',
    }),
    true,
  );
  // A sibling prefix must not match on partial string overlap.
  assert.equal(
    matchesGalleryItem(nested, {
      query: '',
      folder: 'Active/Projects/Ex',
      tag: '',
    }),
    false,
  );
});

test('isPathExcluded removes files under configured folder prefixes', () => {
  const excluded = ['_system', 'Resources/Templates/'];
  assert.equal(isPathExcluded('_system/memory/log.md', excluded), true);
  assert.equal(isPathExcluded('Resources/Templates/Daily.md', excluded), true);
  // A folder name that is only a string prefix of another must not match.
  assert.equal(isPathExcluded('_systemic/note.md', excluded), false);
  assert.equal(isPathExcluded('Active/Projects/Exo.md', excluded), false);
  // Blank and whitespace-only entries are ignored.
  assert.equal(isPathExcluded('any/path.md', ['', '   ']), false);
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

test('sortGalleryItems supports ascending creation order', () => {
  const source = [
    item({ title: 'Newer', ctime: 30 }),
    item({ title: 'Older', ctime: 10 }),
  ];
  assert.deepEqual(
    sortGalleryItems(source, 'created-asc').map((entry) => entry.title),
    ['Older', 'Newer'],
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

test('formatPropertyValue skips null-like and empty values', () => {
  assert.equal(formatPropertyValue(''), null);
  assert.equal(formatPropertyValue('   '), null);
  assert.equal(formatPropertyValue('null'), null);
  assert.equal(formatPropertyValue('undefined'), null);
  assert.equal(formatPropertyValue('NULL'), null);
});

test('formatPropertyValue renders a wikilink as its basename', () => {
  assert.equal(formatPropertyValue('[[Product Heroes]]'), 'Product Heroes');
  assert.equal(
    formatPropertyValue('[[Active/Projects/DeepAgent/DeepAgent]]'),
    'DeepAgent',
  );
});

test('formatPropertyValue prefers a wikilink alias over the target', () => {
  assert.equal(formatPropertyValue('[[Path/To/Note|Acme Inc]]'), 'Acme Inc');
});

test('formatPropertyValue cleans multiple wikilinks in a list value', () => {
  assert.equal(formatPropertyValue('[[Acme]], [[Beta Co]]'), 'Acme, Beta Co');
});

test('formatPropertyValue passes plain text through untouched', () => {
  assert.equal(formatPropertyValue('Product Growth Newsletter'), 'Product Growth Newsletter');
  assert.equal(formatPropertyValue('  Trade Republic  '), 'Trade Republic');
});

test('formatPropertyValue returns null when a value cleans to empty', () => {
  assert.equal(formatPropertyValue('[[]]'), null);
});
