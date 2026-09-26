import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TABS_SETTINGS,
  hasTabsSettings,
  legacyTabxDataPath,
  parseTabsSettings,
  readLegacyTabxSettings,
  type LegacyDataReader,
} from './settings-data.ts';

test('parseTabsSettings returns defaults for empty input', () => {
  assert.deepEqual(parseTabsSettings(undefined), DEFAULT_TABS_SETTINGS);
  assert.deepEqual(parseTabsSettings({}), DEFAULT_TABS_SETTINGS);
  assert.deepEqual(parseTabsSettings(null), DEFAULT_TABS_SETTINGS);
});

test('parseTabsSettings keeps valid overrides', () => {
  const parsed = parseTabsSettings({ autoHide: true, previewCharacters: 100 });
  assert.equal(parsed.autoHide, true);
  assert.equal(parsed.previewCharacters, 100);
});

test('parseTabsSettings clamps out-of-range numbers', () => {
  assert.equal(parseTabsSettings({ previewCharacters: 5 }).previewCharacters, 40);
  assert.equal(parseTabsSettings({ previewCharacters: 9999 }).previewCharacters, 2000);
});

test('parseTabsSettings ignores wrong types', () => {
  const parsed = parseTabsSettings({ autoHide: 'yes', previewCharacters: 'wide' });
  assert.equal(parsed.autoHide, DEFAULT_TABS_SETTINGS.autoHide);
  assert.equal(parsed.previewCharacters, DEFAULT_TABS_SETTINGS.previewCharacters);
});

test('parseTabsSettings returns a fresh object every time', () => {
  const first = parseTabsSettings(undefined);
  first.autoHide = true;
  assert.equal(parseTabsSettings(undefined).autoHide, false);
  assert.equal(DEFAULT_TABS_SETTINGS.autoHide, false);
});

test('hasTabsSettings is true only when the tabs section is an object', () => {
  assert.equal(hasTabsSettings(undefined), false);
  assert.equal(hasTabsSettings(null), false);
  assert.equal(hasTabsSettings({ presentation: 'compact' }), false);
  assert.equal(hasTabsSettings({ tabs: 'nope' }), false);
  assert.equal(hasTabsSettings({ tabs: {} }), true);
});

test('the legacy TabX data lives under the vault config dir', () => {
  assert.equal(legacyTabxDataPath('.obsidian'), '.obsidian/plugins/tabx/data.json');
  assert.equal(legacyTabxDataPath('.config'), '.config/plugins/tabx/data.json');
});

function reader(files: Record<string, string>): LegacyDataReader {
  return {
    exists: async (path) => path in files,
    read: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    },
  };
}

test('readLegacyTabxSettings imports a real TabX data.json', async () => {
  // The exact file TabX 0.3.0 left in the marioverse vault.
  const legacy = JSON.stringify({
    autoHide: false,
    scrollTabBar: true,
    showTabPreview: true,
    showTags: false,
    previewCharacters: 240,
    presentation: 'compact',
    tabBarButton: true,
    sort: 'modified-desc',
  });
  const imported = await readLegacyTabxSettings(
    reader({ '.obsidian/plugins/tabx/data.json': legacy }),
    '.obsidian',
  );
  assert.equal(imported.showTags, false);
  assert.equal(imported.presentation, 'compact');
  assert.equal(imported.sort, 'modified-desc');
  // A key TabX never saved falls back to its default.
  assert.equal(imported.sidebarAddButton, true);
});

test('readLegacyTabxSettings falls back to defaults without a TabX file', async () => {
  assert.deepEqual(
    await readLegacyTabxSettings(reader({}), '.obsidian'),
    DEFAULT_TABS_SETTINGS,
  );
});

test('readLegacyTabxSettings survives a corrupt TabX file', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(
      await readLegacyTabxSettings(
        reader({ '.obsidian/plugins/tabx/data.json': '{not json' }),
        '.obsidian',
      ),
      DEFAULT_TABS_SETTINGS,
    );
  } finally {
    console.warn = warn;
  }
});
