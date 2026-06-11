/*
 * options.js
 * The full settings page (also shown as a welcome tab on first install).
 * Settings are saved to storage.local under "options"; each control writes
 * its own field and preserves the rest (merge-save), so the popup and this
 * page never clobber each other.
 */
"use strict";

// Default split height = the user's physical vertical resolution, so each
// saved image is roughly one screen tall.
function screenSplitDefault() {
  const h = window.screen && window.screen.height ? window.screen.height : 1080;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(32000, Math.max(600, Math.round(h * dpr)));
}

const DEFAULTS = {
  format: "png",
  quality: 0.92,
  maxSegmentHeight: screenSplitDefault(),
  delay: 250,
  hideFixed: true,
  scrollArea: "auto",
  zipMultiple: true,
  copyToClipboard: false,
  captureOnClick: false
};

const $ = (id) => document.getElementById(id);

function clampInt(value, min, max, fallback) {
  let n = parseInt(value, 10);
  if (!Number.isFinite(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}

function readOptions() {
  return {
    format: $("format").value,
    quality: parseFloat($("quality").value),
    maxSegmentHeight: clampInt($("maxHeight").value, 600, 32000, DEFAULTS.maxSegmentHeight),
    delay: clampInt($("delay").value, 0, 5000, DEFAULTS.delay),
    hideFixed: $("hideFixed").checked,
    scrollArea: $("scrollArea").value,
    zipMultiple: $("zipMultiple").checked,
    copyToClipboard: $("copyToClipboard").checked,
    captureOnClick: $("captureOnClick").checked
  };
}

function updateQualityUI() {
  $("qualityRow").style.display = $("format").value === "jpeg" ? "" : "none";
  $("qualityVal").textContent = Math.round(parseFloat($("quality").value) * 100) + "%";
}

async function loadOptions() {
  let stored = {};
  try {
    stored = (await browser.storage.local.get("options")).options || {};
  } catch (e) {
    /* defaults */
  }
  const o = Object.assign({}, DEFAULTS, stored);
  $("format").value = o.format;
  $("quality").value = o.quality;
  $("maxHeight").value = o.maxSegmentHeight;
  $("delay").value = o.delay;
  $("hideFixed").checked = o.hideFixed;
  $("scrollArea").value = o.scrollArea;
  $("zipMultiple").checked = o.zipMultiple;
  $("copyToClipboard").checked = o.copyToClipboard;
  $("captureOnClick").checked = o.captureOnClick;
  updateQualityUI();
}

let savedTimer = null;
function flashSaved() {
  const el = $("saved");
  el.textContent = "Saved ✓";
  el.classList.add("flash");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    el.textContent = "Settings save automatically.";
    el.classList.remove("flash");
  }, 1200);
}

async function saveOptions() {
  try {
    const cur = (await browser.storage.local.get("options")).options || {};
    await browser.storage.local.set({ options: Object.assign({}, cur, readOptions()) });
    flashSaved();
  } catch (e) {
    /* non-fatal */
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (location.hash === "#welcome") {
    $("welcome").classList.remove("hidden");
  }

  loadOptions();

  $("format").addEventListener("change", () => {
    updateQualityUI();
    saveOptions();
  });
  $("quality").addEventListener("input", updateQualityUI);

  [
    "format",
    "quality",
    "maxHeight",
    "delay",
    "hideFixed",
    "scrollArea",
    "zipMultiple",
    "copyToClipboard",
    "captureOnClick"
  ].forEach((id) => $(id).addEventListener("change", saveOptions));
});
