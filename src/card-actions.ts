import {
  Notice,
  setIcon,
  type App,
  type Component,
  type TFile,
} from 'obsidian';

import { buildWikilink } from './presentation.ts';

interface FileExplorerView {
  revealInFolder(file: TFile): void | Promise<void>;
}

interface CardActionsConfig {
  app: App;
  owner: Component;
  containerEl: HTMLElement;
  file: TFile;
  title: string;
  openInNewTab: () => void | Promise<void>;
}

export function createCardActions(config: CardActionsConfig): HTMLElement {
  const actionsEl = config.containerEl.createDiv({
    cls: 'masonry-card-actions',
    attr: { 'aria-label': `Actions for ${config.title}` },
  });

  const newTabButton = createActionButton(
    actionsEl,
    'panels-top-left',
    'Open in new tab',
  );
  config.owner.registerDomEvent(newTabButton, 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void config.openInNewTab();
  });

  const copyButton = createActionButton(
    actionsEl,
    'copy',
    'Copy wikilink',
  );
  config.owner.registerDomEvent(copyButton, 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wikilink = buildWikilink(config.file.path, config.title);
    void navigator.clipboard.writeText(wikilink).then(
      () => new Notice('Wikilink copied'),
      () => new Notice('Could not copy wikilink'),
    );
  });

  const revealButton = createActionButton(
    actionsEl,
    'folder-search',
    'Show in file explorer',
  );
  config.owner.registerDomEvent(revealButton, 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void revealInFileExplorer(config.app, config.file);
  });

  return actionsEl;
}

function createActionButton(
  containerEl: HTMLElement,
  icon: string,
  label: string,
): HTMLButtonElement {
  const buttonEl = containerEl.createEl('button', {
    cls: 'clickable-icon masonry-card-action',
    attr: {
      type: 'button',
      title: label,
      'aria-label': label,
    },
  });
  setIcon(buttonEl, icon);
  if (!buttonEl.querySelector('svg')) setIcon(buttonEl, 'ellipsis');
  return buttonEl;
}

async function revealInFileExplorer(app: App, file: TFile): Promise<void> {
  const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
  if (!leaf) {
    new Notice('File explorer unavailable');
    return;
  }

  const view = leaf.view as unknown as Partial<FileExplorerView>;
  if (!view.revealInFolder) {
    new Notice('Could not reveal the note in the file explorer');
    return;
  }

  await view.revealInFolder(file);
  await app.workspace.revealLeaf(leaf);
}
