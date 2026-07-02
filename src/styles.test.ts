import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('reduced-motion disables the preview shimmer', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const reducedMotion = styles.slice(
    styles.indexOf('@media (prefers-reduced-motion: reduce)'),
  );

  assert.match(
    reducedMotion,
    /\.masonry-preview-skeleton\s*{[^}]*animation:\s*none;/s,
  );
});
