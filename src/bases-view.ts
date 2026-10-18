import {
  BasesView,
  type BasesAllOptions,
  type BasesEntry,
  type BasesPropertyId,
  type QueryController,
} from 'obsidian';

import { GallerySurface } from './gallery.ts';
import { createGalleryItem } from './model.ts';
import { resolveLayout } from './settings-data.ts';
import type { PreviewService } from './preview.ts';
import { formatPropertyValue } from './utils.ts';
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
        displayName: 'Layout',
        type: 'dropdown',
        key: 'layout',
        default: 'masonry',
        options: {
          masonry: 'Masonry',
          list: 'List',
          table: 'Table',
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

  /** Every configured property, empty ones included as '', so each item
   *  carries the view's full column order: the table reads it as its columns,
   *  the card skips the empty values. */
  private getProperties(
    entry: BasesEntry,
    propertyOrder: BasesPropertyId[],
  ): GalleryProperty[] {
    return propertyOrder.map((propertyId) => {
      const value = entry.getValue(propertyId);
      return {
        id: propertyId,
        label: this.config.getDisplayName(propertyId),
        value: (value && formatPropertyValue(value.toString())) ?? '',
      };
    });
  }

  private getDisplayOptions(): GalleryDisplayOptions {
    return {
      layout: resolveLayout(this.config.get('layout'), this.settings.layout),
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
