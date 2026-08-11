/**
 * Builds the ad/tracker blocking engine that ships with the app.
 *
 * This runs at BUILD time, on purpose. Vela makes exactly two kinds of network
 * request at runtime — pages the user navigated to, and the update check — so
 * it can never go and fetch a filter list on its own. The lists are compiled
 * into `resources/adblock-engine.bin` here and refreshed with app updates.
 *
 *   node scripts/fetch-filters.mjs
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ElectronBlocker } from '@ghostery/adblocker-electron';

/** `--if-missing` keeps repeat builds offline; `npm run filters:update` refreshes. */
const ifMissing = process.argv.includes('--if-missing');

const LISTS = [
  { name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
  { name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
];

const OUT_DIR = path.resolve(process.cwd(), 'resources');
const ENGINE_PATH = path.join(OUT_DIR, 'adblock-engine.bin');
const MANIFEST_PATH = path.join(OUT_DIR, 'adblock-engine.json');

async function download({ name, url }) {
  process.stdout.write(`  fetching ${name} … `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${String(response.status)}`);
  const text = await response.text();
  process.stdout.write(`${String(Math.round(text.length / 1024))} KiB\n`);
  return text;
}

if (ifMissing) {
  try {
    await access(ENGINE_PATH);
    process.stdout.write('▸ blocking engine already built — skipping\n');
    process.exit(0);
  } catch {
    // Not built yet; fall through and build it.
  }
}

await mkdir(OUT_DIR, { recursive: true });

process.stdout.write('▸ building the blocking engine\n');
const sources = await Promise.all(LISTS.map(download));

const blocker = ElectronBlocker.parse(sources.join('\n'), {
  enableCompression: true,
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
});

const serialized = blocker.serialize();
await writeFile(ENGINE_PATH, serialized);
await writeFile(
  MANIFEST_PATH,
  `${JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      lists: LISTS.map((list) => list.url),
      bytes: serialized.byteLength,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `✓ ${path.relative(process.cwd(), ENGINE_PATH)} (${String(Math.round(serialized.byteLength / 1024))} KiB)\n`,
);
