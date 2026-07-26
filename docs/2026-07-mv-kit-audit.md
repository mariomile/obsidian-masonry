# mv-kit audit — Masonry (wave 3)

Audit of `styles.css` (790 lines pre-fix) + the UI code (`src/gallery.ts`,
`src/card-actions.ts`, `src/preview.ts`, `src/bases-view.ts`,
`src/settings.ts`, `src/presentation.ts`) against
`obsidian-cosmos-theme/docs/mv-kit.md`, both desktop and phone columns.
Scope: coherence-only fixes (radius / type / motion tokens / touch targets /
empty states / microcopy). No layout redesign, no DOM restructure — per
`docs/2026-07-24-suite-coherence-design.md` §C/D non-goals.

Masonry has real mobile surfaces (the `@media (pointer: coarse)` MOBILE KIT
block, the long-press card-actions menu, the ≤520px container-query phone
layout), so the phone column is audited on its own merits, not by analogy
with desktop.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason) / **deferred**
(violation is real but lives in an off-limits file — see the Deferred
section).

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — before this wave `styles.css` consumed **zero** suite tokens (grep for `--cosmos-`/`--mv-`: 0 hits). It now consumes 17, every one of them with the exact literal Masonry already shipped as the fallback, so a Cosmos-less vault renders identically. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass**, now mechanically enforced — Masonry only ever defines its own `--masonry-*` namespace, on `.masonry` (a plugin container), never at `:root`/`body`. `src/style-contract.test.ts` gained a third assertion that fails on any `--cosmos-*`/`--mv-*` definition anywhere in the stylesheet, matched at a **declaration boundary** (`{` or `;`) rather than at the start of a line, so the compact one-liner `:root { --mv-r-card: 11px; }` is caught as surely as the multi-line block. (The first version of this assertion was line-anchored and let the one-liner through; see the corrected red-before-green log below.) |

The rewiring is the load-bearing change of this wave: Masonry's own custom
properties became *consumers* rather than *definitions*.

```css
/* before */                      /* after */
--masonry-radius: 11px;           --masonry-radius: var(--mv-r-card, 11px);
--masonry-ease: cubic-bezier(     --masonry-ease: var(--mv-wash,
  0.25, 1, 0.5, 1);                 cubic-bezier(0.25, 1, 0.5, 1));
```

Everything downstream (`.masonry-card`, `.masonry-card-actions`, every
`transition` in the file) keeps referring to `var(--masonry-radius)` /
`var(--masonry-ease)` unchanged, so a one-line rewire moved the whole
stylesheet onto the suite scale.

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.masonry-card` radius (`--masonry-radius`) | was literal `11px` | same value, no phone variant | **fixed** — now `var(--mv-r-card, 11px)`. The kit names this surface explicitly: "`--mv-r-card` … Card radius (= masonry `--masonry-radius`)". Masonry *is* the reference implementation of that token; it now consumes it instead of defining the number twice. |
| `.masonry-tag-chip` radius | was literal `5px` | same | **fixed** — now `var(--mv-r-chip, 5px)`. Same story: the kit's `--mv-r-chip` row reads "(= `.masonry-tag-chip`)". |
| `.masonry-card-actions`, `.masonry-preview-skeleton`, `.masonry-retry-button`, `.masonry-reset-button` (`--radius-s`) | native Obsidian token | same | **pass** — a native token, not a hand-picked pixel. Matches the wave-1 verdict on Sonar's `--radius-s`/`--radius-m` uses. |
| `.masonry-density`, `.masonry-load-more` (`--radius-m`) | native token | same | **pass** |
| `.masonry-tag-chip[data-tag-kind='status']::before` — `border-radius: 50%` on a 5×5 dot | n/a | n/a | **waived** — the round-cap idiom on a fixed tiny shape, not a "pill/card/chip" *surface* in the kit's §1 sense. Same waiver Sonar's badge-dot got in wave 1; the kit's radius table has no entry for status dots. |
| Elevation shadow — `.masonry-card:hover` `box-shadow: 0 5px 16px color-mix(…)` | desktop-only (inside `@media (hover: hover)`) | not reachable on touch | **waived** — the kit's shadow MUST covers *floating surfaces* (`--cosmos-pop-shadow`: menu / tooltip / popover / prompt) and sidebar islands (`--cosmos-island-shadow`). A card hover-lift inside a scrolling grid is neither, and the kit ships no token for it. The value is a `color-mix` over `--background-modifier-box-shadow`, i.e. already theme-derived, not a hardcoded rgba. |
| Floating surfaces of Masonry's own | none — the folder/tag/sort/view pickers open Obsidian's `Menu` and `FuzzySuggestModal`; the long-press card menu is also a `Menu` | same, and on phone Cosmos renders those as bottom-sheets | **waived, nothing to tokenize** — Masonry renders no popover chrome of its own, so there is no elevation to consume `--cosmos-pop-shadow` for. It inherits the theme's floating-surface treatment by construction, which is the outcome the rule wants. |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.masonry-search-input`, `.masonry-select`, `.masonry-density` | `min-height: 36px` (no desktop minimum in the kit) | was raw `min-height: 44px` | **fixed** — now `var(--cosmos-touch-min, 44px)`. Same computed value, but the 44 is a token now, not a number the kit and the plugin happen to agree on. |
| `.masonry-menu-button--icon` (folder / tag / sort / view triggers) | `36px` square | was **36px wide, 44px tall** — the coarse-pointer block raised `min-height` on `.masonry-select` but the icon variant pins `width`/`min-width`/`max-width: 36px`, so the horizontal axis silently stayed under the floor | **fixed on phone** — width/min-width/max-width now `var(--cosmos-touch-min, 44px)` inside the coarse block. This was a genuine, previously-unnoticed §2 violation on the most-tapped controls in the phone toolbar. Desktop unchanged. |
| `.masonry-load-more` ("Load N more notes") | `min-height: 38px` | was `38px` — never listed in the MOBILE KIT block | **fixed on phone** — added to the `var(--cosmos-touch-min, 44px)` group. It is the primary scroll-forward affordance on phone and sat 6px under the floor. |
| `.masonry-retry-button` / `.masonry-reset-button` ("Retry", "Clear filters") | `min-height: 32px` | was `32px` — also missing from the MOBILE KIT block | **fixed on phone** — added to the same group. 12px under the floor; these are recovery controls, the worst place to make a tap miss. |
| `.masonry-density-button` (28px glyph) | 28px | 36px box + transparent `::after` hit-area extension, `inset: calc((100% - 44px) / 2)` | **fixed (tokenized)** — the pseudo-element trick is kept verbatim (it is the suite's own pattern, born here); the raw `44px` inside the `calc()` is now `var(--cosmos-touch-min, 44px)`. |
| `.masonry-card-action` (26px per-card buttons) | 26px, mouse-only | `display: none` under `@media (pointer: coarse)` — the actions live in the long-press menu instead | **pass** — not reachable on touch, so the 44px floor doesn't apply. The long-press menu items are Obsidian `Menu` rows, which the platform/theme already sizes for touch. |
| `.masonry-card` itself (the primary tap target) | n/a | whole card is clickable, minimum realistic height well above 44px (image + body + padding) | **pass** |
| Micro-label font size | `.masonry-card-meta`, `.masonry-property` use `var(--font-ui-smaller)` | same | **pass** |
| Card-content type scale (`.masonry-tag-chip` `0.68rem`, `.masonry-card-preview` `0.76rem`, compact variants `0.9rem`/`0.72rem`, `.masonry-card-title` `clamp(1.02rem, …)`) | bespoke rem values | same | **waived** — this is *content* typography inside the card, and the programme doc puts it explicitly out of scope: "Niente tipografia di contenuto (NC-Tight = cantiere 3, decisione di Mario)". Changing these changes card density, i.e. layout, which this wave's non-goals forbid. §2's MUST NOT is scoped to *micro-labels* ("a bespoke micro-label font size … instead of `var(--font-ui-smaller, 12px)`"), and Masonry's micro-labels already use the token. |
| Icon sizing (`16px` search/menu icons, `14px` chevron, `28px` empty-state icon) | raw px on the SVG wrapper spans | same | **pass** — matches the kit's own §2 row ("Cosmos defines no separate icon-size scale") and the wave-1 Sonar verdict on the identical pattern. Noted as an optional future tightening in Deferred. |

## §3 Motion

| Token / animation | Before | After | Verdict |
|---|---|---|---|
| `--masonry-ease` (the file's only easing) | raw `cubic-bezier(0.25, 1, 0.5, 1)` | `var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))` | **fixed** — the kit names this exact curve `--mv-wash` and cites Masonry as its origin ("= masonry `--masonry-ease`"). It drives colour/background washes, which is precisely what `--mv-wash` is for. |
| `.masonry-card` border/background wash | raw `140ms` ×2 | `var(--cosmos-t-fast, 140ms)` | **fixed** — micro-feedback tier, exact token match. |
| `.masonry-card` shadow lift | raw `180ms` | `var(--cosmos-t-base, 180ms)` | **fixed** — physical-lift tier, exact token match. |
| `.masonry-card-actions` opacity reveal | raw `120ms` | `var(--cosmos-t-fast, 120ms)` | **fixed** — micro-feedback tier. Fallback kept at Masonry's shipped `120ms` (not the token's `140ms`) so nothing moves without Cosmos; this is the kit's own shipped Portal pattern, `var(--cosmos-t-fast, 120ms)`. |
| `.masonry-card-actions` transform reveal | raw `160ms` | `var(--cosmos-t-base, 160ms)` | **fixed** — same reasoning, physical tier. |
| `.masonry-card-title` colour transition | raw `140ms` | `var(--cosmos-t-fast, 140ms)` | **fixed** |
| **Press-scale on phone** (`--cosmos-press-scale`) | **absent** — no tap-confirmation anywhere | `transform: scale(var(--cosmos-press-scale, 0.98))` on `:active` for `.masonry-card` and the five toolbar/CTA controls, inside `@media (pointer: coarse)` | **fixed on phone** — the kit marks this a phone **MUST** and Masonry had nothing. `transform` was added to `.masonry-card`'s existing transition list and a transform-only transition given to the toolbar controls (which had none), so the scale animates instead of snapping. Composited property only; no reflow. Desktop untouched (the kit: "N/A (no press-scale defined for pointer/desktop)"). |
| Animated properties | `border-color` / `background-color` / `box-shadow` / `color` / `background-position` | unchanged, plus the new `transform` | **pass** — none is layout-triggering, which is what the MUST forbids ("never width/height/top/left"). Same verdict as wave 1 on Sonar's hover washes. Worth noting: `.masonry-card:hover .masonry-card-title { padding-right: 78px }` *is* a layout property, but it is not transitioned (the title's `transition` lists `color` only), so it is a state change, not an animation — and it is already neutralised on touch (`padding-right: 0` in the coarse block). |
| `prefers-reduced-motion: reduce` | zeroed `.masonry-card` and `.masonry-card-actions` transition-duration; `animation: none` on the shimmer | unchanged, **plus** the five new press-scale targets added to the same block | **fixed (extended)** — under Cosmos the duration tokens are zeroed at token level, so consuming them buys reduced-motion for free; but Masonry must also behave correctly *without* Cosmos, where the literal fallbacks stay live. The explicit block is what covers that case. The shimmer's `animation: none` is untouched — `src/styles.test.ts` asserts it and still passes. |
| Shimmer loop, `animation: masonry-shimmer 1.25s linear infinite` | raw `1.25s` | unchanged | **waived** — the `--cosmos-t-*` scale tops out at `300ms` (`--cosmos-t-panel`); there is no suite token for a continuous loop duration, and inventing one would violate the kit's own premise ("the kit EXTRACTS Cosmos's rules, it doesn't invent new ones"). The animation is fully disabled under `prefers-reduced-motion`, which is the risk the §3 MUST exists to manage. |
| Phone entrance recipes (`cosmos-pop-in` / `cosmos-sheet-rise` / `cosmos-fade-in`) | n/a | the long-press card-actions menu, and every filter picker, is an Obsidian `Menu` / `FuzzySuggestModal` | **pass, inherited** — Masonry renders no popover, sheet, or overlay chrome of its own, so the three phone entrance MUSTs land on the theme's own `.menu` / `.modal` rules in `cosmos-phone.css`, which already ship the recipes. Masonry adds no competing animation or `!important` that would suppress them. This is the correct outcome of the rule, not an exemption from it. |
| `--cosmos-spring` (overshoot) | never used | unchanged | **pass** — the kit reserves it for confirmation micro-moments; Masonry has none, and correctly does not reach for it on hover/reveal. |
| Two known side effects of the press-scale fix (accepted, recorded) | — | — | **noted, not defects.** (a) The coarse block gives the five toolbar/CTA controls `transition: transform …` as a *shorthand*, which resets any `transition` those elements inherit — in practice only `.masonry-density-button`, which is a `.clickable-icon` and so inherits core's icon transition on touch. The visible effect is that its hover/colour wash no longer animates on a touch device, where hover doesn't exist anyway; the alternative (long-hand `transition-property`) resets the same set, so there is no clobber-free one-liner. Left as-is rather than duplicating core's transition list into the plugin. (b) `transform var(--cosmos-t-base, 180ms)` was added to `.masonry-card`'s transition list unconditionally, while the only transform (press-scale) exists solely under `pointer: coarse` — so on desktop it is a declaration with nothing to animate. Harmless (no cost until a transform appears) and it keeps the card's transition list in one place; scoping it into the coarse block would be tidier but means repeating the whole list. |
| JS-side timings (`gallery.ts` search debounce `120`, long-press threshold `500`) | raw numbers in TS | unchanged | **waived** — the kit's audit procedure scopes to the *stylesheet* ("grep the plugin's stylesheet…"). These are input-latency thresholds (debounce, gesture recognition), not design durations: a 500ms long-press is an interaction contract with iOS, not a motion curve. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.masonry-group-title` — section eyebrow above each grouped grid (the Bases group key: a status, a folder, a date bucket) | was `font-size: var(--font-ui-medium); font-weight: 600; color: var(--text-muted)` — a heading treatment competing with the card titles under it | same class, no phone variant | **fixed** — now the kit's micro-label recipe verbatim: `var(--font-ui-smaller)` / `var(--font-medium)` / `var(--text-faint)` / `text-transform: uppercase` / `letter-spacing: 0.06em`. Identical to the wave-1 fix on Sonar's `.sonar-group`; the two plugins now render group eyebrows the same way. |
| `.masonry-empty h3` — "No notes found" | was `color: var(--text-normal); font-size: 1rem` | same | **fixed against the MUST NOT, not against the whisper recipe — judgement call, flag to Mario.** The MUST NOT ("an empty state reads as a title … no bold, no `--text-normal`") is now satisfied: `var(--text-muted)` / `var(--font-ui-small)` / `var(--font-medium)`, `<h3>` kept for document outline and screen readers. But the §4 whisper recipe is `--text-faint` / `--font-ui-smaller`, and "No notes found" is arguably *the* empty-state message the MUST names, not a lead-in to `<p>` below it. Read strictly, this line should be one step fainter and one step smaller. It was left as a two-step hierarchy (muted headline + faint whisper) deliberately, because collapsing both to the whisper recipe removes the visual anchor of the empty state entirely — a design change, not a token substitution, and this wave's non-goals forbid those. **Mario decides**: strict recipe (headline drops to `--text-faint`/`--font-ui-smaller`, becoming visually identical to the `<p>`) or keep the two-step. One-line change either way. |
| `.masonry-empty p` — "Try removing a filter or using a shorter search term." | was `var(--font-ui-small)`, colour inherited `--text-muted` from `.masonry-empty` | same | **fixed** — whisper recipe verbatim: `color: var(--text-faint)`, `font-size: var(--font-ui-smaller)`. |
| `.masonry-card-empty-preview` — "Empty note" / "Preview unavailable" / "Image preview unavailable" | was `var(--text-faint)` (correct) at `var(--font-ui-small)` (one step too large) | same | **fixed** — `font-size` dropped to `var(--font-ui-smaller)`. The italic is kept: the kit's whisper recipe constrains colour and size, and italic reinforces "this is a state note, not note content". |
| `.masonry-reset-button` ("Clear filters") inside the empty state | a real recovery action, correctly styled as a button rather than folded into the whisper text | same | **pass** — the kit forbids an empty *message* reading as a CTA; it does not forbid offering the one action that resolves the empty state. Verb + object label, no `mod-cta`. |
| `.masonry-empty-icon` (28px `search-x`, `aria-hidden`) | decorative glyph above the message | same | **pass** — `--text-faint`, no colour accent, doesn't turn the empty state into a hero. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| No native `<select>` in plugin forms | the four in-view pickers (folder, tag, sort, view) are `<button>` + Obsidian `Menu`, with a `FuzzySuggestModal` for long option lists. `.masonry-presentation-select` is a *class name* on a button, a leftover of an earlier implementation, not a `<select>` element — `grep "createEl('select'"` in `src/`: zero hits | same button, icon-only variant below 520px | **pass** — this is exactly the chip+popover pattern the kit asks for, and it predates the kit. |
| No native `<select>` — settings tab | `src/settings.ts` uses `new Setting(…).addDropdown(…)`, which renders a native `<select>` | same | **deferred, out of scope by design** — the programme doc puts settings screens outside this wave on purpose: "Niente settings screens (in coda programma)". Replacing `addDropdown` with a chip+popover means writing a custom form component, i.e. exactly the "no component rework" non-goal. Flagged for the settings-screen cantiere. |
| No `mod-cta` on buttons | `grep mod-cta src/`: zero hits | same | **pass** |
| Sentence-case labels | every in-view string is sentence case: "Search notes…", "All folders", "All tags", "Recently modified", "Title A–Z", "Open in new tab", "Copy wikilink", "Show in file explorer", "No notes found", "Clear filters", "Retry", "Load 48 more notes", "Empty note", "Preview unavailable", "Wikilink copied", "Could not copy wikilink", "File explorer unavailable" | same | **pass** |
| Sentence-case labels — the "All Docs" view name | `src/main.ts` / `src/all-docs-view.ts` render "All Docs" and "Open All Docs" (Title Case) | same | **deferred** — both strings live in the two off-limits files. See Deferred. |
| Button labels are verb + object | "Open in new tab", "Copy wikilink", "Show in file explorer", "Clear filters", "Load N more notes" — all name the outcome; "Retry" is a single-verb recovery on an error row, where the object is unambiguous | same | **pass** |
| English product surfaces, PM jargon untranslated | all user-facing strings are English. The Italian in the stylesheet is *code comments* (the MOBILE KIT block, the compact-columns note), which the vault language rule permits and which record Mario's own on-device findings | same | **pass** |
| Settings copy | `src/settings.ts`: "Default presentation", "Preview length", "Show folder", "Show tags", "Excluded folders", "Load remote images" — sentence case, English, each with a concrete description | n/a | **pass** (the `<select>` issue above is separate) |

## §Golden rule — raw-value leakage (post-fix grep)

Post-fix `styles.css` scan for raw `ms` / hex / `cubic-bezier` outside a
`var(--token, fallback)` expression:

- raw hex: **0 occurrences** in the file at all (before and after).
- `cubic-bezier`: **1 occurrence**, line 29, as the fallback inside
  `var(--mv-wash, …)`.
- `ms` durations: **11 occurrences**, of which 8 are `var(--cosmos-t-*, N)`
  fallbacks and 3 are the `transition-duration: 0.01ms` reduced-motion
  escape hatch.
- `var(--cosmos-*)` / `var(--mv-*)` consumption: **0 → 17**.
- `--cosmos-*` / `--mv-*` *definitions* anywhere (including `:root`/`body`):
  **0**.

`src/style-contract.test.ts` was tightened to enforce exactly this. Its
raw-value rule previously allowed three extra escape hatches (a raw value
was legal if the line defined a `--masonry-*` property, or merely mentioned
one) — those existed only because `--masonry-radius` and `--masonry-ease`
hardcoded their values. With both rewired to consume suite tokens, the
escape hatches are dead and were removed, leaving "inside a `var()`
fallback, or the reduced-motion `0.01ms`". A third assertion was added for
the golden rule's MUST NOT (no `--cosmos-*`/`--mv-*` definitions).

**Two holes were found in the first version of that contract by review and
closed in the same wave** — both were *line-scoped* checks where a
*position-scoped* one was needed:

1. Assertion 3 matched `/^\s*--(?:cosmos|mv)-[\w-]+\s*:/gm`. The `^\s*` line
   anchor only fires when the declaration **starts a line**, so the compact
   one-liner `:root { --mv-r-card: 11px; }` — the likeliest way this
   regression actually gets authored — walked straight past it. Now matched
   at a declaration boundary: `/(?:^|[{;])\s*--(?:cosmos|mv)-[\w-]+\s*:/g`.
   Consumption sites stay immune because `var(--mv-wash, …)` puts a comma,
   never a colon, after the token name.
2. Assertion 1 licensed a whole **line** if that line contained any
   `var(--token, …)` anywhere on it, so
   `transition: opacity 250ms linear, transform var(--x, 1px);` passed with
   a raw `250ms` in it. It now tests each raw value by **character
   position** against the fallback ranges of every `var()` call (paren-depth
   aware, so nested forms like `var(--mv-wash, cubic-bezier(…))` resolve
   correctly). Comment stripping was changed to blank comments in place
   instead of deleting them, which keeps offsets — and therefore the
   reported line numbers — exact.

Red-before-green log, re-run against the **corrected** contract (`pnpm
test`, each probe appended to `styles.css`, the file restored from a byte
copy after every run — final `shasum` re-verified identical):

| Probe appended | Result |
|---|---|
| `:root { --mv-r-card: 11px; }` (one line) | `not ok 16` — assertion 3. **36 tests / 35 pass / 1 fail** |
| `:root {\n  --mv-r-card: 11px;\n}` (block) | `not ok 16` — assertion 3. **36 / 35 / 1** |
| `body{--cosmos-t-fast:99ms}` | `not ok 14` + `not ok 16` — assertions 1 and 3. **36 / 34 / 2** |
| `.probe { transition: opacity 250ms linear, transform var(--x, 1px); }` | `not ok 14` — assertion 1, reported as `line 899: "250ms"` (the real line number). **36 / 35 / 1** |
| `.probe { color: #ff0000; border-color: red !important; }` | `not ok 14` + `not ok 15` — assertions 1 and 2 (count 13 > ceiling 12). **36 / 34 / 2** |
| *(none — restored file)* | **36 / 36 / 0** |

The first two rows are the correction, and it is worth stating as a
retraction rather than a diff: an earlier version of this note, and of the
wave's fix-commit message, claimed the one-line
`:root { --mv-r-card: 11px; }` probe had failed assertion 3. **It did not.**
Against the contract as first landed that probe passed (36 / 36 / 0) — only
the multi-line form went red, so assertion 3 was never exercised in the form
the note cited. The regex is fixed, the commit message was corrected in place
(the wave was unpushed, so the fix commit is now `35e9255`), and both probe
forms have been run red against the version that ships.

The `0.01ms` reduced-motion carve-out in assertion 1 is a **deliberate
divergence from the wave-1 reference**, not parity with it: sonar's contract
has no such exception because sonar ships no explicit
`prefers-reduced-motion` block. Masonry does (it must behave correctly
without Cosmos zeroing the tokens), and no suite token exists for an
"effectively instant" duration, so the three `transition-duration: 0.01ms`
lines are allowed by name — a strictly looser contract than sonar's, kept
open-eyed rather than by omission.

## `!important` audit — 14 → 12, each survivor justified inline

The kit is silent on `!important` (it is in no MUST/MUST NOT), so each was
judged on whether it wins a real specificity battle or shortcuts the cascade.

| Block | Count | Verdict |
|---|---|---|
| `.masonry-presentation-select` — `border-color` + `background` | 2 | **removed** — provably redundant, not a judgement call. `createMenuButton()` in `gallery.ts` builds this element with `cls: 'masonry-select masonry-menu-button masonry-presentation-select masonry-menu-button--icon'`, so it *always* also carries `.masonry-select`, whose block already sets the identical `border-color` / `background-color` / `color` / `min-height` — with `!important`, at that. The rule now owns only what is genuinely its own: the narrow-pane `display` toggle. Zero visual change. |
| `.masonry-view-content` — `padding: 0` | 1 | **kept, justified inline** — Obsidian styles the same node via `.workspace-leaf-content > .view-content` (higher specificity than one plugin class) with the standard view padding; the gallery needs an edge-to-edge canvas. |
| `.masonry-search-input` — `padding-inline`, `border-color`, `background`, `box-shadow` | 4 | **kept, justified inline** — core styles this control through `input[type='search']` (0,1,1), which outranks `.masonry-search-input` (0,1,0) on all four properties. Without them the field renders as native search chrome instead of matching the toolbar. |
| `.masonry-select` — `border-color`, `background-color`, `box-shadow` | 3 | **kept, justified inline** — it is a `<button>`, and core styles buttons through `button:not(.clickable-icon)`, which is (0,1,1) because `:not()` inherits its argument's weight. Same specificity story as above. |
| `:focus-visible` border on the three fields | 1 | **kept, justified inline** — chain-forced: the resting border it overrides is itself `!important`, and only an `!important` beats an `!important`. |
| `.masonry-menu-button--icon.is-filtered` — `background` | 1 | **kept, justified inline** — same chain: it has to beat `.masonry-select`'s `!important` background. |
| Keyboard focus-ring restoration — `outline`, `box-shadow` | 2 | **kept, justified inline** — core and several themes ship `.clickable-icon:focus-visible { box-shadow: none }`-style rules that erase focus rings on icon buttons; that is an a11y regression in a grid where the keyboard is a primary way to move between cards. Landed deliberately in `d4a2ce8` ("fix(a11y): restore keyboard focus indicators"). |

**Total: 12** (was 14). Every survivor now carries an adjacent comment
naming the selector it must outrank and why; before this wave none of them
did. The contract test's ceiling ratcheted 14 → 12.

## Deferred — off-limits files (`src/all-docs-view.ts`, `src/main.ts`)

Both files carry uncommitted in-flight work by Mario and were **read but not
edited** by this wave; they appear in no commit. The mv-kit findings in them
are recorded here instead of fixed:

1. **`src/main.ts` — Bases view icon is still Lucide.**
   `registerBasesView(BASES_GALLERY_VIEW_TYPE, { name: 'Masonry', icon: 'layout-dashboard', … })`
   uses a stock Lucide name, while the ribbon and the All Docs view already
   use the Huge icon `hi-layout-grid` registered a few lines above. That is a
   direct miss against front 1 of the programme ("Icone Huge ovunque —
   linguaggio iconografico unico app-wide"): the same plugin shows two icon
   languages depending on how you open it. One-word fix, deferred purely
   because of the file lock.
2. **`src/main.ts` / `src/all-docs-view.ts` — "All Docs" is Title Case.**
   `getDisplayText()` returns `'All Docs'`; the ribbon tooltip and command
   are `'Open All Docs'`. §5 MUST: "all labels are sentence-case, not Title
   Case or ALL CAPS". Needs a call from Mario before anyone touches it —
   "All Docs" may be intended as a proper surface name (like "Masonry"),
   in which case the rule doesn't bite. Worth deciding once for the whole
   suite rather than patching one plugin.
3. **`src/all-docs-view.ts` — raw `450` ms vault-event debounce**
   (`queueRefresh()`). Same class as the `gallery.ts` timings waived in §3:
   an input-coalescing threshold, not a design duration, and outside the
   kit's stylesheet-scoped audit procedure. Listed for completeness, not as
   a defect.

## Not touched (explicit non-goals, confirmed out of scope)

- No layout or DOM changes anywhere. Every fix is a token substitution, a
  missing property on an already-existing selector, or (in the coarse-pointer
  block) an extra selector added to an existing group.
- Card-content typography (`0.68rem` chips, `0.76rem` excerpts, the
  `clamp()` title scale) — cantiere 3 (NC-Tight), Mario's call.
- Settings screen (`src/settings.ts` `addDropdown` → native `<select>`) —
  explicitly queued after this programme.
- Icon sizes (`16px`/`14px`/`28px` on SVG wrapper spans) could be rewired to
  `var(--icon-s, 16px)` etc., but the kit's §2 row states Cosmos defines no
  icon-size scale, and wave 1 set the precedent of leaving these as **pass**.
  Changing them would also let a theme resize Masonry's chrome icons, which
  is a behaviour change, not a coherence fix.
- The shimmer's `1.25s` loop (see §3) — no suite token exists for loop
  durations.

## Verification

Run on the post-fix tree, exit codes and counts quoted verbatim:

- `pnpm typecheck` (`tsc --noEmit`) — **exit 0**, 0 errors
- `pnpm lint` (`eslint src`) — **exit 0**, 0 problems
- `pnpm test` (`node --experimental-strip-types --test src/*.test.ts`) —
  **tests 36 / pass 36 / fail 0** (33 pre-existing + the 3 in
  `src/style-contract.test.ts`, up from 2: the golden-rule assertion is new).
  Re-run after the review-round contract corrections: still **36 / 36 / 0**,
  with all five probes above verified red and the restored file green.
- `src/styles.test.ts` reduced-motion shimmer assertion: still green (it is
  one of the 36).
- `src/release-contract.test.ts`: still green; the version was **not**
  bumped (`1.3.1` stays pinned in `manifest.json`, `package.json`,
  `versions.json`).
- Desktop screenshot / live vault reload: **pending** — no live Obsidian
  reload was run in this session.
- Phone verification: **pending Mario's on-device sign-off**. Per the hard
  constraint, `EmulateMobile` was not used (it kills Node plugins). The phone
  fixes (44px floors on the icon triggers / load-more / retry / reset,
  press-scale) are verified by reading the resulting CSS against the kit's
  phone column, not by rendering on device.

---

# §6 — wave 2026-07 dinamica

Audit of `styles.css` (897 lines pre-fix, 927 post-fix) against
`obsidian-cosmos-theme/docs/mv-kit.md` §6 ("Elevation & motion depth",
landed cosmos-theme commit `10f5ddc`), both desktop and phone columns.
Scope: the four §6 sub-rules only (elevation hierarchy, hover richness,
drag polish, panel/tab transitions) — coherence-only, no layout redesign,
no new components, no version bump. `src/all-docs-view.ts` and
`src/main.ts` excluded per hard constraint (Mario's uncommitted in-flight
diffs); untouched, byte-identical before and after this wave (verified by
`git diff … | shasum`, matching on both ends). Rollout order in this
cantiere: Sonar → Portal → **Masonry** → TabX; this wave draws on both
prior waves' precedent (Portal `389d564`/`133c93d`/`4b95bf2`, TabX
`cc65cd4`/`a792752`/`662d11a`), consulted before editing.

Per-rule verdict: **pass** (already compliant, nothing to do) / **fixed**
(this wave) / **waived** (kit rule doesn't literally apply to this surface,
with reason) / **N/A** (surface doesn't exist in Masonry at all).

## Elevation hierarchy

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.masonry-card` hover `box-shadow` (`0 5px 16px color-mix(…)`) | hand-picked shadow, inside `@media (hover: hover)` | not reachable (hover-gated) | **waived, carried forward from wave 3's §1 verdict** — mv-kit's shadow-tier MUST covers *floating* surfaces (Pop: menu/tooltip/popover/prompt, dismissed by outside-click) and *persistent* Island surfaces (a sidebar/panel that doesn't close on outside-click). A grid card inside a scrolling masonry layout is neither — inline flow content, permanently part of the document, no dismiss behaviour. The value is already theme-derived (`color-mix` over `--background-modifier-box-shadow`), not a hardcoded rgba. Re-confirmed this wave under §6's more detailed tier language; nothing changed. |
| Floating surfaces of Masonry's own (menu, popover, modal) | none — folder/tag/sort/view pickers open Obsidian's native `Menu`/`FuzzySuggestModal` (`src/gallery.ts` `new Menu()`, `OptionSuggestModal`) | same; the long-press card-actions menu is also a native `Menu` | **waived, nothing to tokenize** — confirmed by reading `src/gallery.ts` in full: zero plugin-authored popover/modal chrome. Nothing in Masonry's surface set qualifies for `--cosmos-pop-shadow`/`--cosmos-island-shadow`; it inherits the theme's floating-surface treatment by construction, the correct outcome of the rule. |
| Glass surface (`--cosmos-glass-*`) | not present | not present | **N/A** — `grep -n "blur\|glass" styles.css`: zero hits. Masonry has no command-bar/floating-toolbar-over-content surface. |
| Two tiers stacked on one element | not present | not present | **pass, not applicable** — no `box-shadow` declaration in the file pairs with a blur/glass surface; nothing to stack. |

## Hover richness

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.masonry-card:hover` | **was a violation**: colour (`border-color`, `background`) + shadow wash already existed, correctly inside `@media (hover: hover)`, but **no lift transform** — the base rule's `transition` list even already had a `transform` leg, wired to `--masonry-ease` (`--mv-wash`, a colour curve) with nothing to animate | hover unreachable on touch (gated); the existing `:active { transform: scale(--cosmos-press-scale) }` under `@media (pointer: coarse)` is the touch-equivalent physical response | **fixed** — added `transform: translateY(-1px)` inside the existing `@media (hover: hover)` block (within the kit's ≤2px cap), and split the base rule's `transform` transition onto its own leg using `--mv-lift` (`cubic-bezier(0.22, 1, 0.36, 1)`) instead of `--masonry-ease`, per the kit's own "the two easings are not interchangeable" MUST — this is close to verbatim the kit's own `.card:hover { transform: translateY(-1px) }` example. Wash properties (`border-color`, `background-color`, `box-shadow`) keep `--masonry-ease`. Guarded by two new style-contract assertions. |
| `.masonry-card-action:hover` (per-card action buttons) | colour wash only (`background`, `color`), grouped with `:focus-visible` on the same rule, ungated | **N/A — parent container is `display: none`** under `@media (pointer: coarse)` (line ~845 of the fixed file); the touch equivalent lives entirely in the native long-press `Menu`, which Masonry doesn't style | **waived, N/A — not a violation.** Gating an already-phone-unreachable selector would be a no-op edit, not a fix; left untouched per the wave's "don't invent work" instruction. `:focus-visible` on the same selector group is correctly ungated (keyboard-only) and was not disturbed. |
| `.masonry-retry-button:hover`, `.masonry-reset-button:hover` ("Retry", "Clear filters") | **was a violation**: bare top-level `:hover`, colour wash only | **phone-reachable**: both are touch-target-sized (`var(--cosmos-touch-min, 44px)`) inside the `@media (pointer: coarse)` MOBILE KIT block — a bare `:hover` fires on tap and the wash sticks, since touch has no pointer to leave | **fixed** — wrapped in `@media (hover: hover)`, matching the exact pattern in portal `389d564` / tabx `cc65cd4`. These are the vault's own error-recovery controls; the worst place for a stuck visual state. |
| `.masonry-load-more:hover` ("Load N more notes") | **was a violation**: bare top-level `:hover`, colour + text-colour wash | **phone-reachable**: touch-target-sized in the same MOBILE KIT block, and it is the primary scroll-forward affordance on phone | **fixed** — wrapped in `@media (hover: hover)`, same pattern. |
| `.masonry-card:hover .masonry-card-title { padding-right: 78px }` (makes room for the hover-revealed action buttons) | **was a violation**: bare `:hover` on a phone-reachable card, grouped on one selector list with `.masonry-card:focus-within .masonry-card-title` | **already separately neutralised**: an existing `@media (pointer: coarse)` rule resets `padding-right: 0` for both `:focus-within` and `:hover` (line ~861), because `.masonry-card-actions` is hidden on touch (see the `.masonry-card-action` row above) — so the desktop-only 78px reserve has no functional effect on a real device, but the *selector itself* was still a bare `:hover` sitting outside any hover gate | **fixed** — split the grouped selector so `:focus-within` (keyboard/pointer-agnostic, must never be hover-gated) keeps its own ungated rule, and the `:hover` leg moved into a new `@media (hover: hover)` block. The `@media (pointer: coarse)` reset at line ~861 was left untouched — it is inert on real touch devices already (coarse pointer has no hover capability) and gating it would be a no-op inside a no-op; documented and explicitly excluded in the new style-contract test rather than silently ignored. |
| `--mv-wash` vs `--mv-lift` used correctly (not interchanged) | after the fix: `.masonry-card`'s new lift leg uses `--mv-lift`; every colour/opacity wash across the file (`.masonry-card` border/background, `.masonry-card-title`, `.masonry-card-actions` opacity) still uses `--masonry-ease` (itself `var(--mv-wash, …)`) | same | **pass (verified, not assumed)** — `grep -n "mv-lift\|mv-wash" styles.css` post-fix confirms exactly one `--mv-lift` consumption site (the new card lift) and every other transition still resolves through `--masonry-ease`; no site mixes the two. |
| `transform` lift never exceeds 2px | `.masonry-card:hover`'s new lift is exactly `-1px` | n/a, hover-gated | **pass** — guarded by a new style-contract assertion (`> 0 && <= 2`). |

## Drag polish

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| Any Masonry-owned drag interaction (`.is-dragging`/`.is-dropped` or equivalent) | **does not exist** | **does not exist** | **N/A, nothing to audit** — verified, not assumed: `grep -n "draggable\|dragstart\|dragover\|drop\b\|is-dragging\|is-dropped" src/*.ts` (excluding test files) returns zero functional hits (the one match, in `src/utils.ts`, is the unrelated English word "drop" in a comment about falling back to a basename). Cards are click-to-open / long-press-for-menu, not reorderable or draggable — Masonry implements no drag surface of its own for this rule to govern. |

## Panel & tab transitions

| Motion | Before | After | Verdict |
|---|---|---|---|
| Section/group expand-collapse, tab-content swap | Masonry renders no persistent panel that opens/closes and no tab-content-swap surface of its own — `.masonry-presentation-select` toggles between icon-button and full select via `display`, an instant swap tied to container-query width, not a user-triggered tab click | same | **N/A, not applicable — Masonry owns neither surface.** The view itself (the whole `.masonry-view-content` leaf) is opened/closed by Obsidian's own workspace/leaf chrome, entirely outside any CSS Masonry ships; `grep -n "@keyframes\|slide" styles.css` shows only the pre-existing `masonry-shimmer` loading shimmer (already waived in wave 3's §3), nothing resembling a panel or tab transition. |
| `.masonry-card-actions` reveal on hover/focus-within (opacity + `translateY`) | `var(--cosmos-t-fast, 120ms)` / `var(--cosmos-t-base, 160ms)`, both `--masonry-ease` | unchanged | **pass, correctly hover/wash-tier, not panel-tier** — this is a micro-feedback reveal riding on an existing card, not a structural panel open/close or a content swap; the kit's panel-duration MUST doesn't reach it. Re-confirmed, not changed. |

## Not touched (explicit non-goals, confirmed out of scope)

- No layout or DOM changes anywhere — every fix in this wave is a `@media
  (hover: hover)` wrapper addition around four already-shipped hover rules
  (with one of them split off its `:focus-within` sibling first), one new
  `transform` transition leg re-pointed to `--mv-lift`, and one new
  `transform: translateY(-1px)` declaration inside an existing hover block.
- `.masonry-card-action:hover` — confirmed N/A (parent hidden on touch), not
  gated; gating it would have been a no-op edit invented for its own sake.
- The `@media (pointer: coarse)` `padding-right: 0` reset on
  `.masonry-card:hover .masonry-card-title` — left as a bare `:hover`
  because it is already inert on real touch devices (no hover capability
  under coarse pointer); not a stuck-state risk, so not a fix candidate.
- No drag surface was built to give the Drag polish rule something to
  satisfy — Masonry has no drag interaction of its own, and building one
  would be new interaction design, forbidden by this wave's non-goals.
- No panel/tab-swap surface was built for the same reason — Masonry owns
  neither.
- `src/all-docs-view.ts`, `src/main.ts` — untouched, byte-identical to their
  pre-wave state (verified via `git diff … | shasum` before and after);
  not audited against §6 per hard constraint (in-flight, uncommitted).

## Style contract — new §6 assertions

Three new assertions added to `src/style-contract.test.ts` (5 pre-existing
→ 8 total), each mechanically derived from a concrete finding above (zero
speculative assertions):

1. **`§6: every phone-reachable .masonry-*:hover rule is gated behind
   @media (hover: hover)`** — a brace-depth scanner (ported from
   obsidian-tabx's `662d11a`, adapted to Masonry's selector prefix) walks
   `styles.css` (comments stripped) tracking whether each bare
   `.masonry-*:hover` rule opens inside an `@media (hover: hover)` block.
   Two narrow, documented exclusions: `.masonry-card-action:hover` (N/A,
   parent hidden on touch) and any selector nested inside an
   `@media (pointer: coarse)` gate (inert there — coarse pointer has no
   hover capability, so no stuck-state risk exists to guard against).
2. **`§6: .masonry-card transform transition eases with --mv-lift, not
   --masonry-ease`** — extracts the base `.masonry-card` rule's `transform`
   transition leg and asserts it names `var(--mv-lift, …)`, not
   `var(--masonry-ease)`, catching a regression back to the pre-fix
   colour-curve easing on a physical-transform property.
3. **`§6: .masonry-card:hover has a physical lift (transform), capped at
   2px`** — extracts the hover block's `translateY(...)` value and asserts
   it is present and within `(0, 2]` px, guarding both "colour alone is not
   enough" and the kit's own lift-magnitude cap.

All 5 pre-existing assertions (raw-value scan, `!important` ceiling, no
`--cosmos-*`/`--mv-*` definitions, the two comment-integrity guards) pass
unmodified.

**Red-before-green, verified this wave**: each of the four concrete fixes
was independently reverted against a byte-checksummed copy of the fixed
file (`shasum 8b494de8281a3e226c5256bc49a3526e3bbd863b`), the corresponding
assertion confirmed to fail and no other assertion affected, then the file
restored and re-verified byte-identical via `shasum` before moving to the
next probe:

| Probe | Result |
|---|---|
| Un-gate `.masonry-retry-button:hover`/`.masonry-reset-button:hover` | `not ok 6` only. **8 / 7 / 1** |
| Revert `.masonry-card`'s transform leg to `var(--masonry-ease)` | `not ok 7` only. **8 / 7 / 1** |
| Remove the `.masonry-card:hover` lift transform | `not ok 8` only. **8 / 7 / 1** |
| Un-gate `.masonry-load-more:hover` | `not ok 6` only. **8 / 7 / 1** |
| *(restored, final state)* | **8 / 8 / 0** |

## Verification

Run on the post-fix tree, exit codes and counts quoted verbatim:

- `pnpm lint` (`eslint src`) — **exit 0**, 0 problems.
- `pnpm test` (`node --experimental-strip-types --test src/*.test.ts`) —
  **tests 41 / pass 41 / fail 0** (38 pre-wave + 3 new §6 assertions in
  `src/style-contract.test.ts`).
- `pnpm build` (`tsc --noEmit && esbuild … production`) — **exit 0**.
- `pnpm release:check` (`lint && test && build`) — **exit 0** end to end.
- `src/release-contract.test.ts` — still green; version **not** bumped
  (`1.3.1` stays pinned in `manifest.json`, `package.json`,
  `versions.json`), per the wave's hard constraint.
- `src/all-docs-view.ts`, `src/main.ts`: `git diff … | shasum` identical
  before and after this wave's edits (`d39bdcc8ce83f78cacb4e154e661104359939ac5`,
  matching on both ends).
- Desktop screenshot / live vault reload: **pending** — no live Obsidian
  reload was run in this session, consistent with wave 3's own scope.
- Phone verification: **pending Mario's on-device sign-off**, same
  constraint as wave 3 — `EmulateMobile` was not used (kills Node-based
  plugins). The phone-side claims in this wave (the three gated hover rules
  stop triggering on touch; `.masonry-card-action:hover`'s N/A status;
  the `padding-right: 0` reset's inertness under coarse pointer) are
  verified by reading the resulting CSS against the kit's phone column and
  against `grep`-confirmed absence of a phone-reachable path, not by
  rendering on-device.
