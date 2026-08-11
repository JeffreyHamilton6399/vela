# Vela

A privacy-focused desktop web browser. Electron + TypeScript, distributed as a free download via GitHub Releases. No servers, no backend, no accounts — it runs entirely on your machine.

The privacy posture of DuckDuckGo, the visual language of Instagram, the feature set of Opera.

## Install

Download from **[jeffreyhamilton6399.github.io/vela](https://jeffreyhamilton6399.github.io/vela/)** or [Releases](https://github.com/JeffreyHamilton6399/vela/releases/latest): `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux.

Builds are **not code-signed yet**, so the first launch will be met with a warning:

- **Windows** — SmartScreen says “Windows protected your PC”. Click _More info_ → _Run anyway_.
- **macOS** — Gatekeeper says Vela “cannot be opened because it is from an unidentified developer”. Right-click the app → _Open_ → confirm. Or `xattr -dr com.apple.quarantine /Applications/Vela.app`.
- **Linux** — `chmod +x Vela-*.AppImage` before running it.

## What Vela collects

Nothing. There is no account, no server, and no analytics.

Out of the box Vela makes exactly **two** kinds of network request:

1. the pages you navigate to, and
2. one check of the GitHub Releases feed — a plain GET, no query parameters, no install identifier, and a user agent that is the version string and nothing else.

A **third** appears only if you go out of your way: switching the assistant from its local default to a hosted service. Left alone it talks to a model on your own machine, which is not the internet at all. In development, a `session.webRequest` assertion logs any request that is none of these, so accidental telemetry surfaces while building rather than after shipping.

Everything Vela remembers lives in one local JSON file. The settings panel prints its path, and the export button hands you its contents verbatim.

## What it does

- **First-run screen** that asks where your searches should go — DuckDuckGo, Startpage, Brave, Ecosia, Google or Bing — and says plainly which of them build a profile from them.
- **Tabs** with drag reordering, pinning, restore-last-closed, and native context menus.
- **Workspaces**: named tab groups. Leaving one suspends its tabs, so an idle workspace costs storage for its titles and nothing else.
- **Speed Dial** new tab page with locally cached favicons.
- **Bookmarks** with a bar, **local history** that feeds the command palette, and a **downloads** list.
- **Per-site zoom** that sticks (`Ctrl+=` / `Ctrl+-` / `Ctrl+0`).
- **Command palette** (`Ctrl+K`), **sidebar tools** (`Ctrl+B` — assistant, notes, calculator, unit converter), and **bang shortcuts** (`!gh`, `!yt`, `!w`) resolved on this machine.
- **Private windows** (`Ctrl+Shift+N`) on a memory-only session.
- An **Opera-style left rail**: workspaces at the top, sidebar tools below, privacy and settings pinned to the bottom.

### The assistant runs locally by default

The sidebar assistant defaults to **Ollama on your own machine** — no key, no account, and no request that leaves the computer. Install Ollama, `ollama pull llama3.2`, and the panel works.

The alternative is a hosted service using **a key you paste into Settings**. Vela ships without one and could not usefully ship with one: this is a downloadable app, so an embedded key sits in `app.asar` for anyone who unzips it and bills whoever put it there.

Only the hosted option adds a network destination beyond the two above, which is why it is not the default.

### Web panels

Dock a site into the sidebar from the rail's globe button, the way Opera does. Each panel is an ordinary `WebContentsView` on the same hardened session a tab uses — same sandbox, same blocking, same referer policy, no preload — simply positioned into the sidebar rectangle. Only the visible panel exists; closing it destroys the view rather than leaving a hidden renderer running.

### What Vela deliberately does not have

- **No built-in VPN.** A browser-branded "free VPN" is someone else's server seeing all your traffic — the opposite of the point, and it needs infrastructure Vela does not run. Settings has a proxy field instead: point it at a proxy or VPN you already trust and every session goes through it.
- **No account, no sign-in, no sync.** An email-and-password login that carries your data between installs needs a server holding that data, and an account tying it to you. Vela has neither, on purpose — an account is the single thing that turns "a browser on your machine" into "a profile someone else keeps". Settings → _Export_ hands you the whole JSON file to move yourself.

Not yet: find in page. It is written, but Chromium's `found-in-page` event does not reach a listener registered from the app's own main bundle in this configuration, so it was removed rather than shipped as a search box that never counts matches.

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

> **The workflows are parked and not running yet.** They live at
> `ci/github-workflows/` rather than `.github/workflows/`, because GitHub refuses a
> push that touches workflow files unless the pushing token carries the `workflow`
> scope. To switch them on:
>
> ```sh
> gh auth refresh -s workflow
> git mv ci/github-workflows .github/workflows
> git commit -m "Enable CI" && git push
> ```
>
> Until then, `npm run verify` and `npm run test:e2e` are the gates, run locally,
> and releases are built with `npm run package`.

`ci.yml` runs typecheck → lint → format → unit tests, then the Playwright suite on a Windows / macOS / Linux matrix.

`release.yml` fires on a `v*` tag: it runs the same gates, then builds installers on all three platforms and attaches them to the Release, and deploys `docs/` to GitHub Pages. That last part is what will produce the macOS `.dmg` and Linux `.AppImage` that 0.1.0 is missing.
