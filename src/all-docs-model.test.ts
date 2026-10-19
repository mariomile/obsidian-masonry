import assert from 'node:assert/strict';
import test from 'node:test';

import { AllDocsModel } from './all-docs-model.ts';
import type { GalleryItem } from './types.ts';

interface FakeFile {
  path: string;
  extension: string;
  tags: string[];
  mtime: number;
}

// Pure model fixtures; view event integration is covered in all-docs-view.test.ts.
function fixture(count: number, excluded: string[] = []) {
  const files: FakeFile[] = Array.from({ length: count }, (_, index) => ({
    path: `Notes/n${index}.md`, extension: 'md', tags: [], mtime: 0,
  }));
  const metadata = new Set(files.map((file) => file.path));
  let builds = 0;
  const model = new AllDocsModel<FakeFile>({
    listFiles: () => [...files],
    isExcluded: (path) => excluded.some((folder) => path.startsWith(`${folder}/`)),
    createItem: (file) => {
      builds += 1;
      return {
        file: file as unknown as GalleryItem['file'], path: file.path,
        title: file.path, folder: '', topFolder: '',
        tags: metadata.has(file.path) ? [...file.tags] : [],
        mtime: file.mtime, ctime: 0,
      };
    },
    hasMetadata: (file) => metadata.has(file.path),
  });
  return {
    files, metadata, model,
    builds: () => builds,
    resetCounts: () => { builds = 0; },
  };
}

const paths = (items: GalleryItem[]) => items.map((item) => item.path);
function at<T>(list: T[], index: number): T {
  const value = list[index];
  assert.ok(value !== undefined, `missing index ${index}`);
  return value;
}

test('one edit rebuilds one item instead of the whole vault', () => {
  const f = fixture(1000);
  const first = f.model.collect();
  assert.equal(f.builds(), 1000);
  f.resetCounts();

  const edited = at(f.files, 500);
  edited.mtime = 42;
  edited.tags = ['project'];
  f.model.markDirty(edited.path);
  f.model.markUnresolvedDirty();
  const second = f.model.collect();

  // Before this change every refresh rebuilt all 1000 items.
  assert.equal(f.builds(), 1);
  assert.equal(at(second, 500).mtime, 42);
  assert.deepEqual(at(second, 500).tags, ['project']);
  // Untouched notes keep their item objects, in vault order.
  assert.deepEqual(paths(second), paths(first));
  assert.equal(at(second, 0), at(first, 0));
  assert.equal(at(second, 999), at(first, 999));
});

test('a metadata re-parse after the refresh still lands: no stale tags', () => {
  const f = fixture(3);
  f.model.collect();
  const note = at(f.files, 1);
  // The refresh timer wins the race against the parser.
  f.model.markDirty(note.path);
  note.mtime = 5;
  assert.deepEqual(at(f.model.collect(), 1).tags, []);
  note.tags = ['late'];
  f.resetCounts();
  f.model.markDirty(note.path);
  f.model.markUnresolvedDirty();
  const items = f.model.collect();
  assert.deepEqual(at(items, 1).tags, ['late']);
  assert.equal(f.builds(), 1);
});

test('items built before the metadata cache knew the file rebuild on resolved', () => {
  const f = fixture(3);
  f.metadata.delete(at(f.files, 2).path);
  at(f.files, 2).tags = ['cold'];
  assert.deepEqual(at(f.model.collect(), 2).tags, []);
  f.metadata.add(at(f.files, 2).path);
  f.resetCounts();
  f.model.markUnresolvedDirty();
  const items = f.model.collect();
  assert.equal(f.builds(), 1);
  assert.deepEqual(at(items, 2).tags, ['cold']);
  f.resetCounts();
  f.model.markUnresolvedDirty();
  f.model.collect();
  assert.equal(f.builds(), 0);
});

test('create, delete and rename keep membership and vault order', () => {
  const f = fixture(3);
  f.model.collect();
  f.resetCounts();

  const created: FakeFile = { path: 'Notes/new.md', extension: 'md', tags: [], mtime: 1 };
  f.files.splice(1, 0, created);
  f.metadata.add(created.path);
  f.model.markDirty(created.path);
  assert.deepEqual(paths(f.model.collect()), ['Notes/n0.md', 'Notes/new.md', 'Notes/n1.md', 'Notes/n2.md']);
  assert.equal(f.builds(), 1);

  const deleted = at(f.files.splice(2, 1), 0);
  f.model.markDirty(deleted.path);
  assert.deepEqual(paths(f.model.collect()), ['Notes/n0.md', 'Notes/new.md', 'Notes/n2.md']);

  f.resetCounts();
  const renamed = at(f.files, 0);
  const oldPath = renamed.path;
  renamed.path = 'Archive/n0.md';
  f.model.markDirty(oldPath);
  f.model.markDirty(renamed.path);
  const items = f.model.collect();
  assert.deepEqual(paths(items), ['Archive/n0.md', 'Notes/new.md', 'Notes/n2.md']);
  assert.equal(f.builds(), 1);
});

test('exclusions are re-read every collect; reset forces a full rebuild', () => {
  const excluded: string[] = [];
  const f = fixture(4, excluded);
  at(f.files, 3).path = 'Private/secret.md';
  f.metadata.add('Private/secret.md');
  assert.equal(f.model.collect().length, 4);
  excluded.push('Private');
  f.resetCounts();
  assert.deepEqual(paths(f.model.collect()), ['Notes/n0.md', 'Notes/n1.md', 'Notes/n2.md']);
  assert.equal(f.builds(), 0);
  excluded.pop();
  assert.equal(f.model.collect().length, 4);
  assert.equal(f.builds(), 1);
  f.resetCounts();
  f.model.reset();
  f.model.collect();
  assert.equal(f.builds(), 4);
});

test('a replaced file object behind the same path is rebuilt', () => {
  const f = fixture(2);
  const first = f.model.collect();
  f.resetCounts();
  f.files[0] = { ...at(f.files, 0), mtime: 9 };
  const items = f.model.collect();
  assert.equal(f.builds(), 1);
  assert.notEqual(at(items, 0), at(first, 0));
  assert.equal(at(items, 0).mtime, 9);
});
