import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSidebarMenu, prettifyViewType, type SidebarMenuInput } from './sidebar-add-menu.ts';

const TERMINAL_CMD = 'terminal:open-terminal.integrated.root';

const input = (over: Partial<SidebarMenuInput> = {}): SidebarMenuInput => ({
  registered: [],
  fileBacked: [],
  openInSidebars: [],
  commands: [],
  ...over,
});

test('prettifyViewType collapses the plugin:view repetition', () => {
  assert.equal(prettifyViewType('terminal:terminal'), 'Terminal');
  assert.equal(prettifyViewType('terminal:documentation'), 'Terminal documentation');
  assert.equal(prettifyViewType('exo-chats'), 'Exo chats');
  assert.equal(prettifyViewType('all-properties'), 'All properties');
});

test('featured tier offers Browser and Terminal when both are available', () => {
  const menu = buildSidebarMenu(
    input({
      registered: ['webviewer', 'terminal:terminal'],
      commands: [TERMINAL_CMD],
    }),
  );
  assert.deepEqual(
    menu.featured.map((e) => e.label),
    ['Browser', 'Terminal'],
  );
  assert.equal(menu.featured[1]?.commandId, TERMINAL_CMD);
});

test('featured entries drop out when their view or command is missing', () => {
  const noTerminalPlugin = buildSidebarMenu(input({ registered: ['webviewer'] }));
  assert.deepEqual(noTerminalPlugin.featured.map((e) => e.label), ['Browser']);

  const noTerminalCommand = buildSidebarMenu(
    input({ registered: ['webviewer', 'terminal:terminal'], commands: [] }),
  );
  assert.deepEqual(noTerminalCommand.featured.map((e) => e.label), ['Browser']);
  // And it must not reappear in the second tier: the exclusion set is built
  // from the FEATURED constant, not from the surviving entries, precisely so a
  // featured view with a missing command is dropped rather than demoted into a
  // list where clicking it would open it the way that was already ruled out.
  assert.deepEqual(noTerminalCommand.views, []);
});

test('featured views are offered even when already open — a second one is valid', () => {
  const menu = buildSidebarMenu(
    input({ registered: ['webviewer'], openInSidebars: ['webviewer'] }),
  );
  assert.deepEqual(menu.featured.map((e) => e.label), ['Browser']);
  assert.deepEqual(menu.views, []);
});

test('views tier excludes file-backed types, open types and the featured ones', () => {
  const menu = buildSidebarMenu(
    input({
      registered: ['markdown', 'pdf', 'outline', 'backlink', 'webviewer', 'exo-chats'],
      fileBacked: ['markdown', 'pdf'],
      openInSidebars: ['outline'],
      commands: [],
    }),
  );
  assert.deepEqual(
    menu.views.map((e) => e.type),
    ['backlink', 'exo-chats'],
  );
});

test('views tier is sorted by label, not by type id', () => {
  const menu = buildSidebarMenu(
    input({ registered: ['tag', 'backlink', 'file-explorer', 'outline'] }),
  );
  assert.deepEqual(
    menu.views.map((e) => e.label),
    ['Backlinks', 'Files', 'Outline', 'Tags'],
  );
});

test("TabX's own views are named the way its commands name them", () => {
  const menu = buildSidebarMenu(input({ registered: ['tabx-grid', 'tabx-rail'] }));
  assert.deepEqual(
    menu.views.map((e) => e.label),
    ['Tab grid', 'Tab rail'],
  );
});

test('unknown view types still get a label and an icon', () => {
  const menu = buildSidebarMenu(input({ registered: ['some-new-plugin:panel'] }));
  assert.deepEqual(menu.views, [
    { type: 'some-new-plugin:panel', label: 'Some new plugin panel', icon: 'panel-right' },
  ]);
});
