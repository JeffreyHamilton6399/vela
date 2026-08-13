import { describe, expect, it } from 'vitest';
import { panelsWithIcon } from '../../src/main/panels/panel-icons.js';
import type { WebPanel } from '../../src/shared/settings.js';

const GMAIL = 'data:image/png;base64,gmail';
const SLACK = 'data:image/png;base64,slack';

function panels(): WebPanel[] {
  return [
    { id: 'a', url: 'https://mail.google.com', title: 'Gmail', icon: null },
    { id: 'b', url: 'https://app.slack.com/client', title: 'Slack', icon: SLACK },
  ];
}

describe('panelsWithIcon', () => {
  it('gives a docked site its icon', () => {
    const next = panelsWithIcon(panels(), 'a', GMAIL);
    expect(next?.map((panel) => panel.icon)).toEqual([GMAIL, SLACK]);
  });

  it('leaves every other site alone', () => {
    const next = panelsWithIcon(panels(), 'a', GMAIL);
    expect(next?.[1]).toEqual(panels()[1]);
  });

  /**
   * The caller writes the settings file with whatever comes back, and the file
   * wakes every window. "No change" has to be distinguishable from "here is the
   * same list again", or docking a site would rewrite it on every icon report.
   */
  it('says nothing changed when the icon is already the one it has', () => {
    expect(panelsWithIcon(panels(), 'b', SLACK)).toBeNull();
  });

  it('says nothing changed for a site that has since been undocked', () => {
    expect(panelsWithIcon(panels(), 'gone', GMAIL)).toBeNull();
  });

  it('replaces an icon that has changed', () => {
    const next = panelsWithIcon(panels(), 'b', GMAIL);
    expect(next?.[1]?.icon).toBe(GMAIL);
  });

  it('does not mutate the list it was given', () => {
    const original = panels();
    panelsWithIcon(original, 'a', GMAIL);
    expect(original[0]?.icon).toBeNull();
  });
});
