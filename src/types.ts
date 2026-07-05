import type { TFile } from 'obsidian';

import type { GalleryPresentation } from './presentation.ts';

export type GallerySort =
  | 'modified-desc'
  | 'modified-asc'
  | 'created-desc'
  | 'created-asc'
  | 'title-asc'
  | 'title-desc';

export interface GalleryProperty {
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
  presentation: GalleryPresentation;
  previewCharacters: number;
  showFolder: boolean;
  showTags: boolean;
}

export interface MasonrySettings extends GalleryDisplayOptions {
  loadRemoteImages: boolean;
  initialBatchSize: number;
  batchSize: number;
  sort: GallerySort;
  excludedFolders: string[];
}
