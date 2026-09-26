import { TabHeaderButton } from './tab-header-button.ts';

/**
 * "Open tab grid" in the native main-area tab bar, next to the built-in "+".
 * `workspace-tab-header-tab-list` is the native wrapper class there, which is
 * what makes the button sit and style like the controls beside it.
 */
export function createTabGridButton(onClick: () => void): TabHeaderButton {
  return new TabHeaderButton({
    mark: 'tabx-tabbar-grid',
    containerSelector: '.mod-root .workspace-tab-header-container',
    anchorSelector: '.workspace-tab-header-new-tab',
    wrapperClass: 'workspace-tab-header-tab-list',
    ariaLabel: 'Open tab grid',
    icon: 'layout-grid',
    onActivate: () => onClick(),
  });
}
