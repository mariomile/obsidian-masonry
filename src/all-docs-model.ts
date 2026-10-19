import type { GalleryItem } from './types.ts';

export interface AllDocsFile {
  path: string;
}

export interface AllDocsSource<F extends AllDocsFile> {
  /** Every markdown file, in vault order. Cheap: no metadata work. */
  listFiles(): F[];
  isExcluded(path: string): boolean;
  /** The expensive part: metadata lookup and tag normalization. */
  createItem(file: F): GalleryItem;
  /** Whether the metadata cache had an entry when the item was built. */
  hasMetadata(file: F): boolean;
}

interface Entry<F> {
  file: F;
  item: GalleryItem;
  resolved: boolean;
}

/**
 * The All Docs item model, rebuilt per note instead of per vault.
 *
 * Discovery stays a full walk of `listFiles()` so membership, exclusions and
 * vault order are exactly what a from-scratch rebuild would give, and a missed
 * create, delete or rename heals on the next collect. Only the per-note item is
 * cached, and it is rebuilt whenever its note is marked dirty (modify, metadata
 * change, create, rename), when the file object behind a path changes, or when
 * it was built before the metadata cache knew the file.
 */
export class AllDocsModel<F extends AllDocsFile> {
  private entries = new Map<string, Entry<F>>();
  private readonly dirty = new Set<string>();
  private readonly source: AllDocsSource<F>;

  constructor(source: AllDocsSource<F>) {
    this.source = source;
  }

  markDirty(path: string): void {
    this.dirty.add(path);
  }

  /** Rebuild items built without metadata: the cache may have caught up. */
  markUnresolvedDirty(): void {
    for (const [path, entry] of this.entries) {
      if (!entry.resolved) this.dirty.add(path);
    }
  }

  /** Drop every cached item: the next collect rebuilds all of them. */
  reset(): void {
    this.entries.clear();
    this.dirty.clear();
  }

  collect(): GalleryItem[] {
    const next = new Map<string, Entry<F>>();
    const items: GalleryItem[] = [];
    for (const file of this.source.listFiles()) {
      if (this.source.isExcluded(file.path)) continue;
      let entry = this.entries.get(file.path);
      if (!entry || entry.file !== file || this.dirty.has(file.path)) {
        entry = {
          file,
          item: this.source.createItem(file),
          resolved: this.source.hasMetadata(file),
        };
      }
      next.set(file.path, entry);
      items.push(entry.item);
    }
    this.entries = next;
    this.dirty.clear();
    return items;
  }
}
