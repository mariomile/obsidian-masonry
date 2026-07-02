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
