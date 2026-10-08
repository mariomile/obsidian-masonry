import type { GalleryPresentation } from './presentation.ts';

/** Below this container width the gallery is a phone layout: one column, or
 *  two for Compact. Mirrors the `@container (max-width: 520px)` block. */
export const PHONE_CONTAINER_WIDTH = 520;

export interface ColumnCountInput {
  /** Inline size of the `.masonry` query container (what `cqi` resolves to). */
  containerWidth: number;
  /** Content width available to the columns. */
  gridWidth: number;
  gap: number;
  cardWidth: number;
  presentation: GalleryPresentation;
}

/**
 * How many columns the gallery shows. Same arithmetic CSS multi-column used
 * (`column-width` as a minimum), now computed in JS because the columns are
 * real elements: WebKit's multi-column fragmentation left blank slots on iOS
 * and re-balanced the whole block on every async height change.
 */
export function columnCountFor(input: ColumnCountInput): number {
  const { containerWidth, gridWidth, gap, cardWidth, presentation } = input;
  if (gridWidth <= 0) return 1;
  if (containerWidth <= PHONE_CONTAINER_WIDTH) {
    return presentation === 'compact' ? 2 : 1;
  }
  const columnWidth =
    presentation === 'compact'
      ? Math.min(cardWidth, containerWidth * 0.46)
      : cardWidth;
  return Math.max(1, Math.floor((gridWidth + gap) / (columnWidth + gap)));
}

/** Index of the shortest column; ties go left so order reads left to right. */
export function shortestColumn(heights: readonly number[]): number {
  let best = 0;
  for (let index = 1; index < heights.length; index += 1) {
    if ((heights[index] ?? 0) < (heights[best] ?? 0)) best = index;
  }
  return best;
}
