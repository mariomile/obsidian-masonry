// ⚠️ VENDORED da marioverse-kit/mdrender.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
// marioverse-kit · mdrender — canonical source of truth.
//
// Prepares the markdown that feeds a *rendered miniature*: a genuine, scaled-down
// MarkdownRenderer output of a note's opening, the way Craft's card grid shows
// real tables, images and callouts instead of a stripped text excerpt.
//
// This is the sibling of `mdpreview.ts`. That module produces PROSE (everything
// structural removed); this one produces MARKDOWN (structure preserved, only the
// expensive and the dangerous removed). Both drop a leading H1 that duplicates
// the title, using the same `normalizeText`, so the two preview families agree
// on what the note "starts with".
//
// Extracted from obsidian-sonar's `src/ui/thumbnail.ts`, which shipped the first
// working miniature. Two latent bugs in that original are fixed here:
//
//   1. `/```[\s\S]*?```/g` MIS-PAIRS. On a note containing a fence nested inside
//      a longer fence (or any odd number of fence markers) the non-greedy match
//      pairs opener-to-opener and swallows the prose between two unrelated
//      blocks. The scan below is line-based and tracks the opening fence's
//      length, the way CommonMark defines it.
//   2. It dropped EVERY fence. A plain ```ts block is one of the most legible
//      things in a scaled-down render — it reads as "this note has code" at a
//      glance. Only fences whose language would run ANOTHER PLUGIN's post-
//      processor inside every card are dropped (see EXECUTING_FENCE_LANGUAGES).
//
// Pure: no `obsidian` import, so it stays unit-testable under `node:test`.
// Consumers vendor a copy at `src/kit/mdrender.ts` via `sync.sh`. Edit HERE.

import { normalizeText, stripFrontmatter } from './mdpreview.ts';

/**
 * Fence languages that would execute another plugin's post-processor inside
 * every miniature — a query engine per card, on a grid that can hold dozens.
 * Their fences are dropped whole before MarkdownRenderer ever sees them.
 *
 * `mermaid` is in the list despite being pretty: it is a full layout engine,
 * and paying for one per card is exactly the cost this module exists to avoid.
 */
export const EXECUTING_FENCE_LANGUAGES: ReadonlySet<string> = new Set([
  'dataview',
  'dataviewjs',
  'tasks',
  'query',
  'base',
  'bases',
  'chart',
  'tracker',
  'meta-bind',
  'meta-bind-js',
  'meta-bind-button',
  'dice',
  'templater',
  'mermaid',
  'excalidraw',
  'kanban',
]);

const IMAGE_EMBED = /\.(png|jpe?g|webp|gif|svg|avif|bmp)(?:[|#].*)?$/i;

export interface MiniRenderBudget {
  /** Character ceiling on the markdown handed to MarkdownRenderer. */
  maxCharacters: number;
  /** Block ceiling — a cheap guard against a note of 500 one-line paragraphs. */
  maxBlocks: number;
  /** Image embeds kept; the rest are dropped so a gallery note isn't a payload. */
  maxImages: number;
}

export const DEFAULT_MINI_BUDGET: MiniRenderBudget = {
  maxCharacters: 1200,
  maxBlocks: 14,
  maxImages: 2,
};

export interface MiniPrefix {
  /** Markdown to render. Empty when `empty` is true. */
  markdown: string;
  /** Blocks were dropped by the budget — the caller should fade the bottom. */
  truncated: boolean;
  blocks: number;
  images: number;
  /** Nothing renderable: blank note, or frontmatter only. */
  empty: boolean;
}

interface Block {
  text: string;
  isFence: boolean;
  language: string;
}

/**
 * Split markdown into blocks, treating a fenced code block as ONE indivisible
 * unit regardless of the blank lines inside it. Everything else breaks at blank
 * lines, which keeps a table and a tight list whole by construction (neither
 * contains a blank line).
 */
function splitBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    blocks.push({ text: buffer.join('\n'), isFence: false, language: '' });
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    // CommonMark: up to 3 leading spaces, then 3+ backticks or tildes.
    const opener = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/);

    if (opener) {
      flush();
      const marker = opener[1] ?? '';
      const fenceChar = marker[0] ?? '`';
      const fenceLength = marker.length;
      const language = (opener[2] ?? '').toLowerCase();
      const fenceLines = [line];
      index += 1;
      // A closing fence is the same character, at least as long, and carries no
      // info string. An unterminated fence runs to EOF — which is why the loop
      // condition, not a lookahead, decides where it ends.
      for (; index < lines.length; index += 1) {
        const candidate = lines[index] ?? '';
        fenceLines.push(candidate);
        const closer = candidate.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (closer && (closer[1] ?? '')[0] === fenceChar && (closer[1] ?? '').length >= fenceLength) {
          break;
        }
      }
      blocks.push({ text: fenceLines.join('\n'), isFence: true, language });
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return blocks;
}

/** Strip note transclusions, keep image embeds. Without this one card can render
 *  an unbounded tree of other notes. */
function dropNoteTransclusions(text: string): string {
  return text.replace(/!\[\[([^\]]+)\]\]/g, (match, inner: string) =>
    IMAGE_EMBED.test(String(inner).trim()) ? match : '',
  );
}

function countImages(text: string): number {
  const wiki = text.match(/!\[\[[^\]]+\]\]/g)?.length ?? 0;
  const md = text.match(/!\[[^\]]*\]\([^)]+\)/g)?.length ?? 0;
  return wiki + md;
}

/** Remove image embeds beyond `remaining`, left to right. */
function capImages(text: string, remaining: number): { text: string; used: number } {
  let budget = remaining;
  let used = 0;
  const capped = text.replace(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g, (match) => {
    if (budget > 0) {
      budget -= 1;
      used += 1;
      return match;
    }
    return '';
  });
  return { text: capped, used };
}

/**
 * Bound a note down to the opening that a miniature actually shows.
 *
 * The cap is applied to the MARKDOWN STRING, before MarkdownRenderer is
 * involved: that is what keeps a 7000-block note from costing 7000 blocks of
 * render. And it is applied on BLOCK BOUNDARIES — a table that does not fit is
 * excluded whole rather than cut in half, because a half-table is the one
 * artefact that reads as "broken" instead of "clipped".
 */
export function createRenderPrefix(
  markdown: string,
  title: string,
  budget: Partial<MiniRenderBudget> = {},
): MiniPrefix {
  const limits = { ...DEFAULT_MINI_BUDGET, ...budget };
  const source = stripFrontmatter(markdown).replace(/%%[\s\S]*?%%/g, '');

  const kept: string[] = [];
  let characters = 0;
  let blocks = 0;
  let images = 0;
  let truncated = false;
  let sawFirstBlock = false;

  for (const block of splitBlocks(source)) {
    if (block.isFence && EXECUTING_FENCE_LANGUAGES.has(block.language)) continue;

    let text = block.isFence ? block.text : dropNoteTransclusions(block.text);

    if (!block.isFence && !sawFirstBlock) {
      // Drop a leading H1 that merely repeats the card's own title — same rule
      // and same comparison as createScanText, so the two agree.
      const heading = text.match(/^ {0,3}#\s+(.*)$/);
      if (heading && normalizeText((heading[1] ?? '').trim()) === normalizeText(title)) {
        text = text.slice(heading[0].length).replace(/^\n/, '');
      }
    }

    if (text.trim() === '') continue;
    sawFirstBlock = true;

    if (!block.isFence && countImages(text) > 0) {
      const capped = capImages(text, Math.max(0, limits.maxImages - images));
      text = capped.text;
      images += capped.used;
      if (text.trim() === '') continue;
    }

    if (blocks >= limits.maxBlocks || characters + text.length > limits.maxCharacters) {
      // Never take a partial block. If nothing has been kept yet the note opens
      // with one oversized block, and half of it beats none of it — the fade
      // hides the cut, and `truncated` tells the caller to draw it.
      if (kept.length === 0) {
        kept.push(text.slice(0, limits.maxCharacters));
        blocks += 1;
      }
      truncated = true;
      break;
    }

    kept.push(text);
    characters += text.length;
    blocks += 1;
  }

  const result = kept.join('\n\n').trim();
  return { markdown: result, truncated, blocks, images, empty: result === '' };
}

/**
 * Clamp a measured miniature to the band the card allows.
 * Pure, so the same arithmetic is unit-testable and identical in every consumer.
 */
export function clampMiniatureHeight(
  contentHeight: number,
  scale: number,
  minHeight: number,
  maxHeight: number,
): { height: number; clipped: boolean } {
  const scaled = contentHeight * scale;
  if (scaled > maxHeight) return { height: maxHeight, clipped: true };
  return { height: Math.max(minHeight, Math.round(scaled)), clipped: false };
}

/**
 * Height to RESERVE before any async work, from `TFile.stat.size` alone (no I/O).
 *
 * This exists for one specific failure: Masonry's grid is CSS multi-column, which
 * balances columns. Every async height change re-balances the whole block and
 * cards visibly hop between columns as they hydrate. Writing a predicted height
 * at build time makes the layout final before the first read; the measured height
 * only corrects it afterwards, and only when the difference is worth a reflow.
 *
 * Deliberately crude — it is a placeholder, not an estimate anyone reads. Longer
 * notes reserve more, everything stays inside the band, and it is monotonic in
 * size so the ordering of cards never inverts between prediction and measurement.
 */
export function predictMiniatureHeight(
  byteSize: number,
  scale: number,
  minHeight: number,
  maxHeight: number,
): number {
  const CHARACTERS_PER_LINE = 78;
  const LINE_HEIGHT = 24;
  const lines = Math.min(byteSize, DEFAULT_MINI_BUDGET.maxCharacters) / CHARACTERS_PER_LINE;
  return clampMiniatureHeight(lines * LINE_HEIGHT, scale, minHeight, maxHeight).height;
}

/** Cache identity: content (path+mtime) AND the budget that shaped the render. */
export function buildMiniatureCacheKey(
  path: string,
  mtime: number,
  budget: MiniRenderBudget,
): string {
  return `${path}::${mtime}::${budget.maxCharacters}:${budget.maxBlocks}:${budget.maxImages}`;
}
