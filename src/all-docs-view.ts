import { ItemView, TFile, type WorkspaceLeaf } from 'obsidian';

import { GallerySurface } from './gallery.ts';
import { createGalleryItem } from './model.ts';
import type { PreviewService } from './preview.ts';
import type { GalleryPresentation } from './presentation.ts';
import type { GallerySort, MasonrySettings } from './types.ts';
import { isPathExcluded, type RefreshSignal } from './utils.ts';

export const ALL_DOCS_VIEW_TYPE = 'masonry-all-docs';

export class AllDocsGalleryView extends ItemView {
  private surface: GallerySurface | null = null;
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly settings: MasonrySettings,
    private readonly previewService: PreviewService,
    private readonly refreshSignal: RefreshSignal,
    private readonly onPresentationChange: (
      presentation: GalleryPresentation,
    ) => Promise<void>,
    private readonly onSortChange: (sort: GallerySort) => Promise<void>,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return ALL_DOCS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'All Docs';
  }

  getIcon(): string {
    return 'layout-dashboard';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('masonry-view-content');
    this.surface = this.addChild(
      new GallerySurface({
        app: this.app,
        containerEl: this.contentEl,
        mode: 'all-docs',
        title: 'All Docs',
        showChrome: true,
        onPresentationChange: this.onPresentationChange,
        onSortChange: this.onSortChange,
        previewService: this.previewService,
        refreshSignal: this.refreshSignal,
        settings: this.settings,
      }),
    );

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') this.queueRefresh();
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.previewService.invalidate(file.path);
          this.queueRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.previewService.invalidate(oldPath);
          this.queueRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.previewService.invalidate(file.path);
          this.queueRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on('resolved', () => this.queueRefresh()),
    );

    this.refresh();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.surface) this.removeChild(this.surface);
    this.surface = null;
    this.contentEl.removeClass('masonry-view-content');
  }

  /** Force a full re-discovery — used when exclusion settings change. */
  reload(): void {
    this.refresh();
  }

  private queueRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 450);
  }

  private refresh(): void {
    const excluded = this.settings.excludedFolders;
    const items = this.app.vault
      .getMarkdownFiles()
      .filter((file) => !isPathExcluded(file.path, excluded))
      .map((file) => createGalleryItem(this.app, file));
    this.surface?.setItems(items);
  }
}
