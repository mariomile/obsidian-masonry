import {
  BasesView,
  type BasesAllOptions,
  type BasesEntry,
  type BasesPropertyId,
  type QueryController,
} from 'obsidian';

import { GallerySurface } from './gallery.ts';
import { createGalleryItem } from './model.ts';
import { resolvePresentation } from './presentation.ts';
import type { PreviewService } from './preview.ts';
import type { RefreshSignal } from './utils.ts';
import type {
  MasonrySettings,
  GalleryDisplayOptions,
  GalleryProperty,
} from './types.ts';

export const BASES_GALLERY_VIEW_TYPE = 'masonry';

export class MasonryBasesView extends BasesView {
  readonly type = BASES_GALLERY_VIEW_TYPE;
  private readonly surface: GallerySurface;

  constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    private readonly settings: MasonrySettings,
    previewService: PreviewService,
    refreshSignal: RefreshSignal,
  ) {
    super(controller);
    this.surface = this.addChild(
      new GallerySurface({
        app: this.app,
        containerEl,
        mode: 'bases',
        showChrome: false,
        previewService,
        refreshSignal,
        settings,
      }),
    );
  }

  onDataUpdated(): void {
    this.surface.setDisplayOptions(this.getDisplayOptions(), false);

    const propertyOrder = this.config
      .getOrder()
      .filter(
        (propertyId) =>
          propertyId !== 'file.name' && propertyId !== 'file.mtime',
      );
    const items = this.data.groupedData.flatMap((group) => {
      const groupLabel = group.hasKey()
        ? (group.key?.toString() ?? 'Ungrouped')
        : undefined;
      return group.entries.map((entry) =>
        createGalleryItem(this.app, entry.file, {
          group: groupLabel,
          properties: this.getProperties(entry, propertyOrder),
        }),
      );
    });

    this.surface.setItems(items);
  }

  static getViewOptions(): BasesAllOptions[] {
    return [
      {
        displayName: 'Presentation',
        type: 'dropdown',
        key: 'presentation',
        default: 'editorial',
        options: {
          compact: 'Compact',
          editorial: 'Editorial',
          visual: 'Visual',
        },
      },
      {
        displayName: 'Preview length',
        type: 'slider',
        key: 'previewCharacters',
        default: 700,
        min: 180,
        max: 1_400,
        step: 20,
      },
      {
        displayName: 'Show folder',
        type: 'toggle',
        key: 'showFolder',
        default: true,
      },
      {
        displayName: 'Show tags',
        type: 'toggle',
        key: 'showTags',
        default: true,
      },
    ];
  }

  private getProperties(
    entry: BasesEntry,
    propertyOrder: BasesPropertyId[],
  ): GalleryProperty[] {
    const properties: GalleryProperty[] = [];
    for (const propertyId of propertyOrder) {
      const value = entry.getValue(propertyId);
      if (!value) continue;
      const text = value.toString().trim();
      if (!text) continue;
      properties.push({
        label: this.config.getDisplayName(propertyId),
        value: text,
      });
      if (properties.length === 4) break;
    }
    return properties;
  }

  private getDisplayOptions(): GalleryDisplayOptions {
    return {
      presentation: resolvePresentation(
        this.config.get('presentation'),
        this.settings.presentation,
      ),
      previewCharacters: this.numberOption(
        'previewCharacters',
        this.settings.previewCharacters,
      ),
      showFolder: this.booleanOption('showFolder', this.settings.showFolder),
      showTags: this.booleanOption('showTags', this.settings.showTags),
    };
  }

  private numberOption(key: string, fallback: number): number {
    const value = this.config.get(key);
    return typeof value === 'number' ? value : fallback;
  }

  private booleanOption(key: string, fallback: boolean): boolean {
    const value = this.config.get(key);
    return typeof value === 'boolean' ? value : fallback;
  }
}
