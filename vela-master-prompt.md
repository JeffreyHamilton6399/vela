# Vela — Master Build Prompt

Paste this whole document into Claude Code as your opening message.

---

Build **Vela**, a privacy-focused desktop web browser. Electron + TypeScript, distributed as a free download via GitHub Releases. No servers, no backend, no hosting costs — the app runs entirely on the user's machine.

Vela's three influences: the privacy posture of DuckDuckGo, the visual language of Instagram, the feature set of Opera.

## Ground rules

Work through the eight stages at the bottom **in order**. Stop at the end of each stage, tell me what you built, and wait for my confirmation before starting the next. Do not scaffold stage 5 while building stage 2.

Every stage must end with an app that actually launches and a test suite that passes.

Ask me before adding any dependency not named in this document.

## Architecture

- **Main process** owns the window, the tab lifecycle, sessions, and all privileged operations.
- Page rendering uses **`WebContentsView`** — one view per tab, positioned below the chrome. Do not use `BrowserView` (deprecated) or `<webview>` tags (fragile, poor perf).
- **Renderer** is React + Vite + Tailwind and draws _only_ browser UI: titlebar, tab strip, address bar, sidebar, new tab page. It never renders web content.
- Security flags, non-negotiable: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- All main ↔ renderer traffic goes through a **typed preload bridge** with explicit named channels. Never expose `ipcRenderer` to the renderer. Define every channel and payload type in one shared `types/ipc.ts` imported by both sides, and validate every incoming payload with **zod** at the main-process boundary.
- Persist state with **electron-store** (local JSON). Nothing leaves the machine.

## Privacy — enforce it, don't just intend it

- **Ad/tracker blocking** via `@ghostery/adblocker-electron` with EasyList + EasyPrivacy, wired into `session.webRequest`. Show a per-page blocked count in the toolbar.
- Vela makes exactly **two** categories of network request: (1) pages the user navigated to, (2) the GitHub Releases update check. Nothing else, ever.
- Add a **dev-only assertion** that logs any request whose initiator isn't a user-initiated navigation, so accidental telemetry is caught during development rather than after shipping.
- The update check is a plain GET to the Releases feed. No query params, no install ID, no fingerprint, no user agent beyond the version string.
- **WebRTC leak protection**: set IP handling policy to `default_public_interface_only`.
- **Force HTTPS** upgrades; interstitial warning on plain HTTP.
- Strip `Referer` on cross-origin navigation by default.
- Ship a **consistent** UA string. No per-install randomization — that's a fingerprint, not a defense.
- **Private windows** use a memory-only session partition, destroyed on close. Write a test that proves no disk writes occur during a private session.
- **Clear-on-exit** toggle for cookies, cache, and storage.
- A settings panel that shows plainly what Vela does and does not collect. The honest answer is "nothing" — say so and make it verifiable.

## Design — Instagram's visual language

- **Frameless window** with a custom titlebar and correct per-platform window controls (traffic lights on macOS, minimize/maximize/close on Windows and Linux).
- Near-white and near-black surfaces. Generous whitespace. Strict 8px spacing grid.
- The Instagram gradient (purple → pink → orange) appears in exactly two places: the active tab indicator and focus rings. Restraint is the point.
- Rounded tabs and cards. Subtle 1px borders instead of heavy shadows.
- Spring-eased micro-interactions on tab open, close, and reorder.
- Full dark mode, following the OS by default, manually overridable.
- Self-hosted fonts. No CDN calls, no Google Fonts — that's a network request the user didn't ask for.

## Features — Opera's toolkit

- **Tabs**: drag to reorder, pin, close, and restore-last-closed (`Cmd/Ctrl+Shift+T`).
- **Speed Dial** new tab page: draggable tile grid with locally-cached favicons.
- **Workspaces**: named tab groups the user switches between. Tabs in inactive workspaces suspend.
- **Sidebar panel**: notes, calculator, unit converter. All local, all offline.
- **Command palette** (`Cmd/Ctrl+K`): search, jump to tab, open settings.
- **Bang shortcuts** in the address bar (`!yt`, `!gh`, `!w`), resolved locally.
- Default search engine DuckDuckGo, user-switchable.
- Import/export all settings as a single JSON file.

## Performance targets

- Suspend background `WebContentsView` instances after 5 minutes idle. Keep a lightweight placeholder (title + favicon) and restore on click.
- Cap live views around 10; beyond that, suspend least-recently-used.
- Never block the main process. No sync fs, no sync IPC, no heavy compute in main — move it to a utility process or the renderer.
- Debounce window resize before repositioning views.
- Lazy-load the sidebar tools and settings panel.
- Enable V8 code caching and startup snapshot flags.
- **Targets**: cold start under 2s, new tab under 100ms, idle RAM under 400MB with 5 tabs. Log `process.getProcessMemoryInfo()` in dev so we can watch it.

## Code quality gates

- TypeScript **strict** mode. No `any`. No non-null assertions.
- ESLint + Prettier, plus `eslint-plugin-security` on the main process.
- **Vitest** for main-process logic. **Playwright** for Electron E2E covering the tab lifecycle.
- No secrets, tokens, or keys anywhere in the repo. `.gitignore` covers `.env*`, `dist/`, `out/`, `node_modules/`, and build artifacts.
- CI runs typecheck → lint → test **before** it builds any installer.

## Packaging and distribution

- **electron-builder** producing NSIS `.exe`, `.dmg` (universal binary), and AppImage.
- **electron-updater** pointed at GitHub Releases.
- **GitHub Actions** workflow: on push of a `v*` tag, build on a `windows-latest` / `macos-latest` / `ubuntu-latest` matrix and attach artifacts to the Release.
- Builds are unsigned for now. Add a short install note to the README explaining the SmartScreen and Gatekeeper warnings users will see.
- A minimal GitHub Pages landing page with download buttons and OS detection.

## The eight stages

1. Electron scaffold, frameless window, custom titlebar, preload bridge, typed IPC skeleton.
2. A single `WebContentsView` with a working address bar, back/forward/reload.
3. Multi-tab management: open, close, reorder, pin, restore.
4. Ad blocker, session hardening, private windows, all privacy controls above.
5. New tab page and Speed Dial.
6. Workspaces and tab suspension.
7. Sidebar tools, command palette, bang shortcuts, settings panel.
8. Packaging, auto-update, CI matrix, landing page.

Start with stage 1. Confirm the window launches before you write anything for stage 2.
