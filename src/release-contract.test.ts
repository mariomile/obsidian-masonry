import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
}

const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
) as Manifest;
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
const versions = JSON.parse(
  readFileSync(new URL('../versions.json', import.meta.url), 'utf8'),
) as Record<string, string>;

test('the public release metadata is synchronized', () => {
  assert.equal(manifest.id, 'masonry');
  assert.equal(manifest.name, 'Masonry');
  assert.equal(manifest.version, '1.1.1');
  assert.equal(packageJson.version, '1.1.1');
  assert.deepEqual(versions, { '1.1.1': '1.12.7' });
  assert.equal(manifest.minAppVersion, '1.12.7');
});
