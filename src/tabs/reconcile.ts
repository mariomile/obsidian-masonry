import type { TabCard } from './types.ts';

/**
 * The plan for turning the currently-rendered grid into the next one.
 *
 * - `remove` — the next cards are exactly the previous ones minus some, in the
 *   same relative order. This can be applied surgically: drop just the closed
 *   cards' elements and leave every survivor exactly where it sits, so nothing
 *   reshuffles columns or reflashes its preview.
 * - `full` — anything else (a tab was added, or the order changed via
 *   sort/search). Every card is re-appended in the new order; elements are
 *   still reused (appendChild moves them), so previews don't reflash.
 */
export type ReconcilePlan =
  | { kind: 'remove'; removed: string[] }
  | { kind: 'full' };

/**
 * Diff the previous card-id order against the next one. Returns a `remove` plan
 * only when `next` is `prev` with zero or more ids deleted and no reordering —
 * i.e. `next` is an order-preserving subsequence of `prev`. Any addition or
 * reorder forces a `full` rebuild.
 */
export function planReconcile(prev: string[], next: string[]): ReconcilePlan {
  const prevSet = new Set(prev);
  // Any id in `next` that wasn't there before is an addition → not surgical.
  for (const id of next) {
    if (!prevSet.has(id)) return { kind: 'full' };
  }
  // Walk `prev` and match `next` in order; if we don't consume all of `next`,
  // the survivors were reordered rather than merely thinned.
  let i = 0;
  for (const id of prev) {
    if (i < next.length && next[i] === id) i += 1;
  }
  if (i !== next.length) return { kind: 'full' };

  const nextSet = new Set(next);
  const removed = prev.filter((id) => !nextSet.has(id));
  return { kind: 'remove', removed };
}

const UNIT_SEPARATOR = '␟';

/**
 * A content fingerprint for a card. Two renders of the same tab share a
 * signature only when everything the card element actually draws is unchanged,
 * so a reused element is never left showing stale title/folder/tags. The
 * presentation is included because Masonry's card markup carries it as a
 * modifier class (`masonry-card--compact`). The active
 * state is deliberately excluded: it is toggled in place via `updateActive()`,
 * so folding it in here would needlessly recreate (and reflash) a card whenever
 * focus moves.
 */
export function cardSignature(
  card: TabCard,
  showPreview: boolean,
  showTags: boolean,
  presentation: string,
): string {
  const e = card.entry;
  return [
    e.title,
    e.icon,
    e.filePath ?? '',
    card.folder,
    card.mtime ?? '',
    showTags ? card.tags.slice(0, 4).join(',') : '',
    showPreview ? '1' : '0',
    presentation,
  ].join(UNIT_SEPARATOR);
}
