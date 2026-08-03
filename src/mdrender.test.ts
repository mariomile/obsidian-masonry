import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MINI_BUDGET,
  buildMiniatureCacheKey,
  clampMiniatureHeight,
  createRenderPrefix,
  predictMiniatureHeight,
} from './kit/mdrender.ts';

/*
 * Contract for the rendered-miniature prefix builder (marioverse-kit/mdrender).
 *
 * These assertions encode the two bugs this module was extracted to fix — the
 * mis-pairing fence regex and the indiscriminate fence drop in obsidian-sonar's
 * original — plus the one artefact that reads as "broken" rather than "clipped":
 * a table cut in half.
 */

test('a frontmatter-only note is empty, and never reaches the renderer', () => {
  const result = createRenderPrefix('---\ntitle: X\ntags: [a]\n---\n\n   \n', 'X');
  assert.equal(result.empty, true);
  assert.equal(result.markdown, '');
});

test('an executing fence is dropped, a plain code fence is kept', () => {
  const md = 'Intro paragraph.\n\n```dataview\nTABLE file.name\n```\n\n```ts\nconst x = 1;\n```';
  const result = createRenderPrefix(md, 'Note');
  assert.ok(!result.markdown.includes('TABLE file.name'), 'dataview query survived');
  assert.ok(result.markdown.includes('const x = 1;'), 'plain ts fence was dropped');
});

test('a nested fence pairs correctly (the bug in the old regex)', () => {
  // The old /```[\s\S]*?```/g pairs the OUTER opener with the INNER opener and
  // swallows everything between, taking the prose with it.
  const md = ['````md', '```dataview', 'LIST', '```', '````', '', 'Prose after.'].join('\n');
  const result = createRenderPrefix(md, 'Note');
  assert.ok(result.markdown.includes('Prose after.'), 'prose after a nested fence was swallowed');
});

test('an unterminated fence is consumed to EOF, not leaked as prose', () => {
  const md = 'Intro.\n\n```dataview\nLIST\nno closing fence here';
  const result = createRenderPrefix(md, 'Note');
  assert.equal(result.markdown, 'Intro.');
});

test('note transclusions are dropped, image embeds are kept', () => {
  const md = 'Before.\n\n![[Another Note]]\n\n![[photo.png|300]]';
  const result = createRenderPrefix(md, 'Note');
  assert.ok(!result.markdown.includes('Another Note'), 'a note transclusion would recurse');
  assert.ok(result.markdown.includes('photo.png'), 'the image anchor was lost');
});

test('images beyond the budget are dropped', () => {
  const md = '![[a.png]] ![[b.png]] ![[c.png]] ![[d.png]]';
  const result = createRenderPrefix(md, 'Note', { maxImages: 2 });
  assert.equal(result.images, 2);
  assert.ok(result.markdown.includes('a.png') && result.markdown.includes('b.png'));
  assert.ok(!result.markdown.includes('c.png'), 'image budget was not enforced');
});

test('a table is never cut in half — it is excluded whole', () => {
  const table = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
  const md = `${'x'.repeat(60)}\n\n${table}`;
  // Budget admits the paragraph but not the table.
  const result = createRenderPrefix(md, 'Note', { maxCharacters: 70 });
  assert.equal(result.truncated, true);
  assert.ok(!result.markdown.includes('| 1 | 2 |'), 'a partial table survived');
  assert.ok(!result.markdown.includes('| a | b |'), 'a header-only table survived');
});

test('a leading H1 equal to the title is dropped; a different one is kept', () => {
  const same = createRenderPrefix('# My Note\n\nBody text.', 'My Note');
  assert.ok(!same.markdown.includes('# My Note'), 'the duplicated title was kept');
  assert.ok(same.markdown.includes('Body text.'));

  const other = createRenderPrefix('# Something Else\n\nBody text.', 'My Note');
  assert.ok(other.markdown.includes('# Something Else'), 'a real heading was dropped');
});

test('the H1 comparison folds case and accents, like createScanText', () => {
  const result = createRenderPrefix('# PERCHÉ\n\nCorpo.', 'perché');
  assert.ok(!result.markdown.includes('# PERCHÉ'));
});

test('block and character ceilings both bound the prefix', () => {
  const many = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
  const byBlocks = createRenderPrefix(many, 'N', { maxBlocks: 5, maxCharacters: 10_000 });
  assert.equal(byBlocks.blocks, 5);
  assert.equal(byBlocks.truncated, true);

  const byChars = createRenderPrefix(many, 'N', { maxBlocks: 100, maxCharacters: 40 });
  assert.ok(byChars.markdown.length <= 40);
  assert.equal(byChars.truncated, true);
});

test('a single oversized opening block is truncated rather than dropped', () => {
  const result = createRenderPrefix('y'.repeat(500), 'N', { maxCharacters: 100 });
  assert.equal(result.empty, false, 'the note rendered as empty despite having content');
  assert.equal(result.markdown.length, 100);
  assert.equal(result.truncated, true);
});

test('clampMiniatureHeight honours both ends of the band', () => {
  assert.deepEqual(clampMiniatureHeight(100, 0.45, 96, 340), { height: 96, clipped: false });
  assert.deepEqual(clampMiniatureHeight(1000, 0.45, 96, 340), { height: 340, clipped: true });
  assert.deepEqual(clampMiniatureHeight(400, 0.5, 96, 340), { height: 200, clipped: false });
});

test('predictMiniatureHeight is monotonic and stays inside the band', () => {
  let previous = 0;
  for (const size of [0, 200, 800, 2000, 50_000]) {
    const height = predictMiniatureHeight(size, 0.45, 96, 340);
    assert.ok(height >= previous, `height went down at size ${size}`);
    assert.ok(height >= 96 && height <= 340, `height ${height} left the band at size ${size}`);
    previous = height;
  }
});

test('the cache key separates content from the budget that shaped it', () => {
  const a = buildMiniatureCacheKey('n.md', 1, DEFAULT_MINI_BUDGET);
  const b = buildMiniatureCacheKey('n.md', 2, DEFAULT_MINI_BUDGET);
  const c = buildMiniatureCacheKey('n.md', 1, { ...DEFAULT_MINI_BUDGET, maxCharacters: 400 });
  assert.notEqual(a, b, 'mtime does not participate — a stale render would be served');
  assert.notEqual(a, c, 'budget does not participate — a differently-shaped render would be served');
  assert.ok(a.startsWith('n.md::'), 'invalidate(path) relies on this prefix');
});
