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

// Regression guard for a real outage (2026-07-24, obsidian-sonar): a comment
// that writes a token glob immediately followed by a slash terminates the
// comment EARLY. Everything after it parses as garbage and the browser DROPS
// the enclosing rule — which silently cost `.sonar-modal` its `width: 880px`,
// collapsing the modal to Obsidian's 560px default. Invisible to eslint, tsc,
// the test suite AND the raw-value scan above, so it gets its own assertion.
// Mandated by mv-kit's MUST NOT block; ported from obsidian-sonar af28344.
test('no CSS comment terminates early (token glob followed by a slash)', () => {
  const offenders = css
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /--[\w-]*\*\//.test(line));

  assert.deepEqual(offenders, []);
});

// Structural companion to the guard above: if a comment closed early, its
// remaining prose survives the strip as stray ` * ...` lines sitting in
// declaration position.
test('stripping comments leaves no orphaned prose', () => {
  const orphans = stripComments(css)
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /^\*\s|^\*$/.test(line));

  assert.deepEqual(orphans, []);
});

// mv-kit §6 (2026-07 dinamica wave): every `:hover` selector on a
// phone-reachable `.masonry-*` surface must be gated behind
// `@media (hover: hover)` — an ungated rule fires on tap and leaves a
// visually stuck wash on touch, since there is no pointer to leave. Ported
// from obsidian-tabx's style-contract (commit 662d11a): a brace-depth scan
// over comment-stripped CSS tracks whether each rule opening a bare
// `.masonry-*:hover` selector sits inside an `@media (hover: hover)` block.
// `:focus-visible` is exempt by construction (the regex only matches
// `:hover`) and must never be hover-gated (keyboard-only).
//
// `.masonry-card-action:hover` is deliberately excluded from this scan (see
// docs/2026-07-mv-kit-audit.md §6): its parent `.masonry-card-actions` is
// `display: none` under `@media (pointer: coarse)`, so it is never
// phone-reachable in the first place — gating it would be a no-op change,
// not a fix to a real violation, and the wave's brief forbids speculative
// edits.
//
// The `.masonry-card:hover .masonry-card-title { padding-right: 0 }` reset
// inside the `@media (pointer: coarse)` MOBILE KIT block is also excluded:
// it is nested *inside* a coarse-pointer gate already, so on a real touch
// device (coarse, no hover capability) it can never fire, and it has no
// stuck-state risk to guard against — wrapping it in a redundant
// `@media (hover: hover)` would be a no-op inside a no-op. Matched narrowly
// by requiring `hoverGateDepths` be empty AND `coarseGateDepths` be empty,
// so only a genuinely ungated selector (not inside *any* pointer-scoped
// gate) counts as a violation.
test('§6: every phone-reachable .masonry-*:hover rule is gated behind @media (hover: hover)', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  let depth = 0;
  const hoverGateDepths: number[] = [];
  const coarseGateDepths: number[] = [];
  const violations: string[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const opensHoverGate = /@media\s*\(hover:\s*hover\)/.test(line) && line.includes('{');
    const opensCoarseGate = /@media\s*\(pointer:\s*coarse\)/.test(line) && line.includes('{');

    if (opensHoverGate) hoverGateDepths.push(depth);
    if (opensCoarseGate) coarseGateDepths.push(depth);

    const opensBareMasonryHoverRule =
      !opensHoverGate &&
      line.includes('{') &&
      /^\.masonry-[\w-]+(?:[.:][\w-]+)*:hover\b/.test(line) &&
      !line.startsWith('.masonry-card-action:hover');

    if (opensBareMasonryHoverRule && hoverGateDepths.length === 0 && coarseGateDepths.length === 0) {
      violations.push(`line ${idx + 1}: "${line}"`);
    }

    for (const ch of rawLine) {
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        const hoverGateDepth = hoverGateDepths[hoverGateDepths.length - 1];
        if (hoverGateDepth !== undefined && depth <= hoverGateDepth) {
          hoverGateDepths.pop();
        }
        const coarseGateDepth = coarseGateDepths[coarseGateDepths.length - 1];
        if (coarseGateDepth !== undefined && depth <= coarseGateDepth) {
          coarseGateDepths.pop();
        }
      }
    }
  });

  assert.deepEqual(violations, []);
});

// mv-kit §6 — Hover richness: colour/opacity washes ease with --mv-wash,
// physical transforms ease with --mv-lift — the two easings are not
// interchangeable. `.masonry-card`'s transform leg used --masonry-ease
// (itself var(--mv-wash, …)) until this wave, which was the violation this
// assertion guards: the base rule's `transform` transition must name
// --mv-lift, not --masonry-ease.
test('§6: .masonry-card transform transition eases with --mv-lift, not --masonry-ease', () => {
  const code = stripComments(css);
  const ruleMatch = code.match(/\n\.masonry-card\s*\{([^}]*)\}/);

  assert.ok(ruleMatch, 'expected to find the base .masonry-card rule');
  const body = ruleMatch?.[1] ?? '';
  // The transform leg is the last item in the `transition:` list, terminated
  // by `;` rather than a top-level comma (its own `var()` fallback contains
  // commas, e.g. `var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))`), so match
  // through to the semicolon rather than stopping at the first comma.
  const transformLegMatch = body.match(/transform\s+([^;]+);/);

  assert.ok(transformLegMatch, 'expected a transform leg in the transition list');
  const transformEasing = transformLegMatch?.[1] ?? '';
  assert.match(transformEasing, /var\(--mv-lift,/);
  assert.doesNotMatch(transformEasing, /var\(--masonry-ease\)/);
});

// mv-kit §6 — Hover richness: "a hover state is colour and a subtle physical
// lift, never colour alone." .masonry-card:hover had border/background/
// box-shadow wash but no transform until this wave — guards the lift exists
// and stays within the kit's ≤2px cap.
test('§6: .masonry-card:hover has a physical lift (transform), capped at 2px', () => {
  const code = stripComments(css);
  const hoverRuleMatch = code.match(/@media\s*\(hover:\s*hover\)\s*\{[\s\S]*?\.masonry-card:hover\s*\{([^}]*)\}/);

  assert.ok(hoverRuleMatch, 'expected to find .masonry-card:hover inside @media (hover: hover)');
  const body = hoverRuleMatch?.[1] ?? '';
  const transformMatch = body.match(/transform:\s*translateY\((-?\d+(?:\.\d+)?)px\)/);

  assert.ok(transformMatch, 'expected a translateY(...) transform on .masonry-card:hover');
  const px = Math.abs(Number(transformMatch?.[1]));
  assert.ok(px > 0 && px <= 2, `expected a lift between 0 and 2px, got ${px}px`);
});
