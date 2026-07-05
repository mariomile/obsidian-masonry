import type { GalleryFilters, GalleryItem, GallerySort } from './types.ts';

export const ROOT_FOLDER_FILTER = '__root__';

export interface RefreshSignal {
  subscribe(listener: () => void): () => void;
  emit(): void;
}

export function createRefreshSignal(): RefreshSignal {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

export function isRenderableViewport(rect: {
  width: number;
  height: number;
}): boolean {
  return rect.width > 0 && rect.height > 0;
}

export function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export function isPathExcluded(
  path: string,
  excludedFolders: readonly string[],
): boolean {
  return excludedFolders.some((raw) => {
    const folder = raw.trim().replace(/\/+$/, '');
    if (!folder) return false;
    return path === folder || path.startsWith(`${folder}/`);
  });
}

export function matchesGalleryItem(
  item: GalleryItem,
  filters: GalleryFilters,
): boolean {
  if (filters.folder === ROOT_FOLDER_FILTER && item.folder !== '') return false;
  if (
    filters.folder &&
    filters.folder !== ROOT_FOLDER_FILTER &&
    item.folder !== filters.folder &&
    !item.folder.startsWith(`${filters.folder}/`)
  ) {
    return false;
  }
  if (filters.tag && !item.tags.includes(filters.tag)) return false;

  const query = normalizeText(filters.query.trim());
  if (!query) return true;

  const haystack = normalizeText(
    `${item.title} ${item.path} ${item.tags.join(' ')}`,
  );

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function sortGalleryItems(
  items: GalleryItem[],
  sort: GallerySort,
): GalleryItem[] {
  return [...items].sort((left, right) => {
    switch (sort) {
      case 'modified-asc':
        return left.mtime - right.mtime || left.title.localeCompare(right.title);
      case 'created-desc':
        return right.ctime - left.ctime || left.title.localeCompare(right.title);
      case 'created-asc':
        return left.ctime - right.ctime || left.title.localeCompare(right.title);
      case 'title-asc':
        return left.title.localeCompare(right.title, undefined, {
          sensitivity: 'base',
        });
      case 'title-desc':
        return right.title.localeCompare(left.title, undefined, {
          sensitivity: 'base',
        });
      case 'modified-desc':
        return right.mtime - left.mtime || left.title.localeCompare(right.title);
    }
  });
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
}

export function createScanText(
  markdown: string,
  title: string,
  maxCharacters: number,
): string {
  const withoutStructure = stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
      String(label ?? target).trim(),
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#\s+.*$/m, (heading) => {
      const headingTitle = heading.replace(/^#\s+/, '').trim();
      return normalizeText(headingTitle) === normalizeText(title)
        ? ' '
        : headingTitle;
    })
    .replace(/^\s*>\s*\[![^\]]+\]\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, '')
    .replace(/^\s*- \[[ xX]\]\s*/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutStructure.length <= maxCharacters) return withoutStructure;
  const candidate = withoutStructure.slice(0, maxCharacters + 1);
  const wordBreak = candidate.lastIndexOf(' ');
  const end = wordBreak >= Math.floor(maxCharacters * 0.6)
    ? wordBreak
    : maxCharacters;
  return `${candidate.slice(0, end).trim()}…`;
}

/**
 * Clean a Bases property value for display on a card. Bases stringifies
 * frontmatter naively, so a wikilink arrives as raw `[[Target|Alias]]` and a
 * missing value as the literal `"null"`. Render the wikilink like Obsidian
 * does (alias, else basename) and drop null-like/empty values (return null so
 * the caller skips the row).
 */
export function formatPropertyValue(raw: string): string | null {
  const cleaned = raw
    .replace(
      /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g,
      (_match, target: string, label?: string) => {
        const alias = (label ?? '').trim();
        if (alias) return alias;
        const segments = target.split('/');
        return (segments[segments.length - 1] ?? '').trim();
      },
    )
    .trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return cleaned;
}

export function hasActiveFilters(filters: GalleryFilters): boolean {
  return Boolean(filters.query.trim() || filters.folder || filters.tag);
}

export function topLevelFolder(path: string): string {
  const separator = path.indexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

export function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;

  if (delta < minute) return 'just now';
  if (delta < hour) return `${Math.floor(delta / minute)} min ago`;
  if (delta < day) return `${Math.floor(delta / hour)} hr ago`;
  if (delta < day * 7) return `${Math.floor(delta / day)} days ago`;

  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(timestamp);
}
