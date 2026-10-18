import assert from 'node:assert/strict';
import test from 'node:test';

import { renderListRow, renderTableHeader, renderTableRow, tableColumns } from './rows.ts';
import type { GalleryItem } from './types.ts';

// Minimal Obsidian element API: record the tree built by the real renderers.
// Layout and browser accessibility behavior are outside this test's scope.
interface ElementOptions {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
}
class ElementStub {
  children: ElementStub[] = [];
  attributes: Record<string, string>;
  textContent: string;
  constructor(options: ElementOptions = {}) {
    this.attributes = { ...options.attr, class: options.cls ?? '' };
    this.textContent = options.text ?? '';
  }
  createDiv(options: ElementOptions = {}): ElementStub {
    const child = new ElementStub(options);
    this.children.push(child);
    return child;
  }
  createSpan(options: ElementOptions): ElementStub { return this.createDiv(options); }
  setText(text: string): void { this.textContent = text; }
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  addClass(name: string): void { this.attributes.class += ` ${name}`; }
  prepend(child: ElementStub): void { this.children.unshift(child); }
}

const note: GalleryItem = {
  file: {} as GalleryItem['file'], path: 'a.md', title: 'A', folder: 'Notes',
  topFolder: 'Notes', tags: ['project'], mtime: 0, ctime: 0,
  properties: [{ id: 'note.status', label: 'Status', value: 'Active' }],
};

// Globals are installed only for this suite and restored even on failure.
test('row rendering contracts', async (t) => {
  const names = ['createEl', 'createDiv'] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, 'createEl', {
    configurable: true, value: (_tag: string, options: ElementOptions) => new ElementStub(options),
  });
  Object.defineProperty(globalThis, 'createDiv', {
    configurable: true, value: (options: ElementOptions) => new ElementStub(options),
  });
  try {
    await t.test('table actions mount inside the title cell, never alongside cells', () => {
      const columns = tableColumns([note], { showFolder: true, showTags: true });
      const { rowEl, actionsHostEl } = renderTableRow(note, columns);
      assert.equal(rowEl.getAttribute('role'), 'row');
      assert.equal(rowEl.getAttribute('data-path'), note.path);
      assert.equal(rowEl.getAttribute('tabindex'), '0');
      assert.equal(actionsHostEl, rowEl.children[0]);
      assert.equal(actionsHostEl.getAttribute('role'), 'rowheader');
      assert.equal(actionsHostEl.textContent, note.title);
      actionsHostEl.createDiv({ cls: 'masonry-card-actions' });
      assert.equal(rowEl.children.length, columns.length);
      assert.deepEqual(Array.from(rowEl.children, (cell) => cell.getAttribute('role')),
        ['rowheader', 'cell', 'cell', 'cell', 'cell']);
      assert.equal(rowEl.children[2]?.textContent, 'Active');
      assert.equal(actionsHostEl.children.length, 1);
    });
    await t.test('table headers retain their row and columnheader roles', () => {
      const grid = new ElementStub();
      const columns = tableColumns([note], { showFolder: false, showTags: false });
      const header = renderTableHeader(grid as unknown as HTMLElement, columns);
      assert.equal(grid.children[0], header);
      assert.equal(header.getAttribute('role'), 'row');
      assert.deepEqual(Array.from(header.children, (cell) => cell.getAttribute('role')),
        columns.map(() => 'columnheader'));
      assert.deepEqual(Array.from(header.children, (cell) => cell.textContent),
        columns.map(({ label }) => label));
    });
    await t.test('list actions mount on the keyboard-accessible link row', () => {
      const { rowEl, actionsHostEl } = renderListRow(note, {
        layout: 'list', previewCharacters: 0, showFolder: true, showTags: true,
      });
      assert.equal(actionsHostEl, rowEl);
      assert.equal(rowEl.getAttribute('role'), 'link');
      assert.equal(rowEl.getAttribute('aria-label'), 'Open A');
      assert.equal(rowEl.getAttribute('tabindex'), '0');
      assert.equal(rowEl.getAttribute('data-path'), note.path);
    });
    await t.test('missing title fails explicitly instead of mounting actions on a table row', () => {
      assert.throws(() => renderTableRow(note, [{ kind: 'modified', label: 'Modified' }]),
        /Table rows require a title column/);
    });
  } finally {
    names.forEach((name, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
