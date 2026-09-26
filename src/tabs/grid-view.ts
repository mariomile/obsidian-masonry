import { ItemView, Menu, TFile, setIcon, type WorkspaceLeaf } from 'obsidian';

import { MiniatureService } from '../kit/mdminiature.ts';
import { predictMiniatureHeight } from '../kit/mdrender.ts';
import { createGalleryItem } from '../model.ts';
import type { PreviewService } from '../preview.ts';
import {
  classifyTag,
  PRESENTATIONS,
  type GalleryPresentation,
} from '../presentation.ts';
import { formatRelativeDate, isRenderableViewport } from '../utils.ts';
import { buildTabCard } from './card-model.ts';
import {
  GRID_SORTS,
  matchesQuery,
  sortCards,
  type GridSort,
} from './grid-filter.ts';
import { leafId } from './obsidian-internals.ts';
import { cardSignature, planReconcile } from './reconcile.ts';
import { collectTabs } from './tab-source.ts';
import type { TabCard, TabsSettings } from './types.ts';

/** Kept from TabX so saved workspace layouts reopen this view. */
export const TABX_GRID_VIEW_TYPE = 'tabx-grid';

const PRESENTATION_ORDER: GalleryPresentation[] = ['compact', 'editorial', 'visual'];
const DENSITY_ICONS: Record<GalleryPresentation, string> = {
  compact: 'grip',
  editorial: 'layout-grid',
  visual: 'panels-top-left',
};
const DENSITY_LABELS: Record<GalleryPresentation, string> = {
  compact: 'Compact',
  editorial: 'Editorial',
  visual: 'Visual',
};

/**
 * The open tabs as a Masonry gallery: same root, grid, card markup, rich
 * miniature and text fallback as All Docs, so the two read as one product.
 *
 * What stays specific to tabs is the card LIFECYCLE. A tab closes, opens or
 * gains focus far more often than a note changes, so cards are reconciled by
 * leaf id instead of re-rendered: a survivor keeps its exact element and
 * therefore its already-hydrated preview. Re-rendering every card on each
 * change is what made closing one tab flash the whole grid back through its
 * skeletons.
 */
export class GridView extends ItemView {
  private rootEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private emptyEl: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private miniatures!: MiniatureService;
  private cardEls: HTMLElement[] = [];
  private hostSeq = 0;
  private debounce: number | null = null;
  private searchTimer: number | null = null;
  private presentation: GalleryPresentation = 'editorial';
  private sort: GridSort = 'tab-order';
  private query = '';
  private allCards: TabCard[] = [];
  private sortButton: HTMLButtonElement | null = null;
  private viewButton: HTMLButtonElement | null = null;
  private readonly densityButtons = new Map<GalleryPresentation, HTMLButtonElement>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly getSettings: () => TabsSettings,
    private readonly previewService: PreviewService,
    private readonly onPresentationChange: (
      presentation: GalleryPresentation,
    ) => Promise<void>,
    private readonly onSortChange: (sort: GridSort) => Promise<void>,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TABX_GRID_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Tab grid';
  }

  getIcon(): string {
    return 'layout-grid';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('masonry-view-content');
    this.presentation = this.getSettings().presentation;
    this.sort = this.getSettings().sort;

    this.rootEl = this.contentEl.createDiv({ cls: 'masonry masonry--tabs' });
    this.buildHeader(this.rootEl.createDiv({ cls: 'masonry-header' }));
    this.resultsEl = this.rootEl.createDiv({ cls: 'masonry-results' });
    this.gridEl = this.resultsEl
      .createEl('section', { cls: 'masonry-group' })
      .createDiv({ cls: 'masonry-grid tabx-grid' });
    this.applyPresentation(this.presentation);

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.observer?.unobserve(entry.target);
          void this.hydrate(entry.target as HTMLElement);
        }
      },
      { root: this.contentEl, rootMargin: '320px 0px' },
    );
    this.register(() => this.observer?.disconnect());

    // Per view, like each All Docs surface: closing the grid releases its
    // renders. An evicted host gets its skeleton back and is re-observed, so
    // scrolling to it again refills from the cache instead of staying blank.
    this.miniatures = this.addChild(
      new MiniatureService({
        app: this.app,
        onEvict: (hostEl) => {
          hostEl.addClass('is-loading');
          delete hostEl.dataset.requested;
          this.observer?.observe(hostEl);
        },
      }),
    );
    // Backstop, as in All Docs: an IntersectionObserver in a pane that gets no
    // frames (background window, idle pane) can miss its callback, and without
    // this a card would sit on its skeleton until something touched it.
    this.registerInterval(window.setInterval(() => this.hydrateVisible(), 1500));

    this.registerDomEvent(this.gridEl, 'click', (event) => this.onClick(event));
    this.registerDomEvent(this.gridEl, 'auxclick', (event) => this.onAux(event));
    this.registerDomEvent(this.gridEl, 'keydown', (event) => this.onKey(event));

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.queueRebuild()),
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.updateActive()),
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile) this.invalidate(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.invalidate(oldPath);
        if (file instanceof TFile) this.invalidate(file.path);
        this.queueRebuild();
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile) this.invalidate(file.path);
      }),
    );

    this.rebuild();
  }

  async onClose(): Promise<void> {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.observer?.disconnect();
    this.observer = null;
    this.contentEl.removeClass('masonry-view-content');
  }

  /** Public entry point for settings-driven refresh. */
  reload(): void {
    this.presentation = this.getSettings().presentation;
    this.sort = this.getSettings().sort;
    this.applyPresentation(this.presentation);
    this.updateSortLabel();
    this.rebuild();
  }

  private invalidate(path: string): void {
    this.previewService.invalidate(path);
    this.miniatures.invalidate(path);
  }

  private buildHeader(headerEl: HTMLElement): void {
    const toolbar = headerEl.createDiv({
      cls: 'masonry-toolbar',
      attr: { role: 'toolbar', 'aria-label': 'Tab grid controls' },
    });

    const searchWrap = toolbar.createDiv({ cls: 'mv-field masonry-search' });
    const searchIcon = searchWrap.createSpan({
      cls: 'mv-field__icon',
      attr: { 'aria-hidden': 'true' },
    });
    setIcon(searchIcon, 'search');
    const search = searchWrap.createEl('input', {
      cls: 'mv-field__input masonry-search-input',
      type: 'search',
      placeholder: 'Search tabs…',
      attr: { 'aria-label': 'Search tabs' },
    });
    this.registerDomEvent(search, 'input', () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.searchTimer = null;
        this.query = search.value;
        this.renderCards();
      }, 120);
    });

    this.sortButton = this.createIconMenuButton(toolbar, 'masonry-sort', 'arrow-up-down');
    this.updateSortLabel();
    this.registerDomEvent(this.sortButton, 'click', (event) => {
      this.openSortMenu(event);
    });

    const density = toolbar.createDiv({
      cls: 'mv-seg masonry-density',
      attr: { role: 'group', 'aria-label': 'Card density' },
    });
    for (const mode of PRESENTATION_ORDER) {
      const button = density.createEl('button', {
        cls: 'mv-seg-item masonry-density-button',
        attr: {
          type: 'button',
          title: DENSITY_LABELS[mode],
          'aria-label': DENSITY_LABELS[mode],
          'aria-pressed': String(mode === this.presentation),
        },
      });
      setIcon(button, DENSITY_ICONS[mode]);
      this.registerDomEvent(button, 'click', () => {
        void this.setPresentation(mode);
      });
      this.densityButtons.set(mode, button);
    }

    // Narrow panes hide the segmented control (Masonry's CSS); this icon
    // button takes its place there, exactly as in All Docs.
    this.viewButton = this.createIconMenuButton(
      toolbar,
      'masonry-presentation-select',
      DENSITY_ICONS[this.presentation],
    );
    this.viewButton.setAttribute('aria-label', 'View');
    this.registerDomEvent(this.viewButton, 'click', (event) => {
      this.openDensityMenu(event);
    });
  }

  private createIconMenuButton(
    toolbar: HTMLElement,
    cls: string,
    icon: string,
  ): HTMLButtonElement {
    const button = toolbar.createEl('button', {
      cls: `masonry-select masonry-menu-button masonry-menu-button--icon ${cls}`,
      attr: { type: 'button' },
    });
    const iconEl = button.createSpan({
      cls: 'masonry-menu-button-icon',
      attr: { 'aria-hidden': 'true' },
    });
    setIcon(iconEl, icon);
    return button;
  }

  private applyPresentation(mode: GalleryPresentation): void {
    const def = PRESENTATIONS[mode];
    this.rootEl.dataset.presentation = mode;
    this.rootEl.style.setProperty('--masonry-card-width', `${def.cardWidth}px`);
    this.rootEl.style.setProperty('--masonry-excerpt-lines', String(def.excerptLines));
    this.rootEl.style.setProperty('--mini-scale', String(def.renderScale));
    for (const [value, button] of this.densityButtons) {
      button.setAttribute('aria-pressed', String(value === mode));
    }
    const viewIcon = this.viewButton?.querySelector<HTMLElement>('.masonry-menu-button-icon');
    if (viewIcon) setIcon(viewIcon, DENSITY_ICONS[mode]);
    this.viewButton?.setAttribute('title', DENSITY_LABELS[mode]);
  }

  private async setPresentation(mode: GalleryPresentation): Promise<void> {
    if (mode === this.presentation) return;
    this.presentation = mode;
    this.applyPresentation(mode);
    this.renderCards();
    await this.onPresentationChange(mode);
  }

  private openDensityMenu(event: MouseEvent): void {
    const menu = new Menu();
    for (const mode of PRESENTATION_ORDER) {
      menu.addItem((item) =>
        item
          .setTitle(DENSITY_LABELS[mode])
          .setIcon(DENSITY_ICONS[mode])
          .setChecked(mode === this.presentation)
          .onClick(() => void this.setPresentation(mode)),
      );
    }
    menu.showAtMouseEvent(event);
  }

  private updateSortLabel(): void {
    const label =
      GRID_SORTS.find((option) => option.value === this.sort)?.label ??
      'Sort tabs';
    this.sortButton?.setAttribute('aria-label', `Sort: ${label}`);
    this.sortButton?.setAttribute('title', `Sort: ${label}`);
    this.sortButton?.toggleClass('is-filtered', this.sort !== 'tab-order');
  }

  private openSortMenu(event: MouseEvent): void {
    const menu = new Menu();
    for (const option of GRID_SORTS) {
      menu.addItem((item) => {
        item
          .setTitle(option.label)
          .setChecked(option.value === this.sort)
          .onClick(() => {
            void this.setSort(option.value);
          });
      });
    }
    menu.showAtMouseEvent(event);
  }

  private async setSort(sort: GridSort): Promise<void> {
    if (sort === this.sort) return;
    this.sort = sort;
    this.updateSortLabel();
    this.renderCards();
    await this.onSortChange(sort);
  }

  private queueRebuild(): void {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.debounce = null;
      this.rebuild();
    }, 50);
  }

  /** Re-collect the open tabs, then filter/sort/render them. */
  private rebuild(): void {
    this.allCards = collectTabs(this.app).map((entry) =>
      buildTabCard(this.app, entry),
    );
    this.renderCards();
  }

  /** Render the current cards through the active query + sort (no re-collect). */
  private renderCards(): void {
    const settings = this.getSettings();
    const showPreview = settings.showTabPreview;
    const showTags = settings.showTags;
    const now = Date.now();
    const visible = sortCards(
      this.allCards.filter((card) => matchesQuery(card, this.query)),
      this.sort,
    );

    // Reconcile against what's already on screen, keyed by leaf id. A survivor
    // whose signature is unchanged keeps its exact element; one whose content
    // changed is rebuilt alone and its old element dropped.
    const prevOrder = this.cardEls.map((el) => el.dataset.leafId ?? '');
    const prevById = new Map(
      this.cardEls.map((el) => [el.dataset.leafId ?? '', el] as const),
    );
    const discarded: HTMLElement[] = [];
    let recreatedSurvivor = false;
    const nextEls = visible.map((card) => {
      const id = card.entry.id;
      const sig = cardSignature(card, showPreview, showTags, this.presentation);
      const existing = prevById.get(id);
      if (existing) {
        prevById.delete(id);
        if (existing.dataset.sig === sig) return existing;
        recreatedSurvivor = true;
        discarded.push(existing);
      }
      return this.renderCard(card, showPreview, showTags, now, sig);
    });
    discarded.push(...prevById.values());
    const nextOrder = nextEls.map((el) => el.dataset.leafId ?? '');
    this.cardEls = nextEls;

    for (const el of discarded) this.discardCard(el);

    if (visible.length === 0) {
      this.renderEmpty();
      return;
    }
    this.emptyEl?.remove();
    this.emptyEl = null;

    // A pure removal (no adds, no reorder, no content change) is already done:
    // the survivors never moved. Everything else re-appends the cards in the
    // new order; appendChild moves reused nodes, so their previews stay.
    const plan = planReconcile(prevOrder, nextOrder);
    if (plan.kind === 'remove' && !recreatedSurvivor) return;
    for (const el of nextEls) this.gridEl.appendChild(el);
  }

  private discardCard(cardEl: HTMLElement): void {
    for (const host of Array.from(
      cardEl.querySelectorAll<HTMLElement>('.masonry-preview-host'),
    )) {
      this.observer?.unobserve(host);
      this.miniatures.cancel(host);
    }
    cardEl.remove();
  }

  private renderEmpty(): void {
    this.emptyEl?.remove();
    this.emptyEl = this.resultsEl.createDiv({ cls: 'masonry-empty' });
    const icon = this.emptyEl.createSpan({
      cls: 'masonry-empty-icon',
      attr: { 'aria-hidden': 'true' },
    });
    setIcon(icon, 'search-x');
    this.emptyEl.createEl('h3', {
      text: this.query ? 'No matching tabs' : 'No open tabs',
    });
    this.emptyEl.createEl('p', {
      text: this.query
        ? 'Try a shorter search term.'
        : 'Open a note and it shows up here.',
    });
  }

  private renderCard(
    card: TabCard,
    showPreview: boolean,
    showTags: boolean,
    now: number,
    sig: string,
  ): HTMLElement {
    const { entry } = card;
    const cardEl = createEl('article', {
      cls: `masonry-card masonry-card--${this.presentation} tabx-card`,
      attr: {
        'data-leaf-id': entry.id,
        'data-sig': sig,
        role: 'button',
        tabindex: '0',
        'aria-label': `Activate ${entry.title}`,
      },
    });
    cardEl.toggleClass('is-active', entry.active);

    const closeButton = cardEl.createEl('button', {
      cls: 'clickable-icon tabx-card-close',
      attr: { type: 'button', 'aria-label': `Close ${entry.title}` },
    });
    setIcon(closeButton, 'x');

    const body = cardEl.createDiv({ cls: 'masonry-card-body' });
    const titleEl = body.createEl('h3', {
      cls: 'masonry-card-title',
      text: entry.title,
    });
    titleEl.setAttribute('title', entry.title);

    if (card.folder || card.mtime !== null) {
      const meta = body.createDiv({ cls: 'masonry-card-meta' });
      if (card.folder) {
        meta.createSpan({ cls: 'masonry-folder-label', text: card.folder });
      }
      if (card.mtime !== null) {
        meta.createSpan({
          cls: 'masonry-date',
          text: formatRelativeDate(card.mtime, now),
        });
      }
    }

    const file = entry.filePath
      ? this.app.vault.getAbstractFileByPath(entry.filePath)
      : null;
    if (showPreview && file instanceof TFile && file.extension === 'md') {
      this.renderPreviewHost(cardEl, file);
    } else if (showPreview) {
      // Tabs with nothing to preview (plugin views, empty tabs, web viewers,
      // PDFs) get a poster: the tab's own glyph on a tinted field, so the card
      // reads as an intentional tile, not an empty stub.
      const poster = cardEl.createDiv({ cls: 'tabx-card-poster' });
      const glyph = poster.createSpan({
        cls: 'tabx-card-poster-glyph',
        attr: { 'aria-hidden': 'true' },
      });
      setIcon(glyph, entry.icon);
    }

    if (showTags && card.tags.length > 0) {
      const tagsEl = body.createDiv({ cls: 'masonry-tags' });
      for (const tag of card.tags.slice(0, 4)) {
        tagsEl.createSpan({
          cls: 'masonry-tag-chip',
          text: `#${tag}`,
          attr: { 'data-tag-kind': classifyTag(tag) },
        });
      }
    }

    return cardEl;
  }

  private renderPreviewHost(cardEl: HTMLElement, file: TFile): void {
    const host = cardEl.createDiv({
      cls: 'masonry-preview-host is-loading',
      attr: {
        'data-file': file.path,
        // Per-host token: a host belongs to one card for its whole life, so an
        // in-flight preview is dropped only when ITS card is discarded. A
        // global render epoch would wrongly cancel a reused survivor's
        // still-loading preview on the next rebuild.
        'data-token': String(this.hostSeq++),
      },
    });
    if (MiniatureService.isSupported()) {
      host.addClass('mv-mini');
      host.setAttribute('aria-hidden', 'true');
      // Reserve the height up front from stat.size, as All Docs does: the grid
      // is CSS multi-column, and every async height change re-balances it.
      host.style.height = `${predictMiniatureHeight(
        file.stat.size,
        PRESENTATIONS[this.presentation].renderScale,
        96,
        340,
      )}px`;
    }
    host.createDiv({ cls: 'masonry-preview-skeleton' });
    this.observer?.observe(host);
  }

  private hydrateVisible(): void {
    const rootRect = this.contentEl.getBoundingClientRect();
    if (!isRenderableViewport(rootRect)) return;
    const top = rootRect.top - 320;
    const bottom = rootRect.bottom + 320;
    for (const host of Array.from(
      this.gridEl.querySelectorAll<HTMLElement>('.masonry-preview-host.is-loading'),
    )) {
      if (host.dataset.requested) continue;
      const rect = host.getBoundingClientRect();
      if (rect.bottom < top || rect.top > bottom) continue;
      this.observer?.unobserve(host);
      void this.hydrate(host);
    }
  }

  private async hydrate(host: HTMLElement): Promise<void> {
    if (host.dataset.requested) return;
    host.dataset.requested = '1';
    const path = host.dataset.file;
    const token = host.dataset.token;
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile) || !host.isConnected) return;

    // Rich mode renders the document itself. On 'empty' or 'failed' it falls
    // through to the text path: a card that degrades to an excerpt is better
    // than one that degrades to an error.
    if (host.hasClass('mv-mini')) {
      const outcome = await this.miniatures.request(host, file, token ?? '');
      if (outcome.status === 'rendered' || outcome.status === 'cancelled') return;
      if (!host.isConnected || host.dataset.token !== token) return;
      host.removeClass('mv-mini');
      host.removeAttribute('aria-hidden');
      host.style.removeProperty('height');
    }

    try {
      const preview = await this.previewService.getPreview(
        createGalleryItem(this.app, file),
        this.getSettings().previewCharacters,
      );
      if (!host.isConnected || host.dataset.token !== token) return;
      host.empty();
      host.removeClass('is-loading');
      const imageUrl = preview.imageUrls[0];
      if (imageUrl) {
        const img = host.createEl('img', {
          cls: 'masonry-card-image',
          attr: { alt: '', loading: 'lazy', decoding: 'async', src: imageUrl },
        });
        img.addEventListener('error', () => img.remove(), { once: true });
      }
      if (preview.excerpt) {
        host.createDiv({ cls: 'masonry-card-preview', text: preview.excerpt });
      } else if (!imageUrl) {
        host.createDiv({ cls: 'masonry-card-empty-preview', text: 'Empty note' });
      }
    } catch (error) {
      if (!host.isConnected) return;
      host.empty();
      host.removeClass('is-loading');
      host.createDiv({
        cls: 'masonry-card-empty-preview',
        text: 'Preview unavailable',
      });
      console.warn(`Masonry could not preview the tab ${path ?? ''}`, error);
    }
  }

  private updateActive(): void {
    const activeLeaf = this.app.workspace.getMostRecentLeaf(
      this.app.workspace.rootSplit,
    );
    const activeId = activeLeaf ? leafId(activeLeaf) : null;
    for (const cardEl of this.cardEls) {
      cardEl.toggleClass('is-active', cardEl.dataset.leafId === activeId);
    }
  }

  private cardLeaf(event: Event): WorkspaceLeaf | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const cardEl = target.closest<HTMLElement>('.tabx-card');
    const id = cardEl?.dataset.leafId;
    if (!id) return null;
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateRootLeaves((leaf) => {
      if (leafId(leaf) === id) found = leaf;
    });
    return found;
  }

  private onClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.tabx-card-close')) {
      const leaf = this.cardLeaf(event);
      if (leaf) {
        event.preventDefault();
        leaf.detach();
        this.rebuild();
      }
      return;
    }
    const leaf = this.cardLeaf(event);
    if (leaf) this.activate(leaf);
  }

  private onAux(event: MouseEvent): void {
    if (event.button !== 1) return;
    const leaf = this.cardLeaf(event);
    if (!leaf) return;
    event.preventDefault();
    leaf.detach();
    this.rebuild();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('.tabx-card')) {
      return;
    }
    const leaf = this.cardLeaf(event);
    if (!leaf) return;
    event.preventDefault();
    this.activate(leaf);
  }

  private activate(leaf: WorkspaceLeaf): void {
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    void this.app.workspace.revealLeaf(leaf);
  }
}
