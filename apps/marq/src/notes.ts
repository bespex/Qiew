/*
 * Shows the comments of the document (annotate.ts) where they stand: a small mark per comment in the
 * left margin, in the colour of its type, beside the block it belongs to. Pointing at the marks
 * shows their text in a card; a click keeps the card open.
 *
 * Without --annotate that is all. With it, the card also offers what can be done to a comment:
 * tick it (done ⇄ open), change it, delete it, and add another one to the block. What these do is
 * up to the caller (setNoteActions); the card only asks.
 *
 * The marks take no room, so the page looks exactly as without comments. They are made while
 * rendering, from the comments' own html_block tokens (DOMPurify would remove the comments).
 */
import type MarkdownIt from "markdown-it";
import { COMMENT_TYPE_INFO, bodyStart, parseComment, type BlockRef, type CommentType, type Status } from "./annotate";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

interface Note {
  type: CommentType;
  status: Status | null;
  text: string;
  /** The first line of the comment in the file, counted from 0. */
  line: number;
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const colour = (type: CommentType) => `color-mix(in oklab, ${COMMENT_TYPE_INFO[type].colour} 70%, var(--fg))`;

function noteOf(tok: Token): Note | null {
  if (tok.type !== "html_block" || !tok.map) return null;
  const c = parseComment(tok.content);
  return c && { type: c.type, status: c.status, text: c.text, line: tok.map[0] };
}

/** Teaches `md` to turn the comments before a block into one group of marks. */
export function installNotes(md: InstanceType<typeof MarkdownIt>) {
  md.core.ruler.push("notes", (state) => {
    const start = bodyStart(state.src);
    const out: Token[] = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const first = tokens[i];
      const note = noteOf(first);
      if (!note || note.line < start) {
        out.push(first);
        continue;
      }
      const notes = [note];
      while (i + 1 < tokens.length && noteOf(tokens[i + 1])) notes.push(noteOf(tokens[++i])!);
      const next = tokens[i + 1];
      const orphan = !next || next.nesting === -1 || !next.map;
      const group = new state.Token("marq_notes", "", 0);
      group.block = true;
      group.map = first.map;
      group.level = first.level;
      group.meta = { notes, target: orphan ? null : { line: next.map![0], type: next.type } };
      out.push(group);
    }
    state.tokens = out;
  });

  md.renderer.rules.marq_notes = (tokens, idx) => {
    const { notes, target } = tokens[idx].meta as { notes: Note[]; target: BlockRef | null };
    const open = notes.filter((n) => !n.status).length;
    const label = `${notes.length === 1 ? "1 Kommentar" : `${notes.length} Kommentare`}${open < notes.length ? `, ${open} offen` : ""}`;
    const dots = notes
      .map((n) => `<span class="note-dot${n.status ? " done" : ""}" style="--note: ${colour(n.type)}"></span>`)
      .join("");
    const at = target ? ` data-target="${target.line}:${target.type}"` : "";
    return (
      `<button type="button" class="notes${target ? "" : " orphan"}" aria-label="${label}" title="${label} (F7)"${at} ` +
      `data-notes="${esc(JSON.stringify(notes))}">${dots}</button>\n`
    );
  };
}

/** The block a group of marks belongs to (null: none follows it). */
export function targetOf(group: HTMLElement): BlockRef | null {
  const t = group.dataset.target?.split(":");
  return t ? { line: Number(t[0]), type: t[1] } : null;
}

// ---- What can be done (with --annotate) -------------------------------------------------------

export interface NoteActions {
  /** Whether the file can be changed now: started with --annotate for it, and writable. */
  allowed(): "yes" | "no" | "read-only";
  tick(line: number, done: boolean): Promise<void>;
  remove(line: number): Promise<void>;
  /** Opens the input for changing the comment; `group` is where it stands. */
  edit(group: HTMLElement, line: number, type: CommentType, text: string): void;
  /** Opens the input for a new comment on the block of `group`. */
  add(group: HTMLElement): void;
}

let actions: NoteActions | null = null;

export function setNoteActions(a: NoteActions) {
  actions = a;
}

// ---- The card ---------------------------------------------------------------------------------

let article: HTMLElement;
let card: HTMLElement | null = null;
let shownFor: HTMLElement | null = null;
let pinned = false;
/** After a change of our own: the card to open again once the page is rendered anew. */
let reopen: BlockRef | null = null;

const ICON = {
  tick: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  open: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>`,
  remove: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>`,
};

function cardHtml(group: HTMLElement): string {
  const notes = JSON.parse(group.dataset.notes ?? "[]") as Note[];
  const allowed = actions?.allowed() ?? "no";
  const head = group.classList.contains("orphan")
    ? `<div class="note-orphan">Ohne Bezug: Auf diese Kommentare folgt kein Block.</div>`
    : "";
  const rows = notes
    .map((n) => {
      const info = COMMENT_TYPE_INFO[n.type];
      const status = n.status ? `<span class="note-status">${esc(n.status)}</span>` : "";
      const tools =
        allowed === "yes"
          ? `<span class="note-tools">` +
            `<button type="button" data-act="tick" data-line="${n.line}" title="${n.status ? "Wieder öffnen" : "Abhaken"}">${n.status ? ICON.open : ICON.tick}</button>` +
            `<button type="button" data-act="edit" data-line="${n.line}" title="Bearbeiten">${ICON.edit}</button>` +
            `<button type="button" data-act="remove" data-line="${n.line}" title="Löschen">${ICON.remove}</button>` +
            `</span>`
          : "";
      return (
        `<div class="note${n.status ? " done" : ""}" style="--note: ${colour(n.type)}">` +
        `<div class="note-head"><span class="note-type" title="${esc(info.title)}">@${n.type}</span>${status}${tools}</div>` +
        `<div class="note-text">${esc(n.text)}</div></div>`
      );
    })
    .join("");
  const foot =
    allowed === "yes" && !group.classList.contains("orphan")
      ? `<div class="note-foot"><button type="button" data-act="add" title="Kommentar hinzufügen (Strg+Alt+M)">+ Kommentar</button></div>`
      : allowed === "read-only"
        ? `<div class="note-foot note-hint">Die Datei ist schreibgeschützt.</div>`
        : "";
  return head + rows + foot + `<div class="note-error" hidden></div>`;
}

function show(group: HTMLElement) {
  if (shownFor === group && card) return;
  hide();
  shownFor = group;
  group.classList.add("active");
  card = document.createElement("div");
  card.className = "note-card";
  card.setAttribute("role", "note");
  card.innerHTML = cardHtml(group);
  article.appendChild(card);
  // Beside the marks, into the text; never past the right edge of the page.
  const top = group.offsetTop - 6;
  const left = group.offsetLeft + group.offsetWidth + 6;
  card.style.top = `${top}px`;
  card.style.left = `${Math.max(0, Math.min(left, article.clientWidth - card.offsetWidth - 8))}px`;
}

function pin(group: HTMLElement) {
  show(group);
  pinned = true;
  group.classList.add("pinned");
}

function hide() {
  card?.remove();
  card = null;
  shownFor?.classList.remove("active", "pinned");
  shownFor = null;
  pinned = false;
}

/** Closes the card; a new rendering of the page calls it, since the marks are new then. */
export function resetNotes() {
  hide();
}

/**
 * After the page was rendered anew: opens the card again that was open when we changed the file.
 * `find` tells where that block is now.
 */
export function restoreNotes(find: (block: BlockRef) => BlockRef | null) {
  const was = reopen;
  reopen = null;
  if (!was) return;
  const now = find(was);
  if (!now) return;
  const group = article.querySelector<HTMLElement>(`.notes[data-target="${now.line}:${now.type}"]`);
  if (group) pin(group);
}

/** Opens and keeps open the card of `group` (F7, after a change). */
export function openNotes(group: HTMLElement) {
  pin(group);
}

async function act(button: HTMLButtonElement) {
  const group = shownFor;
  if (!group || !actions || !card) return;
  const line = Number(button.dataset.line);
  const errorBox = card.querySelector<HTMLElement>(".note-error")!;
  const fail = (err: unknown) => {
    errorBox.hidden = false;
    errorBox.textContent = String(err instanceof Error ? err.message : err);
  };
  const notes = JSON.parse(group.dataset.notes ?? "[]") as Note[];
  const note = notes.find((n) => n.line === line);
  switch (button.dataset.act) {
    case "add":
      return actions.add(group);
    case "edit":
      if (note) actions.edit(group, line, note.type, note.text);
      return;
    case "remove":
      // Deleting cannot be undone here: the first click asks.
      if (!button.classList.contains("confirm")) {
        button.classList.add("confirm");
        button.title = "Wirklich löschen? Noch einmal klicken";
        window.setTimeout(() => button.isConnected && button.classList.remove("confirm"), 3000);
        return;
      }
      reopen = notes.length > 1 ? targetOf(group) : null;
      return actions.remove(line).catch((e) => ((reopen = null), fail(e)));
    case "tick":
      reopen = targetOf(group);
      return actions.tick(line, !note?.status).catch((e) => ((reopen = null), fail(e)));
  }
}

export function initNotes(doc: HTMLElement) {
  article = doc;
  // Pointing: the card follows the marks; moving from the marks onto the card keeps it.
  let leaving: number | undefined;
  article.addEventListener("mouseover", (e) => {
    const t = e.target as Element;
    const group = t.closest<HTMLElement>(".notes");
    if (group || t.closest(".note-card")) clearTimeout(leaving);
    if (group && !pinned) show(group);
  });
  article.addEventListener("mouseout", (e) => {
    if (pinned || !shownFor) return;
    const to = e.relatedTarget as Element | null;
    if (to?.closest(".notes, .note-card")) return;
    clearTimeout(leaving);
    leaving = window.setTimeout(() => !pinned && hide(), 250);
  });
  // A click keeps the card open, a second click or one elsewhere closes it.
  article.addEventListener("click", (e) => {
    const t = e.target as Element;
    const button = t.closest<HTMLButtonElement>(".note-card button[data-act]");
    if (button) {
      e.stopPropagation();
      pinned = true;
      shownFor?.classList.add("pinned");
      act(button);
      return;
    }
    const group = t.closest<HTMLElement>(".notes");
    if (group) {
      e.stopPropagation();
      if (pinned && shownFor === group) return hide();
      pin(group);
    } else if (pinned && !t.closest(".note-card")) {
      hide();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && card && !(e.target as Element).closest?.(".input-card")) hide();
  });
}
