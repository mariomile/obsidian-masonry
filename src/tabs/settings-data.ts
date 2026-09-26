import { resolvePresentation } from '../presentation.ts';
import { resolveSort } from './grid-filter.ts';
import type { TabsSettings } from './types.ts';

export const DEFAULT_TABS_SETTINGS: TabsSettings = {
  autoHide: false,
  scrollTabBar: true,
  showTabPreview: true,
  showTags: true,
  previewCharacters: 240,
  presentation: 'editorial',
  tabBarButton: true,
  sidebarAddButton: true,
  sort: 'tab-order',
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTabsSettings(raw: unknown): TabsSettings {
  const data = isRecord(raw) ? raw : {};
  return {
    autoHide: bool(data.autoHide, DEFAULT_TABS_SETTINGS.autoHide),
    scrollTabBar: bool(data.scrollTabBar, DEFAULT_TABS_SETTINGS.scrollTabBar),
    showTabPreview: bool(data.showTabPreview, DEFAULT_TABS_SETTINGS.showTabPreview),
    showTags: bool(data.showTags, DEFAULT_TABS_SETTINGS.showTags),
    previewCharacters: clampInt(
      data.previewCharacters,
      DEFAULT_TABS_SETTINGS.previewCharacters,
      40,
      2000,
    ),
    presentation: resolvePresentation(
      data.presentation,
      DEFAULT_TABS_SETTINGS.presentation,
    ),
    tabBarButton: bool(data.tabBarButton, DEFAULT_TABS_SETTINGS.tabBarButton),
    sidebarAddButton: bool(
      data.sidebarAddButton,
      DEFAULT_TABS_SETTINGS.sidebarAddButton,
    ),
    sort: resolveSort(data.sort, DEFAULT_TABS_SETTINGS.sort),
  };
}

/**
 * Whether Masonry's own saved data already carries the tabs section. When it
 * does not, this is the first load since TabX was merged in, and the old TabX
 * settings are imported once.
 */
export function hasTabsSettings(raw: unknown): boolean {
  return isRecord(raw) && isRecord(raw.tabs);
}

/** Where the retired TabX plugin kept its settings. */
export function legacyTabxDataPath(configDir: string): string {
  return `${configDir}/plugins/tabx/data.json`;
}

/** The slice of `app.vault.adapter` the import needs. */
export interface LegacyDataReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

/**
 * Read the retired TabX plugin's settings, if any. Missing file, unreadable
 * file or invalid JSON all yield the defaults: the import is a courtesy, and a
 * broken leftover file must never stop Masonry from loading.
 */
export async function readLegacyTabxSettings(
  adapter: LegacyDataReader,
  configDir: string,
): Promise<TabsSettings> {
  const path = legacyTabxDataPath(configDir);
  try {
    if (!(await adapter.exists(path))) return parseTabsSettings(undefined);
    return parseTabsSettings(JSON.parse(await adapter.read(path)));
  } catch (error) {
    console.warn('Masonry: could not import the old TabX settings', error);
    return parseTabsSettings(undefined);
  }
}
