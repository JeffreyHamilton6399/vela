import { useEffect } from 'react';
import type { BrowserState } from '../../shared/types/ipc.js';

export interface ShortcutActions {
  focusAddressBar: () => void;
  togglePalette: () => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeOverlays: () => void;
}

/** Cmd on macOS, Ctrl everywhere else. */
function primaryModifier(event: KeyboardEvent): boolean {
  return window.vela.platform === 'darwin' ? event.metaKey : event.ctrlKey;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}

/**
 * Chrome-level keyboard shortcuts. These fire while focus is in Vela's own UI;
 * shortcuts that must work while a page has focus are registered as
 * accelerators in the main process instead.
 */
export function useKeyboardShortcuts(state: BrowserState, actions: ShortcutActions): void {
  useEffect(() => {
    const activeId = state.activeTabId;

    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = primaryModifier(event);
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        actions.closeOverlays();
        return;
      }

      if (mod && event.shiftKey) {
        if (key === 't') {
          event.preventDefault();
          window.vela.tabs.restoreClosed();
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          window.vela.window.openPrivate();
          return;
        }
      }

      if (mod && !event.shiftKey) {
        switch (key) {
          case '=':
          case '+':
            event.preventDefault();
            if (activeId !== null) window.vela.zoom.set(activeId, 'in');
            return;
          case '-':
            event.preventDefault();
            if (activeId !== null) window.vela.zoom.set(activeId, 'out');
            return;
          case '0':
            event.preventDefault();
            if (activeId !== null) window.vela.zoom.set(activeId, 'reset');
            return;
          case 'k':
            event.preventDefault();
            actions.togglePalette();
            return;
          case 'b':
            event.preventDefault();
            actions.toggleSidebar();
            return;
          case ',':
            event.preventDefault();
            actions.openSettings();
            return;
          case 't':
            event.preventDefault();
            window.vela.tabs.create();
            return;
          case 'w':
            event.preventDefault();
            if (activeId !== null) window.vela.tabs.close(activeId);
            return;
          case 'l':
            event.preventDefault();
            actions.focusAddressBar();
            return;
          case 'r':
            event.preventDefault();
            if (activeId !== null) window.vela.tabs.reload(activeId, event.shiftKey);
            return;
          default:
            break;
        }
      }

      // Anything below here would fight with typing.
      if (isTypingTarget(event.target)) return;

      if (key === 'f5') {
        event.preventDefault();
        if (activeId !== null) window.vela.tabs.reload(activeId);
        return;
      }

      if (event.altKey && key === 'arrowleft') {
        event.preventDefault();
        if (activeId !== null) window.vela.tabs.goBack(activeId);
        return;
      }

      if (event.altKey && key === 'arrowright') {
        event.preventDefault();
        if (activeId !== null) window.vela.tabs.goForward(activeId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [state.activeTabId, actions]);
}
