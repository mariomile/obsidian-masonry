import { Component, addIcon, type Plugin } from 'obsidian';

import type { PreviewService } from '../preview.ts';
import { GridView, TABX_GRID_VIEW_TYPE } from './grid-view.ts';
import { RailView, TABX_RAIL_VIEW_TYPE } from './rail-view.ts';
import { createSidebarAddButton } from './sidebar-add-button.ts';
import type { TabHeaderButton } from './tab-header-button.ts';
import { createTabGridButton } from './tabbar-button.ts';
import type { TabsSettings } from './types.ts';

// Huge Icons (hugeicons.com, free/MIT, Stroke Rounded, 24x24 grid), the hi-*
// set used across the suite. addIcon() always wraps content in a fixed
// viewBox="0 0 100 100", so a 4.166667x scale (100/24) fills it correctly.
addIcon(
  'hi-square-stack',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M20.728 14.365C21 14.9 21 15.6 21 17s0 2.1-.273 2.635a2.5 2.5 0 0 1-1.092 1.092C19.1 21 18.4 21 17 21s-2.1 0-2.635-.273a2.5 2.5 0 0 1-1.092-1.092C13 19.1 13 18.4 13 17s0-2.1.273-2.635a2.5 2.5 0 0 1 1.092-1.092C14.9 13 15.6 13 17 13s2.1 0 2.635.273a2.5 2.5 0 0 1 1.092 1.092M15.924 10a2.1 2.1 0 0 0-.197-.635a2.5 2.5 0 0 0-1.092-1.093C14.1 8 13.4 8 12 8s-2.1 0-2.635.272a2.5 2.5 0 0 0-1.093 1.093C8 9.9 8 10.6 8 12s0 2.1.272 2.635a2.5 2.5 0 0 0 1.093 1.092c.185.095.389.156.635.197M10.924 5a2.1 2.1 0 0 0-.197-.635a2.5 2.5 0 0 0-1.092-1.093C9.1 3 8.4 3 7 3s-2.1 0-2.635.272a2.5 2.5 0 0 0-1.093 1.093C3 4.9 3 5.6 3 7s0 2.1.272 2.635a2.5 2.5 0 0 0 1.093 1.092c.185.095.389.156.635.197"/>' +
    '</g>',
);

export interface OpenTabsHost {
  plugin: Plugin;
  settings: () => TabsSettings;
  save: () => Promise<void>;
  previewService: () => PreviewService;
}

/**
 * Everything that used to be the TabX plugin: the open-tabs rail, the tab grid
 * (rendered as a Masonry gallery), the tab-bar and sidebar buttons, and the
 * auto-hide / scrolling tab bar body classes.
 *
 * View type ids (`tabx-rail`, `tabx-grid`), the hover-link source and the CSS
 * hooks keep their TabX names, so saved workspace layouts, page-preview
 * settings and theme overrides written against TabX keep working.
 */
export class OpenTabs extends Component {
  private readonly tabBarButton: TabHeaderButton;
  private readonly sidebarAddButton: TabHeaderButton;

  constructor(private readonly host: OpenTabsHost) {
    super();
    this.tabBarButton = createTabGridButton(() => void this.openGrid());
    this.sidebarAddButton = createSidebarAddButton(host.plugin.app);
  }

  override onload(): void {
    const { plugin } = this.host;

    plugin.registerHoverLinkSource('tabx', {
      display: 'Masonry tab rail',
      defaultMod: true,
    });

    plugin.registerView(
      TABX_RAIL_VIEW_TYPE,
      (leaf) => new RailView(leaf, () => void this.openGrid()),
    );
    plugin.registerView(
      TABX_GRID_VIEW_TYPE,
      (leaf) =>
        new GridView(
          leaf,
          this.host.settings,
          this.host.previewService(),
          async (presentation) => {
            this.host.settings().presentation = presentation;
            await this.host.save();
          },
          async (sort) => {
            this.host.settings().sort = sort;
            await this.host.save();
          },
        ),
    );

    plugin.addRibbonIcon('hi-square-stack', 'Open tab rail', () => {
      void this.openRail();
    });
    plugin.addCommand({
      id: 'open-tab-rail',
      name: 'Open tab rail',
      callback: () => void this.openRail(),
    });
    plugin.addCommand({
      id: 'open-tab-grid',
      name: 'Open tab grid',
      callback: () => void this.openGrid(),
    });
    plugin.addCommand({
      id: 'toggle-tab-bar-autohide',
      name: 'Toggle tab bar auto-hide',
      callback: () => void this.toggleAutoHide(),
    });

    this.applyTabBarStyle();
    this.applyAutoHide();
    this.registerEvent(
      plugin.app.workspace.on('layout-change', () => {
        this.applyTabBarButton();
        this.applySidebarAddButton();
      }),
    );
    plugin.app.workspace.onLayoutReady(() => {
      this.applyTabBarButton();
      this.applySidebarAddButton();
    });
  }

  override onunload(): void {
    this.tabBarButton.unmount();
    this.sidebarAddButton.unmount();
    document.body.removeClass('tabx-scroll-tabs');
    document.body.removeClass('tabx-autohide-tabs');
  }

  applyTabBarStyle(): void {
    document.body.toggleClass('tabx-scroll-tabs', this.host.settings().scrollTabBar);
  }

  applyAutoHide(): void {
    document.body.toggleClass('tabx-autohide-tabs', this.host.settings().autoHide);
  }

  applyTabBarButton(): void {
    this.tabBarButton.refresh(this.host.settings().tabBarButton);
  }

  applySidebarAddButton(): void {
    this.sidebarAddButton.refresh(this.host.settings().sidebarAddButton);
  }

  refreshGrids(): void {
    for (const leaf of this.host.plugin.app.workspace.getLeavesOfType(
      TABX_GRID_VIEW_TYPE,
    )) {
      const view = leaf.view;
      if (view instanceof GridView) view.reload();
    }
  }

  private async toggleAutoHide(): Promise<void> {
    const settings = this.host.settings();
    settings.autoHide = !settings.autoHide;
    await this.host.save();
    this.applyAutoHide();
  }

  async openRail(): Promise<void> {
    const { workspace } = this.host.plugin.app;
    const existing = workspace.getLeavesOfType(TABX_RAIL_VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: TABX_RAIL_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }

  async openGrid(): Promise<void> {
    const { workspace } = this.host.plugin.app;
    const existing = workspace.getLeavesOfType(TABX_GRID_VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getLeaf('tab');
    await leaf.setViewState({ type: TABX_GRID_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}
