/*
 * Commenting in the page (only with --annotate, docs/BEDIENKONZEPT.md):
 *
 * - the margin button: pointing at a block shows a "+" in the left margin; a click opens the input,
 * - the input card: below the block, a chip per comment type (the last one chosen is preset), a
 *   field for the text; Ctrl+Enter saves, Esc cancels,
 * - Ctrl+Alt+M: the input for the block under the pointer (else the first one in view),
 * - F7 / Shift+F7: the next / previous comment, its card open (also without --annotate).
 *
 * Button and card live outside the page, on a layer of their own: a live reload (the AI changing
 * the file while one types) renders the page anew but keeps what was typed; the card then finds
 * its block again.
 *
 * Margin button and input card are the frame's (@qiew/frame/annotate), the same as in Dirq; here is
 * only where they go and what saving does.
 */
import {
  COMMENT_TYPES,
  COMMENT_TYPE_INFO,
  annotatableBlocks,
  relocateBlock,
  type BlockRef,
  type CommentType,
} from "./annotate";
import { inputCard, marginButton } from "@qiew/frame/annotate";
import { colour, openNotes, resetNotes, setNoteActions, targetOf } from "./notes";
import { addComment, changeComment, removeComment, tickComment } from "./write";

/** What the page tells about the document shown. */
export interface Shown {
  path: string;
  content: string;
  annotate: boolean;
  writable: boolean;
}

let article: HTMLElement;
let shown: () => Shown | null;
/** Takes the text just written: renders it at once (and the live reload that follows is ignored). */
let written: (content: string) => void;

const layer = document.createElement("div");
layer.className = "annotate-layer";

/** The blocks that can take a comment, for the text rendered last. */
let blocks: BlockRef[] = [];
let blocksOf = "";

function blocksNow(): BlockRef[] {
  const doc = shown();
  if (!doc) return [];
  if (blocksOf !== doc.content) {
    blocks = annotatableBlocks(doc.content);
    blocksOf = doc.content;
  }
  return blocks;
}

const allowed = (): "yes" | "no" | "read-only" => {
  const doc = shown();
  return !doc?.annotate ? "no" : doc.writable ? "yes" : "read-only";
};

// ---- Blocks in the page -----------------------------------------------------------------------

/** What markdown-it opens with, by the element it renders; code may be either kind. */
const TYPES: Record<string, string[]> = {
  P: ["paragraph_open"],
  H1: ["heading_open"],
  H2: ["heading_open"],
  H3: ["heading_open"],
  H4: ["heading_open"],
  H5: ["heading_open"],
  H6: ["heading_open"],
  TABLE: ["table_open"],
  PRE: ["fence", "code_block"],
  CODE: ["fence", "code_block"],
  DIV: ["fence"], // a Mermaid diagram
  HR: ["hr"],
  UL: ["bullet_list_open"],
  OL: ["ordered_list_open"],
  LI: ["list_item_open"],
  BLOCKQUOTE: ["blockquote_open"],
};

/** The block an element of the page shows, and the element to place things at. */
function blockOf(el: Element | null): { ref: BlockRef; el: HTMLElement } | null {
  for (let e = el?.closest<HTMLElement>("[data-line]"); e && article.contains(e); e = e.parentElement?.closest<HTMLElement>("[data-line]")) {
    if (e.closest(".notes, .note-card")) return null;
    const types = TYPES[e.tagName];
    if (!types) continue;
    const line = Number(e.dataset.line) - 1;
    const ref = blocksNow().find((b) => b.line === line && types.includes(b.type));
    if (ref) return { ref, el: e.tagName === "CODE" ? (e.closest("pre") ?? e) : e };
  }
  return null;
}

/** The element that shows `ref` now. */
function elementOf(ref: BlockRef): HTMLElement | null {
  for (const e of article.querySelectorAll<HTMLElement>(`[data-line="${ref.line + 1}"]`)) {
    const b = blockOf(e);
    if (b && b.ref.type === ref.type && b.ref.line === ref.line) return b.el;
  }
  return null;
}

/** The marks of the comments a block already has. */
function marksOf(el: HTMLElement): HTMLElement | null {
  const before = el.previousElementSibling;
  if (before?.classList.contains("notes")) return before as HTMLElement;
  const first = el.tagName === "LI" ? el.firstElementChild : null;
  return first?.classList.contains("notes") ? (first as HTMLElement) : null;
}

/** Page coordinates of an element: the layer is placed on the page, not on the window. */
function box(el: Element) {
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width };
}

function column() {
  const r = box(article);
  const cs = getComputedStyle(article);
  return { left: r.left + parseFloat(cs.paddingLeft), width: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), gutter: r.left };
}

// ---- The margin button ------------------------------------------------------------------------

const plus = marginButton({
  layer,
  title: "Add a comment",
  onClick: () => plusFor && openInput({ block: plusFor.ref, anchor: plusFor.el }),
});
/** A thin line beside the block the "+" belongs to. */
const bar = document.createElement("div");
bar.className = "margin-bar";
bar.hidden = true;
let plusFor: { ref: BlockRef; el: HTMLElement } | null = null;
/** The block last pointed at, for Ctrl+Alt+M. */
let pointed: { ref: BlockRef; el: HTMLElement } | null = null;
let hideTimer: number | undefined;

function showPlus(b: { ref: BlockRef; el: HTMLElement }) {
  clearTimeout(hideTimer);
  plusFor = b;
  const marks = marksOf(b.el);
  const top = marks ? box(marks).bottom + 2 : box(b.el).top + 2;
  plus.show(b.el, { top, left: column().gutter + 12 });
  const b2 = box(b.el);
  bar.style.top = `${b2.top}px`;
  bar.style.height = `${b2.bottom - b2.top}px`;
  bar.style.left = `${column().left - 8}px`;
  bar.hidden = false;
}

function hidePlus(later = false) {
  clearTimeout(hideTimer);
  if (later) hideTimer = window.setTimeout(() => hidePlus(), 300);
  else {
    plus.hide();
    bar.hidden = true;
    plusFor = null;
  }
}

// ---- The input card ---------------------------------------------------------------------------

let lastType: CommentType = "ai";

interface Input {
  el: HTMLElement;
  /** The text and block it was opened for; the change is made from these (write.ts finds them again). */
  seen: string;
  block: BlockRef | null;
  /** Changing a comment: its first line in `seen`. */
  line: number | null;
  anchor: HTMLElement;
}
let input: Input | null = null;

function closeInput() {
  input?.el.remove();
  input = null;
}

function placeInput() {
  if (!input) return;
  const c = column();
  const b = box(input.anchor);
  input.el.style.top = `${b.bottom + 6}px`;
  input.el.style.left = `${c.left}px`;
  input.el.style.width = `${Math.min(c.width, 620)}px`;
}

function openInput(opts: { block: BlockRef | null; anchor: HTMLElement; line?: number; type?: CommentType; text?: string }) {
  const doc = shown();
  if (!doc || allowed() !== "yes") return;
  closeInput();
  hidePlus();
  resetNotes();
  const editing = opts.line !== undefined;
  let me: Input;
  const card = inputCard({
    title: editing ? "Change comment" : "New comment",
    text: opts.text,
    placeholder: `${editing ? "Change the comment" : "A comment"} …`,
    hint: "Ctrl+Enter saves, Esc cancels",
    submit: "Save",
    // A comment keeps its type when changed: only that chip is offered then
    chips: COMMENT_TYPES.map((t) => ({ id: t, label: `@${t}`, colour: colour(t), title: COMMENT_TYPE_INFO[t].title })),
    chip: opts.type ?? lastType,
    lockChip: editing,
    onCancel: () => closeInput(),
    onSubmit: async (text, chip) => {
      const now = shown();
      if (!now) return;
      const type = (chip ?? lastType) as CommentType;
      const content =
        me.line !== null ? await changeComment(now.path, me.seen, me.line, text) : await addComment(now.path, me.seen, me.block!, type, text);
      if (me.line === null) lastType = type;
      if (input === me) closeInput();
      written(content);
    },
  });
  card.el.classList.add("input-card");
  me = { el: card.el, seen: doc.content, block: opts.block, line: opts.line ?? null, anchor: opts.anchor };
  input = me;
  layer.appendChild(card.el);
  placeInput();
  card.focus();
  card.el.scrollIntoView({ block: "nearest" });
}

/** After the page was rendered anew: the card stays and finds its block again. */
function followInput() {
  if (!input) return;
  const doc = shown();
  if (!doc || allowed() !== "yes") return closeInput();
  if (input.block) {
    const now = relocateBlock(input.seen, doc.content, input.block);
    const el = now && elementOf(now);
    if (el) input.anchor = el;
  }
  if (!input.anchor.isConnected) {
    // The block is gone or not to be found for sure: keep the text, saving will say why it cannot.
    input.anchor = article;
    input.el.style.top = `${box(article).top + 8}px`;
    return;
  }
  placeInput();
}

// ---- Keys -------------------------------------------------------------------------------------

/** The first block that can take a comment and is in view. */
function firstInView(): { ref: BlockRef; el: HTMLElement } | null {
  for (const e of article.querySelectorAll<HTMLElement>("[data-line]")) {
    if (e.getBoundingClientRect().top < 48) continue;
    const b = blockOf(e);
    if (b) return b;
  }
  return null;
}

/** The next (or previous) group of marks after the top of the view. */
function jump(back: boolean) {
  const groups = [...article.querySelectorAll<HTMLElement>(".notes")];
  if (!groups.length) return;
  const edge = 56; // below the toolbar
  const at = (g: HTMLElement) => g.getBoundingClientRect().top;
  const next = back
    ? [...groups].reverse().find((g) => at(g) < edge - 4) ?? groups[groups.length - 1]
    : groups.find((g) => at(g) > edge + 4) ?? groups[0];
  window.scrollTo({ top: window.scrollY + at(next) - edge - 40 });
  openNotes(next);
}

// ---- Wiring -----------------------------------------------------------------------------------

export function initAnnotate(doc: HTMLElement, current: () => Shown | null, onWritten: (content: string) => void) {
  article = doc;
  shown = current;
  written = onWritten;
  document.body.appendChild(layer);
  layer.prepend(bar);

  article.addEventListener("mousemove", (e) => {
    if (allowed() !== "yes") return;
    const t = e.target as Element;
    if (t === article) {
      // The margin: keep the button for the way to it
      clearTimeout(hideTimer);
      if (plusFor) showPlus(plusFor);
      return;
    }
    if (t.closest(".notes, .note-card")) return hidePlus(); // the marks have their own card
    const b = blockOf(t);
    if (b) {
      pointed = b;
      showPlus(b);
    }
  });
  article.addEventListener("mouseleave", (e) => {
    if (e.relatedTarget !== plus.el) hidePlus(true);
  });
  // The frame hides the button itself when the pointer leaves it; the line beside the block goes too
  plus.el.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  plus.el.addEventListener("mouseleave", (e) => {
    if (!article.contains(e.relatedTarget as Node)) hidePlus(true);
  });

  setNoteActions({
    allowed,
    tick: async (line, done) => {
      const d = shown();
      if (d) written(await tickComment(d.path, d.content, line, done));
    },
    remove: async (line) => {
      const d = shown();
      if (d) written(await removeComment(d.path, d.content, line));
    },
    edit: (group, line, type, text) => {
      const target = targetOf(group);
      const anchor = (target && elementOf(target)) || group;
      openInput({ block: target, anchor, line, type, text });
    },
    add: (group) => {
      const target = targetOf(group);
      const el = target && elementOf(target);
      if (target && el) openInput({ block: target, anchor: el });
    },
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "F7" && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      jump(e.shiftKey);
    } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "m" && allowed() === "yes") {
      e.preventDefault();
      const b = (pointed?.el.isConnected && pointed) || firstInView();
      if (b) openInput({ block: b.ref, anchor: b.el });
    }
  });
  window.addEventListener("resize", () => {
    hidePlus();
    placeInput();
  });
}

/** After every rendering: the page has new elements. */
export function afterRender() {
  hidePlus();
  pointed = null;
  followInput();
}
