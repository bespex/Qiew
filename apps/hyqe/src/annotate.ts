/*
 * Comments on the elements of the page (apps/hyqe/KOMMENTARE.md), drawn over the frame:
 *
 * - pointing at an element (with --annotate): a thin line beside it and a "+" in its left margin;
 *   "+" (key or click) opens the input card under it (on an element that has comments: changing
 *   its last open one, else its last one); Alt+↑ / Alt+↓ widen to the container around it and back
 *   (its name is shown at the line),
 * - elements with comments: a small mark per comment in the colour of its type; pointing at the
 *   marks shows their card, a click keeps it open. With --annotate the card offers tick, change,
 *   remove and "+ Comment"; without it, it only shows (as in Marq),
 * - F7 / Shift+F7: the next / previous comment; Ctrl+Alt+M: a new comment on the element pointed at,
 *   also where there are comments already.
 *
 * The page lives in a frame of its own origin; the bridge in it (src-tauri/src/bridge.js) tells
 * which element is pointed at and where the elements are, by their `data-hyqe-at` offsets. What
 * is drawn here is on a layer of the app over the frame, so the page's styles cannot touch it and
 * the page never sees it. Writing is the backend's (annotate.rs); margin button, input card and
 * note come from the frame (@qiew/frame/annotate), the same as in Marq and Dirq.
 */
import { invoke } from "@tauri-apps/api/core";
import { inputCard, marginButton, noteAction, noteHtml } from "@qiew/frame/annotate";
import "@qiew/frame/annotate.css";

/** The comment types, as in Marq (apps/marq/src/annotate.ts, COMMENT_TYPE_INFO). */
const KINDS = {
  ai: { title: "für die KI", colour: "#a371f7" },
  me: { title: "Merkzettel", colour: "#d29922" },
  you: { title: "für andere", colour: "#3fb950" },
} as const;
type Kind = keyof typeof KINDS;
const colour = (kind: string) => `color-mix(in oklab, ${KINDS[kind as Kind]?.colour ?? "var(--accent)"} 70%, var(--fg))`;

export interface Comment {
  at: number;
  kind: string;
  status: string | null;
  text: string;
  /** The element it belongs to (its start tag); null: none follows it. */
  target: number | null;
  /** For a comment without element: the start tag before it. */
  near: number | null;
}

/** What main.ts knows about the document. */
export interface Shown {
  path: string;
  content: string;
  annotate: boolean;
  writable: boolean;
  comments: Comment[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** White space before the element shows (bridge.js, wsMatters): the comment goes right before its tag. */
  ws?: boolean;
}

interface Hover {
  at: number;
  rect: Rect;
  label: string;
  level: number;
  levels: number;
  ws: boolean;
}

interface Edit {
  at: number;
  removed: number;
  inserted: number;
}

interface Written {
  content: string;
  comments: Comment[];
  edit: Edit;
}

let frame: HTMLIFrameElement;
let shown: () => Shown | null;
let written: (content: string, comments: Comment[]) => void;
/** The page in the frame has anchors (it is the file shown, not a page one went to from it). */
let anchored = false;
let hover: Hover | null = null;
/** Where the element pointed at is now (it moves when the page scrolls). */
let hoverRect: Rect | null = null;
const rects = new Map<number, Rect | null>();

const layer = document.createElement("div");
layer.className = "hq-layer";
const bar = document.createElement("div");
bar.className = "hq-bar";
const tag = document.createElement("div");
tag.className = "hq-tag";
layer.append(bar, tag);

const mode = (): "yes" | "read-only" | "no" => {
  const doc = shown();
  if (!doc || !anchored || !doc.annotate) return "no";
  return doc.writable ? "yes" : "read-only";
};

function post(message: object) {
  frame.contentWindow?.postMessage(message, "*");
}

/** Offsets after a change: what lies behind it moves (annotate.rs, Edit). */
const moved = (at: number, e: Edit) => (at >= e.at + e.removed ? at + e.inserted - e.removed : at);

// ---- Groups: the comments of one element ----------------------------------------------------------

interface Group {
  /** Where it is shown: the element's offset, or -1 for the top of the page. */
  key: number;
  orphan: boolean;
  comments: Comment[];
}

function groups(): Group[] {
  const doc = shown();
  if (!doc || !anchored) return [];
  const byKey = new Map<number, Group>();
  for (const c of doc.comments) {
    const key = c.target ?? c.near ?? -1;
    const g = byKey.get(key) ?? { key, orphan: false, comments: [] };
    if (c.target === null) g.orphan = true;
    g.comments.push(c);
    byKey.set(key, g);
  }
  return [...byKey.values()];
}

/** The offsets the bridge reports places of: the groups, an open card. */
function track() {
  const ats = new Set(groups().map((g) => g.key).filter((k) => k >= 0));
  if (input) ats.add(input.at);
  post({ hyqe: "track", ats: [...ats] });
}

// ---- Placing ------------------------------------------------------------------------------------

/** The layer lies exactly over the frame. */
function placeLayer() {
  const r = frame.getBoundingClientRect();
  Object.assign(layer.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
  layer.hidden = frame.hidden || (mode() === "no" && !groups().length);
}

const rectOf = (key: number): Rect | null => (key < 0 ? { x: 12, y: 8, w: 0, h: 0 } : (rects.get(key) ?? null));
const inView = (r: Rect) => r.y + r.h > 0 && r.y < layer.clientHeight;

/** The margin left of an element: outside it if there is room, else just inside. */
const marginX = (r: Rect) => (r.x >= 24 ? r.x - 22 : r.x + 2);

/** The marks of the groups in view, by key; kept while the page scrolls, so pointing stays on them. */
const marks = new Map<number, HTMLButtonElement>();

function clearMarks() {
  for (const m of marks.values()) m.remove();
  marks.clear();
}

function drawMarks() {
  const keep = new Set<number>();
  for (const g of groups()) {
    const r = rectOf(g.key);
    if (!r || !inView(r)) continue;
    keep.add(g.key);
    let b = marks.get(g.key);
    if (!b) {
      const key = g.key;
      b = document.createElement("button");
      b.type = "button";
      b.addEventListener("mouseenter", () => showCard(key, false));
      b.addEventListener("mouseleave", () => card && !card.pinned && hideCardLater());
      b.addEventListener("click", () => showCard(key, true));
      layer.append(b);
      marks.set(g.key, b);
    }
    const dots = g.comments.map((c) => `<span class="hq-dot${c.status ? " done" : ""}" style="--note: ${colour(c.kind)}"></span>`).join("");
    if (b.dataset.dots !== dots) {
      const open = g.comments.filter((c) => !c.status).length;
      const label = `${g.comments.length === 1 ? "1 comment" : `${g.comments.length} comments`}${open < g.comments.length ? `, ${open} open` : ""}`;
      b.title = `${label} (F7)`;
      b.setAttribute("aria-label", label);
      b.innerHTML = dots;
      b.dataset.dots = dots;
    }
    b.className = `hq-marks${g.orphan ? " orphan" : ""}${card?.key === g.key ? " active" : ""}`;
    b.style.top = `${r.y + 2}px`;
    b.style.left = `${marginX(r)}px`;
  }
  for (const [k, b] of marks) {
    if (keep.has(k)) continue;
    b.remove();
    marks.delete(k);
  }
}

function drawHover() {
  const r = hover && (hoverRect ?? hover.rect);
  if (!hover || !r || mode() !== "yes") {
    bar.hidden = true;
    tag.hidden = true;
    return;
  }
  bar.hidden = false;
  Object.assign(bar.style, { top: `${r.y}px`, height: `${r.h}px`, left: `${Math.max(0, r.x - 5)}px` });
  tag.hidden = hover.level === 0;
  tag.textContent = `${hover.label}   Alt+↑ / Alt+↓`;
  Object.assign(tag.style, { top: `${Math.max(0, r.y - 20)}px`, left: `${Math.max(0, r.x)}px` });
  const ownMarks = marks.get(hover.at);
  const top = ownMarks ? ownMarks.offsetTop + ownMarks.offsetHeight + 2 : r.y + 2;
  plus.show(layer, { top, left: marginX(r) });
  // the marks may also be those of comments without element, shown here: "+" changes only the element's own
  const has = !!shown()?.comments.some((c) => c.target === hover!.at);
  const title = has ? "Change the comment" : "Add a comment";
  plus.el.title = has ? `${title} (+) – a further one: Ctrl+Alt+M` : `${title} (+, Ctrl+Alt+M)`;
  plus.el.setAttribute("aria-label", title);
}

function draw() {
  placeLayer();
  drawMarks();
  drawHover();
  placeCard();
  placeInput();
}

// ---- The margin button --------------------------------------------------------------------------

const plus = marginButton({ layer, title: "Add a comment", onClick: () => plusAction() });

/**
 * "+" (key or button) on the element pointed at: a new comment, or, if it has comments, its last
 * open one (else its last one) to change.
 */
function plusAction() {
  if (!hover) return;
  const own = (shown()?.comments ?? []).filter((c) => c.target === hover!.at);
  const c = [...own].reverse().find((x) => !x.status) ?? own[own.length - 1];
  openInput(hover.at, hover.ws, c);
}
let hideTimer: number | undefined;
let onPlus = false;
plus.el.addEventListener("mouseenter", () => {
  onPlus = true;
  clearTimeout(hideTimer);
});
plus.el.addEventListener("mouseleave", () => {
  onPlus = false;
  hideHoverLater();
});

function hideHoverLater() {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (onPlus) return;
    hover = null;
    plus.hide();
    drawHover();
  }, 300);
}

// ---- The input card -----------------------------------------------------------------------------

let lastKind: Kind = "ai";

interface Input {
  el: HTMLElement;
  /** The element it is for (its offset now). */
  at: number;
  /** Changing a comment: its offset. */
  comment: number | null;
}
let input: Input | null = null;

function closeInput() {
  input?.el.remove();
  input = null;
  track();
}

function placeInput() {
  if (!input) return;
  const r = rects.get(input.at);
  const w = Math.min(560, Math.max(360, r?.w ?? 0), layer.clientWidth - 16);
  input.el.style.width = `${w}px`;
  if (!r) return; // it stays where it was; saving says if the element is gone
  const h = input.el.offsetHeight;
  let y = r.y + r.h + 6;
  if (y + h > layer.clientHeight - 4) y = Math.max(4, Math.min(r.y - h - 6, layer.clientHeight - h - 4));
  input.el.style.top = `${y}px`;
  input.el.style.left = `${Math.max(8, Math.min(r.x, layer.clientWidth - w - 8))}px`;
}

function openInput(at: number, ws: boolean, edit?: Comment) {
  const doc = shown();
  if (!doc || mode() !== "yes") return;
  closeInput();
  hideCard();
  plus.hide();
  const me: Input = { el: document.createElement("div"), at, comment: edit?.at ?? null };
  const c = inputCard({
    title: edit ? "Change comment" : "New comment",
    text: edit?.text,
    placeholder: `${edit ? "Change the comment" : "A comment"} …`,
    hint: "Ctrl+Enter saves, Esc cancels",
    submit: "Save",
    chips: (Object.keys(KINDS) as Kind[]).map((k) => ({ id: k, label: `@${k}`, colour: colour(k), title: KINDS[k].title })),
    chip: edit?.kind ?? lastKind,
    lockChip: !!edit,
    onCancel: () => closeInput(),
    onSubmit: async (text, chip) => {
      const now = shown();
      if (!now) return;
      const kind = (chip ?? lastKind) as Kind;
      const w = me.comment !== null
        ? await invoke<Written>("comment_edit", { path: now.path, seen: now.content, at: me.comment, text })
        : await invoke<Written>("comment_add", { path: now.path, seen: now.content, at: me.at, kind, text, ws });
      if (me.comment === null) lastKind = kind;
      if (input === me) closeInput();
      apply(w);
    },
  });
  me.el = c.el;
  c.el.classList.add("hq-input");
  input = me;
  layer.append(c.el);
  track();
  placeInput();
  c.focus();
}

// ---- The card of a group ------------------------------------------------------------------------

interface Card {
  el: HTMLElement;
  key: number;
  pinned: boolean;
}
let card: Card | null = null;
let cardTimer: number | undefined;

function cardHtml(g: Group): string {
  const m = mode();
  const head = g.orphan && g.comments.every((c) => c.target === null) ? `<div class="hq-orphan">No element follows these comments.</div>` : "";
  const rows = g.comments
    .map((c) =>
      noteHtml({
        id: String(c.at),
        text: c.text,
        colour: colour(c.kind),
        label: `@${c.kind}`,
        badges: c.status ? [{ text: c.status }] : [],
        done: !!c.status,
        tools: m === "yes" ? [c.status ? "reopen" : "tick", "edit", "remove"] : [],
      }),
    )
    .join("");
  const foot =
    m === "yes" && g.key >= 0 && !(g.orphan && g.comments.every((c) => c.target === null))
      ? `<div class="hq-foot"><button type="button" data-act="add" title="Add a comment (Ctrl+Alt+M)">+ Comment</button></div>`
      : shown()?.annotate && m === "read-only"
        ? `<div class="hq-foot hq-hint">The file is read-only.</div>`
        : "";
  return head + rows + foot + `<div class="qa-error hq-error" hidden></div>`;
}

function showCard(key: number, pin: boolean) {
  clearTimeout(cardTimer);
  const g = groups().find((x) => x.key === key);
  if (!g) return hideCard();
  if (card?.key === key) {
    card.pinned ||= pin;
    return;
  }
  hideCard();
  const el = document.createElement("div");
  el.className = "hq-card";
  el.setAttribute("role", "note");
  el.innerHTML = cardHtml(g);
  el.addEventListener("mouseenter", () => clearTimeout(cardTimer));
  el.addEventListener("mouseleave", () => card && !card.pinned && hideCardLater());
  el.addEventListener("click", (e) => void act(e));
  layer.append(el);
  card = { el, key, pinned: pin };
  drawMarks();
  placeCard();
}

function placeCard() {
  if (!card) return;
  const m = marks.get(card.key);
  if (!m) {
    card.el.hidden = true;
    return;
  }
  card.el.hidden = false;
  const w = card.el.offsetWidth;
  const h = card.el.offsetHeight;
  const left = Math.max(4, Math.min(m.offsetLeft + m.offsetWidth + 6, layer.clientWidth - w - 8));
  const top = Math.max(4, Math.min(m.offsetTop - 6, layer.clientHeight - h - 4));
  Object.assign(card.el.style, { left: `${left}px`, top: `${top}px` });
}

function hideCard() {
  clearTimeout(cardTimer);
  card?.el.remove();
  card = null;
  for (const m of marks.values()) m.classList.remove("active");
}

function hideCardLater() {
  clearTimeout(cardTimer);
  cardTimer = window.setTimeout(hideCard, 250);
}

/** Opens the card of `key` again after a change (the group may have moved or gone). */
function reopenCard(key: number) {
  hideCard();
  if (groups().some((g) => g.key === key)) showCard(key, true);
}

async function act(e: MouseEvent) {
  if (!card) return;
  const box = card.el;
  const key = card.key;
  if ((e.target as Element).closest("[data-act='add']")) {
    return openInput(key, rects.get(key)?.ws ?? false);
  }
  const a = noteAction(e);
  const doc = shown();
  if (!a || !doc) return;
  const at = Number(a.id);
  const comment = doc.comments.find((c) => c.at === at);
  if (!comment) return;
  try {
    if (a.act === "edit") return openInput(comment.target ?? key, false, comment);
    const w =
      a.act === "remove"
        ? await invoke<Written>("comment_remove", { path: doc.path, seen: doc.content, at })
        : await invoke<Written>("comment_tick", { path: doc.path, seen: doc.content, at, done: a.act === "tick" });
    apply(w);
    reopenCard(moved(key, w.edit));
  } catch (err) {
    const box2 = card?.el === box ? box.querySelector<HTMLElement>(".hq-error") : null;
    if (box2) {
      box2.hidden = false;
      box2.textContent = String(err);
    }
  }
}

// ---- After a change of our own --------------------------------------------------------------------

/** The file was written: the page keeps its state (no reload), its offsets move along. */
function apply(w: Written) {
  post({ hyqe: "shift", ...w.edit });
  const shift = (n: number) => moved(n, w.edit);
  const old = new Map(rects);
  rects.clear();
  for (const [k, r] of old) rects.set(k >= 0 ? shift(k) : k, r);
  if (hover) hover.at = shift(hover.at);
  clearMarks(); // their keys moved
  if (input) input.at = shift(input.at);
  written(w.content, w.comments);
  track();
  draw();
}

// ---- Keys ----------------------------------------------------------------------------------------

/** The next (or previous) group below (above) the top of the view. */
function jump(back: boolean) {
  const all = groups()
    .map((g) => ({ g, r: rectOf(g.key) }))
    .filter((x): x is { g: Group; r: Rect } => !!x.r)
    .sort((a, b) => a.r.y - b.r.y);
  if (!all.length) return;
  const edge = 40;
  const next = back
    ? ([...all].reverse().find((x) => x.r.y < edge - 4) ?? all[all.length - 1])
    : (all.find((x) => x.r.y > edge + 4) ?? all[0]);
  hideCard();
  if (next.g.key >= 0) post({ hyqe: "reveal", at: next.g.key });
  // The page scrolls, then reports where the element is now
  window.setTimeout(() => showCard(next.g.key, true), 120);
}

function key(k: string, shift = false) {
  if (k === "F7") jump(shift);
  else if (k === "comment" && hover && mode() === "yes") openInput(hover.at, hover.ws);
  else if (k === "Escape") {
    if (card) hideCard();
  }
}

// ---- Wiring -------------------------------------------------------------------------------------

/** A message of the bridge; true if it was one of ours. */
export function onPageMessage(data: Record<string, unknown>): boolean {
  switch (data.hyqe) {
    case "ready":
      anchored = data.anchored === true;
      rects.clear();
      clearMarks();
      hover = null;
      hoverRect = null;
      post({ hyqe: "setup", mode: mode() });
      track();
      draw();
      return true;
    case "hover": {
      const t = data.target as Hover | null;
      if (t) {
        clearTimeout(hideTimer);
        hover = t;
        hoverRect = null;
        drawHover();
      } else hideHoverLater();
      return true;
    }
    case "rects": {
      for (const [k, r] of Object.entries((data.rects ?? {}) as Record<string, Rect | null>)) rects.set(Number(k), r);
      if (hover && data.at === hover.at && data.hover) hoverRect = data.hover as Rect;
      draw();
      return true;
    }
    case "plus":
      if (hover) {
        plusAction();
        // The key is still going down in the page: take the focus once more after it
        window.setTimeout(() => input?.el.querySelector("textarea")?.focus(), 0);
      }
      return true;
    case "key":
      key(String(data.key), data.shift === true);
      return true;
    case "down":
      if (card) hideCard();
      return true;
  }
  return false;
}

export function initAnnotate(page: HTMLIFrameElement, current: () => Shown | null, onWritten: (content: string, comments: Comment[]) => void) {
  frame = page;
  shown = current;
  written = onWritten;
  document.body.append(layer);
  window.addEventListener("resize", () => draw());
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    const field = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.key === "+" && !e.ctrlKey && !e.altKey && !e.metaKey && !field && hover && mode() === "yes") {
      e.preventDefault();
      plusAction();
      window.setTimeout(() => input?.el.querySelector("textarea")?.focus(), 0);
    } else if (e.altKey && !e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && hover && !field) {
      e.preventDefault();
      post({ hyqe: "widen", by: e.key === "ArrowUp" ? 1 : -1 });
    } else if (e.key === "F7" && !e.ctrlKey && !e.altKey && mode() !== "no") {
      e.preventDefault();
      key("F7", e.shiftKey);
    } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      key("comment");
    } else if (e.key === "Escape" && card && !field) {
      hideCard();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (card && !card.el.contains(e.target as Node) && !(e.target as Element).closest?.(".hq-marks")) hideCard();
  });
}

/** A new document, a new page in the frame, or the source view: start over. */
export function resetAnnotate() {
  anchored = false;
  hover = null;
  hoverRect = null;
  rects.clear();
  clearMarks();
  hideCard();
  closeInput();
  plus.hide();
  draw();
}

/** The comments changed from outside (the file changed): the page loads anew and says "ready". */
export function refreshAnnotate() {
  hideCard();
  draw();
}
