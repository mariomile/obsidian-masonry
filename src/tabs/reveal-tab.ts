/**
 * With the scrolling tab bar on, the native strip never scrolls itself: the
 * active tab can sit past the right edge, cut down to a few letters or out of
 * sight. This computes the scroll that brings it fully into view, moving as
 * little as possible. Pure, so it is testable without a workspace.
 */
export interface Span {
  left: number;
  right: number;
}

export function revealScrollLeft(current: number, strip: Span, tab: Span): number {
  if (tab.left < strip.left) return current - (strip.left - tab.left);
  if (tab.right > strip.right) {
    // A tab wider than the strip shows its start, not its end.
    const overshoot = Math.min(tab.right - strip.right, tab.left - strip.left);
    return current + overshoot;
  }
  return current;
}
