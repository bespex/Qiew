/*
 * Shows the comments of the document (annotate.ts) where they stand: a small mark per comment in the
 * left margin, in the colour of its type, beside the block it belongs to. Pointing at the marks
 * shows their text in a card; a click keeps the card open. Without --annotate that is all: there is
 * nothing to change here.
 *
 * The marks take no room, so the page looks exactly as without comments. They are made while
 * rendering, from the comments' own html_block tokens (DOMPurify would remove the comments).
 */
import type MarkdownIt from "markdown-it";
import { COMMENT_TYPE_INFO, bodyStart, parseComment, type CommentType, type Status } from "./annotate";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

interface Note {
  type: CommentType;
  status: Status | null;
  text: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colour = (type: CommentType) => `color-mix(in oklab, ${COMMENT_TYPE_INFO[type].colour} 70%, var(--fg))`;

function noteOf(tok: Token): Note | null {
  if (tok.type !== "html_block") return null;
  const c = parseComment(tok.content);
  return c && { type: c.type, status: c.status, text: c.text };
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
      if (!note || (first.map && first.map[0] < start)) {
        out.push(first);
        continue;
      }
      const notes = [note];
      while (i + 1 < tokens.length && noteOf(tokens[i + 1])) notes.push(noteOf(tokens[++i])!);
      const next = tokens[i + 1];
      const group = new state.Token("marq_notes", "", 0);
      group.block = true;
      group.map = first.map;
      group.level = first.level;
      group.meta = { notes, orphan: !next || next.nesting === -1 };
      out.push(group);
    }
    state.tokens = out;
  });

  md.renderer.rules.marq_notes = (tokens, idx) => {
    const { notes, orphan } = tokens[idx].meta as { notes: Note[]; orphan: boolean };
    const open = notes.filter((n) => !n.status).length;
    const label = `${notes.length === 1 ? "1 Kommentar" : `${notes.length} Kommentare`}${open < notes.length ? `, ${open} offen` : ""}`;
    const dots = notes
      .map((n) => `<span class="note-dot${n.status ? " done" : ""}" style="--note: ${colour(n.type)}"></span>`)
      .join("");
    return (
      `<button type="button" class="notes${orphan ? " orphan" : ""}" aria-label="${label}" ` +
      `data-notes="${esc(JSON.stringify(notes))}">${dots}</button>\n`
    );
  };
}

// ---- The card ---------------------------------------------------------------------------------

let article: HTMLElement;
let card: HTMLElement | null = null;
let shownFor: HTMLElement | null = null;
let pinned = false;

function cardHtml(group: HTMLElement): string {
  const notes = JSON.parse(group.dataset.notes ?? "[]") as Note[];
  const head = group.classList.contains("orphan")
    ? `<div class="note-orphan">Ohne Bezug: Auf diese Kommentare folgt kein Block.</div>`
    : "";
  const rows = notes
    .map((n) => {
      const info = COMMENT_TYPE_INFO[n.type];
      const status = n.status ? `<span class="note-status">${esc(n.status)}</span>` : "";
      return (
        `<div class="note${n.status ? " done" : ""}" style="--note: ${colour(n.type)}">` +
        `<div class="note-head"><span class="note-type" title="${esc(info.title)}">@${n.type}</span>${status}</div>` +
        `<div class="note-text">${esc(n.text)}</div></div>`
      );
    })
    .join("");
  return head + rows;
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
    const group = t.closest<HTMLElement>(".notes");
    if (group) {
      e.stopPropagation();
      if (pinned && shownFor === group) return hide();
      show(group);
      pinned = true;
      group.classList.add("pinned");
    } else if (pinned && !t.closest(".note-card")) {
      hide();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && card) hide();
  });
}
