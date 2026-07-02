import { getAllTags, type App, type TFile } from 'obsidian';

import type { GalleryItem, GalleryProperty } from './types.ts';
import { topLevelFolder } from './utils.ts';

export function createGalleryItem(
  app: App,
  file: TFile,
  options: {
    group?: string;
    properties?: GalleryProperty[];
  } = {},
): GalleryItem {
  const cache = app.metadataCache.getFileCache(file);
  const tags = (cache ? (getAllTags(cache) ?? []) : [])
    .map((tag) => tag.replace(/^#/, ''))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .sort((left, right) => left.localeCompare(right));
  const folder = file.parent?.isRoot() ? '' : (file.parent?.path ?? '');

  return {
    file,
    path: file.path,
    title: file.basename,
    folder,
    topFolder: topLevelFolder(file.path),
    tags,
    mtime: file.stat.mtime,
    ctime: file.stat.ctime,
    group: options.group,
    properties: options.properties,
  };
}
