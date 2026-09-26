import type { App, WorkspaceLeaf } from 'obsidian';
import type { TabEntry } from './types.ts';
import { leafId } from './obsidian-internals.ts';

export function toTabEntry(
  leaf: WorkspaceLeaf,
  activeId: string | null,
): TabEntry {
  const id = leafId(leaf);
  const view = leaf.getViewState();
  const file = view.state?.file;
  return {
    id,
    leaf,
    title: leaf.getDisplayText(),
    icon: leaf.getIcon(),
    filePath: typeof file === 'string' && file.length > 0 ? file : null,
    pinned: Boolean(view.pinned),
    active: activeId !== null && id === activeId,
  };
}

export function collectTabs(app: App): TabEntry[] {
  const activeLeaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  const activeId = activeLeaf ? leafId(activeLeaf) : null;
  const entries: TabEntry[] = [];
  app.workspace.iterateRootLeaves((leaf) => {
    entries.push(toTabEntry(leaf, activeId));
  });
  return entries;
}

/** Parent folder of a vault path ('' for a root-level file). */
export function folderOf(filePath: string | null): string {
  if (!filePath) return '';
  const slash = filePath.lastIndexOf('/');
  return slash > 0 ? filePath.slice(0, slash) : '';
}
