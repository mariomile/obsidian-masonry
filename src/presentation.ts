export type TagKind = 'status' | 'type' | 'domain' | 'other';

/** Geometry of the one masonry card (All Docs, Bases, tab grid). */
export const CARD = {
  width: 300,
  /** Fallback testuale: quante righe, quando il render non è disponibile. */
  excerptLines: 7,
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
   */
  renderScale: 0.46,
} as const;

/** Writes the card geometry where the CSS reads it. */
export function applyCardGeometry(rootEl: HTMLElement): void {
  rootEl.style.setProperty('--masonry-card-width', `${CARD.width}px`);
  rootEl.style.setProperty('--masonry-excerpt-lines', String(CARD.excerptLines));
  rootEl.style.setProperty('--mini-scale', String(CARD.renderScale));
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
