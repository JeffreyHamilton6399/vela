# Vela

A privacy-focused desktop web browser. Electron + TypeScript, distributed as a free download via GitHub Releases. No servers, no backend, no accounts — it runs entirely on your machine.

The privacy posture of DuckDuckGo, the visual language of Instagram, the feature set of Opera.

## Install

Download from [Releases](https://github.com/vela-browser/vela/releases/latest): `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux.

Builds are **not code-signed yet**, so the first launch will be met with a warning:

- **Windows** — SmartScreen says “Windows protected your PC”. Click _More info_ → _Run anyway_.
- **macOS** — Gatekeeper says Vela “cannot be opened because it is from an unidentified developer”. Right-click the app → _Open_ → confirm. Or `xattr -dr com.apple.quarantine /Applications/Vela.app`.
- **Linux** — `chmod +x Vela-*.AppImage` before running it.

## What Vela collects

Nothing. There is no account, no server, and no analytics.

Vela makes exactly **two** kinds of network request:

1. the pages you navigate to, and
2. one check of the GitHub Releases feed — a plain GET, no query parameters, no install identifier, and a user agent that is the version string and nothing else.

There is no third. In development, a `session.webRequest` assertion logs any request that is neither, so accidental telemetry surfaces while building rather than after shipping.

Everything Vela remembers lives in one local JSON file. The settings panel prints its path, and the export button hands you its contents verbatim.

## Commands

| Command                  | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server + HMR for the UI; restarts Electron on main changes |
| `npm run build`          | Builds `main`, `preload` and `renderer` into `out/`                 |
| `npm start`              | Builds, then launches the app                                       |
| `npm run package`        | Builds an installer for this platform into `release/`               |
| `npm run release`        | Builds and publishes to GitHub Releases (CI uses this)              |
| `npm run filters:update` | Recompiles the ad/tracker engine from EasyList + EasyPrivacy        |
| `npm run typecheck`      | `tsc` over the Node, DOM and E2E projects separately                |
| `npm run lint`           | ESLint, zero warnings tolerated                                     |
| `npm test`               | Vitest — the pure logic                                             |
| `npm run test:e2e`       | Playwright — drives the real app                                    |
| `npm run verify`         | typecheck → lint → test, in that order                              |

`node scripts/screenshot.mjs out.png [url…] [--keys "Control+k"]` launches the built app against a throwaway profile and writes a PNG, which is the quickest way to look at a chrome change.

## Layout

```
src/
  shared/                 imported by both sides of the bridge
    types/ipc.ts          every channel and payload schema — the single contract
    address-input.ts      what happens when you type: URL, search, or bang
    bangs.ts              !yt !gh !w …, resolved on this machine
    settings.ts           the whole persisted shape, as one zod schema
    tools/                calculator and unit conversion, both pure
  main/
    vela-window.ts        one window: its chrome, its tabs, its session
    tabs/                 tab lifecycle, ordering, layout, suspension policy
    privacy/              policies (pure), session hardening, the blocker
    favicons/             icons cached locally as data URLs
    ipc/contract-guard.ts the zod validation boundary
  preload/                the only bridge; exposes window.vela, never ipcRenderer
  renderer/               React + Tailwind. Browser UI only, never web content.
tests/
  unit/                   Vitest, no Electron required
  e2e/                    Playwright, drives the built and packaged app
```

## How it fits together

**The IPC contract.** `src/shared/types/ipc.ts` names every channel and gives every payload a zod schema. Both sides import it, so a channel that isn't in that file does not exist. At the main-process boundary, `contract-guard.ts` checks three things on every message: that the sender is one of Vela's own windows, that the argument count matches, and that the payload parses. Invoke responses are validated on the way out too, so a handler returning the wrong shape fails there rather than in the UI.

**Web content.** One `WebContentsView` per tab, positioned by main from insets the renderer reports. Insets rather than a rectangle, so a window resize is handled in main without waiting for a round trip. Vela's own pages — the new tab page, the plain-http interstitial — are drawn by the chrome renderer instead of being loaded into a view, which keeps them off the web-content security surface entirely.

**Suspension.** A suspended tab genuinely hands its renderer process back; it survives as title, address and cached icon until you open it again. Switching workspace suspends everything you left behind.

**Favicons.** Downloaded through the page's own session, re-encoded through `nativeImage` at 32px, and stored as data URLs. The chrome renderer's CSP is `img-src 'self' data:`, so a remote favicon could not be drawn even if one leaked through — and the tab strip can't become a side channel telling a site how often you look at your own tabs.

**Ad blocking.** EasyList and EasyPrivacy are compiled into `resources/adblock-engine.bin` at build time by `scripts/fetch-filters.mjs`. Vela never fetches a filter list at runtime — that would be a third category of request. Lists refresh by shipping a new build.

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` — asserted by unit tests on every platform, and by an E2E test that confirms `require`, `process` and `ipcRenderer` are all absent from the renderer.

The chrome renderer ships a `default-src 'none'; connect-src 'none'` CSP in production, cannot navigate, and cannot open windows. ESLint forbids `fetch`, `XMLHttpRequest` and `WebSocket` in renderer source: if the chrome can reach the network, the two-request promise is already broken.

The sidebar calculator is a hand-written tokenizer and shunting-yard evaluator rather than `eval` — otherwise it would be a code-execution path fed by whatever is in the clipboard. A test asserts that `globalThis`, `require("fs")` and friends are rejected rather than run.

**Never commit tokens, keys or credentials.** `.gitignore` covers `.env*` and key material. Publishing uses the `GITHUB_TOKEN` that Actions injects automatically — no personal access token is needed anywhere in this project.

## Design notes

One spacing unit is 8px (`--spacing: 0.5rem`), so every integer Tailwind spacing utility lands on the grid by construction rather than by convention. The Instagram gradient is defined once as `--vela-gradient` and appears in exactly two places: the active tab indicator and focus rings. Fonts are the system stack — no CDN, no Google Fonts, no request you didn't ask for. Dark mode follows the OS by default and is overridable in settings.

## CI

`.github/workflows/ci.yml` runs typecheck → lint → format → unit tests, then the Playwright suite on a Windows / macOS / Linux matrix.

`.github/workflows/release.yml` fires on a `v*` tag: it runs the same gates, then builds installers on all three platforms and attaches them to the Release, and deploys `docs/` to GitHub Pages.
