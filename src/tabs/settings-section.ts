import { Setting } from 'obsidian';

import { resolvePresentation } from '../presentation.ts';
import { GRID_SORTS, resolveSort } from './grid-filter.ts';
import type { OpenTabs } from './open-tabs.ts';
import type { TabsSettings } from './types.ts';

/** The "Open tabs" section of Masonry's settings tab (formerly TabX's). */
export function displayTabsSettings(
  containerEl: HTMLElement,
  settings: TabsSettings,
  save: () => Promise<void>,
  openTabs: OpenTabs,
): void {
  new Setting(containerEl).setName('Open tabs').setHeading();

  new Setting(containerEl)
    .setName('Auto-hide tab bar')
    .setDesc(
      'Hide the horizontal note tab bar and reveal it on hover at the top of the pane.',
    )
    .addToggle((toggle) =>
      toggle.setValue(settings.autoHide).onChange(async (value) => {
        settings.autoHide = value;
        await save();
        openTabs.applyAutoHide();
      }),
    );

  new Setting(containerEl)
    .setName('Scrolling horizontal tab bar')
    .setDesc(
      'Let the native top tab bar scroll horizontally instead of shrinking each tab.',
    )
    .addToggle((toggle) =>
      toggle.setValue(settings.scrollTabBar).onChange(async (value) => {
        settings.scrollTabBar = value;
        await save();
        openTabs.applyTabBarStyle();
      }),
    );

  new Setting(containerEl)
    .setName('Tab grid button in tab bar')
    .setDesc('Show a button in the main tab bar that opens the tab grid.')
    .addToggle((toggle) =>
      toggle.setValue(settings.tabBarButton).onChange(async (value) => {
        settings.tabBarButton = value;
        await save();
        openTabs.applyTabBarButton();
      }),
    );

  new Setting(containerEl)
    .setName('Add-pane button in the sidebar')
    .setDesc(
      'Show a "+" at the end of the right sidebar\'s icon strip that opens a menu of panes to add: browser, terminal, and every other sidebar view.',
    )
    .addToggle((toggle) =>
      toggle.setValue(settings.sidebarAddButton).onChange(async (value) => {
        settings.sidebarAddButton = value;
        await save();
        openTabs.applySidebarAddButton();
      }),
    );

  new Setting(containerEl)
    .setName('Tab grid presentation')
    .setDesc('Initial card layout for the tab grid.')
    .addDropdown((dropdown) =>
      dropdown
        .addOptions({
          compact: 'Compact',
          editorial: 'Editorial',
          visual: 'Visual',
        })
        .setValue(settings.presentation)
        .onChange(async (value) => {
          settings.presentation = resolvePresentation(value);
          await save();
          openTabs.refreshGrids();
        }),
    );

  new Setting(containerEl)
    .setName('Tab grid sort')
    .setDesc('Initial sort order for the tab grid.')
    .addDropdown((dropdown) => {
      for (const option of GRID_SORTS) {
        dropdown.addOption(option.value, option.label);
      }
      dropdown.setValue(settings.sort).onChange(async (value) => {
        settings.sort = resolveSort(value);
        await save();
        openTabs.refreshGrids();
      });
    });

  new Setting(containerEl)
    .setName('Show tab previews')
    .setDesc('Render a preview of the note on each card in the tab grid.')
    .addToggle((toggle) =>
      toggle.setValue(settings.showTabPreview).onChange(async (value) => {
        settings.showTabPreview = value;
        await save();
        openTabs.refreshGrids();
      }),
    );

  new Setting(containerEl)
    .setName('Show tags on tabs')
    .setDesc('Display up to four tags per card in the tab grid.')
    .addToggle((toggle) =>
      toggle.setValue(settings.showTags).onChange(async (value) => {
        settings.showTags = value;
        await save();
        openTabs.refreshGrids();
      }),
    );

  new Setting(containerEl)
    .setName('Tab preview length')
    .setDesc(
      'Maximum characters of the text excerpt, used when the rendered preview is unavailable.',
    )
    .addSlider((slider) =>
      slider
        .setLimits(40, 600, 20)
        .setValue(settings.previewCharacters)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.previewCharacters = value;
          await save();
          openTabs.refreshGrids();
        }),
    );
}
