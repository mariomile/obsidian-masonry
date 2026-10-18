import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, parseSettings } from './settings-data.ts';

test('existing installations default remote images to disabled', () => {
  assert.equal(parseSettings(undefined).loadRemoteImages, false);
  assert.equal(parseSettings({ layout: 'list' }).loadRemoteImages, false);
});

test('the remote image preference is preserved only when explicitly boolean', () => {
  assert.equal(parseSettings({ loadRemoteImages: true }).loadRemoteImages, true);
  assert.equal(parseSettings({ loadRemoteImages: 'true' }).loadRemoteImages, false);
  assert.equal(DEFAULT_SETTINGS.loadRemoteImages, false);
});

test('the persisted sort is restored only for known sort keys', () => {
  assert.equal(parseSettings(undefined).sort, 'modified-desc');
  assert.equal(parseSettings({ sort: 'title-asc' }).sort, 'title-asc');
  assert.equal(parseSettings({ sort: 'created-asc' }).sort, 'created-asc');
  assert.equal(parseSettings({ sort: 'nonsense' }).sort, 'modified-desc');
});

test('excluded folders parse into a trimmed list of strings', () => {
  assert.deepEqual(parseSettings(undefined).excludedFolders, []);
  assert.deepEqual(
    parseSettings({ excludedFolders: ['_system', ' Resources/Templates '] })
      .excludedFolders,
    ['_system', 'Resources/Templates'],
  );
  // Non-string entries and blanks are dropped; non-array input falls back.
  assert.deepEqual(
    parseSettings({ excludedFolders: ['_system', '', 42, null] }).excludedFolders,
    ['_system'],
  );
  assert.deepEqual(
    parseSettings({ excludedFolders: '_system' }).excludedFolders,
    [],
  );
});

test('the tabs section parses into its own fresh settings object', () => {
  const first = parseSettings(undefined);
  first.tabs.autoHide = true;
  assert.equal(parseSettings(undefined).tabs.autoHide, false);
  assert.equal(DEFAULT_SETTINGS.tabs.autoHide, false);
  assert.equal(parseSettings({ tabs: { autoHide: true } }).tabs.autoHide, true);
  // Gallery settings never leak into the tabs section.
  assert.equal(parseSettings({ autoHide: true }).tabs.autoHide, false);
});

test('quick filter settings default to masonry, _inbox and no tags, and sanitize input', () => {
  const defaults = parseSettings(undefined);
  assert.equal(defaults.layout, 'masonry');
  assert.equal(defaults.inboxFolder, '_inbox');
  assert.deepEqual(defaults.quickTags, []);
  const parsed = parseSettings({
    layout: 'table',
    inboxFolder: ' /Inbox/ ',
    quickTags: ['#link', 'person', 7],
  });
  assert.equal(parsed.layout, 'table');
  assert.equal(parsed.inboxFolder, 'Inbox');
  assert.deepEqual(parsed.quickTags, ['link', 'person']);
  assert.equal(parseSettings({ layout: 'list' }).layout, 'list');
  // Values from before 1.6.0 ('grid') fall back to the masonry default.
  assert.equal(parseSettings({ layout: 'grid' }).layout, 'masonry');
  assert.equal(parseSettings({ layout: 'nope' }).layout, 'masonry');
});
