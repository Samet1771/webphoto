/*
 * popup.js
 * Reads/writes user options to storage, kicks off a capture in the background
 * script, and reflects progress sent back over runtime messages. The popup may
 * be closed at any point — the background keeps working and shows a system
 * notification when finished.
 */
"use strict";

const DEFAULTS = {
  format: "png",
  quality: 0.92,
  maxSegmentHeight: 20000,
  delay: 250,
  hideFixed: true
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
    maxSegmentHeight: clampInt($("maxHeight").value, 2000, 32000, DEFAULTS.maxSegmentHeight),
    delay: clampInt($("delay").value, 0, 5000, DEFAULTS.delay),
    hideFixed: $("hideFixed").checked
  };
}

function updateQualityUI() {
  const isJpeg = $("format").value === "jpeg";
  $("qualityRow").style.display = isJpeg ? "" : "none";
  $("qualityVal").textContent = Math.round(parseFloat($("quality").value) * 100) + "%";
}

async function loadOptions() {
  let stored = {};
  try {
    stored = (await browser.storage.local.get("options")).options || {};
  } catch (e) {
    /* fall back to defaults */
  }
  const o = Object.assign({}, DEFAULTS, stored);
  $("format").value = o.format;
  $("quality").value = o.quality;
  $("maxHeight").value = o.maxSegmentHeight;
  $("delay").value = o.delay;
  $("hideFixed").checked = o.hideFixed;
  updateQualityUI();
}

async function saveOptions() {
  try {
    await browser.storage.local.set({ options: readOptions() });
  } catch (e) {
    /* non-fatal */
  }
}

function setBusy(busy) {
  $("captureFull").disabled = busy;
  $("captureVisible").disabled = busy;
  $("progress").classList.toggle("hidden", !busy);
  if (busy) {
    $("barFill").style.width = "0%";
    $("status").textContent = "Preparing…";
  }
}

async function start(mode) {
  await saveOptions();
  setBusy(true);
  browser.runtime.sendMessage({ type: "startCapture", mode });
}

// React to progress/result messages from the background script.
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "start":
      setBusy(true);
      break;
    case "progress": {
      const pct = msg.total ? Math.round((msg.current / msg.total) * 100) : 0;
      $("barFill").style.width = pct + "%";
      $("status").textContent =
        msg.phase === "saving"
          ? `Saving image ${msg.current} of ${msg.total}…`
          : `Capturing ${msg.current} of ${msg.total}…`;
      break;
    }
    case "done":
      $("barFill").style.width = "100%";
      $("status").textContent =
        msg.count > 1 ? `Done — saved ${msg.count} images.` : "Done — saved to Downloads.";
      setTimeout(() => setBusy(false), 2200);
      break;
    case "error":
      $("progress").classList.remove("hidden");
      $("barFill").style.width = "0%";
      $("status").textContent = "⚠ " + msg.message;
      $("captureFull").disabled = false;
      $("captureVisible").disabled = false;
      break;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadOptions();

  $("captureFull").addEventListener("click", () => start("full"));
  $("captureVisible").addEventListener("click", () => start("visible"));

  $("format").addEventListener("change", () => {
    updateQualityUI();
    saveOptions();
  });
  $("quality").addEventListener("input", updateQualityUI);
  ["quality", "maxHeight", "delay", "hideFixed"].forEach((id) => {
    $(id).addEventListener("change", saveOptions);
  });
});
