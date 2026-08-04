export type GalleryPresentation = 'compact' | 'editorial' | 'visual';
export type TagKind = 'status' | 'type' | 'domain' | 'other';

export interface PresentationDefinition {
  cardWidth: number;
  /** Fallback testuale: quante righe, quando il render non è disponibile. */
  excerptLines: number;
  /**
   * Scala della miniatura, e con essa il compromesso centrale dell'anteprima:
   * scala alta = testo leggibile ma poco documento, scala bassa = più
   * documento ma testo minuto.
   *
   * Tarata verso il BASSO (2026-08-04): a 0.52 di una nota che apre con un
   * paragrafo lungo si vedeva solo quel paragrafo, e la card tornava a
   * leggersi come muro di testo pur essendo un render vero. Il valore
   * dell'anteprima è far vedere la STRUTTURA — heading, liste, callout — e
   * per quello serve più documento, non caratteri più grandi.
   * Più stretta è la card, più alta resta la scala: a 200px il testo a 0.44
   * sarebbe poltiglia.
   */
  renderScale: number;
}

export const PRESENTATIONS: Record<
  GalleryPresentation,
  PresentationDefinition
> = {
  compact: {
    cardWidth: 200,
    excerptLines: 5,
    renderScale: 0.55,
  },
  editorial: {
    cardWidth: 300,
    excerptLines: 7,
    renderScale: 0.46,
  },
  visual: {
    cardWidth: 360,
    excerptLines: 11,
    renderScale: 0.44,
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
