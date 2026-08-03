export type GalleryPresentation = 'compact' | 'editorial' | 'visual' | 'rich';
export type TagKind = 'status' | 'type' | 'domain' | 'other';

/**
 * How a card fills its preview area. Modelled as a CAPABILITY on the definition
 * rather than as "the rich density", even though the UI exposes it as a fourth
 * button: it keeps one branch in hydrateCard, and if rich previews should later
 * be available inside Editorial too, that becomes a setting instead of a rewrite.
 */
export type PreviewMode = 'text' | 'render';

export interface PresentationDefinition {
  cardWidth: number;
  excerptLines: number;
  previewMode: PreviewMode;
  /** Miniature scale; 0 when previewMode is 'text'. */
  renderScale: number;
}

export const PRESENTATIONS: Record<
  GalleryPresentation,
  PresentationDefinition
> = {
  compact: {
    cardWidth: 200,
    excerptLines: 5,
    previewMode: 'text',
    renderScale: 0,
  },
  editorial: {
    cardWidth: 300,
    excerptLines: 7,
    previewMode: 'text',
    renderScale: 0,
  },
  visual: {
    cardWidth: 360,
    excerptLines: 11,
    previewMode: 'text',
    renderScale: 0,
  },
  rich: {
    cardWidth: 320,
    excerptLines: 0,
    previewMode: 'render',
    // 320px card → ~284px content box; at 0.45 the miniature lays out at ~631px,
    // a real reading column, and lands at ~7px effective type — Craft's ballpark.
    renderScale: 0.45,
  },
};

export function isGalleryPresentation(
  value: unknown,
): value is GalleryPresentation {
  return (
    value === 'compact' || value === 'editorial' || value === 'visual' || value === 'rich'
  );
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

// normalizeCoverCandidate is shared with horizon via marioverse-kit (src/kit/mdpreview.ts).
export { normalizeCoverCandidate } from './kit/mdpreview.ts';

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
