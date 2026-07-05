import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, parseSettings } from './settings-data.ts';

test('existing installations default remote images to disabled', () => {
  assert.equal(parseSettings(undefined).loadRemoteImages, false);
  assert.equal(parseSettings({ presentation: 'compact' }).loadRemoteImages, false);
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
