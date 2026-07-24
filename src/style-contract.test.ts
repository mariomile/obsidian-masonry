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
 * Encodes only the state actually landed — not aspirational rules. Three
 * assertions:
 *
 * 1. every raw ms/hex/cubic-bezier value sits INSIDE the fallback argument of
 *    a `var(--token, fallback)` expression — the theme-independent pattern
 *    mv-kit's golden rule mandates. Checked by character position, not by
 *    line: a raw value merely sharing a line with some unrelated `var()` is a
 *    violation. The single exception is the standard `0.01ms` reduced-motion
 *    transition-duration, which is an a11y escape hatch rather than a design
 *    value (a deliberate divergence from sonar's wave-1 contract, which has
 *    no such carve-out because sonar ships no explicit reduced-motion block).
 * 2. !important declarations are capped at 12, the exact post-audit count —
 *    the ceiling can only ratchet down, so any future edit that adds one
 *    without removing another fails the test. Every survivor carries an
 *    adjacent comment justifying the specificity battle it wins.
 * 3. the stylesheet never DEFINES a `--cosmos-*`/`--mv-*` property — the
 *    golden rule's MUST NOT. Matched at declaration boundaries (`{` or `;`),
 *    so the compact one-liner `:root { --mv-r-card: 11px; }` is caught as
 *    surely as the multi-line block form.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/**
 * Blank out comments so prose like `/* 80ms *\/` doesn't trip the scans below,
 * while preserving every character position and newline — the scans report
 * line numbers and test containment by offset, both of which would drift if
 * comments were deleted outright.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
}

/**
 * Character ranges covering the *fallback* argument of every `var()` call,
 * i.e. everything after the top-level comma up to the matching `)`. Nested
 * calls (`var(--a, var(--b, 1px))`, `var(--mv-wash, cubic-bezier(…))`) are
 * handled by paren depth, so a nested fallback yields its own range too.
 */
function varFallbackRanges(code: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (let i = 0; i < code.length; i += 1) {
    if (!code.startsWith('var(', i)) continue;

    let depth = 1;
    let commaAt = -1;

    for (let j = i + 4; j < code.length; j += 1) {
      const ch = code[j];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          if (commaAt !== -1) ranges.push([commaAt + 1, j]);
          break;
        }
      } else if (ch === ',' && depth === 1 && commaAt === -1) {
        commaAt = j;
      }
    }
  }

  return ranges;
}

test('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
  const code = stripComments(css);
  const fallbacks = varFallbackRanges(code);

  // A raw ms/hex/cubic-bezier is allowed when it either:
  //   - sits inside a `var(--token, <fallback>)` fallback (mv-kit's golden
  //     rule: consume the token, keep the literal as the no-Cosmos
  //     fallback), or
  //   - is the standard `0.01ms` reduced-motion transition-duration (the
  //     universal "effectively instant" a11y override, not a design value).
  const rawMsPattern = /\b\d+(?:\.\d+)?ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  const isInVarFallback = (index: number) =>
    fallbacks.some(([start, end]) => index >= start && index < end);
  const isReducedMotionDuration = (line: string) =>
    /^\s*transition-duration:\s*0\.01ms;\s*$/.test(line);

  const violations: string[] = [];
  let offset = 0;

  code.split('\n').forEach((line, idx) => {
    if (!isReducedMotionDuration(line)) {
      for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          if (isInVarFallback(offset + match.index)) continue;
          violations.push(`line ${idx + 1}: "${match[0]}" in "${line.trim()}"`);
        }
      }
    }
    offset += line.length + 1;
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
  //
  // Anchored to a declaration boundary (`{` or `;`, or the start of the
  // file) rather than to the start of a LINE: `:root { --mv-r-card: 11px; }`
  // written on one line is the likeliest way this regression gets authored,
  // and a line anchor would wave it straight through. Consumption sites are
  // immune by construction — `var(--mv-wash, …)` puts a comma, never a
  // colon, after the token name.
  const definitions = stripComments(css).match(/(?:^|[{;])\s*--(?:cosmos|mv)-[\w-]+\s*:/g) ?? [];
  assert.deepEqual(definitions, []);
});
