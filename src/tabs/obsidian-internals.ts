import type { App, WorkspaceLeaf } from 'obsidian';

/**
 * Typed accessors for Obsidian internals that are not part of the public
 * `obsidian` typings. Keeping every unsafe cast in this one file lets the
 * rest of the codebase stay `no-explicit-any` clean.
 */

interface LeafInternals {
  id?: string;
}

const mintedIds = new WeakMap<WorkspaceLeaf, string>();
let counter = 0;

/** Stable per-leaf identity for DOM reconciliation. */
export function leafId(leaf: WorkspaceLeaf): string {
  const native = (leaf as unknown as LeafInternals).id;
  if (typeof native === 'string' && native.length > 0) return native;
  let minted = mintedIds.get(leaf);
  if (!minted) {
    counter += 1;
    minted = `tabx-${counter}`;
    mintedIds.set(leaf, minted);
  }
  return minted;
}

interface AppInternals {
  viewRegistry?: {
    /** Every registered view type → its factory. */
    viewByType?: Record<string, unknown>;
    /** File extension → the view type that opens it. */
    typeByExtension?: Record<string, string>;
  };
  commands?: {
    commands?: Record<string, unknown>;
    executeCommandById?: (id: string) => boolean;
  };
}

const internals = (app: App): AppInternals => app as unknown as AppInternals;

/** Every view type Obsidian knows how to open. */
export function registeredViewTypes(app: App): string[] {
  return Object.keys(internals(app).viewRegistry?.viewByType ?? {});
}

/** View types bound to a file extension — i.e. the ones that only make sense
 *  with a file behind them, which is what disqualifies them from a "add a
 *  pane" menu. Derived, so a newly installed file type excludes itself. */
export function fileBackedViewTypes(app: App): string[] {
  return [...new Set(Object.values(internals(app).viewRegistry?.typeByExtension ?? {}))];
}

export function commandIds(app: App): string[] {
  return Object.keys(internals(app).commands?.commands ?? {});
}

export function executeCommand(app: App, id: string): void {
  internals(app).commands?.executeCommandById?.(id);
}
