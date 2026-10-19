import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

import type { GalleryItem } from './types.ts';

// Exercise the actual view and model; only Obsidian and the gallery painter
// are host doubles. No production event interface is needed for Node tests.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./all-docs-view.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['obsidian', './gallery.ts'],
});
const output = bundle.outputFiles[0];
assert.ok(output);
const code = output.text;

type Handler = (...args: unknown[]) => void;

function eventBus() {
  const listeners = new Map<string, Handler>();
  return {
    on(name: string, fn: Handler) { listeners.set(name, fn); return fn; },
    fire(name: string, ...args: unknown[]) { listeners.get(name)?.(...args); },
  };
}

class HostFile {
  path: string;
  extension = 'md';
  tags: string[] = [];
  stat = { mtime: 0, ctime: 0 };
  constructor(path: string) { this.path = path; }
  get basename() { return this.path.split('/').pop()?.replace(/\.md$/, '') ?? ''; }
}

interface TestView {
  onOpen(): Promise<void>;
  onClose(): Promise<void>;
}

async function fixture(count = 3) {
  const files = Array.from({ length: count }, (_, i) => new HostFile(`Notes/n${i}.md`));
  const metadata = new Set(files.map((f) => f.path));
  const vault = eventBus();
  const cache = eventBus();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let items: GalleryItem[] = [];
  let renders = 0;
  const invalidated: string[] = [];
  const registered: unknown[] = [];
  const app = {
    vault: { ...vault, getMarkdownFiles: () => files },
    metadataCache: {
      ...cache,
      getFileCache: (file: HostFile) => metadata.has(file.path) ? { tags: file.tags } : null,
    },
  };
  class ItemView {
    app = app;
    contentEl = { empty() {}, addClass() {}, removeClass() {} };
    addChild<T>(child: T): T { return child; }
    removeChild() {}
    registerEvent(ref: unknown) { registered.push(ref); }
  }
  class GallerySurface {
    setItems(next: GalleryItem[]) { items = next; renders++; }
  }
  const mod = { exports: {} as { AllDocsGalleryView: new (...args: unknown[]) => TestView } };
  runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (id: string) => {
      if (id === 'obsidian') return { ItemView, TFile: HostFile, getAllTags: (m: { tags: string[] }) => m.tags };
      if (id === './gallery.ts') return { GallerySurface };
      throw new Error(`Unexpected test import: ${id}`);
    },
    window: {
      setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; },
      clearTimeout: (id: number) => timers.delete(id),
    },
  });
  const view = new mod.exports.AllDocsGalleryView(
    {}, { excludedFolders: [] }, { invalidate: (path: string) => invalidated.push(path) }, {}, () => {}, () => {},
  );
  await view.onOpen();
  return {
    files, metadata, vault, cache, view, invalidated, registered,
    items: () => items,
    renders: () => renders,
    pending: () => timers.size,
    flush() {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
  };
}

test('view events rebuild only the edited model, including a late metadata parse', async () => {
  const f = await fixture(1000);
  const before = [...f.items()];
  const edited = f.files[500];
  assert.ok(edited);
  edited.stat.mtime = 42;
  f.vault.fire('modify', edited);
  f.flush();
  assert.equal(f.items()[500]?.mtime, 42);
  assert.equal(f.items().filter((item, i) => item !== before[i]).length, 1);
  assert.deepEqual(f.invalidated, [edited.path]);

  edited.tags = ['#late'];
  f.cache.fire('changed', edited);
  f.cache.fire('resolved');
  assert.equal(f.pending(), 1);
  f.flush();
  assert.deepEqual([...f.items()[500]!.tags], ['late']);
  assert.equal(f.items().filter((item, i) => item !== before[i]).length, 1);
  assert.equal(f.registered.length, 6);
});

test('view events preserve membership and ignore non-markdown files', async () => {
  const f = await fixture();
  const added = new HostFile('Notes/new.md');
  f.files.splice(1, 0, added);
  f.vault.fire('create', added);
  f.flush();
  assert.equal(f.items()[1]?.path, added.path);

  added.path = 'Archive/new.md';
  f.vault.fire('rename', added, 'Notes/new.md');
  f.flush();
  assert.equal(f.items()[1]?.path, added.path);
  assert.ok(f.invalidated.includes('Notes/new.md'));

  f.files.splice(1, 1);
  f.vault.fire('delete', added);
  f.flush();
  assert.equal(f.items().length, 3);
  assert.ok(f.invalidated.includes(added.path));

  const canvas = new HostFile('Board.canvas');
  canvas.extension = 'canvas';
  for (const name of ['create', 'delete', 'modify']) f.vault.fire(name, canvas);
  f.vault.fire('rename', canvas, 'Old.canvas');
  f.cache.fire('changed', canvas);
  assert.equal(f.pending(), 0);

  const renders = f.renders();
  f.vault.fire('modify', f.files[0]);
  assert.equal(f.pending(), 1);
  await f.view.onClose();
  f.flush();
  assert.equal(f.renders(), renders);
});
