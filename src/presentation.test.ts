import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPreviewCacheKey,
  buildWikilink,
  CARD,
  classifyTag,
  filterImageCandidates,
  nextImageCandidate,
  normalizeCoverCandidate,
} from './presentation.ts';

test('the one card keeps the former editorial geometry', () => {
  assert.deepEqual(CARD, { width: 300, excerptLines: 7, renderScale: 0.46 });
});

test('tag classification preserves semantic prefixes', () => {
  assert.equal(classifyTag('status/active'), 'status');
  assert.equal(classifyTag('type/reference'), 'type');
  assert.equal(classifyTag('domain/product'), 'domain');
  assert.equal(classifyTag('misc'), 'other');
});

test('cover candidates normalize common frontmatter shapes', () => {
  assert.equal(normalizeCoverCandidate('![[cover.png]]'), 'cover.png');
  assert.equal(
    normalizeCoverCandidate('https://example.com/cover.jpg'),
    'https://example.com/cover.jpg',
  );
  assert.equal(normalizeCoverCandidate(['cover.png']), 'cover.png');
  assert.equal(normalizeCoverCandidate(undefined), undefined);
});

test('wikilinks omit markdown extensions and unnecessary aliases', () => {
  assert.equal(
    buildWikilink('Projects/Example.md', 'Example'),
    '[[Projects/Example]]',
  );
  assert.equal(
    buildWikilink('Projects/Example context.md', 'Example'),
    '[[Projects/Example context|Example]]',
  );
});

test('image candidates advance in priority order after a failure', () => {
  const candidates = ['cover.jpg', 'image.jpg', 'embedded.jpg'];
  assert.equal(nextImageCandidate(candidates), 'cover.jpg');
  assert.equal(nextImageCandidate(candidates, 'cover.jpg'), 'image.jpg');
  assert.equal(nextImageCandidate(candidates, 'image.jpg'), 'embedded.jpg');
  assert.equal(nextImageCandidate(candidates, 'embedded.jpg'), undefined);
  assert.equal(nextImageCandidate([]), undefined);
});

test('remote image candidates require explicit opt-in', () => {
  const candidates = [
    'app://local/image.jpg',
    'https://example.com/cover.jpg',
    'http://example.com/legacy.png',
  ];

  assert.deepEqual(filterImageCandidates(candidates, false), [
    'app://local/image.jpg',
  ]);
  assert.deepEqual(filterImageCandidates(candidates, true), candidates);
});

test('remote image policy participates in the preview cache key', () => {
  assert.notEqual(
    buildPreviewCacheKey('Projects/Example.md', 100, 700, false),
    buildPreviewCacheKey('Projects/Example.md', 100, 700, true),
  );
});
