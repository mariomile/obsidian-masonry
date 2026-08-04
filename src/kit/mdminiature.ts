// ⚠️ VENDORED da marioverse-kit/mdminiature.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
// marioverse-kit · mdminiature — canonical source of truth.
//
// Renders a note's opening into a card as a genuine scaled-down document: real
// tables with their header row, real embedded images, real callouts with their
// coloured bar. The Craft card grid, in Obsidian.
//
// This is the FIRST kit module that imports `obsidian` — a deliberate exception.
// The pure half lives in `mdrender.ts` and stays node-testable; everything that
// needs the app (rendering, the vault, Platform) lives here.
//
// Consumers vendor a copy at `src/kit/mdminiature.ts` via `sync.sh`. Edit HERE.

import { Component, MarkdownRenderer, Platform, type App, type TFile } from 'obsidian';
import {
  DEFAULT_MINI_BUDGET,
  buildMiniatureCacheKey,
  clampMiniatureHeight,
  createRenderPrefix,
  type MiniRenderBudget,
} from './mdrender.ts';

export interface MiniatureServiceOptions {
  app: App;
  /** Concurrent MarkdownRenderer calls. Serialising is the win; 2 is plenty. */
  concurrency?: number;
  /** LRU entries holding a detached rendered subtree. */
  cacheEntries?: number;
  /** Live mounted miniatures before the oldest offscreen ones are evicted. */
  mountCeiling?: number;
  budget?: Partial<MiniRenderBudget>;
  /** Fired when the ceiling evicts a mount, so the caller can restore its
   *  skeleton and re-observe the host. */
  onEvict?: (hostEl: HTMLElement) => void;
}

export type MiniatureOutcome =
  | { status: 'rendered'; height: number; clipped: boolean }
  | { status: 'empty' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: unknown };

interface Job {
  hostEl: HTMLElement;
  file: TFile;
  token: string;
  resolve: (outcome: MiniatureOutcome) => void;
}

interface CacheEntry {
  inner: HTMLElement;
  height: number;
  clipped: boolean;
}

/** Attribute the caller stamps on a host; compared at every await boundary. */
const TOKEN_ATTR = 'miniToken';

/**
 * Queue + cache in front of MarkdownRenderer.
 *
 * Owned by the PLUGIN, not the view: `plugin.addChild(new MiniatureService(...))`.
 * That is what lets the cache survive closing and reopening the gallery, which
 * is the single biggest perceived-speed win in the feature.
 */
export class MiniatureService extends Component {
  private readonly app: App;
  private readonly budget: MiniRenderBudget;
  private readonly concurrency: number;
  private readonly cacheEntries: number;
  private readonly mountCeiling: number;
  private readonly onEvict?: (hostEl: HTMLElement) => void;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly queue: Job[] = [];
  private readonly pending = new Set<HTMLElement>();
  private readonly mounted = new Set<HTMLElement>();
  private readonly renderOwner = new Component();
  private inFlight = 0;
  private draining = false;
  private paused = false;

  constructor(options: MiniatureServiceOptions) {
    super();
    this.app = options.app;
    this.budget = { ...DEFAULT_MINI_BUDGET, ...options.budget };
    const tablet = Platform.isTablet;
    this.concurrency = options.concurrency ?? (tablet ? 1 : 2);
    this.cacheEntries = options.cacheEntries ?? 96;
    this.mountCeiling = options.mountCeiling ?? (tablet ? 24 : 48);
    this.onEvict = options.onEvict;
    this.addChild(this.renderOwner);
  }

  /**
   * Devices where a miniature carries more information than the text excerpt it
   * replaces. On a phone at 2-up the box is ~180px wide: the miniature is mush,
   * and dozens of live subtrees is the memory profile that gets Obsidian mobile
   * killed. Tablets are allowed, at reduced concurrency.
   */
  static isSupported(): boolean {
    return !Platform.isPhone;
  }

  override onload(): void {
    // Backstop, NOT rAF: a gallery in a background pane never gets animation
    // frames, so an rAF-gated drain leaves every card a skeleton until the pane
    // is looked at again. The queue drains on its own schedule; this only
    // catches a drain that was never kicked.
    this.registerInterval(window.setInterval(() => this.drain(), 1000));
  }

  override onunload(): void {
    for (const job of this.queue) job.resolve({ status: 'cancelled' });
    this.queue.length = 0;
    this.pending.clear();
    this.mounted.clear();
    this.cache.clear();
  }

  /** Queue a miniature for `file` into `hostEl`. Resolves once settled. */
  request(hostEl: HTMLElement, file: TFile, token: string): Promise<MiniatureOutcome> {
    hostEl.dataset[TOKEN_ATTR] = token;
    if (this.pending.has(hostEl)) this.cancel(hostEl);

    const cached = this.cache.get(buildMiniatureCacheKey(file.path, file.stat.mtime, this.budget));
    if (cached) {
      this.mount(hostEl, cached);
      return Promise.resolve({
        status: 'rendered',
        height: cached.height,
        clipped: cached.clipped,
      });
    }

    this.pending.add(hostEl);
    return new Promise<MiniatureOutcome>((resolve) => {
      this.queue.push({ hostEl, file, token, resolve });
      void this.drain();
    });
  }

  /** Drop a queued or in-flight request for `hostEl`. */
  cancel(hostEl: HTMLElement): void {
    this.pending.delete(hostEl);
    delete hostEl.dataset[TOKEN_ATTR];
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index]?.hostEl === hostEl) {
        this.queue[index]?.resolve({ status: 'cancelled' });
        this.queue.splice(index, 1);
      }
    }
  }

  /** Forget one path (on vault modify) or everything (on settings change). */
  invalidate(path?: string): void {
    if (path === undefined) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${path}::`)) this.cache.delete(key);
    }
  }

  /**
   * Sospende il drain durante lo scroll attivo.
   *
   * MarkdownRenderer è sincrono e pesante: misurato il 2026-08-04 su uno
   * scroll di stress, 11 long task per 714ms totali col peggiore a 103ms —
   * mentre la stessa griglia in modalità testuale ne produceva ZERO. Il lavoro
   * non è sbagliato, è il MOMENTO: renderizzare mentre l'utente scorre mette
   * i millisecondi esattamente dove si notano. In pausa la card resta
   * scheletro e si riempie appena lo scroll si ferma — è come si comporta
   * qualunque galleria che sembra veloce.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.drain();
  }

  private drain(): void {
    if (this.draining || this.paused) return;
    this.draining = true;
    try {
      while (this.inFlight < this.concurrency) {
        const job = this.queue.shift();
        if (!job) break;
        if (!job.hostEl.isConnected || job.hostEl.dataset[TOKEN_ATTR] !== job.token) {
          this.pending.delete(job.hostEl);
          job.resolve({ status: 'cancelled' });
          continue;
        }
        this.inFlight += 1;
        void this.run(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(job: Job): Promise<void> {
    try {
      const outcome = await this.render(job);
      job.resolve(outcome);
    } catch (error) {
      job.resolve({ status: 'failed', error });
    } finally {
      this.pending.delete(job.hostEl);
      this.inFlight -= 1;
      // Yield between jobs: a tight loop of renders is what janks the pane, far
      // more than the total work does.
      window.setTimeout(() => this.drain(), 0);
    }
  }

  private async render(job: Job): Promise<MiniatureOutcome> {
    const { hostEl, file, token } = job;
    const source = await this.app.vault.cachedRead(file);
    if (!this.isCurrent(hostEl, token)) return { status: 'cancelled' };

    const prefix = createRenderPrefix(source, file.basename, this.budget);
    if (prefix.empty) return { status: 'empty' };

    const inner = createDiv({ cls: 'mv-mini__inner markdown-rendered' });
    await MarkdownRenderer.render(this.app, prefix.markdown, inner, file.path, this.renderOwner);
    if (!this.isCurrent(hostEl, token)) {
      // The work is done; throwing it away would be the waste. Cache it, so
      // scrolling back is a clone.
      this.remember(file, inner, 0, prefix.truncated);
      return { status: 'cancelled' };
    }

    const measured = this.measure(hostEl, inner);
    const entry = this.remember(file, inner, measured.height, measured.clipped || prefix.truncated);
    this.mount(hostEl, entry);
    return { status: 'rendered', height: entry.height, clipped: entry.clipped };
  }

  private isCurrent(hostEl: HTMLElement, token: string): boolean {
    return hostEl.isConnected && hostEl.dataset[TOKEN_ATTR] === token;
  }

  /** Measure off-screen, at the host's own width, before anything is visible. */
  private measure(hostEl: HTMLElement, inner: HTMLElement): { height: number; clipped: boolean } {
    const styles = window.getComputedStyle(hostEl);
    const scale = Number.parseFloat(styles.getPropertyValue('--mini-scale')) || 0.45;
    const min = Number.parseFloat(styles.getPropertyValue('--mini-min-h')) || 96;
    const max = Number.parseFloat(styles.getPropertyValue('--mini-max-h')) || 340;

    const probe = hostEl.createDiv();
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.width = `${100 / scale}%`;
    probe.appendChild(inner.cloneNode(true));
    const contentHeight = probe.getBoundingClientRect().height;
    probe.remove();

    return clampMiniatureHeight(contentHeight, scale, min, max);
  }

  private remember(file: TFile, inner: HTMLElement, height: number, clipped: boolean): CacheEntry {
    const entry: CacheEntry = { inner, height, clipped };
    const key = buildMiniatureCacheKey(file.path, file.stat.mtime, this.budget);
    this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > this.cacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return entry;
  }

  private mount(hostEl: HTMLElement, entry: CacheEntry): void {
    hostEl.empty();
    // `is-loading` è una classe di OBSIDIAN CORE, non del plugin: core le
    // attacca un ::before con una barra di progresso animata da 3px. Finché
    // resta, quella barra gira all'infinito sopra una card già renderizzata —
    // segnalato da Mario come "la barra che carica sempre". Il percorso
    // testuale la toglie in hydrateCard; il percorso miniatura esce prima di
    // arrivarci, quindi va tolta QUI, nell'unico punto che sa che il montaggio
    // è avvenuto.
    hostEl.removeClass('is-loading');
    hostEl.appendChild(entry.inner.cloneNode(true));
    if (entry.height > 0) hostEl.style.height = `${entry.height}px`;
    hostEl.toggleClass('mv-mini--clipped', entry.clipped);
    hostEl.addClass('is-rendered');
    this.mounted.delete(hostEl);
    this.mounted.add(hostEl);
    this.enforceCeiling();
  }

  /** Keep the number of LIVE subtrees bounded. The cache is untouched, so a
   *  card scrolled back into view refills by cloning, not by re-rendering. */
  private enforceCeiling(): void {
    if (this.mounted.size <= this.mountCeiling) return;
    const viewport = window.innerHeight * 2;
    for (const hostEl of this.mounted) {
      if (this.mounted.size <= this.mountCeiling) break;
      const offscreen =
        !hostEl.isConnected || Math.abs(hostEl.getBoundingClientRect().top) > viewport;
      if (!offscreen) continue;
      this.mounted.delete(hostEl);
      hostEl.empty();
      hostEl.removeClass('is-rendered');
      hostEl.removeClass('mv-mini--clipped');
      this.onEvict?.(hostEl);
    }
  }
}
