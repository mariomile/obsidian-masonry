import { Notice, Plugin, TFile, addIcon } from 'obsidian';

// Huge Icons (hugeicons.com, free/MIT, Stroke Rounded, 24x24 grid) — matches
// the hi-* set used elsewhere in the suite. addIcon() always wraps content
// in a fixed viewBox="0 0 100 100", so a 4.166667x scale (100/24) fills it
// correctly.
addIcon(
  'hi-layout-grid',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">' +
    '<path stroke-linejoin="round" d="M20.109 3.891C21.5 5.282 21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391"/>' +
    '<path d="M21.5 12h-19M12 2.5v19"/>' +
    '</g>',
);

import {
  ALL_DOCS_VIEW_TYPE,
  AllDocsGalleryView,
} from './all-docs-view.ts';
import {
  BASES_GALLERY_VIEW_TYPE,
  MasonryBasesView,
} from './bases-view.ts';
import { MiniatureService } from './kit/mdminiature.ts';
import { PreviewService } from './preview.ts';
import {
  MasonrySettingTab,
  DEFAULT_SETTINGS,
  parseSettings,
} from './settings.ts';
import type { GalleryItem, GalleryPreview, MasonrySettings } from './types.ts';
import { createRefreshSignal } from './utils.ts';

/** Richiesta di miniatura da un plugin fratello. */
export interface MasonryRenderRequest {
  filePath: string;
  /** L'elemento in cui scrivere. Il chiamante ne resta proprietario. */
  hostEl: HTMLElement;
  /** Token per-host confrontato a ogni await: se cambia, il render è annullato. */
  token: string;
  /** Scala della miniatura; il chiamante la sceglie in base alla larghezza. */
  scale?: number;
}

export interface MasonryRenderResult {
  rendered: boolean;
  clipped: boolean;
  height: number;
}

export default class MasonryPlugin extends Plugin {
  settings: MasonrySettings = { ...DEFAULT_SETTINGS };
  /**
   * API cross-plugin. `version` è il flag di capacità: TabX e Horizon la
   * leggono per sapere se possono chiedere una miniatura invece di un
   * excerpt. Senza numero, un consumatore dovrebbe indovinare dalla presenza
   * dei metodi — fragile.
   */
  readonly api = {
    version: 2,
    getFilePreview: (
      filePath: string,
      maxCharacters: number,
      allowRemoteImages = false,
    ): Promise<GalleryPreview> =>
      this.getFilePreview(filePath, maxCharacters, allowRemoteImages),
    invalidatePreview: (path?: string): void => this.previewService?.invalidate(path),
    isRichPreviewAvailable: (): boolean => MiniatureService.isSupported(),
    /**
     * Renderizza la miniatura DENTRO un elemento fornito dal chiamante, invece
     * di restituire DOM. Consegnare nodi oltre il confine fra plugin
     * accoppierebbe i cicli di vita: Masonry potrebbe scaricarsi mentre TabX
     * tiene ancora il sottoalbero. Così la proprietà resta al chiamante e
     * Masonry scrive soltanto in un elemento che lui controlla.
     */
    renderFilePreview: (request: MasonryRenderRequest): Promise<MasonryRenderResult> =>
      this.renderFilePreview(request),
  };
  private previewService: PreviewService | null = null;
  private miniatures: MiniatureService | null = null;
  private readonly refreshSignal = createRefreshSignal();

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.previewService = new PreviewService(
      this.app,
      () => this.settings.loadRemoteImages,
    );

    // Servizio di livello PLUGIN, non di vista: la cache sopravvive alla
    // chiusura della galleria, e i plugin fratelli (TabX, Horizon) possono
    // chiedere miniature anche quando All Docs non è aperto.
    this.miniatures = new MiniatureService({ app: this.app });
    this.addChild(this.miniatures);

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

    this.addRibbonIcon('hi-layout-grid', 'Open All Docs', () => {
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

  private async renderFilePreview(
    request: MasonryRenderRequest,
  ): Promise<MasonryRenderResult> {
    const file = this.app.vault.getAbstractFileByPath(request.filePath);
    if (!this.miniatures || !(file instanceof TFile)) {
      return { rendered: false, clipped: false, height: 0 };
    }
    // La scala vive sull'host: la legge il servizio da --mini-scale, così il
    // chiamante la controlla col suo CSS senza passare da qui.
    if (request.scale !== undefined) {
      request.hostEl.style.setProperty('--mini-scale', String(request.scale));
    }
    const outcome = await this.miniatures.request(request.hostEl, file, request.token);
    return outcome.status === 'rendered'
      ? { rendered: true, clipped: outcome.clipped, height: outcome.height }
      : { rendered: false, clipped: false, height: 0 };
  }

  private async getFilePreview(
    filePath: string,
    maxCharacters: number,
    allowRemoteImages: boolean,
  ): Promise<GalleryPreview> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return { excerpt: '', imageUrls: [], empty: true };
    }

    const folder = file.parent?.path ?? '';
    const item: GalleryItem = {
      file,
      path: file.path,
      title: file.basename,
      folder,
      topFolder: folder.split('/')[0] ?? '',
      tags: [],
      mtime: file.stat.mtime,
      ctime: file.stat.ctime,
    };
    return this.getPreviewService().getPreview(
      item,
      maxCharacters,
      allowRemoteImages,
    );
  }
}
