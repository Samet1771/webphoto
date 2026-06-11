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
  hideFixed: true,
  scrollArea: "auto"
};

const $ = (id) => document.getElementById(id);

// Only the fields the popup actually controls. Split height and capture delay
// live on the full settings page now.
function readOptions() {
  return {
    format: $("format").value,
    quality: parseFloat($("quality").value),
    hideFixed: $("hideFixed").checked,
    scrollArea: $("scrollArea").value
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
  $("scrollArea").value = o.scrollArea;
  $("format").value = o.format;
  $("quality").value = o.quality;
  $("hideFixed").checked = o.hideFixed;
  updateQualityUI();
}

// Merge-save: only overwrite the popup's own fields, preserving settings owned
// by the options page (split height, delay, zip, clipboard, capture-on-click).
async function saveOptions() {
  try {
    const cur = (await browser.storage.local.get("options")).options || {};
    await browser.storage.local.set({ options: Object.assign({}, cur, readOptions()) });
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
    case "done": {
      $("barFill").style.width = "100%";
      let txt;
      if (msg.zipped) txt = `Done — saved a .zip of ${msg.count} images.`;
      else txt = msg.count > 1 ? `Done — saved ${msg.count} images.` : "Done — saved to Downloads.";
      if (msg.copied) txt += " Copied.";
      $("status").textContent = txt;
      setTimeout(() => setBusy(false), 2200);
      break;
    }
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
  ["scrollArea", "quality", "hideFixed"].forEach((id) => {
    $(id).addEventListener("change", saveOptions);
  });

  $("openSettings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
});
