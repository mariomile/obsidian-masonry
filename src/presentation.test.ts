import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPreviewCacheKey,
  buildWikilink,
  classifyTag,
  filterImageCandidates,
  isGalleryPresentation,
  nextImageCandidate,
  normalizeCoverCandidate,
  PRESENTATIONS,
  resolvePresentation,
} from './presentation.ts';

test('presentation modes map to distinct card behavior', () => {
  assert.deepEqual(PRESENTATIONS.compact, {
    cardWidth: 200,
    excerptLines: 5,
    previewMode: 'text',
    renderScale: 0,
  });
  assert.deepEqual(PRESENTATIONS.editorial, {
    cardWidth: 300,
    excerptLines: 7,
    previewMode: 'text',
    renderScale: 0,
  });
  assert.deepEqual(PRESENTATIONS.visual, {
    cardWidth: 360,
    excerptLines: 11,
    previewMode: 'text',
    renderScale: 0,
  });
  assert.deepEqual(PRESENTATIONS.rich, {
    cardWidth: 320,
    excerptLines: 0,
    previewMode: 'render',
    renderScale: 0.45,
  });
});

test('rich is the only mode that renders; the others stay textual', () => {
  // The capability is what hydrateCard branches on — not the mode name. If a
  // second rendering mode is ever added, this is the assertion that keeps the
  // branch honest.
  const rendering = Object.entries(PRESENTATIONS)
    .filter(([, definition]) => definition.previewMode === 'render')
    .map(([name]) => name);
  assert.deepEqual(rendering, ['rich']);

  for (const [name, definition] of Object.entries(PRESENTATIONS)) {
    const scaled = definition.renderScale > 0;
    assert.equal(
      scaled,
      definition.previewMode === 'render',
      `${name}: renderScale and previewMode disagree`,
    );
  }
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

test('presentation parsing rejects unknown persisted values', () => {
  assert.equal(isGalleryPresentation('compact'), true);
  assert.equal(resolvePresentation('visual'), 'visual');
  assert.equal(resolvePresentation('unknown'), 'editorial');
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
