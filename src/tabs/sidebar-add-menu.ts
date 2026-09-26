/**
 * The model behind the sidebar "+" menu: which views it offers, in which
 * order, under which name. Pure — it takes plain lists of view types and
 * command ids and returns entries, so the whole policy is testable without a
 * workspace.
 *
 * Two tiers, mirroring what the "+" is for:
 *
 * - **New** — Browser and Terminal. Always offered when installed, even if one
 *   is already open, because a second browser pane is a normal thing to want.
 * - **Open view** — everything else that can live in a sidebar and is not
 *   already there. Views already mounted are omitted rather than greyed out:
 *   their icon is right next to the "+", so listing them would be a duplicate
 *   of what the user is looking at.
 *
 * The exclusion of file-backed views (`markdown`, `pdf`, `canvas`…) is derived
 * from Obsidian's own extension→type registry rather than hardcoded, so a
 * plugin that registers a new file type drops out of this menu on its own.
 */

export interface MenuEntry {
  type: string;
  label: string;
  icon: string;
  /** When set, activate by running this command instead of setting a view
   *  state — for views that need state the plugin alone knows how to build. */
  commandId?: string;
}

export interface SidebarMenuInput {
  /** Every view type in Obsidian's registry. */
  registered: string[];
  /** View types bound to a file extension (`app.viewRegistry.typeByExtension`). */
  fileBacked: string[];
  /** View types currently mounted in the left or right sidebar. */
  openInSidebars: string[];
  /** Ids of every registered command, for the delegating entries. */
  commands: string[];
}

export interface SidebarMenu {
  featured: MenuEntry[];
  views: MenuEntry[];
}

/** The "New" tier. `commandId` entries are skipped when that command is
 *  missing, so a partially-configured plugin never yields a dead menu item. */
const FEATURED: MenuEntry[] = [
  { type: 'webviewer', label: 'Browser', icon: 'globe' },
  {
    type: 'terminal:terminal',
    label: 'Terminal',
    icon: 'terminal',
    // The Terminal plugin builds its view state from a working directory and
    // a shell profile it resolves from its own settings. Opening the view type
    // directly with an empty state was tried and yields a view titled
    // "Invalid" — so this entry asks the plugin to open a terminal instead,
    // which means the terminal lands wherever that plugin puts it (the main
    // area) rather than in the sidebar. A wrong-but-working terminal beats a
    // correctly-placed broken one, and reconstructing the profile here would
    // duplicate logic that belongs to the Terminal plugin.
    commandId: 'terminal:open-terminal.integrated.root',
  },
];

/** Names Obsidian uses in its own UI, where the derived one would be wrong or
 *  merely worse. Everything absent here is prettified from its type id, which
 *  is why this map stays short instead of growing with every plugin. */
const LABELS: Record<string, string> = {
  backlink: 'Backlinks',
  'file-explorer': 'Files',
  graph: 'Graph',
  localgraph: 'Local graph',
  'outgoing-link': 'Outgoing links',
  search: 'Search',
  tag: 'Tags',
  // Our own views: the prettifier would spell the plugin "Tabx".
  'tabx-grid': 'Tab grid',
  'tabx-rail': 'Tab rail',
  webviewer: 'Browser',
  'webviewer-history': 'Browser history',
};

const ICONS: Record<string, string> = {
  'all-properties': 'archive',
  backlink: 'link',
  bases: 'layout-list',
  'file-explorer': 'folder',
  'file-properties': 'info',
  graph: 'git-fork',
  localgraph: 'git-fork',
  outline: 'list',
  'outgoing-link': 'link',
  search: 'search',
  'style-settings': 'sliders-horizontal',
  sync: 'refresh-cw',
  tag: 'tag',
  'tabx-grid': 'layout-grid',
  'tabx-rail': 'hi-square-stack',
  webviewer: 'globe',
  'webviewer-history': 'history',
};

const FALLBACK_ICON = 'panel-right';

/**
 * `exo-chats` → "Exo chats", `terminal:documentation` → "Terminal
 * documentation", `terminal:terminal` → "Terminal". The repeated-word collapse
 * matters because the `plugin:view` convention makes `foo:foo` the normal
 * shape for a plugin's single view.
 */
export function prettifyViewType(type: string): string {
  const words = type
    .split(/[:\-_]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const collapsed = words.filter((w, i) => w !== words[i - 1]);
  const text = collapsed.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function labelFor(type: string): string {
  return LABELS[type] ?? prettifyViewType(type);
}

export function iconFor(type: string): string {
  return ICONS[type] ?? FALLBACK_ICON;
}

export function buildSidebarMenu(input: SidebarMenuInput): SidebarMenu {
  const registered = new Set(input.registered);
  const commands = new Set(input.commands);
  const featured = FEATURED.filter(
    (entry) =>
      registered.has(entry.type) && (!entry.commandId || commands.has(entry.commandId)),
  );

  const excluded = new Set([
    ...input.fileBacked,
    ...input.openInSidebars,
    ...FEATURED.map((e) => e.type),
  ]);
  const views = input.registered
    .filter((type) => !excluded.has(type))
    .map((type) => ({ type, label: labelFor(type), icon: iconFor(type) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  return { featured, views };
}
