/**
 * Launches the built app, optionally opens some pages, and writes a PNG.
 * Handy for eyeballing chrome changes without babysitting a window.
 *
 *   node scripts/screenshot.mjs out.png [url ...]
 *   node scripts/screenshot.mjs out.png --keys "Control+b" --wait 800
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron as electron } from '@playwright/test';

const args = process.argv.slice(2);
const outfile = args.shift();
if (outfile === undefined) {
  console.error('usage: node scripts/screenshot.mjs <out.png> [url ...] [--keys "Control+b"]');
  process.exit(1);
}

const keys = [];
const urls = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--keys') {
    const value = args[i + 1];
    if (value !== undefined) keys.push(value);
    i += 1;
  } else {
    urls.push(args[i]);
  }
}

const root = process.cwd();
const targets = urls.map((url) =>
  /^[a-z]+:/i.test(url) ? url : pathToFileURL(path.resolve(root, url)).href,
);

const app = await electron.launch({
  args: [root],
  // A throwaway profile, so screenshots never touch real settings.
  env: { ...process.env, VELA_USER_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'vela-shot-')) },
});
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

for (const combo of keys) {
  await page.waitForTimeout(300);
  await page.keyboard.press(combo);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: path.resolve(root, outfile) });
await app.close();

console.log(`wrote ${outfile}`);
