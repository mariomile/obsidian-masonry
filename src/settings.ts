import { PluginSettingTab, Setting, type App } from 'obsidian';

import type MasonryPlugin from './main.ts';
import { resolvePresentation } from './presentation.ts';
export { DEFAULT_SETTINGS, parseSettings } from './settings-data.ts';

export class MasonrySettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MasonryPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Default presentation')
      .setDesc('Initial card layout for All Docs and new Masonry Base views.')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            compact: 'Compact',
            editorial: 'Editorial',
            visual: 'Visual',
          })
          .setValue(this.plugin.settings.presentation)
          .onChange(async (value) => {
            this.plugin.settings.presentation = resolvePresentation(value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Preview length')
      .setDesc('Maximum number of Markdown characters loaded per card.')
      .addSlider((slider) =>
        slider
          .setLimits(180, 1_400, 20)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.previewCharacters)
          .onChange(async (value) => {
            this.plugin.settings.previewCharacters = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Show folder')
      .setDesc('Display the folder path on cards.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showFolder)
          .onChange(async (value) => {
            this.plugin.settings.showFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Show tags')
      .setDesc('Display up to four tags per card.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTags)
          .onChange(async (value) => {
            this.plugin.settings.showTags = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Load remote images')
      .setDesc(
        'Allow Masonry to contact external HTTP(S) hosts for note cover images. Disabled by default for privacy.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.loadRemoteImages)
          .onChange(async (value) => {
            await this.plugin.setLoadRemoteImages(value);
          }),
      );
  }
}
