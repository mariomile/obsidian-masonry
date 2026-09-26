import type { TabCard } from './types.ts';

export type GridSort =
  | 'tab-order'
  | 'modified-desc'
  | 'modified-asc'
  | 'title-asc'
  | 'title-desc';

export const GRID_SORTS: { value: GridSort; label: string }[] = [
  { value: 'tab-order', label: 'Tab order' },
  { value: 'modified-desc', label: 'Recently modified' },
  { value: 'modified-asc', label: 'Least recently modified' },
  { value: 'title-asc', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
];

export function isGridSort(value: unknown): value is GridSort {
  return GRID_SORTS.some((sort) => sort.value === value);
}

export function resolveSort(
  value: unknown,
  fallback: GridSort = 'tab-order',
): GridSort {
  return isGridSort(value) ? value : fallback;
}

/** Accent-folded, lower-cased haystack across title, folder and tags. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function matchesQuery(card: TabCard, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  const haystack = fold(
    [card.entry.title, card.folder, ...card.tags].join(' '),
  );
  return haystack.includes(needle);
}

export function sortCards(cards: TabCard[], sort: GridSort): TabCard[] {
  const next = [...cards];
  switch (sort) {
    case 'tab-order':
      return next;
    case 'title-asc':
      return next.sort((a, b) =>
        a.entry.title.localeCompare(b.entry.title),
      );
    case 'title-desc':
      return next.sort((a, b) =>
        b.entry.title.localeCompare(a.entry.title),
      );
    case 'modified-desc':
      return next.sort((a, b) => cmpMtime(a, b, 'desc'));
    case 'modified-asc':
      return next.sort((a, b) => cmpMtime(a, b, 'asc'));
  }
}

/** Compare by mtime; non-file tabs (null mtime) always sort to the end. */
function cmpMtime(a: TabCard, b: TabCard, dir: 'asc' | 'desc'): number {
  if (a.mtime === null && b.mtime === null) return 0;
  if (a.mtime === null) return 1;
  if (b.mtime === null) return -1;
  return dir === 'desc' ? b.mtime - a.mtime : a.mtime - b.mtime;
}
