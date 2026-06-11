# Full Page Screenshot — Firefox Extension

Capture a screenshot of an **entire web page**, not just the visible part. If a
page is too long to fit in a single image, it's automatically split into
multiple images so nothing gets cut off or fails to save.

## Features

- 📸 **Full-page capture** — scrolls the page and stitches every viewport into one image.
- ✂️ **Auto-split for long pages** — anything taller than your threshold (default `20000px`) is saved as `…-1of3`, `…-2of3`, … instead of one oversized file that the browser would reject.
- 🖼️ **Visible-area capture** — grab just what's currently on screen.
- 🎚️ **PNG or JPEG** — choose lossless PNG or smaller JPEG with an adjustable quality slider.
- 📌 **Hide floating headers** — sticky/fixed headers are hidden after the first screen so they don't repeat down the whole shot.
- 📊 **Live progress bar** in the popup, plus a system notification when the file(s) are saved.
- ⌨️ **Keyboard shortcut** — `Alt+Shift+P`.
- 🔒 **Minimal permissions** — uses `activeTab` (only the page you capture), no broad host access.
- 💾 Smart filenames: `FullPage_<page title>_<date>_<time>.png`.

## Install (temporary, for testing)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file in this folder.
4. The camera icon appears in the toolbar — click it, then **Capture Full Page**.

> Temporary add-ons are removed when Firefox restarts. To install permanently
> you'd sign/package it via [AMO](https://addons.mozilla.org/developers/) or
> `web-ext`.

### Optional: run it with web-ext

```bash
npm install --global web-ext
web-ext run            # launches Firefox with the extension loaded
web-ext lint           # validates the manifest and code
web-ext build          # produces a .zip in ./web-ext-artifacts
```

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Extension metadata, permissions, popup, shortcut. |
| `popup.html/.css/.js` | Toolbar UI: buttons, options, progress bar. |
| `background.js` | Orchestrates scrolling + `captureVisibleTab`, stitches tiles onto canvases, splits long pages, and downloads. |
| `content.js` | Injected on demand; measures the page, hides the scrollbar, scrolls precisely, hides floating headers. |

The background script scrolls the page one viewport at a time, captures each
visible frame, and draws it onto a canvas at the exact scroll offset (scaled by
`devicePixelRatio` for sharp output on HiDPI displays). New canvas "segments"
are started whenever the image would exceed the split threshold (kept under
Firefox's ~32767px canvas limit), and each segment is encoded and saved.

## Options

- **Format** — PNG (lossless) or JPEG (smaller; quality slider appears).
- **Split when taller than** — max height per image in pixels before splitting (`2000`–`32000`).
- **Capture delay** — wait after each scroll before capturing (raise it on pages with slow/lazy-loading content).
- **Hide floating headers** — recommended on for sites with sticky navbars.

## Known limitations

- Restricted pages (`about:`, `addons.mozilla.org`, `view-source:`, the PDF viewer) can't be scripted, so full-page capture isn't available there.
- Infinite-scroll / lazy-loading pages are measured once at the start; content that only loads as you scroll past the initial height may not be captured. Increasing the capture delay helps.
