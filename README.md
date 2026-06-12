# FoxSS — Firefox Screenshot Tool

Capture a screenshot of an **entire web page**, not just the visible part. If a
page is too long to fit in a single image, it's automatically split into
multiple images so nothing gets cut off or fails to save.

## Features

- 📸 **Full-page capture** — scrolls the page and stitches every viewport into one image.
- 🧩 **Works with inner JS scroll areas** — many web apps (chat apps, dashboards, docs viewers) don't scroll the window; they scroll an inner `overflow:auto` container. The extension auto-detects the real scroll container and captures *that*. You can also force **Whole page** or **Inner scroll area** in Options.
- ✂️ **Auto-split for long pages** — anything taller than your split threshold (defaults to **your screen's vertical resolution**, so each image is about one screen) is saved as `…-1of3`, `…-2of3`, … instead of one oversized file the browser would reject.
- 🗜️ **Bundle into a .zip** — multiple images can be saved together as a single `.zip` (on by default).
- 📋 **Copy to clipboard** — optionally copy the screenshot to the clipboard as well as saving it (off by default).
- 🖼️ **Visible-area capture** — grab just what's currently on screen.
- 🎚️ **PNG or JPEG** — choose lossless PNG or smaller JPEG with an adjustable quality slider.
- 📌 **Hide floating headers** — sticky/fixed headers are hidden after the first screen so they don't repeat down the whole shot.
- 🖱️ **One-click capture** — optionally make the toolbar icon start a full-page capture immediately (skipping the popup); a right-click menu keeps the actions and settings reachable.
- ⚙️ **Settings page** — a full options/welcome page (shown on first install).
- 📊 **Live progress bar** in the popup, plus a system notification when the file(s) are saved.
- ⌨️ **Keyboard shortcut** — `Alt+Shift+P`.
- 🔒 **Local-only, minimal permissions** — no broad host access; nothing leaves your device.
- 💾 Smart filenames: `FoxSS_<page title>_<date>_<time>.png`.

## Settings

Open the settings page from the popup (**⚙ All settings…**), by right-clicking
the toolbar icon → **Settings…**, or from `about:addons` → FoxSS → *Preferences*.
It also opens automatically the first time you install. Everything saves
automatically.

**Toolbar button**
- **Capture immediately on click** — clicking the icon starts a full-page capture and skips the popup. (Right-click the icon for the actions and settings.)

**Saving**
- **Bundle multiple images into one .zip** — *on by default.*
- **Also copy to clipboard** — *off by default;* copies the first image too.

**Capture defaults**
- **Scroll area** — *Auto-detect* (window or the dominant inner scroll container), *Whole page*, or *Inner scroll area*.
- **Format** — PNG (lossless) or JPEG (smaller; quality slider appears).
- **Split when taller than** — max height per image before splitting. **Defaults to your screen's vertical resolution** (`600`–`32000` px).
- **Capture delay** — wait after each scroll before capturing (raise it on pages with slow/lazy-loading content).
- **Hide floating headers** — recommended on for sites with sticky navbars.

The popup keeps quick access to **Scroll area**, **Format/quality**, and
**Hide floating headers**; the rest live on the settings page.

## Privacy

FoxSS collects **nothing** and sends **nothing** anywhere. Verified by audit:

- **No network requests** — there is no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, or any remote URL anywhere in the code.
- **No analytics or telemetry** — no third-party SDKs, no tracking, no "phone home".
- **Everything stays on your device** — screenshots are built in memory and saved straight to your local Downloads. Zips are built locally with a bundled, no-network ZIP writer. Your settings live in `storage.local` (this browser only; never synced or uploaded).
- **Minimal, local permissions** — `activeTab` (only the page you explicitly capture, only when you act), `downloads` (to save), `storage` (your options), `notifications` (the "saved" toast), `clipboardWrite` (only to place *your* screenshot on the clipboard, and only if you enable it), `contextMenus` (the toolbar right-click menu). No `<all_urls>` / broad host access.
- FoxSS requests no data-collection permissions, and "no data collected" is declared on its add-on listing.

## Known limitations

- Restricted pages (`about:`, `addons.mozilla.org`, `view-source:`, the PDF viewer) can't be scripted, so full-page capture isn't available there.
- Infinite-scroll / lazy-loading pages are measured once at the start; content that only loads as you scroll past the initial height may not be captured. Increasing the capture delay helps.
- **Transform-based scroll-jacking** (libraries like fullPage.js that move content with CSS transforms on wheel events instead of real scrolling) exposes no scrollable element, so only the first screen can be captured. Standard `overflow:auto/scroll` containers *are* supported.
- A captured scroll container is assumed to fit within the viewport (the usual case). If a container is itself taller than the window, only its on-screen portion is captured.

## License

Copyright (C) 2026 Samet Guler. **All rights reserved.** — see [`LICENSE`](LICENSE).

FoxSS is proprietary software. You may install and use the official build (e.g. from addons.mozilla.org), but you may **not** copy, modify, redistribute, reverse engineer to copy, or create derivative works from its source code without prior written permission. The software comes with no warranty, to the extent permitted by law.
