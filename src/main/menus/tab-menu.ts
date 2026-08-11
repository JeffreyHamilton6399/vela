import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { TabManager } from '../tabs/tab-manager.js';

/**
 * The tab context menu is a native menu rather than a React popup: an OS menu
 * floats above the `WebContentsView`, where an HTML dropdown drawn by the
 * chrome renderer would be painted underneath it.
 */
export function popupTabMenu(window: BrowserWindow, manager: TabManager, id: string): void {
  const tab = manager.find(id);
  if (tab === null) return;

  const onlyTab = manager.count <= 1;

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'New Tab',
      accelerator: 'CommandOrControl+T',
      click: () => {
        manager.create();
      },
    },
    {
      label: 'Duplicate Tab',
      click: () => {
        manager.duplicate(id);
      },
    },
    { type: 'separator' },
    {
      label: tab.pinned ? 'Unpin Tab' : 'Pin Tab',
      click: () => {
        manager.setPinned(id, !tab.pinned);
      },
    },
    { type: 'separator' },
    {
      label: 'Reopen Closed Tab',
      accelerator: 'CommandOrControl+Shift+T',
      enabled: manager.hasClosedTabs,
      click: () => {
        manager.restoreClosed();
      },
    },
    {
      label: 'Close Other Tabs',
      enabled: !onlyTab,
      click: () => {
        manager.closeOthers(id);
      },
    },
    {
      label: 'Close Tab',
      accelerator: 'CommandOrControl+W',
      click: () => {
        manager.close(id);
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window });
}
