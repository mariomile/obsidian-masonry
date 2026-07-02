import { type App, TFile } from 'obsidian';

import type { GalleryItem, GalleryPreview } from './types.ts';
import {
  buildPreviewCacheKey,
  filterImageCandidates,
  normalizeCoverCandidate,
} from './presentation.ts';
import { createScanText } from './utils.ts';

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

export class PreviewService {
  private readonly cache = new Map<string, GalleryPreview>();

  constructor(
    private readonly app: App,
    private readonly loadRemoteImages: () => boolean,
    private readonly maxCacheEntries = 320,
  ) {}

  async getPreview(
    item: GalleryItem,
    maxCharacters: number,
  ): Promise<GalleryPreview> {
    const remotePolicy = this.loadRemoteImages();
    const cacheKey = buildPreviewCacheKey(
      item.path,
      item.mtime,
      maxCharacters,
      remotePolicy,
    );
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const source = await this.app.vault.cachedRead(item.file);
    const excerpt = createScanText(source, item.title, maxCharacters);
    const imageUrls = this.findImageUrls(item, source);
    const preview: GalleryPreview = {
      imageUrls,
      excerpt,
      empty: !excerpt && imageUrls.length === 0,
    };

    this.cache.set(cacheKey, preview);
    this.prune();
    return preview;
  }

  invalidate(path?: string): void {
    if (!path) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${path}:`)) this.cache.delete(key);
    }
  }

  private findImageUrls(item: GalleryItem, source: string): string[] {
    const cache = this.app.metadataCache.getFileCache(item.file);
    const candidates: string[] = [];
    const addCandidate = (candidate: string | undefined): void => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };

    for (const property of ['cover', 'image', 'thumbnail'] as const) {
      const candidate = normalizeCoverCandidate(cache?.frontmatter?.[property]);
      addCandidate(
        candidate ? this.resolveImageCandidate(candidate, item) : undefined,
      );
    }

    for (const embed of cache?.embeds ?? []) {
      const destination = this.app.metadataCache.getFirstLinkpathDest(
        embed.link,
        item.path,
      );
      if (
        destination instanceof TFile &&
        IMAGE_EXTENSIONS.has(destination.extension.toLocaleLowerCase())
      ) {
        addCandidate(this.app.vault.getResourcePath(destination));
      }
    }

    const externalImages = source.matchAll(
      /!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi,
    );
    for (const match of externalImages) addCandidate(match[1]);
    return filterImageCandidates(candidates, this.loadRemoteImages());
  }

  private resolveImageCandidate(
    candidate: string,
    item: GalleryItem,
  ): string | undefined {
    if (/^https?:\/\//i.test(candidate)) return candidate;

    const destination = this.app.metadataCache.getFirstLinkpathDest(
      candidate,
      item.path,
    );
    if (
      destination instanceof TFile &&
      IMAGE_EXTENSIONS.has(destination.extension.toLocaleLowerCase())
    ) {
      return this.app.vault.getResourcePath(destination);
    }
    return undefined;
  }

  private prune(): void {
    while (this.cache.size > this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }
}
