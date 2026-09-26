import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceLeaf } from 'obsidian';
import { folderOf, toTabEntry } from './tab-source.ts';
import { leafId } from './obsidian-internals.ts';

function mockLeaf(over: Record<string, unknown>): WorkspaceLeaf {
  return {
    id: over.id,
    getDisplayText: () => (over.title as string) ?? 'Untitled',
    getIcon: () => (over.icon as string) ?? 'file',
    getViewState: () => ({ type: 'markdown', state: { file: over.file } }),
  } as unknown as WorkspaceLeaf;
}

test('toTabEntry maps title, icon, file path', () => {
  const leaf = mockLeaf({
    id: 'a',
    title: 'Note A',
    icon: 'document',
    file: 'Folder/Note A.md',
  });
  const entry = toTabEntry(leaf, 'a');
  assert.equal(entry.id, 'a');
  assert.equal(entry.title, 'Note A');
  assert.equal(entry.icon, 'document');
  assert.equal(entry.filePath, 'Folder/Note A.md');
  assert.equal(entry.active, true);
});

test('toTabEntry marks inactive and null file for non-file views', () => {
  const leaf = mockLeaf({ id: 'b', title: 'Graph', file: undefined });
  const entry = toTabEntry(leaf, 'a');
  assert.equal(entry.active, false);
  assert.equal(entry.filePath, null);
});

test('leafId falls back to a minted id when native id missing', () => {
  const leaf = mockLeaf({ title: 'X' });
  const first = leafId(leaf);
  assert.match(first, /^tabx-\d+$/);
  assert.equal(leafId(leaf), first);
});

test('folderOf returns parent folder or empty for root', () => {
  assert.equal(folderOf('A/B/note.md'), 'A/B');
  assert.equal(folderOf('note.md'), '');
  assert.equal(folderOf(null), '');
});
