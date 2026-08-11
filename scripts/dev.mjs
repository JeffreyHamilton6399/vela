/**
 * Development driver.
 *
 * Renderer runs on the Vite dev server with HMR; main and preload are rebuilt
 * in watch mode, and Electron is restarted whenever either one changes.
 */
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { build, createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts', mode: 'development' });
await server.listen();
server.printUrls();

const devServerUrl = server.resolvedUrls?.local[0];
if (devServerUrl === undefined) {
  throw new Error('Vite dev server did not report a local URL');
}

/** @type {import('node:child_process').ChildProcess | null} */
let electron = null;
let restarting = false;
let shuttingDown = false;

function startElectron() {
  electron = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VELA_DEV_SERVER_URL: devServerUrl },
  });

  electron.on('exit', (code) => {
    electron = null;
    if (restarting || shuttingDown) return;
    void shutdown(code ?? 0);
  });
}

async function restartElectron() {
  if (shuttingDown || electron === null) {
    if (!shuttingDown && electron === null) startElectron();
    return;
  }
  restarting = true;
  await new Promise((resolve) => {
    electron?.once('exit', resolve);
    electron?.kill();
  });
  restarting = false;
  if (!shuttingDown) startElectron();
}

/** Coalesces main+preload rebuilds into a single restart. */
let restartTimer = null;
function scheduleRestart() {
  if (restartTimer !== null) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartElectron();
  }, 150);
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  electron?.kill();
  await server.close();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

/** Rebuilds one bundle in watch mode; resolves after the first successful pass. */
function watchBundle(name, configFile) {
  return new Promise((resolve, reject) => {
    let first = true;
    void build({
      configFile,
      mode: 'development',
      build: { watch: {} },
      logLevel: 'warn',
    }).then((watcher) => {
      watcher.on('event', (event) => {
        if (event.code === 'ERROR') {
          if (first) reject(event.error);
          else console.error(`[${name}] ${event.error.message}`);
          return;
        }
        if (event.code !== 'BUNDLE_END') return;
        if (first) {
          first = false;
          resolve();
          return;
        }
        process.stdout.write(`\n↻ ${name} changed — restarting Electron\n`);
        scheduleRestart();
      });
    }, reject);
  });
}

await Promise.all([
  watchBundle('main', 'vite.main.config.ts'),
  watchBundle('preload', 'vite.preload.config.ts'),
]);

startElectron();
