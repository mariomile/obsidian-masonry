import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Style contract for styles.css, sibling to release-contract.test.ts.
 * Ported from obsidian-sonar's mv-kit style contract (commit 3acb417),
 * adapted to masonry's own token convention: masonry defines its raw
 * values once as local `--masonry-*` custom properties (e.g.
 * `--masonry-ease: cubic-bezier(...)` in `.masonry`) and consumes them
 * bare via `var(--masonry-*)` elsewhere — it doesn't need a var()
 * fallback the way references to external/theme tokens do.
 *
 * Encodes only the state currently landed in styles.css — not
 * aspirational rules. Two assertions:
 *
 * 1. every raw ms/hex/cubic-bezier value appears only where the token
 *    system accounts for it: as the fallback in `var(--token, fallback)`,
 *    as the definition of a local `--masonry-*` custom property, as a
 *    duration sitting alongside a bare `var(--masonry-*)` reference, or
 *    as the standard `0.01ms` reduced-motion escape hatch.
 * 2. !important declarations are capped at 14, the exact current count —
 *    the ceiling can only ratchet down, so any future edit that adds one
 *    without removing another fails the test.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so prose like `/* 80ms *\/` doesn't trip the raw-value scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('raw ms/hex/cubic-bezier values are only used where the token system accounts for them', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  // A raw ms/hex/cubic-bezier is allowed when the line:
  //   - has a `var(--token, <fallback>)` expression (sonar's original rule,
  //     for references to external/theme tokens with a literal fallback), OR
  //   - defines a local `--masonry-*` custom property (the raw value IS the
  //     token, not an escape from it), OR
  //   - references a bare `var(--masonry-*)` (masonry's own token, always
  //     in scope from `.masonry`, so no fallback is needed), OR
  //   - is the standard `0.01ms` reduced-motion transition-duration (the
  //     universal "effectively instant" a11y override, not a decorative
  //     value escaping the token system).
  const rawMsPattern = /\b\d+(?:\.\d+)?ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  const hasVarFallback = (line: string) => /var\(\s*--[\w-]+\s*,/.test(line);
  const definesMasonryToken = (line: string) => /^\s*--masonry-[\w-]+\s*:/.test(line);
  const referencesMasonryToken = (line: string) => /var\(\s*--masonry-[\w-]+\s*\)/.test(line);
  const isReducedMotionDuration = (line: string) =>
    /^\s*transition-duration:\s*0\.01ms;\s*$/.test(line);

  const isAllowed = (line: string) =>
    hasVarFallback(line) ||
    definesMasonryToken(line) ||
    referencesMasonryToken(line) ||
    isReducedMotionDuration(line);

  const violations: string[] = [];

  lines.forEach((line, idx) => {
    if (isAllowed(line)) return;

    for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        violations.push(`line ${idx + 1}: "${match[0]}" in "${line.trim()}"`);
      }
    }
  });

  assert.deepEqual(violations, []);
});

test('!important declarations are capped at the current count (ratchet down only)', () => {
  const importantCount = (css.match(/!important/g) ?? []).length;
  // Ceiling frozen at the exact count in styles.css as of this test's
  // creation. This ceiling may only be LOWERED, never raised: if a future
  // edit needs to add an !important, it must first remove one elsewhere to
  // stay at or under 14.
  assert.ok(
    importantCount <= 14,
    `!important count ${importantCount} exceeds the frozen ceiling of 14`,
  );
});
