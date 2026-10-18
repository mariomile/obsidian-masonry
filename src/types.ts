import type { TFile } from 'obsidian';

import type { TabsSettings } from './tabs/types.ts';

export type GallerySort =
  | 'modified-desc'
  | 'modified-asc'
  | 'created-desc'
  | 'created-asc'
  | 'title-asc'
  | 'title-desc';

export type GalleryLayout = 'masonry' | 'list' | 'table';

export interface GalleryProperty {
  id: string;
  label: string;
  value: string;
}

export interface GalleryItem {
  file: TFile;
  path: string;
  title: string;
  folder: string;
  topFolder: string;
  tags: string[];
  mtime: number;
  ctime: number;
  group?: string;
  properties?: GalleryProperty[];
}

export interface GalleryFilters {
  query: string;
  folder: string;
  tag: string;
}

export interface GalleryPreview {
  imageUrls: string[];
  excerpt: string;
  empty: boolean;
}

export interface GalleryDisplayOptions {
  layout: GalleryLayout;
  previewCharacters: number;
  showFolder: boolean;
  showTags: boolean;
}

export interface MasonrySettings extends GalleryDisplayOptions {
  loadRemoteImages: boolean;
  initialBatchSize: number;
  batchSize: number;
  sort: GallerySort;
  /** Folder behind the Inbox quick filter (hidden when it does not exist). */
  inboxFolder: string;
  /** Tags shown as quick-filter pills; empty = the two most used tags. */
  quickTags: string[];
  excludedFolders: string[];
  /** The open-tabs module (formerly the TabX plugin). */
  tabs: TabsSettings;
}
