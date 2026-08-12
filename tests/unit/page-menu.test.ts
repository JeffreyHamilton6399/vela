import { describe, expect, it } from 'vitest';
import {
  buildPageMenu,
  shortenForLabel,
  type PageContext,
  type PageMenuItem,
  type PageMenuState,
} from '../../src/main/menus/page-menu-items.js';

const BARE: PageContext = {
  linkURL: '',
  srcURL: '',
  mediaType: 'none',
  selectionText: '',
  isEditable: false,
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
};

const STATE: PageMenuState = {
  searchEngineId: 'duckduckgo',
  canGoBack: true,
  canGoForward: false,
  isDev: false,
};

const labels = (items: PageMenuItem[]): string[] =>
  items.filter((item) => item.separator !== true).map((item) => item.label ?? '');

const find = (items: PageMenuItem[], label: string): PageMenuItem | undefined =>
  items.find((item) => item.label === label);

describe('buildPageMenu', () => {
  it('offers navigation on bare page, so right-click can go back', () => {
    const items = buildPageMenu(BARE, STATE);

    expect(labels(items)).toEqual(['Back', 'Forward', 'Reload', 'Select All']);
    expect(find(items, 'Back')?.enabled).toBe(true);
    expect(find(items, 'Forward')?.enabled).toBe(false);
  });

  it('offers link actions, including saving it', () => {
    const items = buildPageMenu({ ...BARE, linkURL: 'https://example.com/file.zip' }, STATE);

    expect(labels(items)).toContain('Save Link As…');
    expect(find(items, 'Save Link As…')?.action).toEqual({
      kind: 'download',
      url: 'https://example.com/file.zip',
    });
    expect(find(items, 'Copy Link Address')?.action).toEqual({
      kind: 'copyText',
      text: 'https://example.com/file.zip',
    });
    // Navigation is not padded on when there are link things to show.
    expect(labels(items)).not.toContain('Reload');
  });

  it('offers image actions, including saving it', () => {
    const items = buildPageMenu(
      { ...BARE, mediaType: 'image', srcURL: 'https://example.com/cat.png' },
      STATE,
    );

    expect(find(items, 'Save Image As…')?.action).toEqual({
      kind: 'download',
      url: 'https://example.com/cat.png',
    });
    expect(find(items, 'Copy Image')?.action).toEqual({ kind: 'copyImage' });
  });

  it('offers both when an image is inside a link', () => {
    const items = buildPageMenu(
      {
        ...BARE,
        linkURL: 'https://example.com/photo',
        mediaType: 'image',
        srcURL: 'https://example.com/cat.png',
      },
      STATE,
    );

    expect(labels(items)).toContain('Save Link As…');
    expect(labels(items)).toContain('Save Image As…');
  });

  it('saves video and audio too', () => {
    const video = buildPageMenu(
      { ...BARE, mediaType: 'video', srcURL: 'https://example.com/clip.mp4' },
      STATE,
    );
    expect(labels(video)).toContain('Save Video As…');

    const audio = buildPageMenu(
      { ...BARE, mediaType: 'audio', srcURL: 'https://example.com/song.mp3' },
      STATE,
    );
    expect(labels(audio)).toContain('Save Audio As…');
  });

  it('searches with the engine the user chose, never a hardcoded one', () => {
    const context = { ...BARE, selectionText: 'otters' };

    const duck = buildPageMenu(context, STATE);
    expect(labels(duck)).toContain('Search DuckDuckGo for “otters”');
    const action = find(duck, 'Search DuckDuckGo for “otters”')?.action;
    expect(action?.kind).toBe('openInNewTab');
    expect(action).toHaveProperty('url', expect.stringContaining('duckduckgo.com'));

    const startpage = buildPageMenu(context, { ...STATE, searchEngineId: 'startpage' });
    expect(labels(startpage).join()).toContain('Search Startpage for');
  });

  it('trims a long selection down to something a menu can show', () => {
    const long = 'a'.repeat(200);
    const items = buildPageMenu({ ...BARE, selectionText: long }, STATE);
    const label = labels(items).find((text) => text.startsWith('Search'));

    expect(label?.length).toBeLessThan(60);
    expect(label).toContain('…');
  });

  it('respects the edit flags in a text field', () => {
    const items = buildPageMenu(
      {
        ...BARE,
        isEditable: true,
        editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
      },
      STATE,
    );

    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste', 'Select All']);
    expect(find(items, 'Cut')?.enabled).toBe(false);
    expect(find(items, 'Paste')?.enabled).toBe(true);
  });

  it('prefers the editing menu over the search menu inside a field', () => {
    const items = buildPageMenu({ ...BARE, isEditable: true, selectionText: 'typed text' }, STATE);

    expect(labels(items)).toContain('Paste');
    expect(labels(items).join()).not.toContain('Search');
  });

  it('keeps Inspect Element out of a shipped build', () => {
    expect(labels(buildPageMenu(BARE, STATE))).not.toContain('Inspect Element');
    expect(labels(buildPageMenu(BARE, { ...STATE, isDev: true }))).toContain('Inspect Element');
  });

  it('never starts or ends with a separator', () => {
    const cases: PageContext[] = [
      BARE,
      { ...BARE, linkURL: 'https://example.com' },
      { ...BARE, mediaType: 'image', srcURL: 'https://example.com/a.png' },
      { ...BARE, selectionText: 'hello' },
      { ...BARE, isEditable: true },
    ];

    for (const context of cases) {
      const items = buildPageMenu(context, STATE);
      expect(items[0]?.separator).not.toBe(true);
      expect(items[items.length - 1]?.separator).not.toBe(true);
    }
  });
});

describe('shortenForLabel', () => {
  it('collapses whitespace so a multi-line selection stays one line', () => {
    expect(shortenForLabel('hello \n  world')).toBe('hello world');
  });

  it('leaves a short string alone', () => {
    expect(shortenForLabel('short')).toBe('short');
  });
});
