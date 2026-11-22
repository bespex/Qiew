/*
 * Commenting, the same in every viewer (docs/BEDIENKONZEPT.md, 2; docs/ANNOTATE.md). Only with
 * --annotate: without it an app shows none of this.
 *
 * - the margin button: pointing at something that can take a comment shows a "+" beside it,
 * - the input card: a field under the place, Ctrl+Enter saves or sends, Esc cancels; optionally a
 *   row of chips to choose a kind (Marq: @ai, @me, @you),
 * - the note: one comment, a coloured stripe, its text, and on pointing the tools (tick, change,
 *   remove; removing asks with the first click).
 *
 * The app says where (it places the button and the cards, since a table row and a page block are
 * placed differently) and what happens (callbacks). Where comments are kept is the app's too: Marq
 * writes them into the file, Dirq sends them to the program that started it (`sendComment`).
 */
import { invoke } from "@tauri-apps/api/core";
import { keyLabel } from "./keys";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ICON = {
  tick: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  reopen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>`,
  remove: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>`,
  bubble: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>`,
};
/** The speech bubble of comments, for counters and buttons. */
export const BUBBLE_ICON = ICON.bubble;

// ---- the margin button ----------------------------------------------------------------------

export interface MarginButton {
  el: HTMLButtonElement;
  /** What it is shown for now. */
  readonly anchor: Element | null;
  /** Shows it for `anchor`, at a place on the page (page coordinates of its top left corner). */
  show(anchor: Element, at: { top: number; left: number }): void;
  /** Hides it, at once or after a moment (the pointer may be on its way to it). */
  hide(later?: boolean): void;
}

/**
 * The "+" in the margin. One per page; it lives on `layer` (page coordinates), so the app can
 * render the page anew without losing it.
 */
export function marginButton(opts: { layer: HTMLElement; title: string; onClick: (anchor: Element) => void }): MarginButton {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "qa-plus";
  el.textContent = "+";
  el.title = `${opts.title} (${keyLabel("comment")})`;
  el.setAttribute("aria-label", opts.title);
  el.hidden = true;
  opts.layer.append(el);
  let anchor: Element | null = null;
  let timer: number | undefined;
  const button: MarginButton = {
    el,
    get anchor() {
      return anchor;
    },
    show(to, at) {
      clearTimeout(timer);
      anchor = to;
      el.style.top = `${at.top}px`;
      el.style.left = `${at.left}px`;
      el.hidden = false;
    },
    hide(later = false) {
      clearTimeout(timer);
      if (later) {
        timer = window.setTimeout(() => button.hide(), 300);
        return;
      }
      el.hidden = true;
      anchor = null;
    },
  };
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => button.hide(true));
  el.addEventListener("click", () => anchor && opts.onClick(anchor));
  return button;
}

// ---- the input card -------------------------------------------------------------------------

export interface Chip {
  id: string;
  label: string;
  colour: string;
  title: string;
}

export interface InputCardOptions {
  /** The card's heading, beside the bubble: "New comment", "Change comment". */
  title?: string;
  text?: string;
  placeholder: string;
  /** Beside the buttons: where the comment goes, and the keys. */
  hint: string;
  /** The label of the button that saves or sends. */
  submit: string;
  /** Kinds to choose from (Marq's comment types); `chip` is chosen, `lockChip`: only it is offered. */
  chips?: Chip[];
  chip?: string;
  lockChip?: boolean;
  /** Saves or sends. A rejection is shown in the card, which stays. */
  onSubmit: (text: string, chip?: string) => void | Promise<void>;
  onCancel: () => void;
  /** Every change of the text, so the app can keep it across a new rendering. */
  onInput?: (text: string) => void;
}

export interface InputCard {
  el: HTMLElement;
  textarea: HTMLTextAreaElement;
  focus(): void;
}

/** The card a comment is written in. The app puts it where it belongs. */
export function inputCard(o: InputCardOptions): InputCard {
  const el = document.createElement("div");
  el.className = "qa-input";
  const chips = (o.chips ?? [])
    .filter((c) => !o.lockChip || c.id === o.chip)
    .map((c) => `<button type="button" class="qa-chip" data-chip="${esc(c.id)}" style="--note: ${c.colour}" title="${esc(c.title)}">${esc(c.label)}</button>`)
    .join("");
  // A heading with the bubble (and the kinds beside it) sets the card apart from the document
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", o.title ?? "Comment");
  el.innerHTML =
    `<div class="qa-input-head"><span class="qa-bubble">${ICON.bubble}</span><span class="qa-title">${esc(o.title ?? "Comment")}</span>` +
    (chips ? `<span class="qa-chips" role="radiogroup" aria-label="Kind">${chips}</span>` : "") +
    `</div>` +
    `<textarea rows="3" placeholder="${esc(o.placeholder)}" aria-label="Comment"></textarea>` +
    `<div class="qa-error" hidden></div>` +
    `<div class="qa-actions"><span class="qa-keys">${esc(o.hint)}</span>` +
    `<button type="button" data-do="cancel">Cancel</button><button type="button" data-do="submit" class="qa-primary">${esc(o.submit)}</button></div>`;
  const textarea = el.querySelector("textarea")!;
  textarea.value = o.text ?? "";
  const error = el.querySelector<HTMLElement>(".qa-error")!;
  let chip = o.chip ?? o.chips?.[0]?.id;
  const setChip = (id: string | undefined) => {
    chip = id;
    const c = o.chips?.find((x) => x.id === id);
    if (c) el.style.setProperty("--note", c.colour);
    el.querySelectorAll<HTMLElement>(".qa-chip").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.chip === id)));
  };
  setChip(chip);
  const submit = async () => {
    const text = textarea.value.trim();
    if (!text) return textarea.focus();
    el.classList.add("busy");
    try {
      await o.onSubmit(text, chip);
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      el.classList.remove("busy");
    }
  };
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.chip) {
      setChip(b.dataset.chip);
      textarea.focus();
    } else if (b.dataset.do === "cancel") o.onCancel();
    else if (b.dataset.do === "submit") void submit();
  });
  textarea.addEventListener("input", () => o.onInput?.(textarea.value));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      o.onCancel();
    }
  });
  return {
    el,
    textarea,
    focus() {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    },
  };
}

// ---- the note -------------------------------------------------------------------------------

export type NoteTool = "tick" | "reopen" | "edit" | "remove";

export interface NoteView {
  /** Given back with every action (`data-id`). */
  id: string;
  text: string;
  /** The stripe and the label; default the accent colour. */
  colour?: string;
  /** In the colour, monospaced: the kind (Marq's "@ai"). */
  label?: string;
  /** Muted, after the label: where it stands ("Line 42: …"). */
  where?: string;
  /** Small words after it; `action` makes one a button ("Send again"). */
  badges?: { text: string; warn?: boolean; title?: string; action?: { act: string; label: string } }[];
  /** Ticked off: pale. */
  done?: boolean;
  /** Its place is gone ("line changed"): dimmed, a dashed stripe. */
  lost?: boolean;
  /** Something is wrong with it (not sent): the stripe in amber. */
  warn?: boolean;
  tools: NoteTool[];
  /** Why the last action failed. */
  error?: string;
}

const TOOL_TITLE: Record<NoteTool, string> = { tick: "Tick off", reopen: "Open again", edit: "Change", remove: "Remove" };

/** One comment as HTML. Actions come back through `noteAction`. */
export function noteHtml(n: NoteView): string {
  const badges = (n.badges ?? [])
    .map(
      (b) =>
        `<span class="qa-badge${b.warn ? " warn" : ""}"${b.title ? ` title="${esc(b.title)}"` : ""}>${esc(b.text)}` +
        `${b.action ? ` <button type="button" data-act="${esc(b.action.act)}">${esc(b.action.label)}</button>` : ""}</span>`,
    )
    .join("");
  const tools = n.tools.length
    ? `<span class="qa-tools">${n.tools.map((t) => `<button type="button" data-act="${t}" title="${TOOL_TITLE[t]}">${ICON[t]}</button>`).join("")}</span>`
    : "";
  const cls = ["qa-note", n.done && "done", n.lost && "lost", n.warn && "warn"].filter(Boolean).join(" ");
  return (
    `<div class="${cls}" data-id="${esc(n.id)}"${n.colour ? ` style="--note: ${n.colour}"` : ""}>` +
    `<div class="qa-head">${n.label ? `<span class="qa-label">${esc(n.label)}</span>` : `<span class="qa-bubble">${ICON.bubble}</span>`}` +
    (n.where ? `<span class="qa-where">${esc(n.where)}</span>` : "") +
    `${badges}${tools}</div><div class="qa-text">${esc(n.text)}</div>` +
    (n.error ? `<div class="qa-error">${esc(n.error)}</div>` : "") +
    `</div>`
  );
}

/**
 * The action a click inside a note asks for, with the note's id; null if it was none. Removing asks
 * first: the first click on the bin only turns it red for three seconds.
 */
export function noteAction(e: Event): { act: string; id: string; button: HTMLButtonElement } | null {
  const button = (e.target as Element).closest<HTMLButtonElement>(".qa-note button[data-act]");
  const id = button?.closest<HTMLElement>(".qa-note")?.dataset.id;
  if (!button || id === undefined) return null;
  if (button.dataset.act === "remove" && !button.classList.contains("confirm")) {
    button.classList.add("confirm");
    button.title = "Remove? Click again";
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("confirm");
      button.title = TOOL_TITLE.remove;
    }, 3000);
    return null;
  }
  return { act: button.dataset.act!, id, button };
}

// ---- sending (for apps whose comments go to the program that started them) ------------------

/** What `sendComment` makes one line of JSON of (docs/ANNOTATE.md, 4). */
export interface Outgoing {
  action: "line_comment" | "line_comment_remove";
  id: string;
  file?: string;
  line?: number;
  code?: string;
  text?: string;
  session?: string;
  doc?: string;
}

/**
 * Sends a comment on the document at `path` to the program that started the viewer. Only for a
 * document opened with --annotate and CODEDECK_SOCKET; otherwise it fails with the reason.
 */
export const sendComment = (path: string, message: Outgoing) => invoke<void>("send_comment", { path, message });
