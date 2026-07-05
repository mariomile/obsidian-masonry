import { Notice, Plugin } from 'obsidian';

import {
  ALL_DOCS_VIEW_TYPE,
  AllDocsGalleryView,
} from './all-docs-view.ts';
import {
  BASES_GALLERY_VIEW_TYPE,
  MasonryBasesView,
} from './bases-view.ts';
import { PreviewService } from './preview.ts';
import {
  MasonrySettingTab,
  DEFAULT_SETTINGS,
  parseSettings,
} from './settings.ts';
import type { MasonrySettings } from './types.ts';
import { createRefreshSignal } from './utils.ts';

export default class MasonryPlugin extends Plugin {
  settings: MasonrySettings = { ...DEFAULT_SETTINGS };
  private previewService: PreviewService | null = null;
  private readonly refreshSignal = createRefreshSignal();

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.previewService = new PreviewService(
      this.app,
      () => this.settings.loadRemoteImages,
    );

    this.registerHoverLinkSource('masonry', {
      display: 'Masonry',
      defaultMod: true,
    });

    this.registerView(
      ALL_DOCS_VIEW_TYPE,
      (leaf) =>
        new AllDocsGalleryView(
          leaf,
          this.settings,
          this.getPreviewService(),
          this.refreshSignal,
          async (presentation) => {
            this.settings.presentation = presentation;
            await this.saveSettings();
          },
          async (sort) => {
            this.settings.sort = sort;
            await this.saveSettings();
          },
        ),
    );

    this.registerBasesView(BASES_GALLERY_VIEW_TYPE, {
      name: 'Masonry',
      icon: 'layout-dashboard',
      factory: (controller, containerEl) =>
        new MasonryBasesView(
          controller,
          containerEl,
          this.settings,
          this.getPreviewService(),
          this.refreshSignal,
        ),
      options: MasonryBasesView.getViewOptions,
    });

    this.addRibbonIcon('layout-dashboard', 'Open All Docs', () => {
      void this.activateAllDocs();
    });
    this.addCommand({
      id: 'open-all-docs',
      name: 'Open All Docs',
      callback: () => {
        void this.activateAllDocs();
      },
    });
    this.addSettingTab(new MasonrySettingTab(this.app, this));
  }

  onunload(): void {
    this.previewService?.invalidate();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  refreshAllDocs(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(ALL_DOCS_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof AllDocsGalleryView) view.reload();
    }
  }

  async setLoadRemoteImages(value: boolean): Promise<void> {
    if (this.settings.loadRemoteImages === value) return;
    this.settings.loadRemoteImages = value;
    await this.saveSettings();
    this.previewService?.invalidate();
    this.refreshSignal.emit();
  }

  private async activateAllDocs(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(ALL_DOCS_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: ALL_DOCS_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private getPreviewService(): PreviewService {
    if (!this.previewService) {
      new Notice('Masonry is not ready yet.');
      throw new Error('Masonry preview service is not initialized');
    }
    return this.previewService;
  }
}
