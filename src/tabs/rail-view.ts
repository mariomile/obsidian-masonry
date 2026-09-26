import {
  ItemView,
  setIcon,
  type HoverParent,
  type HoverPopover,
  type WorkspaceLeaf,
} from 'obsidian';

import { collectTabs } from './tab-source.ts';
import { leafId } from './obsidian-internals.ts';
import type { TabEntry } from './types.ts';

export const TABX_RAIL_VIEW_TYPE = 'tabx-rail';

interface RailRow {
  el: HTMLElement;
  titleEl: HTMLElement;
  iconEl: HTMLElement;
  entry: TabEntry;
}

export class RailView extends ItemView implements HoverParent {
  hoverPopover: HoverPopover | null = null;

  private listEl!: HTMLElement;
  private countEl!: HTMLElement;
  private readonly rows = new Map<string, RailRow>();
  private debounce: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly openGrid: () => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TABX_RAIL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Open tabs';
  }

  getIcon(): string {
    return 'hi-square-stack';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tabx-rail-content');
    const root = this.contentEl.createDiv({ cls: 'tabx-rail' });

    const header = root.createDiv({ cls: 'tabx-rail-header' });
    header.createSpan({ cls: 'tabx-rail-title', text: 'Open tabs' });
    this.countEl = header.createSpan({ cls: 'tabx-rail-count' });

    const newTabButton = header.createEl('button', {
      cls: 'clickable-icon tabx-rail-action tabx-new-tab',
      attr: { type: 'button', 'aria-label': 'New tab' },
    });
    setIcon(newTabButton, 'plus');
    this.registerDomEvent(newTabButton, 'click', () => this.newTab());

    const gridButton = header.createEl('button', {
      cls: 'clickable-icon tabx-rail-action tabx-grid-open',
      attr: { type: 'button', 'aria-label': 'Open tab grid' },
    });
    setIcon(gridButton, 'layout-grid');
    this.registerDomEvent(gridButton, 'click', () => this.openGrid());

    this.listEl = root.createDiv({ cls: 'tabx-rail-list' });
    this.registerDomEvent(this.listEl, 'click', (event) =>
      this.onListClick(event),
    );
    this.registerDomEvent(this.listEl, 'auxclick', (event) =>
      this.onListAux(event),
    );
    this.registerDomEvent(this.listEl, 'keydown', (event) =>
      this.onListKey(event),
    );
    this.registerDomEvent(this.listEl, 'mouseover', (event) =>
      this.onHover(event),
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.queueRebuild()),
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.updateActive()),
    );

    this.rebuild();
  }

  async onClose(): Promise<void> {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.rows.clear();
  }

  private queueRebuild(): void {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.debounce = null;
      this.rebuild();
    }, 50);
  }

  /** Full re-read of open tabs, reconciled by leaf id to preserve focus/hover. */
  private rebuild(): void {
    const entries = collectTabs(this.app);
    const seen = new Set<string>();

    for (const entry of entries) {
      seen.add(entry.id);
      const existing = this.rows.get(entry.id);
      const row = existing ?? this.createRow(entry);
      if (existing) this.updateRow(row, entry);
      // Re-append to enforce current tab order (moves existing nodes cheaply).
      this.listEl.appendChild(row.el);
    }

    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.el.remove();
      this.rows.delete(id);
    }

    this.countEl.setText(String(entries.length));
  }

  private createRow(entry: TabEntry): RailRow {
    const el = createDiv({
      cls: 'tabx-tab',
      attr: {
        'data-leaf-id': entry.id,
        role: 'button',
        tabindex: '0',
        'aria-label': `Activate ${entry.title}`,
      },
    });
    const iconEl = el.createSpan({
      cls: 'tabx-tab-icon',
      attr: { 'aria-hidden': 'true' },
    });
    const titleEl = el.createSpan({ cls: 'tabx-tab-title' });
    const closeButton = el.createEl('button', {
      cls: 'clickable-icon tabx-tab-close',
      attr: { type: 'button', 'aria-label': `Close ${entry.title}` },
    });
    setIcon(closeButton, 'x');

    const row: RailRow = { el, titleEl, iconEl, entry };
    this.updateRow(row, entry);
    this.rows.set(entry.id, row);
    return row;
  }

  private updateRow(row: RailRow, entry: TabEntry): void {
    row.entry = entry;
    row.titleEl.setText(entry.title);
    row.titleEl.setAttribute('title', entry.title);
    setIcon(row.iconEl, entry.icon);
    row.el.toggleClass('is-pinned', entry.pinned);
    row.el.toggleClass('is-active', entry.active);
    if (entry.active) row.el.setAttribute('aria-current', 'true');
    else row.el.removeAttribute('aria-current');
  }

  /** O(1) active highlight — no rebuild. */
  private updateActive(): void {
    const activeLeaf = this.app.workspace.getMostRecentLeaf(
      this.app.workspace.rootSplit,
    );
    const activeId = activeLeaf ? leafId(activeLeaf) : null;
    for (const [id, row] of this.rows) {
      const isActive = id === activeId;
      row.el.toggleClass('is-active', isActive);
      if (isActive) row.el.setAttribute('aria-current', 'true');
      else row.el.removeAttribute('aria-current');
    }
  }

  private rowFromEvent(event: Event): RailRow | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('.tabx-tab');
    const id = el?.dataset.leafId;
    return id ? (this.rows.get(id) ?? null) : null;
  }

  private onListClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.tabx-tab-close')) {
      const row = this.rowFromEvent(event);
      if (row) {
        event.preventDefault();
        this.closeTab(row.entry);
      }
      return;
    }
    const row = this.rowFromEvent(event);
    if (row) this.activateTab(row.entry);
  }

  private onListAux(event: MouseEvent): void {
    if (event.button !== 1) return;
    const row = this.rowFromEvent(event);
    if (!row) return;
    event.preventDefault();
    this.closeTab(row.entry);
  }

  private onListKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('.tabx-tab')) return;
    const row = this.rowFromEvent(event);
    if (!row) return;
    event.preventDefault();
    this.activateTab(row.entry);
  }

  private onHover(event: MouseEvent): void {
    const row = this.rowFromEvent(event);
    if (!row || !row.entry.filePath) return;
    const related = event.relatedTarget;
    if (related instanceof Node && row.el.contains(related)) return;
    this.app.workspace.trigger('hover-link', {
      event,
      source: 'tabx',
      hoverParent: this,
      targetEl: row.el,
      linktext: row.entry.filePath,
      sourcePath: '',
    });
  }

  private activateTab(entry: TabEntry): void {
    this.app.workspace.setActiveLeaf(entry.leaf, { focus: true });
    void this.app.workspace.revealLeaf(entry.leaf);
  }

  private newTab(): void {
    const leaf = this.app.workspace.getLeaf('tab');
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private closeTab(entry: TabEntry): void {
    entry.leaf.detach();
    this.rebuild();
  }
}
