import assert from 'node:assert/strict';
import test from 'node:test';

import { tableColumns } from './rows.ts';
import type { GalleryItem } from './types.ts';

function item(properties: GalleryItem['properties']): GalleryItem {
  return {
    file: {} as GalleryItem['file'],
    path: 'a.md',
    title: 'A',
    folder: '',
    topFolder: '',
    tags: [],
    mtime: 0,
    ctime: 0,
    properties,
  };
}

test('table columns: properties in order of first appearance, once each', () => {
  const columns = tableColumns(
    [
      item([{ id: 'note.status', label: 'Status', value: 'open' }]),
      item([
        { id: 'note.owner', label: 'Owner', value: 'Mario' },
        { id: 'note.status', label: 'Status', value: 'done' },
      ]),
      item(undefined),
    ],
    { showFolder: true, showTags: true },
  );
  assert.deepEqual(
    columns.map(({ label }) => label),
    ['Title', 'Folder', 'Status', 'Owner', 'Tags', 'Modified'],
  );
});

test('table columns: folder and tags follow the display options', () => {
  const columns = tableColumns([item([])], { showFolder: false, showTags: false });
  assert.deepEqual(
    columns.map(({ kind }) => kind),
    ['title', 'modified'],
  );
});

test('table columns: properties sharing a label stay separate columns', () => {
  const columns = tableColumns(
    [
      item([
        { id: 'note.status', label: 'Status', value: 'open' },
        { id: 'formula.status', label: 'Status', value: 'late' },
      ]),
    ],
    { showFolder: false, showTags: false },
  );
  assert.deepEqual(
    columns.flatMap((column) => (column.kind === 'property' ? [column.id] : [])),
    ['note.status', 'formula.status'],
  );
});
