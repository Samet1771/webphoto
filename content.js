/*
 * content.js
 * Injected on demand into the active tab. It measures the page, hides the
 * scrollbar (Firefox-specific, keeps the page scrollable), scrolls to exact
 * positions for each capture, and can hide floating/sticky headers so they
 * don't repeat in every tile. The background script drives all of this over
 * runtime messages.
 */
(() => {
  "use strict";

  // Guard against double injection (background may inject before every run).
  if (window.__fpsInjected) {
    return;
  }
  window.__fpsInjected = true;

  const STYLE_ID = "__fps_hide_scrollbar_style";
  let saved = null;
  let floatingEls = [];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // scrollbar-width works in Firefox and keeps the page scrollable while
    // removing the gutter, so tiles cover the full content width.
    style.textContent =
      "html { scrollbar-width: none !important; }" +
      "html::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  function getMetrics() {
    const doc = document.documentElement;
    const body = document.body || doc;
    const totalWidth = Math.max(doc.scrollWidth, body.scrollWidth, doc.clientWidth);
    const totalHeight = Math.max(doc.scrollHeight, body.scrollHeight, doc.clientHeight);
    return {
      totalWidth,
      totalHeight,
      viewportWidth: doc.clientWidth,
      viewportHeight: doc.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  // Find elements that stay on screen while scrolling (fixed/sticky). These
  // are hidden after the first tile so a sticky header doesn't repeat down
  // the whole screenshot.
  function collectFloating() {
    floatingEls = [];
    if (!document.body) return;
    const all = document.body.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      let pos;
      try {
        pos = getComputedStyle(el).position;
      } catch (e) {
        continue;
      }
      if (pos === "fixed" || pos === "sticky") {
        floatingEls.push(el);
      }
    }
  }

  function setFloatingVisible(visible) {
    for (const el of floatingEls) {
      if (!visible) {
        if (el.getAttribute("data-fps-vis") === null) {
          el.setAttribute("data-fps-vis", el.style.visibility || "");
        }
        el.style.setProperty("visibility", "hidden", "important");
      } else {
        const prev = el.getAttribute("data-fps-vis");
        if (prev !== null) {
          el.style.visibility = prev;
          el.removeAttribute("data-fps-vis");
        }
      }
    }
  }

  function prepare() {
    saved = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollBehavior: document.documentElement.style.scrollBehavior
    };
    // Instant scrolling so captures aren't taken mid-animation.
    document.documentElement.style.scrollBehavior = "auto";
    injectStyle();
    collectFloating();
    // Force a reflow so the new metrics reflect the hidden scrollbar.
    void document.documentElement.offsetHeight;
    return getMetrics();
  }

  function restore() {
    setFloatingVisible(true);
    removeStyle();
    if (saved) {
      document.documentElement.style.scrollBehavior = saved.scrollBehavior;
      window.scrollTo(saved.scrollX, saved.scrollY);
    }
    saved = null;
    floatingEls = [];
  }

  function scrollToPos(x, y) {
    window.scrollTo(x, y);
    // Return the clamped position so the background can place the tile exactly.
    return { x: window.scrollX, y: window.scrollY };
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.cmd) return false;
    switch (msg.cmd) {
      case "ping":
        return Promise.resolve({ ok: true });
      case "prepare":
        return Promise.resolve(prepare());
      case "scrollTo":
        return Promise.resolve(scrollToPos(msg.x, msg.y));
      case "hideFloating":
        setFloatingVisible(false);
        return Promise.resolve({ ok: true });
      case "showFloating":
        setFloatingVisible(true);
        return Promise.resolve({ ok: true });
      case "restore":
        restore();
        return Promise.resolve({ ok: true });
      default:
        return false;
    }
  });
})();
