import { getAllTags, TFile, type App } from 'obsidian';

import { folderOf } from './tab-source.ts';
import type { TabCard, TabEntry } from './types.ts';

/** Build the synchronous card metadata (tags, folder, mtime) for a tab. */
export function buildTabCard(app: App, entry: TabEntry): TabCard {
  if (!entry.filePath) {
    return { entry, folder: '', mtime: null, tags: [] };
  }
  const file = app.vault.getAbstractFileByPath(entry.filePath);
  if (!(file instanceof TFile)) {
    return { entry, folder: folderOf(entry.filePath), mtime: null, tags: [] };
  }
  const cache = app.metadataCache.getFileCache(file);
  const tags = (cache ? (getAllTags(cache) ?? []) : [])
    .map((tag) => tag.replace(/^#/, ''))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .sort((left, right) => left.localeCompare(right));
  const folder = file.parent?.isRoot() ? '' : (file.parent?.path ?? '');
  return { entry, folder, mtime: file.stat.mtime, tags };
}
