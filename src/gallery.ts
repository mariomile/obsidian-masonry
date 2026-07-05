import {
  Component,
  Keymap,
  type App,
  type HoverParent,
  type HoverPopover,
  setIcon,
} from 'obsidian';

import { createCardActions } from './card-actions.ts';
import type { PreviewService } from './preview.ts';
import {
  classifyTag,
  nextImageCandidate,
  PRESENTATIONS,
  type GalleryPresentation,
} from './presentation.ts';
import type {
  MasonrySettings,
  GalleryDisplayOptions,
  GalleryFilters,
  GalleryItem,
  GallerySort,
} from './types.ts';
import {
  type RefreshSignal,
  formatRelativeDate,
  hasActiveFilters,
  isRenderableViewport,
  matchesGalleryItem,
  ROOT_FOLDER_FILTER,
  sortGalleryItems,
} from './utils.ts';

type GalleryMode = 'all-docs' | 'bases';

interface GallerySurfaceConfig {
  app: App;
  containerEl: HTMLElement;
  mode: GalleryMode;
  title?: string;
  showChrome: boolean;
  onPresentationChange?: (
    presentation: GalleryPresentation,
  ) => void | Promise<void>;
  onSortChange?: (sort: GallerySort) => void | Promise<void>;
  previewService: PreviewService;
  refreshSignal: RefreshSignal;
  settings: MasonrySettings;
}

const PRESENTATION_ORDER: GalleryPresentation[] = [
  'compact',
  'editorial',
  'visual',
];

export class GallerySurface extends Component implements HoverParent {
  hoverPopover: HoverPopover | null = null;

  private readonly app: App;
  private readonly mode: GalleryMode;
  private readonly rootEl: HTMLElement;
  private readonly resultsEl: HTMLElement;
  private readonly countEl: HTMLElement | null;
  private readonly sentinelEl: HTMLButtonElement;
  private readonly previewService: PreviewService;
  private readonly settings: MasonrySettings;
  private readonly refreshSignal: RefreshSignal;
  private readonly onPresentationChange?: (
    presentation: GalleryPresentation,
  ) => void | Promise<void>;
  private readonly onSortChange?: (sort: GallerySort) => void | Promise<void>;
  private searchEl: HTMLInputElement | null = null;
  private folderSelect: HTMLSelectElement | null = null;
  private tagSelect: HTMLSelectElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;
  private presentationSelect: HTMLSelectElement | null = null;
  private presentationButtons = new Map<
    GalleryPresentation,
    HTMLButtonElement
  >();
  private displayOptions: GalleryDisplayOptions;
  private allItems: GalleryItem[] = [];
  private itemByPath = new Map<string, GalleryItem>();
  private filteredItems: GalleryItem[] = [];
  private filters: GalleryFilters = { query: '', folder: '', tag: '' };
  private sort: GallerySort;
  private visibleCount = 0;
  private renderEpoch = 0;
  private searchTimer: number | null = null;
  private previewObserver: IntersectionObserver | null = null;
  private sentinelObserver: IntersectionObserver | null = null;
  private visibilityObserver: ResizeObserver | null = null;
  private scrollRoot: HTMLElement | null = null;
  private hydrationFrame: number | null = null;
  private readonly groupGrids = new Map<string, HTMLElement>();

  constructor(config: GallerySurfaceConfig) {
    super();
    this.app = config.app;
    this.mode = config.mode;
    this.previewService = config.previewService;
    this.settings = config.settings;
    this.refreshSignal = config.refreshSignal;
    this.onPresentationChange = config.onPresentationChange;
    this.onSortChange = config.onSortChange;
    this.sort = config.settings.sort;
    this.displayOptions = {
      presentation: config.settings.presentation,
      previewCharacters: config.settings.previewCharacters,
      showFolder: config.settings.showFolder,
      showTags: config.settings.showTags,
    };

    this.rootEl = config.containerEl.createDiv({
      cls: `masonry masonry--${config.mode}`,
    });
    this.applyPresentation(config.settings.presentation);

    if (config.showChrome) {
      const headerEl = this.rootEl.createDiv({ cls: 'masonry-header' });
      const titleGroupEl = headerEl.createDiv({ cls: 'masonry-title-group' });
      titleGroupEl.createEl('h2', {
        cls: 'masonry-title',
        text: config.title ?? 'All Docs',
      });
      this.countEl = titleGroupEl.createSpan({ cls: 'masonry-count' });
      this.buildToolbar(headerEl);
    } else {
      this.countEl = null;
    }

    this.resultsEl = this.rootEl.createDiv({ cls: 'masonry-results' });
    this.sentinelEl = this.rootEl.createEl('button', {
      cls: 'masonry-load-more',
      text: 'Load more notes',
      attr: { type: 'button' },
    });

    this.registerDomEvent(this.rootEl, 'click', (event) => {
      this.handleClick(event);
    });
    this.registerDomEvent(this.rootEl, 'auxclick', (event) => {
      this.handleAuxClick(event);
    });
    this.registerDomEvent(this.rootEl, 'keydown', (event) => {
      this.handleKeydown(event);
    });
    this.registerDomEvent(this.rootEl, 'mouseover', (event) => {
      this.handleHover(event);
    });
    this.registerDomEvent(this.sentinelEl, 'click', () => {
      this.appendNextBatch();
    });
    this.initializeObservers();
  }

  override onload(): void {
    this.initializeObservers();
    this.register(this.refreshSignal.subscribe(() => this.renderFromStart(true)));
  }

  private initializeObservers(): void {
    if (this.previewObserver || this.sentinelObserver) return;
    this.scrollRoot =
      this.rootEl.closest<HTMLElement>('.bases-view') ??
      this.rootEl.closest<HTMLElement>('.masonry-view-content');

    this.previewObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.previewObserver?.unobserve(entry.target);
          void this.hydrateCard(entry.target as HTMLElement);
        }
      },
      { root: this.scrollRoot, rootMargin: '320px 0px' },
    );

    this.sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.appendNextBatch();
      },
      { root: this.scrollRoot, rootMargin: '600px 0px' },
    );
    this.sentinelObserver.observe(this.sentinelEl);
    this.visibilityObserver = new ResizeObserver(() => {
      this.queueVisibleHydration();
    });
    this.visibilityObserver.observe(this.rootEl);
    if (this.scrollRoot) {
      this.registerDomEvent(this.scrollRoot, 'scroll', () => {
        this.queueVisibleHydration();
      });
    }
    this.registerDomEvent(window, 'resize', () => {
      this.queueVisibleHydration();
    });
    this.register(() => this.previewObserver?.disconnect());
    this.register(() => this.sentinelObserver?.disconnect());
    this.register(() => this.visibilityObserver?.disconnect());
  }

  override onunload(): void {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.hydrationFrame !== null) {
      window.cancelAnimationFrame(this.hydrationFrame);
    }
    this.rootEl.remove();
  }

  setItems(items: GalleryItem[]): void {
    this.allItems = items;
    this.itemByPath = new Map(items.map((item) => [item.path, item]));
    this.populateFilterOptions();
    // A data refresh (vault edit, sync, Base re-query) must not yank the
    // reader back to the top — preserve scroll and focus across the re-render.
    this.renderFromStart(true);
  }

  setDisplayOptions(options: GalleryDisplayOptions, render = true): void {
    this.displayOptions = options;
    this.applyPresentation(options.presentation);
    if (render) this.renderFromStart();
  }

  private buildToolbar(headerEl: HTMLElement): void {
    const toolbarEl = headerEl.createDiv({
      cls: 'masonry-toolbar',
      attr: { role: 'toolbar', 'aria-label': 'Gallery controls' },
    });

    const searchWrapEl = toolbarEl.createDiv({ cls: 'masonry-search' });
    const searchIconEl = searchWrapEl.createSpan({
      cls: 'masonry-search-icon',
      attr: { 'aria-hidden': 'true' },
    });
    setIcon(searchIconEl, 'search');
    this.searchEl = searchWrapEl.createEl('input', {
      cls: 'masonry-search-input',
      type: 'search',
      placeholder: 'Search notes…',
      attr: { 'aria-label': 'Search notes' },
    });
    this.registerDomEvent(this.searchEl, 'input', () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        this.filters.query = this.searchEl?.value ?? '';
        this.renderFromStart();
      }, 120);
    });

    if (this.mode === 'all-docs') {
      this.folderSelect = this.createSelect(toolbarEl, 'Folder', 'folder', [
        { value: '', label: 'All folders' },
      ]);
      this.tagSelect = this.createSelect(toolbarEl, 'Tag', 'tag', [
        { value: '', label: 'All tags' },
      ]);
      const sortEl = toolbarEl.createEl('select', {
        cls: 'dropdown masonry-select masonry-sort',
        attr: { 'aria-label': 'Sort notes' },
      });
      const sortOptions: Array<{ value: GallerySort; label: string }> = [
        { value: 'modified-desc', label: 'Recently modified' },
        { value: 'modified-asc', label: 'Least recently modified' },
        { value: 'created-desc', label: 'Recently created' },
        { value: 'created-asc', label: 'Least recently created' },
        { value: 'title-asc', label: 'Title A–Z' },
        { value: 'title-desc', label: 'Title Z–A' },
      ];
      for (const option of sortOptions) {
        sortEl.createEl('option', { value: option.value, text: option.label });
      }
      sortEl.value = this.sort;
      this.sortSelect = sortEl;
      this.registerDomEvent(sortEl, 'change', () => {
        this.sort = sortEl.value as GallerySort;
        this.renderFromStart();
        void this.onSortChange?.(this.sort);
      });
    }

    const densityEl = toolbarEl.createDiv({
      cls: 'masonry-density',
      attr: { role: 'group', 'aria-label': 'Card presentation' },
    });
    const densityIcons = ['grip', 'layout-grid', 'panels-top-left'];
    const labels = ['Compact', 'Editorial', 'Visual'];
    PRESENTATION_ORDER.forEach((presentation, index) => {
      const buttonEl = densityEl.createEl('button', {
        cls: 'clickable-icon masonry-density-button',
        attr: {
          type: 'button',
          title: labels[index] ?? 'Presentation',
          'aria-label': labels[index] ?? 'Presentation',
          'aria-pressed': String(
            this.displayOptions.presentation === presentation,
          ),
        },
      });
      setIcon(buttonEl, densityIcons[index] ?? 'layout-grid');
      if (!buttonEl.querySelector('svg')) setIcon(buttonEl, 'layout-grid');
      this.registerDomEvent(buttonEl, 'click', () => {
        void this.setPresentation(presentation, true);
      });
      this.presentationButtons.set(presentation, buttonEl);
    });

    this.presentationSelect = toolbarEl.createEl('select', {
      cls: 'dropdown masonry-presentation-select',
      attr: { 'aria-label': 'View' },
    });
    this.presentationSelect.createEl('option', {
      value: 'compact',
      text: 'View: Compact',
    });
    this.presentationSelect.createEl('option', {
      value: 'editorial',
      text: 'View: Editorial',
    });
    this.presentationSelect.createEl('option', {
      value: 'visual',
      text: 'View: Visual',
    });
    this.presentationSelect.value = this.displayOptions.presentation;
    this.registerDomEvent(this.presentationSelect, 'change', () => {
      void this.setPresentation(
        this.presentationSelect?.value as GalleryPresentation,
        true,
      );
    });
  }

  private applyPresentation(presentation: GalleryPresentation): void {
    const definition = PRESENTATIONS[presentation];
    this.rootEl.dataset.presentation = presentation;
    this.rootEl.style.setProperty(
      '--masonry-card-width',
      `${definition.cardWidth}px`,
    );
    this.rootEl.style.setProperty(
      '--masonry-excerpt-lines',
      String(definition.excerptLines),
    );
    for (const [value, button] of this.presentationButtons) {
      button.setAttribute('aria-pressed', String(value === presentation));
    }
    if (this.presentationSelect) this.presentationSelect.value = presentation;
  }

  private async setPresentation(
    presentation: GalleryPresentation,
    persist: boolean,
  ): Promise<void> {
    if (!PRESENTATION_ORDER.includes(presentation)) return;
    this.displayOptions.presentation = presentation;
    this.applyPresentation(presentation);
    this.renderFromStart();
    if (persist) await this.onPresentationChange?.(presentation);
  }

  private createSelect(
    toolbarEl: HTMLElement,
    ariaLabel: string,
    kind: 'folder' | 'tag',
    options: Array<{ value: string; label: string }>,
  ): HTMLSelectElement {
    const selectEl = toolbarEl.createEl('select', {
      cls: `dropdown masonry-select masonry-${kind}`,
      attr: { 'aria-label': ariaLabel },
    });
    for (const option of options) {
      selectEl.createEl('option', { value: option.value, text: option.label });
    }
    this.registerDomEvent(selectEl, 'change', () => {
      this.filters[kind] = selectEl.value;
      this.renderFromStart();
    });
    return selectEl;
  }

  private populateFilterOptions(): void {
    if (this.mode !== 'all-docs') return;

    const folderSelect = this.rootEl.querySelector<HTMLSelectElement>(
      '.masonry-folder',
    );
    const tagSelect = this.rootEl.querySelector<HTMLSelectElement>(
      '.masonry-tag',
    );
    if (!folderSelect || !tagSelect) return;

    const currentFolder = folderSelect.value;
    const currentTag = tagSelect.value;
    const folders = [...new Set(this.allItems.map((item) => item.folder))]
      .sort((left, right) => left.localeCompare(right));
    const tagCounts = new Map<string, number>();
    for (const item of this.allItems) {
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const tags = [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 120);

    folderSelect.empty();
    folderSelect.createEl('option', { value: '', text: 'All folders' });
    if (folders.includes('')) {
      folderSelect.createEl('option', {
        value: ROOT_FOLDER_FILTER,
        text: 'Vault root',
      });
    }
    for (const folder of folders.filter(Boolean)) {
      folderSelect.createEl('option', { value: folder, text: folder });
    }
    folderSelect.value = currentFolder;
    if (folderSelect.value !== currentFolder) this.filters.folder = '';

    tagSelect.empty();
    tagSelect.createEl('option', { value: '', text: 'All tags' });
    for (const [tag, count] of tags) {
      tagSelect.createEl('option', {
        value: tag,
        text: `#${tag} · ${count}`,
      });
    }
    tagSelect.value = currentTag;
    if (tagSelect.value !== currentTag) this.filters.tag = '';
  }

  private renderFromStart(preserveScroll = false): void {
    const renderContext = preserveScroll ? this.captureRenderContext() : null;
    this.renderEpoch += 1;
    const matching = this.allItems.filter((item) =>
      matchesGalleryItem(item, this.filters),
    );
    this.filteredItems =
      this.mode === 'all-docs'
        ? sortGalleryItems(matching, this.sort)
        : matching;
    this.visibleCount = 0;
    for (const previewHost of Array.from(
      this.resultsEl.querySelectorAll('.masonry-preview-host'),
    )) {
      this.previewObserver?.unobserve(previewHost);
    }
    this.resultsEl.empty();
    this.groupGrids.clear();
    this.countEl?.setText(
      `${this.filteredItems.length.toLocaleString('en-US')} notes`,
    );

    if (this.filteredItems.length === 0) {
      this.renderEmptyState();
      this.updateLoadMoreState();
      if (renderContext) this.restoreRenderContext(renderContext);
      return;
    }

    this.appendNextBatch(true);
    if (renderContext) this.restoreRenderContext(renderContext);
  }

  private captureRenderContext(): {
    scrollEl: HTMLElement | null;
    scrollTop: number;
    focusedPath: string | null;
  } {
    const scrollEl = this.scrollRoot;
    const activeElement = document.activeElement;
    const focusedCard =
      activeElement instanceof Element && this.rootEl.contains(activeElement)
        ? activeElement.closest<HTMLElement>('.masonry-card')
        : null;
    return {
      scrollEl,
      scrollTop: scrollEl?.scrollTop ?? 0,
      focusedPath: focusedCard?.dataset.path ?? null,
    };
  }

  private restoreRenderContext(context: {
    scrollEl: HTMLElement | null;
    scrollTop: number;
    focusedPath: string | null;
  }): void {
    if (!context.scrollEl) return;
    window.requestAnimationFrame(() => {
      if (!this.rootEl.isConnected || !context.scrollEl?.isConnected) return;
      context.scrollEl.scrollTop = context.scrollTop;
      if (!context.focusedPath) return;
      const focusedCard = Array.from(
        this.rootEl.querySelectorAll<HTMLElement>('.masonry-card'),
      ).find((card) => card.dataset.path === context.focusedPath);
      focusedCard?.focus({ preventScroll: true });
    });
  }

  private appendNextBatch(initial = false): void {
    if (this.visibleCount >= this.filteredItems.length) {
      this.updateLoadMoreState();
      return;
    }

    const size = initial
      ? this.settings.initialBatchSize
      : this.settings.batchSize;
    const nextItems = this.filteredItems.slice(
      this.visibleCount,
      this.visibleCount + size,
    );
    this.visibleCount += nextItems.length;

    for (const item of nextItems) this.renderCard(item);
    this.updateLoadMoreState();
    this.queueVisibleHydration();
  }

  private queueVisibleHydration(): void {
    if (this.hydrationFrame !== null) return;
    this.hydrationFrame = window.requestAnimationFrame(() => {
      this.hydrationFrame = null;
      this.hydrateVisibleCards();
    });
  }

  private hydrateVisibleCards(): void {
    if (!this.rootEl.isConnected) return;
    if (!isRenderableViewport(this.rootEl.getBoundingClientRect())) return;
    const rootRect = this.scrollRoot?.getBoundingClientRect();
    if (rootRect && !isRenderableViewport(rootRect)) return;
    const viewportTop = (rootRect?.top ?? 0) - 320;
    const viewportBottom =
      (rootRect?.bottom ?? window.innerHeight) + 320;

    for (const previewHost of Array.from(
      this.rootEl.querySelectorAll<HTMLElement>(
        '.masonry-preview-host.is-loading',
      ),
    )) {
      const rect = previewHost.getBoundingClientRect();
      if (rect.bottom < viewportTop || rect.top > viewportBottom) continue;
      this.previewObserver?.unobserve(previewHost);
      void this.hydrateCard(previewHost);
    }

    const sentinelRect = this.sentinelEl.getBoundingClientRect();
    if (
      sentinelRect.top <= viewportBottom + 280 &&
      this.visibleCount < this.filteredItems.length
    ) {
      this.appendNextBatch();
    }
  }

  private renderCard(item: GalleryItem): void {
    const gridEl = this.getGroupGrid(item.group ?? '');
    const cardEl = gridEl.createEl('article', {
      cls: `masonry-card masonry-card--${this.displayOptions.presentation}`,
      attr: {
        'data-path': item.path,
        role: 'link',
        tabindex: '0',
        'aria-label': `Open ${item.title}`,
      },
    });
    createCardActions({
      app: this.app,
      owner: this,
      containerEl: cardEl,
      file: item.file,
      title: item.title,
      openInNewTab: () => this.openPath(item.path, true),
    });

    const bodyEl = cardEl.createDiv({ cls: 'masonry-card-body' });
    const headingEl = bodyEl.createEl('h3', {
      cls: 'masonry-card-title',
      text: item.title,
    });
    headingEl.setAttribute('title', item.title);

    const metaEl = bodyEl.createDiv({ cls: 'masonry-card-meta' });
    if (this.displayOptions.showFolder && item.folder) {
      metaEl.createSpan({ cls: 'masonry-folder-label', text: item.folder });
    }
    metaEl.createSpan({
      cls: 'masonry-date',
      text: formatRelativeDate(item.mtime),
    });

    if (item.properties?.length) {
      const propertiesEl = bodyEl.createDiv({
        cls: 'masonry-properties',
      });
      for (const property of item.properties.slice(0, 4)) {
        const rowEl = propertiesEl.createDiv({
          cls: 'masonry-property',
        });
        rowEl.createSpan({
          cls: 'masonry-property-label',
          text: property.label,
        });
        rowEl.createSpan({
          cls: 'masonry-property-value',
          text: property.value,
        });
      }
    }

    const previewHostEl = cardEl.createDiv({
      cls: 'masonry-preview-host is-loading',
      attr: {
        'data-preview-path': item.path,
        'data-render-epoch': String(this.renderEpoch),
      },
    });
    previewHostEl.createDiv({ cls: 'masonry-preview-skeleton' });

    if (this.displayOptions.showTags && item.tags.length > 0) {
      const tagsEl = bodyEl.createDiv({ cls: 'masonry-tags' });
      for (const tag of item.tags.slice(0, 4)) {
        tagsEl.createSpan({
          cls: 'masonry-tag-chip',
          text: `#${tag}`,
          attr: { 'data-tag-kind': classifyTag(tag) },
        });
      }
    }

    this.previewObserver?.observe(previewHostEl);
  }

  private getGroupGrid(group: string): HTMLElement {
    const existing = this.groupGrids.get(group);
    if (existing) return existing;

    const sectionEl = this.resultsEl.createEl('section', {
      cls: 'masonry-group',
    });
    if (group) {
      sectionEl.createEl('h3', {
        cls: 'masonry-group-title',
        text: group,
      });
    }
    const gridEl = sectionEl.createDiv({ cls: 'masonry-grid' });
    this.groupGrids.set(group, gridEl);
    return gridEl;
  }

  private async hydrateCard(previewHostEl: HTMLElement): Promise<void> {
    const path = previewHostEl.dataset.previewPath;
    const expectedEpoch = previewHostEl.dataset.renderEpoch;
    const item = path ? this.itemByPath.get(path) : undefined;
    if (!item || !previewHostEl.isConnected) return;

    try {
      const preview = await this.previewService.getPreview(
        item,
        this.displayOptions.previewCharacters,
      );
      if (
        !previewHostEl.isConnected ||
        previewHostEl.dataset.renderEpoch !== expectedEpoch ||
        expectedEpoch !== String(this.renderEpoch)
      ) {
        return;
      }

      previewHostEl.empty();
      previewHostEl.removeClass('is-loading');
      if (preview.imageUrls.length > 0) {
        this.renderPreviewImage(previewHostEl, preview.imageUrls, preview.excerpt);
      }
      if (preview.excerpt) {
        previewHostEl.createDiv({
          cls: 'masonry-card-preview',
          text: preview.excerpt,
        });
      }
      if (preview.imageUrls.length === 0 && preview.empty) {
        previewHostEl.createDiv({
          cls: 'masonry-card-empty-preview',
          text: 'Empty note',
        });
      }
    } catch (error) {
      if (!previewHostEl.isConnected) return;
      previewHostEl.empty();
      previewHostEl.removeClass('is-loading');
      const errorEl = previewHostEl.createDiv({
        cls: 'masonry-card-empty-preview',
        text: 'Preview unavailable',
      });
      const retryButton = errorEl.createEl('button', {
        cls: 'masonry-retry-button',
        text: 'Retry',
        attr: { type: 'button' },
      });
      this.registerDomEvent(retryButton, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        previewHostEl.empty();
        previewHostEl.addClass('is-loading');
        previewHostEl.createDiv({ cls: 'masonry-preview-skeleton' });
        void this.hydrateCard(previewHostEl);
      });
      console.warn(`Masonry could not render ${item.path}`, error);
    }
  }

  private renderPreviewImage(
    previewHostEl: HTMLElement,
    candidates: readonly string[],
    excerpt: string,
    failedCandidate?: string,
  ): void {
    const imageUrl = nextImageCandidate(candidates, failedCandidate);
    if (!imageUrl) {
      if (!excerpt && previewHostEl.isConnected) {
        previewHostEl.createDiv({
          cls: 'masonry-card-empty-preview',
          text: 'Image preview unavailable',
        });
      }
      return;
    }

    const imageEl = previewHostEl.createEl('img', {
      cls: 'masonry-card-image',
      attr: { alt: '', loading: 'lazy', decoding: 'async' },
    });
    imageEl.addEventListener(
      'error',
      () => {
        imageEl.remove();
        if (!previewHostEl.isConnected) return;
        this.renderPreviewImage(previewHostEl, candidates, excerpt, imageUrl);
      },
      { once: true },
    );
    imageEl.src = imageUrl;
  }

  private renderEmptyState(): void {
    const emptyEl = this.resultsEl.createDiv({ cls: 'masonry-empty' });
    const iconEl = emptyEl.createSpan({
      cls: 'masonry-empty-icon',
      attr: { 'aria-hidden': 'true' },
    });
    setIcon(iconEl, 'search-x');
    emptyEl.createEl('h3', { text: 'No notes found' });
    emptyEl.createEl('p', {
      text: 'Try removing a filter or using a shorter search term.',
    });
    if (this.mode === 'all-docs' && hasActiveFilters(this.filters)) {
      const resetButton = emptyEl.createEl('button', {
        cls: 'masonry-reset-button',
        text: 'Clear filters',
        attr: { type: 'button' },
      });
      this.registerDomEvent(resetButton, 'click', () => this.resetFilters());
    }
  }

  private resetFilters(): void {
    this.filters = { query: '', folder: '', tag: '' };
    if (this.searchEl) this.searchEl.value = '';
    if (this.folderSelect) this.folderSelect.value = '';
    if (this.tagSelect) this.tagSelect.value = '';
    this.renderFromStart();
  }

  private updateLoadMoreState(): void {
    const remaining = this.filteredItems.length - this.visibleCount;
    this.sentinelEl.toggle(remaining > 0);
    if (remaining <= 0) return;
    const nextCount = Math.min(this.settings.batchSize, remaining);
    this.sentinelEl.setText(`Load ${nextCount} more notes`);
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const linkEl = target.closest<HTMLAnchorElement>('a.internal-link');
    if (linkEl) {
      event.preventDefault();
      const href = linkEl.dataset.href ?? linkEl.getAttribute('href');
      if (href) {
        const sourcePath =
          linkEl.closest<HTMLElement>('.masonry-card')?.dataset.path ?? '';
        void this.app.workspace.openLinkText(
          href,
          sourcePath,
          Keymap.isModEvent(event),
        );
      }
      return;
    }

    if (target.closest('button, input, select, option')) return;
    const cardEl = target.closest<HTMLElement>('.masonry-card');
    if (cardEl?.dataset.path) {
      void this.openPath(
        cardEl.dataset.path,
        Keymap.isModEvent(event) !== false,
      );
    }
  }

  private handleAuxClick(event: MouseEvent): void {
    if (event.button !== 1) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cardEl = target.closest<HTMLElement>('.masonry-card');
    if (!cardEl?.dataset.path) return;
    event.preventDefault();
    void this.openPath(cardEl.dataset.path, true);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cardEl = target.closest<HTMLElement>('.masonry-card');
    if (!cardEl?.dataset.path || target !== cardEl) return;
    event.preventDefault();
    void this.openPath(
      cardEl.dataset.path,
      Keymap.isModEvent(event) !== false,
    );
  }

  private handleHover(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cardEl = target.closest<HTMLElement>('.masonry-card');
    if (!cardEl?.dataset.path) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && cardEl.contains(relatedTarget)) return;

    this.app.workspace.trigger('hover-link', {
      event,
      source: 'masonry',
      hoverParent: this,
      targetEl: cardEl,
      linktext: cardEl.dataset.path,
      sourcePath: '',
    });
  }

  private async openPath(path: string, newLeaf: boolean): Promise<void> {
    await this.app.workspace.openLinkText(path, '', newLeaf);
  }
}
