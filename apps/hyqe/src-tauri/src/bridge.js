/*
 * Hyqe's bridge, put at the start of every HTML page it serves (protocol.rs). The page lives in a
 * frame of another origin: it cannot reach the app, and the app cannot reach into it. This script
 * is the one way between them, by messages:
 *
 * - web links and window.open leave for the browser, F5 and Ctrl+F go to the app,
 * - the app asks the page to search itself (window.find),
 * - the page's background colour, for the toolbar,
 * - comments (apps/hyqe/KOMMENTARE.md): which element the pointer is on, where the elements with
 *   comments are, keys. The app draws the margin button, the marks and the cards over the frame;
 *   nothing of it is part of the page.
 *
 * Elements are named by `data-hyqe-at`, the offset of their start tag in the file (annotate.rs).
 * The end tag of a script element must never appear in this file (it is inlined into the page).
 */
(function () {
  function tell(m) {
    try {
      parent.postMessage(m, "*");
    } catch (e) {}
  }

  // ---- links, search, keys, colour -------------------------------------------------------------

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented) return;
      if (/^(https?|mailto):/i.test(a.href)) {
        e.preventDefault();
        tell({ hyqe: "open-url", url: a.href });
      }
    },
    true,
  );
  window.open = function (u) {
    if (u && /^https?:/i.test(String(u))) tell({ hyqe: "open-url", url: String(u) });
    return null;
  };

  function opaque(c) {
    return c && c !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(c);
  }
  function report() {
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!opaque(bg)) bg = getComputedStyle(document.documentElement).backgroundColor;
    if (!opaque(bg)) {
      // No background of its own: the canvas, which a page that asks for dark gets dark.
      var cs = getComputedStyle(document.documentElement).colorScheme || "";
      var dark = /dark/.test(cs) && (!/light/.test(cs) || matchMedia("(prefers-color-scheme: dark)").matches);
      bg = dark ? "rgb(18, 18, 18)" : "rgb(255, 255, 255)";
    }
    tell({ hyqe: "page", background: bg, title: document.title });
  }
  addEventListener("load", report);

  // ---- comments: which element ------------------------------------------------------------------

  var AT = "data-hyqe-at";
  /** What the app allows: "yes" (comment), "read-only" (only show), "no". */
  var mode = "no";
  /** The offsets whose places the app wants to know (elements with comments, an open card). */
  var tracked = [];
  /** The element pointed at: its ladder (the content block, then wider containers) and the rung. */
  var cur = null;

  var MEDIA = /^(img|svg|canvas|video|audio|iframe|picture|object|embed|math|hr)$/;
  var CONTROL = /^(button|input|select|textarea|meter|progress)$/;
  var SKIP = /^(html|head|body|script|style|template|noscript|br|wbr|option|optgroup|source|track|area|map|param|title|meta|link)$/;

  function at(el) {
    var v = el && el.getAttribute && el.getAttribute(AT);
    return v == null ? null : Number(v);
  }
  function shown(el) {
    var r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  }
  function blockish(display) {
    return !/^(inline|contents|none)$/.test(display);
  }
  /** Text of its own: a text node, or an inline element with text, right inside. */
  function ownText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.data)) return true;
      if (n.nodeType === 1 && getComputedStyle(n).display === "inline" && /\S/.test(n.textContent)) return true;
    }
    return false;
  }
  function usable(el) {
    return at(el) != null && !SKIP.test(el.localName) && shown(el);
  }
  /** A block of content: text of its own, a picture, a control. */
  function content(el) {
    if (!usable(el)) return false;
    var n = el.localName;
    if (MEDIA.test(n) || CONTROL.test(n)) return true;
    var d = getComputedStyle(el).display;
    if (n === "a" && d !== "inline") return true; // a link that looks like a button
    return blockish(d) && ownText(el);
  }
  /** A container one may widen to: any box of its own. */
  function structural(el) {
    return usable(el) && (blockish(getComputedStyle(el).display) || MEDIA.test(el.localName));
  }
  function top(el) {
    return !el || el === document.body || el === document.documentElement;
  }

  /** The content block under the pointer, else the nearest box. */
  function pick(t) {
    var el = t && t.nodeType === 1 ? t : t && t.parentElement;
    if (!el) return null;
    while (el.ownerSVGElement) el = el.ownerSVGElement; // a drawing is one thing
    for (var e = el; !top(e); e = e.parentElement) if (content(e)) return e;
    for (e = el; !top(e); e = e.parentElement) if (structural(e)) return e;
    return null;
  }

  function same(a, b) {
    return Math.abs(a.top - b.top) < 2 && Math.abs(a.bottom - b.bottom) < 2 && Math.abs(a.left - b.left) < 2 && Math.abs(a.right - b.right) < 2;
  }

  /** The block and the containers around it; wrappers of the same size count once (the outer one). */
  function ladder(el) {
    var out = [el];
    for (var e = el.parentElement; !top(e); e = e.parentElement) {
      if (!structural(e)) continue;
      var last = out[out.length - 1];
      if (out.length > 1 && same(e.getBoundingClientRect(), last.getBoundingClientRect())) out[out.length - 1] = e;
      else if (!same(e.getBoundingClientRect(), last.getBoundingClientRect())) out.push(e);
    }
    return out;
  }

  function label(el) {
    var s = el.localName;
    if (el.id) return s + "#" + el.id;
    var c = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
    return c ? s + "." + c : s;
  }

  /** Whether white space before the element shows: then the comment goes straight before its tag. */
  function wsMatters(el) {
    var p = el.parentElement;
    if (!p) return false;
    var ps = getComputedStyle(p);
    var cs = getComputedStyle(el);
    var collapse = ps.whiteSpaceCollapse || "";
    var ws = ps.whiteSpace || "";
    if (/preserve|break-spaces/.test(collapse) || /^pre/.test(ws) || ws === "break-spaces") return true;
    if (/flex|grid/.test(ps.display)) return false;
    if (cs.position === "absolute" || cs.position === "fixed" || (cs.cssFloat && cs.cssFloat !== "none")) return false;
    return /^inline/.test(cs.display) || /^(ruby|contents)/.test(cs.display);
  }

  function rect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function hoverInfo() {
    if (!cur) return null;
    var el = cur.ladder[cur.level];
    if (!el.isConnected) return null;
    return {
      at: at(el),
      rect: rect(el),
      label: cur.ladder
        .slice(0, cur.level + 1)
        .reverse()
        .map(label)
        .join(" › "),
      level: cur.level,
      levels: cur.ladder.length,
      ws: wsMatters(el),
    };
  }

  function point(target) {
    var el = mode === "yes" ? pick(target) : null;
    if (cur && el === cur.ladder[0]) return;
    cur = el ? { ladder: ladder(el), level: 0 } : null;
    tell({ hyqe: "hover", target: hoverInfo() });
  }

  function widen(by) {
    if (!cur) return;
    var level = Math.max(0, Math.min(cur.ladder.length - 1, cur.level + by));
    if (level === cur.level) return;
    cur.level = level;
    tell({ hyqe: "hover", target: hoverInfo() });
  }

  document.addEventListener("mousemove", function (e) {
    if (mode === "yes") point(e.target);
  });
  document.addEventListener("mouseout", function (e) {
    if (!e.relatedTarget && cur) {
      cur = null;
      tell({ hyqe: "hover", target: null, left: true });
    }
  });
  document.addEventListener(
    "pointerdown",
    function () {
      tell({ hyqe: "down" });
    },
    true,
  );

  // ---- comments: where the elements are --------------------------------------------------------

  function byAt(n) {
    return document.querySelector("[" + AT + '="' + n + '"]');
  }

  var queued = false;
  function places() {
    queued = false;
    var rects = {};
    for (var i = 0; i < tracked.length; i++) {
      var el = byAt(tracked[i]);
      var r = el ? rect(el) : null;
      if (r) r.ws = wsMatters(el);
      rects[tracked[i]] = r;
    }
    var h = cur && cur.ladder[cur.level];
    tell({ hyqe: "rects", rects: rects, hover: h && h.isConnected ? rect(h) : null, at: h ? at(h) : null });
  }
  function schedule() {
    if (queued || (!tracked.length && !cur)) return;
    queued = true;
    requestAnimationFrame(places);
  }
  addEventListener("scroll", schedule, true);
  addEventListener("resize", schedule);
  // The page may move by itself (pictures loading, scripts)
  setInterval(schedule, 600);

  // ---- keys ---------------------------------------------------------------------------------------

  document.addEventListener(
    "keydown",
    function (e) {
      var t = e.target;
      var field = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R"))) {
        e.preventDefault();
        tell({ hyqe: "reload" });
      } else if (e.ctrlKey && !e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        tell({ hyqe: "search" });
      } else if (e.key === "+" && !e.ctrlKey && !e.altKey && !e.metaKey && !field && mode === "yes" && cur) {
        e.preventDefault();
        e.stopImmediatePropagation();
        tell({ hyqe: "plus" });
      } else if (e.altKey && !e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && mode === "yes" && cur) {
        e.preventDefault();
        e.stopImmediatePropagation();
        widen(e.key === "ArrowUp" ? 1 : -1);
      } else if (e.key === "F7" && !e.ctrlKey && !e.altKey && mode !== "no") {
        e.preventDefault();
        tell({ hyqe: "key", key: "F7", shift: e.shiftKey });
      } else if (e.ctrlKey && e.altKey && (e.key === "m" || e.key === "M") && mode === "yes") {
        e.preventDefault();
        tell({ hyqe: "key", key: "comment" });
      } else if (e.key === "Escape") {
        tell({ hyqe: "key", key: "Escape" });
      }
    },
    true,
  );

  // ---- what the app asks for ------------------------------------------------------------------------

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || e.source !== parent) return;
    if (d.hyqe === "find") {
      getSelection().removeAllRanges();
      var ok = d.text ? window.find(d.text, false, !!d.back, true, false, false, false) : false;
      tell({ hyqe: "found", ok: ok });
    } else if (d.hyqe === "setup") {
      mode = d.mode;
      if (mode !== "yes" && cur) {
        cur = null;
        tell({ hyqe: "hover", target: null });
      }
    } else if (d.hyqe === "track") {
      tracked = d.ats || [];
      queued = false;
      places();
    } else if (d.hyqe === "widen") {
      widen(d.by);
    } else if (d.hyqe === "reveal") {
      var el = byAt(d.at);
      if (el) el.scrollIntoView({ block: "center" });
      places();
    } else if (d.hyqe === "shift") {
      // A comment was written: the offsets behind it moved (annotate.rs, Edit)
      var from = d.at + d.removed;
      var by = d.inserted - d.removed;
      var all = document.querySelectorAll("[" + AT + "]");
      for (var i = 0; i < all.length; i++) {
        var v = Number(all[i].getAttribute(AT));
        if (v >= from) all[i].setAttribute(AT, String(v + by));
      }
      places();
    }
  });

  function ready() {
    tell({ hyqe: "ready", anchored: !!document.querySelector("[" + AT + "]") });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
