import { setIcon } from 'obsidian';

/**
 * One mechanism for injecting a control into an Obsidian tab-header strip,
 * shared by the main tab bar's "open tab grid" button and the sidebar's
 * "add pane" button.
 *
 * Obsidian rebuilds these containers on layout changes, so `mount()` is
 * idempotent (guarded by `mark`) and meant to be re-run on `layout-change`.
 * Main window only: popout windows are not handled.
 *
 * The pieces that differ between strips — which containers, where in them, and
 * what the wrapper is called — are the spec below rather than a second copy of
 * this lifecycle, because they are exactly the pieces that turned out to be
 * strip-specific in practice (see each caller's comments).
 */
export interface TabHeaderButtonSpec {
  /** Class marking the injected wrapper; doubles as the idempotency guard. */
  mark: string;
  /** Which tab-header containers to inject into. */
  containerSelector: string;
  /** Element inside the container to insert after; appended when absent. */
  anchorSelector: string;
  /** Extra wrapper classes, for strips where a native class does the styling. */
  wrapperClass?: string;
  ariaLabel: string;
  icon: string;
  onActivate: (event: MouseEvent) => void;
}

export class TabHeaderButton {
  constructor(private readonly spec: TabHeaderButtonSpec) {}

  refresh(enabled: boolean): void {
    if (enabled) this.mount();
    else this.unmount();
  }

  mount(): void {
    const spec = this.spec;
    const containers = document.querySelectorAll<HTMLElement>(spec.containerSelector);
    for (const container of Array.from(containers)) {
      if (container.querySelector(`.${spec.mark}`)) continue;

      const wrap = createDiv({
        cls: spec.wrapperClass ? `${spec.wrapperClass} ${spec.mark}` : spec.mark,
      });
      const button = wrap.createDiv({
        cls: 'clickable-icon',
        attr: {
          'aria-label': spec.ariaLabel,
          'data-tooltip-position': 'bottom',
          role: 'button',
          tabindex: '0',
        },
      });
      setIcon(button, spec.icon);
      button.addEventListener('click', (event) => spec.onActivate(event));
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        button.click();
      });

      const anchor = container.querySelector(spec.anchorSelector);
      if (anchor) anchor.insertAdjacentElement('afterend', wrap);
      else container.appendChild(wrap);
    }
  }

  unmount(): void {
    for (const el of Array.from(document.querySelectorAll(`.${this.spec.mark}`))) {
      el.remove();
    }
  }
}
