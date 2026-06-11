/*
 * content.js
 * Injected on demand into the active tab. It figures out WHAT actually scrolls
 * (the window, or an inner element with overflow:auto/scroll that many web apps
 * use), hides scrollbars, then scrolls that target step-by-step. For each step
 * it reports back the exact rectangle of the viewport to copy ("crop") and where
 * that pixels belong in the final image ("dest"), all in CSS pixels. The
 * background script multiplies by devicePixelRatio, crops the captured frame,
 * and stitches it. Floating/sticky headers can be hidden so they don't repeat.
 */
(() => {
  "use strict";

  if (window.__fpsInjected) {
    return;
  }
  window.__fpsInjected = true;

  const STYLE_ID = "__fps_hide_scrollbar_style";
  let saved = null;
  let floatingEls = [];

  // The current scroll target. null === scroll the page/window.
  let target = null;
  let isPage = true;
  // Geometry captured at prepare() time (CSS px).
  let geom = null;

  /* ------------------------------------------------------------------ */
  /* Scrollbar hiding                                                    */
  /* ------------------------------------------------------------------ */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "html { scrollbar-width: none !important; }" +
      "html::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Scroll-container detection                                          */
  /* ------------------------------------------------------------------ */

  function isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    let cs;
    try {
      cs = getComputedStyle(el);
    } catch (e) {
      return false;
    }
    const oy = cs.overflowY;
    const scrolls = oy === "auto" || oy === "scroll" || oy === "overlay";
    return scrolls && el.scrollHeight - el.clientHeight > 4 && el.clientHeight > 40;
  }

  function scoreElement(el) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    const visW = Math.min(r.right, vw) - Math.max(r.left, 0);
    const visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (visW <= 0 || visH <= 0) return 0;
    const hidden = el.scrollHeight - el.clientHeight; // how much content is offscreen
    return hidden * (visW * visH); // lots of hidden content AND a big on-screen area
  }

  // Cheap probe first (elements under a few viewport points), then a bounded
  // full scan only if nothing turned up.
  function findScrollContainer() {
    const found = new Map();
    const consider = (el) => {
      if (isScrollable(el)) {
        const s = scoreElement(el);
        if (s > 0) found.set(el, s);
      }
    };

    const pts = [
      [0.5, 0.5], [0.5, 0.3], [0.5, 0.7], [0.3, 0.5], [0.7, 0.5]
    ];
    for (const [fx, fy] of pts) {
      let el = document.elementFromPoint(window.innerWidth * fx, window.innerHeight * fy);
      let guard = 0;
      while (el && guard++ < 200) {
        consider(el);
        el = el.parentElement;
      }
    }

    if (found.size === 0 && document.body) {
      const all = document.body.getElementsByTagName("*");
      const limit = Math.min(all.length, 8000);
      for (let i = 0; i < limit; i++) consider(all[i]);
    }

    let best = null;
    let bestScore = 0;
    for (const [el, s] of found) {
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Floating header handling                                           */
  /* ------------------------------------------------------------------ */

  function collectFloating() {
    floatingEls = [];
    if (!document.body) return;
    const all = document.body.getElementsByTagName("*");
    const limit = Math.min(all.length, 8000);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      let pos;
      try {
        pos = getComputedStyle(el).position;
      } catch (e) {
        continue;
      }
      if (pos === "fixed" || pos === "sticky") floatingEls.push(el);
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

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                   */
  /* ------------------------------------------------------------------ */

  // Content box origin (where scroll offset 0 sits) and visible size, all in
  // CSS px relative to the viewport. Works for both the page and an element.
  function computeGeometry() {
    if (isPage) {
      const doc = document.documentElement;
      const body = document.body || doc;
      return {
        contentTop: 0,
        contentLeft: 0,
        clientWidth: doc.clientWidth,
        clientHeight: doc.clientHeight,
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth, doc.clientWidth),
        scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight, doc.clientHeight)
      };
    }
    const r = target.getBoundingClientRect();
    const cs = getComputedStyle(target);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0;
    return {
      contentTop: r.top + bt,
      contentLeft: r.left + bl,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
      scrollWidth: target.scrollWidth,
      scrollHeight: target.scrollHeight
    };
  }

  function getScroll() {
    return isPage
      ? { x: window.scrollX, y: window.scrollY }
      : { x: target.scrollLeft, y: target.scrollTop };
  }

  function applyScroll(x, y) {
    if (isPage) {
      window.scrollTo(x, y);
    } else {
      target.scrollLeft = x;
      target.scrollTop = y;
    }
  }

  // Unique stops across [0, total) stepping by `step`, each clamped to `max`.
  function buildStops(total, step, max) {
    const stops = [];
    const s = Math.max(1, step);
    for (let p = 0; p < total; p += s) stops.push(Math.min(p, max));
    if (stops.length === 0) stops.push(0);
    return stops.filter((v, i) => stops.indexOf(v) === i);
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                           */
  /* ------------------------------------------------------------------ */

  function prepare(options) {
    options = options || {};
    saved = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollBehavior: document.documentElement.style.scrollBehavior,
      target: null,
      targetScrollbar: "",
      targetScrollLeft: 0,
      targetScrollTop: 0,
      targetBehavior: ""
    };
    document.documentElement.style.scrollBehavior = "auto";
    injectStyle();

    // Decide what scrolls.
    const doc = document.documentElement;
    const pageHidden = Math.max(doc.scrollHeight, (document.body || doc).scrollHeight) - doc.clientHeight;
    const wanted = options.scrollArea || "auto";

    if (wanted === "page") {
      target = null;
    } else if (wanted === "element") {
      target = findScrollContainer();
    } else {
      // auto: only switch to an inner container when it dominates the viewport
      // and either the page barely scrolls or the container clearly holds more
      // content. This avoids hijacking a normal long page that happens to embed
      // a tall scrollable widget.
      const el = findScrollContainer();
      if (el) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const r = el.getBoundingClientRect();
        const visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        const visW = Math.min(r.right, vw) - Math.max(r.left, 0);
        const coversViewport = visH >= vh * 0.5 && visW >= vw * 0.5;
        const pageBarelyScrolls = pageHidden < vh * 0.5;
        const elHidden = el.scrollHeight - el.clientHeight;
        target = coversViewport && (pageBarelyScrolls || elHidden > pageHidden * 1.5) ? el : null;
      } else {
        target = null;
      }
    }
    isPage = !target;

    // Hide the target element's own scrollbar too, and remember to restore it.
    if (!isPage) {
      saved.target = target;
      saved.targetScrollbar = target.style.scrollbarWidth || "";
      saved.targetScrollLeft = target.scrollLeft;
      saved.targetScrollTop = target.scrollTop;
      saved.targetBehavior = target.style.scrollBehavior || "";
      target.style.scrollbarWidth = "none";
      target.style.scrollBehavior = "auto";
    }

    collectFloating();
    void document.documentElement.offsetHeight; // force reflow

    geom = computeGeometry();
    const maxX = Math.max(0, geom.scrollWidth - geom.clientWidth);
    const maxY = Math.max(0, geom.scrollHeight - geom.clientHeight);

    // Step by the on-screen visible content size so tiles are contiguous.
    const stepX = Math.max(1, Math.min(geom.clientWidth, window.innerWidth - Math.max(0, geom.contentLeft)));
    const stepY = Math.max(1, Math.min(geom.clientHeight, window.innerHeight - Math.max(0, geom.contentTop)));

    return {
      mode: isPage ? "page" : "element",
      devicePixelRatio: window.devicePixelRatio || 1,
      outputWidth: geom.scrollWidth,
      outputHeight: geom.scrollHeight,
      xs: buildStops(geom.scrollWidth, stepX, maxX),
      ys: buildStops(geom.scrollHeight, stepY, maxY)
    };
  }

  // Scroll to (x, y) on the target, then report the visible crop + where it
  // lands in the output image.
  function scrollToPos(x, y) {
    applyScroll(x, y);
    const s = getScroll();
    const g = geom || computeGeometry();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // The currently-visible portion of the target's content, in viewport CSS px.
    const cropX = Math.max(0, g.contentLeft);
    const cropY = Math.max(0, g.contentTop);
    const cropW = Math.max(0, Math.min(vw, g.contentLeft + g.clientWidth) - cropX);
    const cropH = Math.max(0, Math.min(vh, g.contentTop + g.clientHeight) - cropY);

    // Where those pixels go in the stitched image (content coordinates).
    const destX = s.x + (cropX - g.contentLeft);
    const destY = s.y + (cropY - g.contentTop);

    return {
      scrollX: s.x,
      scrollY: s.y,
      crop: { x: cropX, y: cropY, w: cropW, h: cropH },
      dest: { x: destX, y: destY }
    };
  }

  function restore() {
    setFloatingVisible(true);
    removeStyle();
    if (saved) {
      document.documentElement.style.scrollBehavior = saved.scrollBehavior;
      if (saved.target) {
        saved.target.style.scrollbarWidth = saved.targetScrollbar;
        saved.target.style.scrollBehavior = saved.targetBehavior;
        saved.target.scrollLeft = saved.targetScrollLeft;
        saved.target.scrollTop = saved.targetScrollTop;
      }
      window.scrollTo(saved.scrollX, saved.scrollY);
    }
    saved = null;
    floatingEls = [];
    target = null;
    isPage = true;
    geom = null;
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.cmd) return false;
    switch (msg.cmd) {
      case "prepare":
        return Promise.resolve(prepare(msg.options));
      case "scrollTo":
        return Promise.resolve(scrollToPos(msg.x, msg.y));
      case "hideFloating":
        setFloatingVisible(false);
        return Promise.resolve({ ok: true });
      case "restore":
        restore();
        return Promise.resolve({ ok: true });
      default:
        return false;
    }
  });
})();
