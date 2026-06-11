/*
 * background.js
 * Orchestrates the capture. Lives in the (hidden) background page so it can
 * use a real DOM <canvas> and keep running even after the popup closes.
 *
 * Flow:
 *   1. Inject content.js into the active tab and ask it to prepare + measure.
 *   2. Walk the page viewport-by-viewport: scroll -> wait -> captureVisibleTab.
 *   3. Stitch each captured tile onto one or more canvases. A new canvas is
 *      started whenever the image would exceed the split threshold, so very
 *      long pages come out as several images instead of one giant one.
 *   4. Encode each canvas (PNG or JPEG) and save it via downloads.
 */
"use strict";

const DEFAULTS = {
  format: "png",
  quality: 0.92,
  maxSegmentHeight: 20000, // device px; pages taller than this are split
  delay: 250, // ms to wait after scrolling before capturing
  hideFixed: true
};

// Firefox canvases cap out around 32767px per side; stay comfortably under it.
const CANVAS_MAX = 32000;
// Minimum spacing between captures to respect captureVisibleTab rate limits.
const MIN_CAPTURE_GAP = 60;

let capturing = false;
let lastCaptureTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOptions() {
  try {
    const stored = await browser.storage.local.get("options");
    return Object.assign({}, DEFAULTS, stored.options || {});
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

// Broadcast progress to the popup if it happens to be open; ignore otherwise.
function notifyPopup(message) {
  browser.runtime.sendMessage(message).catch(() => {});
}

function showNotification(title, message) {
  try {
    browser.notifications
      .create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.svg"),
        title,
        message
      })
      .catch(() => {});
  } catch (e) {
    /* notifications are best-effort */
  }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode captured image"));
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      mime,
      quality
    );
  });
}

async function captureVisible(windowId) {
  // Throttle so we never trip the browser's capture rate limit.
  const since = Date.now() - lastCaptureTime;
  if (since < MIN_CAPTURE_GAP) {
    await sleep(MIN_CAPTURE_GAP - since);
  }
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: "png" });
  lastCaptureTime = Date.now();
  return dataUrl;
}

// Unique scroll stops covering [0, total) in `step` increments, with the last
// stop clamped so we never scroll past the end.
function buildStops(total, step) {
  if (step <= 0) return [0];
  const stops = [];
  const maxStart = Math.max(0, total - step);
  for (let p = 0; p < total; p += step) {
    stops.push(Math.min(p, maxStart));
  }
  return stops.filter((v, i) => stops.indexOf(v) === i);
}

// Draw a captured tile (already in device pixels) onto whichever segment
// canvases it overlaps.
function placeTile(segments, img, destX, destY) {
  const imgTop = destY;
  const imgBottom = destY + img.height;
  for (const seg of segments) {
    const segTop = seg.top;
    const segBottom = seg.top + seg.canvas.height;
    const top = Math.max(imgTop, segTop);
    const bottom = Math.min(imgBottom, segBottom);
    if (bottom <= top) continue;
    const sourceY = top - imgTop;
    const height = bottom - top;
    seg.ctx.drawImage(
      img,
      0, sourceY, img.width, height, // source rectangle
      destX, top - segTop, img.width, height // destination on this segment
    );
  }
}

function makeFilename(title) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let base = (title || "screenshot")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!base) base = "screenshot";
  return `FullPage_${base}_${stamp}`;
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const id = await browser.downloads.download({ url, filename, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return id;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

// Encode every segment canvas and download it. Long captures become
// "<name>-1of3", "<name>-2of3", ... single captures keep a plain name.
async function exportSegments(segments, options, title) {
  const isJpeg = options.format === "jpeg";
  const mime = isJpeg ? "image/jpeg" : "image/png";
  const ext = isJpeg ? "jpg" : "png";
  const base = makeFilename(title);
  const total = segments.length;

  for (let i = 0; i < total; i++) {
    notifyPopup({ type: "progress", phase: "saving", current: i + 1, total });
    let canvas = segments[i].canvas;
    if (isJpeg) {
      // JPEG has no alpha; flatten onto white so transparent areas aren't black.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d");
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      canvas = flat;
    }
    const blob = await canvasToBlob(canvas, mime, options.quality);
    const suffix = total > 1 ? `-${i + 1}of${total}` : "";
    await downloadBlob(blob, `${base}${suffix}.${ext}`);
  }
  return total;
}

async function captureFullPage(tab, options) {
  const windowId = tab.windowId;

  const metrics = await browser.tabs.sendMessage(tab.id, { cmd: "prepare" });
  try {
    const dpr = metrics.devicePixelRatio || 1;
    const vw = metrics.viewportWidth;
    const vh = metrics.viewportHeight;
    const totalW = metrics.totalWidth;
    const totalH = metrics.totalHeight;

    const xs = buildStops(totalW, vw);
    const ys = buildStops(totalH, vh);

    const totalWpx = Math.round(totalW * dpr);
    const totalHpx = Math.round(totalH * dpr);

    // Decide how tall each output image may be (the auto-split logic).
    let segHeight = Math.min(options.maxSegmentHeight || CANVAS_MAX, CANVAS_MAX);
    const minSeg = Math.ceil(vh * dpr);
    if (segHeight < minSeg) segHeight = minSeg;
    const numSegments = Math.max(1, Math.ceil(totalHpx / segHeight));

    const segments = [];
    for (let i = 0; i < numSegments; i++) {
      const top = i * segHeight;
      const height = Math.min(segHeight, totalHpx - top);
      const canvas = document.createElement("canvas");
      canvas.width = totalWpx;
      canvas.height = height;
      segments.push({ canvas, ctx: canvas.getContext("2d"), top });
    }

    const totalTiles = xs.length * ys.length;
    let done = 0;
    let first = true;

    for (const y of ys) {
      for (const x of xs) {
        const actual = await browser.tabs.sendMessage(tab.id, { cmd: "scrollTo", x, y });

        // After the first tile, optionally hide floating/sticky headers so
        // they don't repeat in every screen.
        if (!first && options.hideFixed) {
          await browser.tabs.sendMessage(tab.id, { cmd: "hideFloating" }).catch(() => {});
        }

        await sleep(options.delay);

        const dataUrl = await captureVisible(windowId);
        const img = await loadImage(dataUrl);

        placeTile(segments, img, Math.round(actual.x * dpr), Math.round(actual.y * dpr));

        first = false;
        done++;
        notifyPopup({ type: "progress", phase: "capturing", current: done, total: totalTiles });
      }
    }

    return await exportSegments(segments, options, tab.title);
  } finally {
    // Always undo our DOM changes, even if something failed mid-capture.
    await browser.tabs.sendMessage(tab.id, { cmd: "restore" }).catch(() => {});
  }
}

async function captureVisibleOnly(tab, options) {
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  return await exportSegments([{ canvas, top: 0 }], options, tab.title);
}

async function startCapture(mode) {
  if (capturing) {
    notifyPopup({ type: "error", message: "A capture is already in progress." });
    return;
  }
  capturing = true;
  notifyPopup({ type: "start" });

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) throw new Error("No active tab to capture.");

    const options = await getOptions();

    let count;
    if (mode === "visible") {
      count = await captureVisibleOnly(tab, options);
    } else {
      // Inject the content script (needed for measuring + scrolling).
      try {
        await browser.tabs.executeScript(tab.id, { file: "content.js" });
      } catch (e) {
        throw new Error("This page can't be captured (it's a restricted browser page).");
      }
      count = await captureFullPage(tab, options);
    }

    notifyPopup({ type: "done", count });
    showNotification(
      "Screenshot saved",
      count > 1
        ? `Saved ${count} images to your Downloads.`
        : "Saved to your Downloads."
    );
  } catch (e) {
    console.error("Capture failed:", e);
    notifyPopup({ type: "error", message: e.message || String(e) });
    showNotification("Capture failed", e.message || String(e));
  } finally {
    capturing = false;
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "startCapture") {
    startCapture(msg.mode || "full");
    return Promise.resolve({ ok: true });
  }
  return false;
});

browser.commands.onCommand.addListener((command) => {
  if (command === "capture-full-page") {
    startCapture("full");
  }
});
