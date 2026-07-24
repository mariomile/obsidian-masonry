import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * mv-kit style contract for styles.css, sibling to release-contract.test.ts.
 * Ported from obsidian-sonar's contract (commit 3acb417) and tightened by the
 * 2026-07 mv-kit audit wave (docs/2026-07-mv-kit-audit.md), which rewired
 * masonry's own `--masonry-*` properties to CONSUME the suite tokens
 * (`--masonry-radius: var(--mv-r-card, 11px)`, `--masonry-ease:
 * var(--mv-wash, …)`) instead of hardcoding their values.
 *
 * Encodes only the state actually landed — not aspirational rules. Two
 * assertions:
 *
 * 1. every raw ms/hex/cubic-bezier value appears ONLY as the fallback inside
 *    a `var(--token, fallback)` expression — the theme-independent pattern
 *    mv-kit's golden rule mandates. The single exception is the standard
 *    `0.01ms` reduced-motion transition-duration, which is an a11y escape
 *    hatch rather than a design value.
 * 2. !important declarations are capped at 12, the exact post-audit count —
 *    the ceiling can only ratchet down, so any future edit that adds one
 *    without removing another fails the test. Every survivor carries an
 *    adjacent comment justifying the specificity battle it wins.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so prose like `/* 80ms *\/` doesn't trip the scans below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  // A raw ms/hex/cubic-bezier is allowed when the line either:
  //   - contains a `var(--token, <fallback>)` expression (mv-kit's golden
  //     rule: consume the token, keep the literal as the no-Cosmos
  //     fallback), or
  //   - is the standard `0.01ms` reduced-motion transition-duration (the
  //     universal "effectively instant" a11y override, not a design value).
  const rawMsPattern = /\b\d+(?:\.\d+)?ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  const hasVarFallback = (line: string) => /var\(\s*--[\w-]+\s*,/.test(line);
  const isReducedMotionDuration = (line: string) =>
    /^\s*transition-duration:\s*0\.01ms;\s*$/.test(line);

  const isAllowed = (line: string) =>
    hasVarFallback(line) || isReducedMotionDuration(line);

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

test('!important declarations are capped at the post-audit count (ratchet down only)', () => {
  // Count declarations only: the justification comments the mv-kit audit
  // added next to each survivor mention the word too.
  const importantCount = (stripComments(css).match(/!important/g) ?? []).length;
  // Ceiling frozen at the count left standing by the 2026-07 mv-kit audit
  // (was 14; two redundant overrides on `.masonry-presentation-select` were
  // removed). This ceiling may only be LOWERED, never raised: if a future
  // edit needs an !important, it must first remove one elsewhere.
  assert.ok(
    importantCount <= 12,
    `!important count ${importantCount} exceeds the frozen ceiling of 12`,
  );
});

test('the plugin never defines --cosmos-* / --mv-* itself', () => {
  // mv-kit golden rule: plugins are theme-independent. They consume the suite
  // tokens with a literal fallback; they never redefine them (at :root, on
  // body, or anywhere else), which would make the theme the plugin's
  // dependent instead of the other way round.
  const definitions = stripComments(css).match(/^\s*--(?:cosmos|mv)-[\w-]+\s*:/gm) ?? [];
  assert.deepEqual(definitions, []);
});
