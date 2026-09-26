import { Menu } from 'obsidian';
import type { App } from 'obsidian';

import {
  commandIds,
  executeCommand,
  fileBackedViewTypes,
  registeredViewTypes,
} from './obsidian-internals.ts';
import { buildSidebarMenu, type MenuEntry } from './sidebar-add-menu.ts';
import { TabHeaderButton } from './tab-header-button.ts';

/**
 * "+" at the end of the right sidebar's tab-header strip, so panes can be
 * added where their icons already live — the way a tab bar's "+" adds a tab.
 * Without it, opening a sidebar view means knowing its command name.
 *
 * Two strip-specific details, both learned the hard way:
 *
 * - No `workspace-tab-header-tab-list` wrapper class. Obsidian sets it to
 *   `display: none` outside the main split, so reusing the tab bar's wrapper
 *   mounts an invisible button. `.tabx-sidebar-add` styles the box instead;
 *   the child keeps `clickable-icon`, which is what a theme skins.
 * - Anchored to the header inner, not appended. The container ends with a
 *   flexible spacer and the sidebar-toggle button, so appending strands the
 *   "+" in the far corner with a gap where the icons are.
 */
export function createSidebarAddButton(app: App): TabHeaderButton {
  return new TabHeaderButton({
    mark: 'tabx-sidebar-add',
    containerSelector: '.mod-right-split .workspace-tab-header-container',
    anchorSelector: '.workspace-tab-header-container-inner',
    ariaLabel: 'Add a pane',
    icon: 'plus',
    onActivate: (event) => showAddMenu(app, event),
  });
}

function showAddMenu(app: App, event: MouseEvent): void {
  const { featured, views } = buildSidebarMenu({
    registered: registeredViewTypes(app),
    fileBacked: fileBackedViewTypes(app),
    openInSidebars: openInSidebars(app),
    commands: commandIds(app),
  });

  const menu = new Menu();
  const addEntry = (entry: MenuEntry): void => {
    menu.addItem((item) =>
      item
        .setTitle(entry.label)
        .setIcon(entry.icon)
        .onClick(() => void open(app, entry)),
    );
  };
  featured.forEach(addEntry);
  if (featured.length > 0 && views.length > 0) menu.addSeparator();
  views.forEach(addEntry);
  menu.showAtMouseEvent(event);
}

/** View types already mounted in either sidebar. `getRoot()` is the public way
 *  to ask which split a leaf belongs to, so this needs no internals. */
function openInSidebars(app: App): string[] {
  const { workspace } = app;
  const types = new Set<string>();
  workspace.iterateAllLeaves((leaf) => {
    const root = leaf.getRoot();
    if (root === workspace.leftSplit || root === workspace.rightSplit) {
      types.add(leaf.view.getViewType());
    }
  });
  return [...types];
}

async function open(app: App, entry: MenuEntry): Promise<void> {
  if (entry.commandId) {
    executeCommand(app, entry.commandId);
    return;
  }
  const leaf = app.workspace.getRightLeaf(false);
  if (!leaf) return;
  await leaf.setViewState({ type: entry.type, active: true });
  app.workspace.revealLeaf(leaf);
}
