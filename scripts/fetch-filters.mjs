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

/**
 * The lists, each with somewhere else to get it.
 *
 * `easylist.to` is the home of both, and it is one host: when it is down or
 * rate-limiting, a build that only knows that address simply fails, and the
 * failure looks like Vela's rather than like someone else's web server having
 * a bad afternoon. The alternates are the Adblock Plus download mirrors, which
 * publish the same two lists from the same maintainers.
 *
 * Exact byte-equality is not needed and is not claimed. Nothing here is
 * checksummed against a constant — the text is compiled into an engine and the
 * engine is what ships — so a mirror a few hours out of step is a perfectly
 * good answer, and a much better one than no engine at all.
 */
const LISTS = [
  {
    name: 'EasyList',
    urls: [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist-downloads.adblockplus.org/easylist.txt',
    ],
  },
  {
    name: 'EasyPrivacy',
    urls: [
      'https://easylist.to/easylist/easyprivacy.txt',
      'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
    ],
  },
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

/** Everything that went wrong for one list, as one line worth reading. */
function describeFailure(name, failures) {
  // One line per address, not one per attempt: four identical DNS failures
  // against the same host say nothing the first one did not.
  const lastPerUrl = new Map();
  for (const failure of failures) lastPerUrl.set(failure.url, failure);

  const reasons = [...lastPerUrl.values()]
    .map(({ url, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      // An AggregateError from a refused connection carries its detail in
      // `errors` and nothing in `message`, which produced "EasyList: " and no
      // reason at all — the exact unhelpfulness that hid a bug in this file.
      const detail =
        message !== ''
          ? message
          : Array.isArray(error?.errors) && error.errors.length > 0
            ? error.errors.map((inner) => inner.code ?? String(inner)).join(', ')
            : (error?.code ?? 'no reason given');
      return `${url} (${detail})`;
    })
    .join('; ');
  return `${name}: every source failed — ${reasons}`;
}

async function download({ name, urls }) {
  process.stdout.write(`  fetching ${name} … `);
  const failures = [];

  // Each address gets the full run of attempts before the next is tried, so a
  // host that is merely slow is not abandoned for one that may be worse.
  for (const [index, url] of urls.entries()) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const text = await fetchText(url);
        // A truncated response or an error page would parse into a useless
        // engine rather than failing, so the shape is checked before it is
        // accepted.
        if (!text.includes('[Adblock')) throw new Error('not a filter list');
        process.stdout.write(
          `${String(Math.round(text.length / 1024))} KiB${index > 0 ? ' (mirror)' : ''}\n`,
        );
        return text;
      } catch (error) {
        failures.push({ url, error });
        if (attempt < MAX_ATTEMPTS) {
          process.stdout.write(`retrying (${String(attempt)}) … `);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    if (index < urls.length - 1) process.stdout.write('mirror … ');
  }

  // A build that fails because someone else's CDN blinked is not a broken
  // build. It only gives up once every address for the list is unreachable.
  process.stdout.write('\n');
  throw new Error(describeFailure(name, failures), { cause: failures[0]?.error });
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
      lists: LISTS.flatMap((list) => list.urls),
      bytes: serialized.byteLength,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `✓ ${path.relative(process.cwd(), ENGINE_PATH)} (${String(Math.round(serialized.byteLength / 1024))} KiB)\n`,
);
