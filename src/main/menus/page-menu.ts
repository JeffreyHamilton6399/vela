import {
  clipboard,
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { buildPageMenu, type PageMenuAction } from './page-menu-items.js';

export interface PageMenuOptions {
  window: BrowserWindow;
  contents: WebContents;
  params: ContextMenuParams;
  /** Opens a URL in a new tab beside this one, through the usual https vetting. */
  openInNewTab: (url: string) => void;
  searchEngineId: () => string;
  isDev: boolean;
}

/**
 * The context menu for web content.
 *
 * Native rather than a React popup, for the same reason the tab menu is: an OS
 * menu floats above the `WebContentsView`, where a menu drawn by the chrome
 * renderer would be painted underneath the page.
 *
 * What goes in it is decided by `buildPageMenu`, which is plain data and unit
 * tested. This file only performs what that decided.
 *
 * "Save as" goes through `downloadURL`, so it lands in the session's own
 * download handler — the same path, folder and downloads list as clicking a
 * download link, rather than a second way of saving files.
 */
export function popupPageMenu(options: PageMenuOptions): void {
  const { params, contents } = options;

  const perform = (action: PageMenuAction): void => {
    switch (action.kind) {
      case 'openInNewTab':
        options.openInNewTab(action.url);
        return;
      case 'copyText':
        clipboard.writeText(action.text);
        return;
      case 'download':
        contents.downloadURL(action.url);
        return;
      case 'copyImage':
        contents.copyImageAt(params.x, params.y);
        return;
      case 'edit':
        if (action.command === 'cut') contents.cut();
        else if (action.command === 'copy') contents.copy();
        else if (action.command === 'paste') contents.paste();
        else contents.selectAll();
        return;
      case 'navigate':
        if (action.command === 'back') contents.navigationHistory.goBack();
        else if (action.command === 'forward') contents.navigationHistory.goForward();
        else contents.reload();
        return;
      case 'inspect':
        contents.inspectElement(params.x, params.y);
        return;
    }
  };

  const template: MenuItemConstructorOptions[] = buildPageMenu(
    {
      linkURL: params.linkURL,
      srcURL: params.srcURL,
      mediaType: params.mediaType,
      selectionText: params.selectionText,
      isEditable: params.isEditable,
      editFlags: {
        canCut: params.editFlags.canCut,
        canCopy: params.editFlags.canCopy,
        canPaste: params.editFlags.canPaste,
        canSelectAll: params.editFlags.canSelectAll,
      },
    },
    {
      searchEngineId: options.searchEngineId(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      isDev: options.isDev,
    },
  ).map((item) => {
    if (item.separator === true) return { type: 'separator' };

    const { action } = item;
    return {
      label: item.label ?? '',
      ...(item.accelerator === undefined ? {} : { accelerator: item.accelerator }),
      ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
      ...(action === undefined
        ? {}
        : {
            click: () => {
              perform(action);
            },
          }),
    };
  });

  Menu.buildFromTemplate(template).popup({ window: options.window });
}
