import type { WorkspaceLeaf } from 'obsidian';

import type { GalleryPresentation } from '../presentation.ts';
import type { GridSort } from './grid-filter.ts';

/** Settings of the open-tabs module (formerly the TabX plugin). */
export interface TabsSettings {
  autoHide: boolean;
  scrollTabBar: boolean;
  showTabPreview: boolean;
  showTags: boolean;
  previewCharacters: number;
  presentation: GalleryPresentation;
  tabBarButton: boolean;
  /** "+" at the end of the right sidebar's tab-header strip, opening a menu
   *  of panes to add (browser, terminal, any other sidebar view). */
  sidebarAddButton: boolean;
  sort: GridSort;
}

export interface TabEntry {
  id: string;
  leaf: WorkspaceLeaf;
  title: string;
  icon: string;
  filePath: string | null;
  pinned: boolean;
  active: boolean;
}

/** Synchronous, file-derived metadata for a grid card (tags, folder, date). */
export interface TabCard {
  entry: TabEntry;
  folder: string;
  mtime: number | null;
  tags: string[];
}
