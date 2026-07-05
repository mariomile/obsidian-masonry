export type GalleryPresentation = 'compact' | 'editorial' | 'visual';
export type TagKind = 'status' | 'type' | 'domain' | 'other';

export interface PresentationDefinition {
  cardWidth: number;
  excerptLines: number;
}

export const PRESENTATIONS: Record<
  GalleryPresentation,
  PresentationDefinition
> = {
  compact: {
    cardWidth: 200,
    excerptLines: 5,
  },
  editorial: {
    cardWidth: 300,
    excerptLines: 7,
  },
  visual: {
    cardWidth: 360,
    excerptLines: 11,
  },
};

export function isGalleryPresentation(
  value: unknown,
): value is GalleryPresentation {
  return value === 'compact' || value === 'editorial' || value === 'visual';
}

export function resolvePresentation(
  value: unknown,
  fallback: GalleryPresentation = 'editorial',
): GalleryPresentation {
  return isGalleryPresentation(value) ? value : fallback;
}

export function classifyTag(tag: string): TagKind {
  if (tag.startsWith('status/')) return 'status';
  if (tag.startsWith('type/')) return 'type';
  if (tag.startsWith('domain/')) return 'domain';
  return 'other';
}

export function normalizeCoverCandidate(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const normalized = normalizeCoverCandidate(candidate);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (typeof value !== 'string') return undefined;

  const candidate = value.trim();
  if (!candidate) return undefined;

  const wikilink = candidate.match(/^!?(?:\[\[)([^\]]+)(?:\]\])$/);
  if (wikilink?.[1]) return wikilink[1].split('|')[0]?.trim() || undefined;

  const markdownImage = candidate.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  if (markdownImage?.[1]) {
    return markdownImage[1].replace(/\s+["'][^"']*["']$/, '').trim();
  }

  return candidate.replace(/^['"]|['"]$/g, '').trim() || undefined;
}

export function buildWikilink(path: string, title: string): string {
  const linkPath = path.replace(/\.md$/i, '');
  const basename = linkPath.split('/').pop() ?? linkPath;
  return basename === title
    ? `[[${linkPath}]]`
    : `[[${linkPath}|${title}]]`;
}

export function nextImageCandidate(
  candidates: readonly string[],
  current?: string,
): string | undefined {
  if (!current) return candidates[0];
  const currentIndex = candidates.indexOf(current);
  return currentIndex === -1 ? candidates[0] : candidates[currentIndex + 1];
}

export function filterImageCandidates(
  candidates: readonly string[],
  loadRemoteImages: boolean,
): string[] {
  if (loadRemoteImages) return [...candidates];
  return candidates.filter((candidate) => !/^https?:\/\//i.test(candidate));
}

export function buildPreviewCacheKey(
  path: string,
  mtime: number,
  maxCharacters: number,
  loadRemoteImages: boolean,
): string {
  return `${path}:${mtime}:${maxCharacters}:${loadRemoteImages ? 1 : 0}`;
}
