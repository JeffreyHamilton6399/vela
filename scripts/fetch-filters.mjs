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
import { get } from 'node:https';
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

const MAX_ATTEMPTS = 4;
const REDIRECT_LIMIT = 5;

/**
 * A plain https GET, rather than `fetch`.
 *
 * `fetch` is undici underneath, and undici can trip an internal
 * `assert(!this.paused)` from inside a socket event handler when a connection
 * ends mid-body. That throw arrives outside the promise chain, so no `await`
 * and no try/catch around the call can catch it — the process just dies, which
 * is what took out the first Windows build of these lists. `node:https` hands
 * the failure back as an event on the request, where it can be retried.
 */
function fetchText(url, redirectsLeft = REDIRECT_LIMIT) {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { 'user-agent': 'vela-build' } }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      if (status >= 300 && status < 400 && location !== undefined) {
        response.resume();
        if (redirectsLeft === 0) {
          reject(new Error(`too many redirects for ${url}`));
          return;
        }
        fetchText(new URL(location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${String(status)}`));
        return;
      }

      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve(body);
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(60_000, () => {
      request.destroy(new Error('timed out'));
    });
  });
}

async function download({ name, url }) {
  process.stdout.write(`  fetching ${name} … `);

  for (let attempt = 1; ; attempt += 1) {
    try {
      const text = await fetchText(url);
      process.stdout.write(`${String(Math.round(text.length / 1024))} KiB\n`);
      return text;
    } catch (error) {
      // A build that fails because someone else's CDN blinked is not a broken
      // build. It only gives up once the list is genuinely unreachable.
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      process.stdout.write(`retrying (${String(attempt)}) … `);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
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
