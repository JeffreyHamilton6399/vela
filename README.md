# Vela

A privacy-focused desktop web browser. Electron + TypeScript, runs entirely on your machine — no servers, no backend, no telemetry.

> **Status: stage 1 of 8.** The window shell, preload bridge, and typed IPC skeleton are in place. Web content arrives in stage 2.

## Commands

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Vite dev server + HMR for the UI; restarts Electron on main changes |
| `npm run build`     | Builds `main`, `preload`, and `renderer` into `out/`                |
| `npm start`         | Builds, then launches the app                                      |
| `npm run typecheck` | `tsc` over the Node and DOM projects separately                    |
| `npm run lint`      | ESLint, with `eslint-plugin-security` on main and preload          |
| `npm test`          | Vitest — main-process logic                                        |
| `npm run test:e2e`  | Playwright — launches the real app                                 |
| `npm run verify`    | typecheck → lint → test, in that order                             |

## Layout

```
src/
  shared/types/ipc.ts   every channel and payload schema — the single contract
  shared/platform.ts    narrows process.platform to darwin | win32 | linux
  main/                 window lifecycle, IPC registration, privileged work
    ipc/contract-guard  the zod validation boundary; nothing crosses unchecked
  preload/              the only bridge; exposes window.vela, never ipcRenderer
  renderer/             React + Tailwind. Browser UI only, never web content.
tests/
  unit/                 Vitest, no Electron required
  e2e/                  Playwright, drives the built app
```

## How the IPC contract works

`src/shared/types/ipc.ts` names every channel and gives every payload a zod schema. Main and renderer both import it, so a channel that isn't in that file does not exist.

At the main-process boundary, `contract-guard.ts` validates three things on every message: that the sender is Vela's own chrome, that the argument count matches, and that the payload parses. Invoke responses are validated on the way out too, so a handler that returns the wrong shape fails here rather than in the UI.

The renderer never sees `ipcRenderer`. It sees `window.vela`, which has exactly three keys.

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` — asserted by unit tests on every platform, and by an E2E test that confirms `require`, `process`, and `ipcRenderer` are all absent from the renderer.

The chrome renderer ships a `default-src 'none'; connect-src 'none'` CSP in production and cannot navigate or open windows. Fonts are system fonts: no CDN, no Google Fonts, no request the user didn't ask for.

**Never commit tokens, keys, or credentials.** `.gitignore` covers `.env*` and key material. Releases publishing (stage 8) uses the `GITHUB_TOKEN` that GitHub Actions injects automatically — no personal access token is needed anywhere in this project.

## Design notes

One spacing unit is 8px (`--spacing: 0.5rem`), so every integer Tailwind spacing utility lands on the grid by construction. The Instagram gradient is defined once as `--vela-gradient` and used in exactly two places: focus rings, and the active tab indicator once tabs exist. Dark mode follows the OS via `data-theme` on `<html>`, which stage 7's settings panel will override directly.
