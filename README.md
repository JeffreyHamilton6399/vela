# Vela

A privacy-focused desktop web browser. Electron + TypeScript, distributed as a free download via GitHub Releases. No servers, no backend, no hosted accounts — it runs entirely on your machine.

The privacy posture of DuckDuckGo, the visual language of Instagram, the feature set of Opera.

## Install

Download from **[jeffreyhamilton6399.github.io/vela](https://jeffreyhamilton6399.github.io/vela/)** or [Releases](https://github.com/JeffreyHamilton6399/vela/releases/latest): `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux.

Builds are **not code-signed yet**, so the first launch will be met with a warning:

- **Windows** — SmartScreen says “Windows protected your PC”. Click _More info_ → _Run anyway_.
- **macOS** — Gatekeeper says Vela “cannot be opened because it is from an unidentified developer”. Right-click the app → _Open_ → confirm. Or `xattr -dr com.apple.quarantine /Applications/Vela.app`.
- **Linux** — `chmod +x Vela-*.AppImage` before running it.

## What Vela collects

Nothing. There is no server and no analytics, and the only account is a local one that unlocks a file on your own disk.

Out of the box Vela makes exactly **two** kinds of network request:

1. the pages you navigate to, and
2. one check of the GitHub Releases feed — a plain GET, no query parameters, no install identifier, and a user agent that is the version string and nothing else.

A **third** appears only if you go out of your way: switching the assistant from its local default to a hosted service. Left alone it talks to a model on your own machine, which is not the internet at all. In development, a `session.webRequest` assertion logs any request that is none of these, so accidental telemetry surfaces while building rather than after shipping.

Everything Vela remembers lives in one local JSON file. The settings panel prints its path, and the export button hands you its contents verbatim.

## What it does

- **First-run screen** that asks where your searches should go — DuckDuckGo, Startpage, Brave, Ecosia, Google or Bing — and says plainly which of them build a profile from them.
- **Tabs** with drag reordering, pinning, restore-last-closed, and native context menus.
- **A page context menu** that changes with what you right-clicked: save a link, image, video or audio file, copy an address, open it in a new tab, or search your selection with the engine you chose. Native rather than drawn by the chrome, because an OS menu floats above the page where an HTML one would be painted underneath it. What goes in it is `buildPageMenu`, which is plain data and unit tested.
- **Workspaces**: named tab groups. Leaving one suspends its tabs, so an idle workspace costs storage for its titles and nothing else.
- **Speed Dial** new tab page with locally cached favicons.
- **Bookmarks** with a bar, **local history** that feeds the command palette, and **downloads** in a bubble that raises itself over the top right of the page as a file lands.
- **Per-site zoom** that sticks (`Ctrl+=` / `Ctrl+-` / `Ctrl+0`).
- **Command palette** (`Ctrl+K`), a **sidebar** (`Ctrl+B`) holding the assistant, notes and the sites you dock, and **bang shortcuts** (`!gh`, `!yt`, `!w`) resolved on this machine.
- **Private windows** (`Ctrl+Shift+N`) on a memory-only session.
- An **Opera-style left rail**: workspaces at the top, the assistant and notes below, your docked sites under those, settings at the bottom.

### The assistant runs locally by default

The sidebar assistant defaults to **a model running inside Vela itself**. Nothing to install, no second program, and no port to talk to: llama.cpp is linked into the process, so a question never becomes a network request in the first place. That is a stronger claim than "the request only goes to localhost" — there is no request.

Vela ships without a model on purpose. A four-gigabyte GGUF inside the installer would be a miserable download for everyone who never opens the assistant, and it would ride along in every update after. So Settings → Assistant offers a short catalogue with sizes, and the one you pick downloads once — resumable, and checked against its SHA-256 before it is used, because a truncated GGUF fails somewhere deep inside llama.cpp rather than saying "the download did not finish".

Only the CPU build of llama.cpp is shipped. The CUDA and Vulkan binaries are 163 MB and 95 MB against 46 for CPU, which would quadruple the installer for hardware most people do not have.

**Ollama** is still there for anyone who already runs it, and the alternative to both is a hosted service using **a key you paste into Settings**. Vela ships without one and could not usefully ship with one: this is a downloadable app, so an embedded key sits in `app.asar` for anyone who unzips it and bills whoever put it there.

Only the hosted option adds a network destination beyond the two above, which is why it is not the default.

### The account and the password vault

Settings → Account creates a **local** account: an email as a label and a master password that unlocks an encrypted file. The master password is never stored, only a separate scrypt derivation of it, so the file without the password is unreadable. Credentials are AES-256-GCM under a key derived the same way. There is no password reset, because there is nobody to ask.

Sign in to a site by hand and Vela offers to remember it — the same prompt Chrome shows. After that it fills the login as the page loads, and Settings → Account can tell it to press the sign-in button as well. The key button in the address bar still fills on demand, overwriting whatever is in the boxes.

Two scripts do this, and they cost different amounts. The **fill** script goes into a page only when the vault is unlocked _and_ already holds a credential for that exact host, so it reaches the handful of sites you save passwords for and no others. The **watcher** behind "offer to save logins" is the expensive one: to notice a login on a site you have not saved yet, it has to run on pages Vela holds nothing for. That is a real trade and the setting says so rather than burying it. What stays true either way: both are ordinary injections that die with their document, neither is a preload, tabs still carry no standing bridge, the watcher reads nothing until a login is submitted, and nothing runs anywhere while the vault is locked.

The captured password never reaches the chrome renderer. It waits in the main process while the prompt — host and username only — is drawn, and the buttons answer by id.

It is careful about what it touches: never a page showing two password boxes (that is a sign-up or a password change, not a login), never a field you have already typed into, and never a bare text box that has not identified itself as a username — which is what keeps your email out of search boxes. Auto-submit fires only when a password went in or the page marked the field `autocomplete="username"`, and it stops where the site does: a second factor or a "was this you?" prompt is still yours to answer.

`loginAutofill` is `off`, `fill` or `submit`, defaulting to `fill`; `offerToSaveLogins` is the watcher, and defaults on.

A sign-in page can still refuse you for reasons Vela does not control — a second factor, a code from your phone, a "was this you?" challenge. Vela fills and submits; it does not pretend to answer those.

**Google will not sign you in, and that is not something Vela can fix.** `accounts.google.com` accepts a short list of browsers and refuses the rest with "This browser or app may not be secure" — before it looks at anything you typed. Vela sends a plain Chrome user agent and the matching client hints, so the page loads and every header-level check passes; Google's check is not in the headers. One version went further and restored the parts of Chrome's JavaScript surface Electron omits — the `window.chrome` members, the `Google Chrome` brand in `navigator.userAgentData` — verified present in the page at document-start, with `navigator.webdriver` false beside them. Google refused the same address at the same step regardless, so that guess has been removed: it bought nothing and cost every tab a debugger attachment and a lie about what browser it was. What Vela does instead is recognise the refusal, say plainly that it is Google's decision and not a password problem, and offer to reopen the page in your usual browser. The rest of Google — Gmail, Drive, Calendar, search — works normally once you have a session.

### Web panels

Dock a site into the sidebar from the rail's globe button, the way Opera does. Each panel is an ordinary `WebContentsView` on the same hardened session a tab uses — same sandbox, same blocking, same referer policy, no preload — simply positioned into the sidebar rectangle. Only the visible panel exists; closing it destroys the view rather than leaving a hidden renderer running.

### What Vela deliberately does not have

- **No built-in VPN.** A browser-branded "free VPN" is someone else's server seeing all your traffic — the opposite of the point, and it needs infrastructure Vela does not run. Settings has a proxy field instead: point it at a proxy or VPN you already trust and every session goes through it.
- **No hosted account, and no sync between machines.** There is a Vela account, but it is local: signing in unlocks an encrypted file on this computer. Nothing is uploaded, and there is no server to sync with — an account you sign into somewhere else is the single thing that turns "a browser on your machine" into "a profile somebody keeps". Settings → _Export_ moves your settings between machines; the vault stays put.

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
    providers.ts          the models and proxies Vela suggests, in one file
  main/
    vela-window.ts        one window: its chrome, its tabs, its session
    account/              the local vault: scrypt, AES-256-GCM, click-to-fill
    panels/               sites docked into the sidebar
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

`nativeImage` reads PNG and JPEG and nothing else, which quietly cost most of the web its icon: measured across ten ordinary sites, six — Wikipedia, Hacker News, Stack Overflow, YouTube, Amazon, the New York Times — declare an ICO or an SVG, came back undecodable, and showed the first letter of the host where Chrome shows a logo. What `nativeImage` refuses now goes to Chromium, which reads all of it, in a view attached to no window: sandboxed, no preload, no bridge, its own session with the network switched off, holding one `<img>` and one canvas. Raw bytes from a website never go to the chrome renderer, because that is the renderer holding the IPC bridge and an image decoder is a classic place to find a memory-safety bug. What comes back is a PNG, main re-encodes even that through `nativeImage`, and the renderer is handed back after thirty idle seconds. All ten sites have their icon now.

A site docked into the sidebar is the one case where nothing has loaded the page yet, so there is no icon to have noticed. Vela asks that site for `/favicon.ico` once, when you dock it — one request, to the one site you have just said you want open beside the page. Sites that declare their icon only in HTML (Messenger, Discord, Google Calendar are the ones in Vela's own suggestion list) show a letter until the first time you open the panel, and their real icon from then on.

**Ad blocking.** EasyList and EasyPrivacy are compiled into `resources/adblock-engine.bin` at build time by `scripts/fetch-filters.mjs`. Vela never fetches a filter list at runtime — that would be a third category of request. Lists refresh by shipping a new build.

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` — asserted by unit tests on every platform, and by an E2E test that confirms `require`, `process` and `ipcRenderer` are all absent from the renderer.

**Browser identity.** Every install on a platform sends the same plain Chrome user agent, naming neither Vela nor Electron — randomising it per install would be a fingerprint, not a defence. The client hints have to say the same thing, and Electron sends none of them at all: Chromium only emits `Sec-CH-UA` for an embedder that supplies user-agent metadata, and Electron exposes no way to. That leaves a browser claiming `Chrome/150` in its user agent and sending no brand list whatsoever, which no real Chrome has ever done and which a sign-in front end reads as an embedded webview. Vela sends the three low-entropy hints Chrome sends unprompted, derived from the same platform and version the user agent is built from, and aligns any brand list Chromium does send so both halves name Chrome. The higher-entropy hints are never volunteered, and nothing is sent to a plain-http origin. An e2e test asserts on what a real page request actually receives, rather than on the string Vela meant to send.

**Signing in.** A "Sign in with …" button calls `window.open` with window features, keeps the handle it gets back, and waits for the popup to answer through `window.opener`. Vela follows Chrome's own rule: features mean a real popup window, no features mean a tab. The popup carries the same four non-negotiable flags a tab does and no preload, and dies with the tab that opened it. `Referer` is trimmed rather than removed — another origin learns which site you came from and never which page, which is what Chrome and Firefox both do by default, and leaves the origin that CSRF middleware falls back to when a login POSTs across origins.

The chrome renderer ships a `default-src 'none'; connect-src 'none'` CSP in production, cannot navigate, and cannot open windows. ESLint forbids `fetch`, `XMLHttpRequest` and `WebSocket` in renderer source: if the chrome can reach the network, the two-request promise is already broken.

The password vault never stores the master password, only a separate scrypt derivation used to check it, and holds the encryption key in memory for exactly as long as you are signed in. Filling a login injects a script into one page, gated on the vault holding a credential for that exact host, rather than giving every page a permanent bridge.

**Never commit tokens, keys or credentials.** `.gitignore` covers `.env*` and key material. Publishing uses the `GITHUB_TOKEN` that Actions injects automatically — no personal access token is needed anywhere in this project.

## Design notes

A `WebContentsView` always paints above the window's own web contents, so anything the chrome renderer draws inside the content region is behind the page. The palette, settings and privacy panels answer that by hiding the page while they are up — they own the whole region anyway. The downloads bubble cannot: it appears on its own when a file lands, and blanking the page you were reading to announce a download would be absurd. So it is its own `WebContentsView`, loading the same renderer at `#downloads`, trimmed to the height the card actually draws at. Every pixel outside those few hundred still belongs to the page.

One spacing unit is 8px (`--spacing: 0.5rem`), so every integer Tailwind spacing utility lands on the grid by construction rather than by convention. The Instagram gradient is defined once as `--vela-gradient` and appears in exactly two places: the active tab indicator and focus rings. Fonts are the system stack — no CDN, no Google Fonts, no request you didn't ask for. Dark mode follows the OS by default and is overridable in settings.

## CI

`ci.yml` runs typecheck → lint → format → unit tests, then the Playwright suite on a Windows / macOS / Linux matrix.

`release.yml` fires on a `v*` tag: it runs the same gates, then builds installers on all three platforms and attaches them to the Release. It is the only thing that can produce the macOS `.dmg` and the Linux `.AppImage` — a `.dmg` can only be made on macOS, and neither target cross-compiles from Windows, so 0.1.0 shipped Windows-only for want of a runner. `npm run verify` and `npm run test:e2e` remain the local gates.

The landing page is not deployed from the workflow. Pages serves `docs/` straight off `main`, so a push that touches the page is live within a minute or two of landing.
