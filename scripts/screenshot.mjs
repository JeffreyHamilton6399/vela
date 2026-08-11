/**
 * Launches the built app, optionally opens some pages, and writes a PNG.
 * Handy for eyeballing chrome changes without babysitting a window.
 *
 *   node scripts/screenshot.mjs out.png [url ...]
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron as electron } from '@playwright/test';

const [outfile, ...urls] = process.argv.slice(2);
if (outfile === undefined) {
  console.error('usage: node scripts/screenshot.mjs <out.png> [url ...]');
  process.exit(1);
}

const root = process.cwd();
const targets = urls.map((url) =>
  /^[a-z]+:/i.test(url) ? url : pathToFileURL(path.resolve(root, url)).href,
);

const app = await electron.launch({ args: [root] });
const page = await app.firstWindow();
await page.waitForSelector('[role="tablist"]');

if (targets.length > 0) {
  await page.evaluate(async (list) => {
    const { tabs } = globalThis.vela;
    const state = await tabs.getState();
    tabs.navigate(state.activeTabId, list[0]);
    for (const url of list.slice(1)) tabs.create({ url });
  }, targets);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: path.resolve(root, outfile) });
await app.close();

console.log(`wrote ${outfile}`);
