/**
 * What belongs in the page context menu, as plain data.
 *
 * Kept free of Electron so the decision — which is all this is — can be
 * asserted by unit tests rather than trusted by comment, in the manner of
 * `privacy/policies.ts`. `page-menu.ts` turns the result into a native menu
 * and performs the actions.
 */
import { buildSearchUrl, findSearchEngine } from '../../shared/search-engines.js';

export type PageMenuAction =
  | { kind: 'openInNewTab'; url: string }
  | { kind: 'copyText'; text: string }
  | { kind: 'download'; url: string }
  | { kind: 'copyImage' }
  | { kind: 'edit'; command: 'cut' | 'copy' | 'paste' | 'selectAll' }
  | { kind: 'navigate'; command: 'back' | 'forward' | 'reload' }
  | { kind: 'inspect' };

export interface PageMenuItem {
  /** Absent on a separator. */
  label?: string;
  separator?: boolean;
  enabled?: boolean;
  accelerator?: string;
  action?: PageMenuAction;
}

/** The parts of Electron's `ContextMenuParams` the menu actually reads. */
export interface PageContext {
  linkURL: string;
  srcURL: string;
  mediaType: string;
  selectionText: string;
  isEditable: boolean;
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

export interface PageMenuState {
  searchEngineId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isDev: boolean;
}

/** Enough of the selection to read in a menu label, without spilling out of it. */
export function shortenForLabel(text: string, limit = 32): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

const separator: PageMenuItem = { separator: true };

/**
 * Builds the menu from what was under the pointer.
 *
 * A right-click on a link offers link things and a right-click on bare page
 * offers navigation, rather than one long menu with most of it greyed out.
 */
export function buildPageMenu(context: PageContext, state: PageMenuState): PageMenuItem[] {
  const items: PageMenuItem[] = [];
  const section = (): void => {
    if (items.length > 0) items.push(separator);
  };

  if (context.linkURL !== '') {
    items.push(
      { label: 'Open Link in New Tab', action: { kind: 'openInNewTab', url: context.linkURL } },
      separator,
      { label: 'Copy Link Address', action: { kind: 'copyText', text: context.linkURL } },
      { label: 'Save Link As…', action: { kind: 'download', url: context.linkURL } },
    );
  }

  if (context.mediaType === 'image' && context.srcURL !== '') {
    section();
    items.push(
      { label: 'Open Image in New Tab', action: { kind: 'openInNewTab', url: context.srcURL } },
      { label: 'Copy Image', action: { kind: 'copyImage' } },
      { label: 'Copy Image Address', action: { kind: 'copyText', text: context.srcURL } },
      { label: 'Save Image As…', action: { kind: 'download', url: context.srcURL } },
    );
  }

  if ((context.mediaType === 'video' || context.mediaType === 'audio') && context.srcURL !== '') {
    section();
    items.push({
      label: context.mediaType === 'video' ? 'Save Video As…' : 'Save Audio As…',
      action: { kind: 'download', url: context.srcURL },
    });
  }

  if (context.isEditable) {
    section();
    items.push(
      {
        label: 'Cut',
        accelerator: 'CommandOrControl+X',
        enabled: context.editFlags.canCut,
        action: { kind: 'edit', command: 'cut' },
      },
      {
        label: 'Copy',
        accelerator: 'CommandOrControl+C',
        enabled: context.editFlags.canCopy,
        action: { kind: 'edit', command: 'copy' },
      },
      {
        label: 'Paste',
        accelerator: 'CommandOrControl+V',
        enabled: context.editFlags.canPaste,
        action: { kind: 'edit', command: 'paste' },
      },
      {
        label: 'Select All',
        accelerator: 'CommandOrControl+A',
        enabled: context.editFlags.canSelectAll,
        action: { kind: 'edit', command: 'selectAll' },
      },
    );
  } else if (context.selectionText.trim() !== '') {
    section();
    const engine = findSearchEngine(state.searchEngineId);
    const selection = context.selectionText.trim();

    items.push(
      {
        label: 'Copy',
        accelerator: 'CommandOrControl+C',
        action: { kind: 'edit', command: 'copy' },
      },
      {
        // The engine you chose, not a hardcoded one: a browser that quietly
        // sends your selected text somewhere you did not pick would undo the
        // point of the first-run screen.
        label: `Search ${engine.name} for “${shortenForLabel(selection)}”`,
        action: { kind: 'openInNewTab', url: buildSearchUrl(engine, selection) },
      },
    );
  }

  // Bare page: navigation, so a right-click is a usable way to go back.
  if (items.length === 0) {
    items.push(
      { label: 'Back', enabled: state.canGoBack, action: { kind: 'navigate', command: 'back' } },
      {
        label: 'Forward',
        enabled: state.canGoForward,
        action: { kind: 'navigate', command: 'forward' },
      },
      {
        label: 'Reload',
        accelerator: 'CommandOrControl+R',
        action: { kind: 'navigate', command: 'reload' },
      },
      separator,
      {
        label: 'Select All',
        accelerator: 'CommandOrControl+A',
        action: { kind: 'edit', command: 'selectAll' },
      },
    );
  }

  if (state.isDev) {
    items.push(separator, { label: 'Inspect Element', action: { kind: 'inspect' } });
  }

  return items;
}
