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
import { esc, noteAction, noteHtml } from "@qiew/frame/annotate";
import { COMMENT_TYPE_INFO, bodyStart, parseComment, type BlockRef, type CommentType, type Status } from "./annotate";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

interface Note {
  type: CommentType;
  status: Status | null;
  text: string;
  /** The first line of the comment in the file, counted from 0. */
  line: number;
}

export { esc };
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
    const label = `${notes.length === 1 ? "1 comment" : `${notes.length} comments`}${open < notes.length ? `, ${open} open` : ""}`;
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

function cardHtml(group: HTMLElement): string {
  const notes = JSON.parse(group.dataset.notes ?? "[]") as Note[];
  const allowed = actions?.allowed() ?? "no";
  const head = group.classList.contains("orphan") ? `<div class="note-orphan">No block follows these comments.</div>` : "";
  // Each comment is the frame's note, as in Dirq; its id is its first line in the file
  const rows = notes
    .map((n) =>
      noteHtml({
        id: String(n.line),
        text: n.text,
        colour: colour(n.type),
        label: `@${n.type}`,
        badges: n.status ? [{ text: n.status }] : [],
        done: !!n.status,
        tools: allowed === "yes" ? [n.status ? "reopen" : "tick", "edit", "remove"] : [],
      }),
    )
    .join("");
  const foot =
    allowed === "yes" && !group.classList.contains("orphan")
      ? `<div class="note-foot"><button type="button" data-act="add" title="Add a comment (Ctrl+Alt+M)">+ Comment</button></div>`
      : allowed === "read-only"
        ? `<div class="note-foot note-hint">The file is read-only.</div>`
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

/** What a button in the card asks for: a note's tool (frame), or adding one to the block. */
async function act(act: string, line: number) {
  const group = shownFor;
  if (!group || !actions || !card) return;
  const errorBox = card.querySelector<HTMLElement>(".note-error")!;
  const fail = (err: unknown) => {
    errorBox.hidden = false;
    errorBox.textContent = String(err instanceof Error ? err.message : err);
  };
  const notes = JSON.parse(group.dataset.notes ?? "[]") as Note[];
  const note = notes.find((n) => n.line === line);
  switch (act) {
    case "add":
      return actions.add(group);
    case "edit":
      if (note) actions.edit(group, line, note.type, note.text);
      return;
    case "remove":
      // The frame asked first (the first click on the bin only turns it red)
      reopen = notes.length > 1 ? targetOf(group) : null;
      return actions.remove(line).catch((e) => ((reopen = null), fail(e)));
    case "tick":
    case "reopen":
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
      if (button.dataset.act === "add") void act("add", -1);
      else {
        const asked = noteAction(e);
        if (asked) void act(asked.act, Number(asked.id));
      }
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
    if (e.key === "Escape" && card && !(e.target as Element).closest?.(".qa-input")) hide();
  });
}
