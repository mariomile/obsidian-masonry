import { classifyTag } from './presentation.ts';
import type { GalleryDisplayOptions, GalleryItem } from './types.ts';
import { formatRelativeDate } from './utils.ts';

/** One table column: a fixed field, or a Bases property by its id. */
export type TableColumn =
  | { kind: 'title' | 'folder' | 'tags' | 'modified'; label: string }
  | { kind: 'property'; id: string; label: string };

export interface RenderedRow {
  rowEl: HTMLElement;
  actionsHostEl: HTMLElement;
}

/** Track widths: the title leads, the date stays narrow. */
const TRACKS: Record<TableColumn['kind'], { min: number; fr: number }> = {
  title: { min: 220, fr: 2.4 },
  folder: { min: 140, fr: 1 },
  property: { min: 120, fr: 1 },
  tags: { min: 150, fr: 1.2 },
  modified: { min: 96, fr: 0.6 },
};

/** Title, folder, every property in order of first appearance, tags, date. */
export function tableColumns(
  items: readonly GalleryItem[],
  display: Pick<GalleryDisplayOptions, 'showFolder' | 'showTags'>,
): TableColumn[] {
  const columns: TableColumn[] = [{ kind: 'title', label: 'Title' }];
  if (display.showFolder) columns.push({ kind: 'folder', label: 'Folder' });
  const seen = new Set<string>();
  for (const item of items) {
    for (const { id, label } of item.properties ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      columns.push({ kind: 'property', id, label });
    }
  }
  if (display.showTags) columns.push({ kind: 'tags', label: 'Tags' });
  columns.push({ kind: 'modified', label: 'Modified' });
  return columns;
}

/** Same tracks for the header and every row, so the cells line up without
 *  measuring. The minimum width lets a wide table scroll instead of crush. */
export function applyTableTracks(
  gridEl: HTMLElement,
  columns: readonly TableColumn[],
): void {
  const tracks = columns.map(({ kind }) => TRACKS[kind]);
  gridEl.style.setProperty(
    '--masonry-table-tracks',
    tracks.map(({ min, fr }) => `minmax(${min}px, ${fr}fr)`).join(' '),
  );
  gridEl.style.setProperty(
    '--masonry-table-min-width',
    `${tracks.reduce((sum, { min }) => sum + min, 0)}px`,
  );
}

export function renderTableHeader(
  gridEl: HTMLElement,
  columns: readonly TableColumn[],
): HTMLElement {
  const headerEl = createDiv({
    cls: 'masonry-table-header',
    attr: { role: 'row' },
  });
  for (const column of columns) {
    headerEl.createDiv({
      cls: `masonry-cell masonry-cell--${column.kind}`,
      text: column.label,
      attr: { role: 'columnheader' },
    });
  }
  gridEl.prepend(headerEl);
  return headerEl;
}

/** The shell every row shares with a card: the gallery's click, keyboard and
 *  context-menu handlers key on `.masonry-card[data-path]`. A list row is a
 *  link; a table row is a row, so a screen reader reads its cells. */
function createRowShell(item: GalleryItem, kind: 'list' | 'table'): HTMLElement {
  return createEl('article', {
    cls: `masonry-card masonry-row masonry-row--${kind}`,
    attr:
      kind === 'list'
        ? {
            'data-path': item.path,
            role: 'link',
            tabindex: '0',
            'aria-label': `Open ${item.title}`,
          }
        : { 'data-path': item.path, role: 'row', tabindex: '0' },
  });
}

function renderTags(parentEl: HTMLElement, tags: readonly string[], limit: number): void {
  const tagsEl = parentEl.createDiv({ cls: 'masonry-tags masonry-row-tags' });
  for (const tag of tags.slice(0, limit)) {
    tagsEl.createSpan({
      cls: 'masonry-tag-chip',
      text: `#${tag}`,
      attr: { 'data-tag-kind': classifyTag(tag) },
    });
  }
}

export function renderListRow(
  item: GalleryItem,
  display: GalleryDisplayOptions,
): RenderedRow {
  const rowEl = createRowShell(item, 'list');
  const mainEl = rowEl.createDiv({ cls: 'masonry-row-main' });
  mainEl.createDiv({
    cls: 'masonry-row-title',
    text: item.title,
    attr: { title: item.title },
  });
  if (display.showFolder && item.folder) {
    mainEl.createDiv({ cls: 'masonry-row-folder', text: item.folder });
  }
  if (display.showTags && item.tags.length > 0) renderTags(rowEl, item.tags, 3);
  rowEl.createSpan({
    cls: 'masonry-date masonry-row-date',
    text: formatRelativeDate(item.mtime),
  });
  return { rowEl, actionsHostEl: rowEl };
}

export function renderTableRow(
  item: GalleryItem,
  columns: readonly TableColumn[],
): RenderedRow {
  const rowEl = createRowShell(item, 'table');
  let actionsHostEl: HTMLElement | undefined;
  const values = new Map(item.properties?.map(({ id, value }) => [id, value]));
  for (const column of columns) {
    const cellEl = rowEl.createDiv({
      cls: `masonry-cell masonry-cell--${column.kind}`,
      attr: { role: column.kind === 'title' ? 'rowheader' : 'cell' },
    });
    switch (column.kind) {
      case 'title':
        actionsHostEl = cellEl;
        cellEl.setText(item.title);
        cellEl.setAttribute('title', item.title);
        break;
      case 'folder':
        cellEl.setText(item.folder);
        break;
      case 'property':
        cellEl.setText(values.get(column.id) ?? '');
        break;
      case 'tags':
        renderTags(cellEl, item.tags, 4);
        break;
      case 'modified':
        cellEl.addClass('masonry-date');
        cellEl.setText(formatRelativeDate(item.mtime));
        break;
    }
  }
  if (!actionsHostEl) throw new Error('Table rows require a title column');
  return { rowEl, actionsHostEl };
}
