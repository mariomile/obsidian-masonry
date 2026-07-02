import { resolvePresentation } from './presentation.ts';
import type { MasonrySettings } from './types.ts';
import { boundedNumber } from './utils.ts';

export const DEFAULT_SETTINGS: MasonrySettings = {
  presentation: 'editorial',
  previewCharacters: 700,
  showFolder: true,
  showTags: true,
  loadRemoteImages: false,
  initialBatchSize: 72,
  batchSize: 48,
};

export function parseSettings(data: unknown): MasonrySettings {
  if (!isRecord(data)) return { ...DEFAULT_SETTINGS };
  return {
    presentation: resolvePresentation(
      data.presentation,
      DEFAULT_SETTINGS.presentation,
    ),
    previewCharacters: boundedNumber(
      data.previewCharacters,
      DEFAULT_SETTINGS.previewCharacters,
      180,
      1_400,
    ),
    showFolder: booleanValue(data.showFolder, DEFAULT_SETTINGS.showFolder),
    showTags: booleanValue(data.showTags, DEFAULT_SETTINGS.showTags),
    loadRemoteImages: booleanValue(
      data.loadRemoteImages,
      DEFAULT_SETTINGS.loadRemoteImages,
    ),
    initialBatchSize: boundedNumber(
      data.initialBatchSize,
      DEFAULT_SETTINGS.initialBatchSize,
      1,
      240,
    ),
    batchSize: boundedNumber(
      data.batchSize,
      DEFAULT_SETTINGS.batchSize,
      1,
      120,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
