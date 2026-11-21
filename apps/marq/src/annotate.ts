/*
 * Comments on blocks, kept as HTML comments in the Markdown file itself:
 *
 *   <!-- @ai: Shorten this paragraph. -->
 *
 *   The paragraph the comment belongs to …
 *
 * Everything here is a pure function from file text to file text (or to what is in it), so it can be
 * tested without the window. Lines are counted from 0, as in markdown-it's `tok.map`; the `data-line`
 * attributes in the page count from 1.
 *
 * What these functions promise (apps/marq/IDEEN.md, "Zusicherungen", tested in annotate.test.ts):
 * the document renders the same, only comment lines change, foreign comments stay untouched, line
 * endings, BOM and the end of the file stay as they were, and every change can be taken back byte
 * for byte. Every write checks the rendering before it returns; if it changed, it throws.
 */
import MarkdownIt from "markdown-it";
type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

/**
 * The comment types: who a comment is for, and its colour (mixed with the text colour of the page,
 * so it gets darker on light pages and lighter on dark ones). Add a type here and it is known
 * everywhere.
 */
export const COMMENT_TYPE_INFO = {
  ai: { title: "für die KI", colour: "#a371f7" },
  me: { title: "Merkzettel", colour: "#d29922" },
  you: { title: "für andere", colour: "#3fb950" },
} as const;
export type CommentType = keyof typeof COMMENT_TYPE_INFO;
export const COMMENT_TYPES = Object.keys(COMMENT_TYPE_INFO) as CommentType[];

/** The states a comment can have besides open. Written after `#`: `@ai#erledigt`. */
export const STATUSES = ["erledigt"] as const;
export type Status = (typeof STATUSES)[number];

/** A block a comment can be attached to: its first line and the markdown-it token that opens it. */
export interface BlockRef {
  line: number;
  type: string;
}

export interface Comment {
  type: CommentType;
  /** null: open. An unknown word after `#` is no status; the comment then counts as open. */
  status: Status | null;
  /** The head as written, e.g. `@ai#erledigt`; kept when the text is changed. */
  head: string;
  text: string;
  /** The lines the comment takes, from `line` up to (not including) `end`. */
  line: number;
  end: number;
  /** The block it belongs to; null when nothing follows it in its container (`container` then). */
  target: BlockRef | null;
  /** For a comment without block: the container it ends (null: the document). */
  container: BlockRef | null;
}

export class AnnotateError extends Error {}

/** The blocks that can take a comment: the token that opens them. */
const ANNOTATABLE = new Set([
  "paragraph_open",
  "heading_open",
  "table_open",
  "fence",
  "code_block",
  "html_block",
  "hr",
  "bullet_list_open",
  "ordered_list_open",
  "list_item_open",
  "blockquote_open",
]);

const parser = new MarkdownIt({ html: true });

const KNOWN = COMMENT_TYPES.join("|");
/** A whole html_block that is one comment of a known type. */
const COMMENT_RE = new RegExp(
  `^<!--[ \\t]*@(${KNOWN})(?:#([\\p{L}\\p{N}_]+))?(?=[\\s:]|-->)[ \\t]*:?\\s*([\\s\\S]*?)\\s*-->\\s*$`,
  "u",
);
/** The head of a known comment on its first line, as written in the file. */
const HEAD_RE = new RegExp(`(<!--[ \\t]*@)(${KNOWN})(#[\\p{L}\\p{N}_]+)?(?=[\\s:]|-->)`, "u");
const ANY_COMMENT_RE = /^<!--[\s\S]*?-->\s*$/;

// ---- The file as lines ----------------------------------------------------------------------

interface Lines {
  bom: string;
  text: string[];
  /** The line ending after each line; "" after the last one if the file does not end with one. */
  eol: string[];
  /** The line ending new lines get: the one the file uses first. */
  newEol: string;
}

function split(src: string): Lines {
  const bom = src.startsWith("﻿") ? "﻿" : "";
  const body = src.slice(bom.length);
  const text: string[] = [];
  const eol: string[] = [];
  const re = /\r\n|\r|\n/g;
  let last = 0;
  for (let m; (m = re.exec(body)); last = re.lastIndex) {
    text.push(body.slice(last, m.index));
    eol.push(m[0]);
  }
  text.push(body.slice(last));
  eol.push("");
  // "a\n" is one line followed by an ending, not two lines.
  if (text.length > 1 && text[text.length - 1] === "") {
    text.pop();
    eol.pop();
  }
  return { bom, text, eol, newEol: eol.find((e) => e) ?? "\n" };
}

function join(l: Lines): string {
  let out = l.bom;
  for (let i = 0; i < l.text.length; i++) out += l.text[i] + l.eol[i];
  return out;
}

/** Replaces lines [from, to) by `lines`, keeping the line endings and the end of the file. */
function splice(l: Lines, from: number, to: number, lines: string[]) {
  const lastEol = l.eol[l.eol.length - 1];
  const touchesEnd = to >= l.text.length;
  l.text.splice(from, to - from, ...lines);
  l.eol.splice(from, to - from, ...lines.map(() => l.newEol));
  for (let i = 0; i < l.eol.length - 1; i++) if (!l.eol[i]) l.eol[i] = l.newEol;
  if (l.eol.length && (touchesEnd || !lastEol)) l.eol[l.eol.length - 1] = lastEol;
}

const blankish = (s: string | undefined) => s !== undefined && /^[ \t>]*$/.test(s);

// ---- Parsing --------------------------------------------------------------------------------

interface Parsed {
  lines: Lines;
  tokens: Token[];
  /** The first line after a front matter (0 without one). */
  bodyStart: number;
}

function parse(src: string): Parsed {
  const lines = split(src);
  const tokens = parser.parse(lines.text.join("\n"), {});
  return { lines, tokens, bodyStart: frontMatterEnd(lines.text) };
}

/** The first line after a front matter (0 without one). */
export function bodyStart(src: string): number {
  return frontMatterEnd(src.split(/\r\n|\r|\n/));
}

function frontMatterEnd(text: string[]): number {
  if (!/^---\s*$/.test(text[0] ?? "")) return 0;
  for (let i = 1; i < text.length; i++) if (/^(---|\.\.\.)\s*$/.test(text[i])) return i + 1;
  return 0;
}

/** What an html_block holds if it is one comment of a known type: type, status, head, text. */
export function parseComment(html: string) {
  const m = COMMENT_RE.exec(html);
  if (!m || m[3].includes("-->")) return null;
  const word = m[2];
  const status = (STATUSES as readonly string[]).includes(word ?? "") ? (word as Status) : null;
  const text = m[3]
    .split("\n")
    .map((s, i) => (i ? s.trim() : s))
    .join("\n");
  return { type: m[1] as CommentType, status, head: `@${m[1]}${word ? `#${word}` : ""}`, text };
}

const asComment = (tok: Token) => (tok.type === "html_block" ? parseComment(tok.content) : null);

const isAnyComment = (tok: Token | undefined) => tok?.type === "html_block" && ANY_COMMENT_RE.test(tok.content);

/** The containers (blockquote, list item) around token `idx`, outermost first. */
function ancestors(tokens: Token[], idx: number): Token[] {
  const stack: Token[] = [];
  for (let i = 0; i < idx; i++) {
    const t = tokens[i];
    if (t.nesting === 1) stack.push(t);
    else if (t.nesting === -1) stack.pop();
  }
  return stack.filter((t) => t.type === "blockquote_open" || t.type === "list_item_open");
}

/** The token that opens the container token `idx` is in (null: the document). */
function parentOf(tokens: Token[], idx: number): Token | null {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.nesting === -1) depth++;
    else if (t.nesting === 1 && depth-- === 0) return t;
  }
  return null;
}

/** The comments of the document, in the order of the file. */
export function readComments(src: string): Comment[] {
  const { tokens, bodyStart } = parse(src);
  const out: Comment[] = [];
  tokens.forEach((tok, i) => {
    const c = asComment(tok);
    if (!c || !tok.map || tok.map[0] < bodyStart) return;
    // The comments before a block belong to it; a comment first in a list item to the item.
    let first = i;
    while (isAnyComment(tokens[first - 1])) first--;
    const before = tokens[first - 1];
    let j = i + 1;
    while (isAnyComment(tokens[j])) j++;
    const next = tokens[j];
    let target: BlockRef | null = null;
    let container: BlockRef | null = null;
    if (before?.type === "list_item_open" && before.map) {
      target = { line: before.map[0], type: before.type };
    } else if (next && next.nesting !== -1 && next.map) {
      target = { line: next.map[0], type: next.type };
    } else {
      const p = parentOf(tokens, i);
      container = p?.map ? { line: p.map[0], type: p.type } : null;
    }
    out.push({ ...c, line: tok.map[0], end: tok.map[1], target, container });
  });
  return out;
}

/** The blocks of the document that can take a comment. */
export function annotatableBlocks(src: string): BlockRef[] {
  const { tokens, bodyStart } = parse(src);
  return tokens
    .filter((t) => t.map && t.map[0] >= bodyStart && ANNOTATABLE.has(t.type) && !isAnyComment(t))
    .map((t) => ({ line: t.map![0], type: t.type }));
}

// ---- Line prefixes: blockquote markers and list indentation ---------------------------------

interface Segment {
  len: number;
  /** A list item whose marker is on this line: on other lines it becomes spaces. */
  opensItem: boolean;
  /** A container that starts on this line. */
  opens: boolean;
}

/** How the containers `anc` split the start of line `n`, outermost first. */
function segments(text: string[], n: number, anc: Token[]): Segment[] {
  const s = text[n];
  const segs: Segment[] = [];
  let pos = 0;
  anc.forEach((a, k) => {
    const rest = s.slice(pos);
    const opens = a.map![0] === n;
    let len: number;
    if (a.type === "blockquote_open") {
      const m = /^ {0,3}> ?/.exec(rest);
      if (!m) throw new AnnotateError(`Line ${n + 1}: no quote marker where one belongs`);
      len = m[0].length;
    } else if (opens) {
      const m = /^( {0,3})([-*+]|\d{1,9}[.)])( *)/.exec(rest);
      if (!m) throw new AnnotateError(`Line ${n + 1}: no list marker where one belongs`);
      if (rest.length === m[0].length) throw new AnnotateError(`Line ${n + 1}: a list item that starts empty`);
      const spaces = m[3].length > 4 ? 1 : m[3].length;
      len = m[1].length + m[2].length + spaces;
    } else {
      const first = segments(text, a.map![0], anc.slice(0, k + 1));
      len = first[first.length - 1].len;
      if (!rest.startsWith(" ".repeat(len))) throw new AnnotateError(`Line ${n + 1}: indented less than its list item`);
    }
    segs.push({ len, opensItem: opens && a.type === "list_item_open", opens });
    pos += len;
  });
  if (s.slice(0, pos).includes("\t")) throw new AnnotateError(`Line ${n + 1}: tabs in the indentation`);
  return segs;
}

/** The prefix as on line `n`, and as it is written on the lines that continue it. */
function prefixes(text: string[], n: number, segs: Segment[]) {
  let pos = 0;
  let first = "";
  let cont = "";
  for (const seg of segs) {
    const part = text[n].slice(pos, pos + seg.len);
    first += part;
    cont += seg.opensItem ? " ".repeat(seg.len) : part;
    pos += seg.len;
  }
  return { first, cont };
}

// ---- Writing --------------------------------------------------------------------------------

/** The lines of a comment, without the line prefix. `-->` in the text would end it early. */
function commentLines(head: string, text: string): string[] {
  const body = text
    .replace(/--(!?)>/g, "--$1 >")
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter((s) => s);
  if (!body.length) return [`<!-- ${head}: -->`];
  return body.map((s, i) => (i ? "     " : `<!-- ${head}: `) + s + (i === body.length - 1 ? " -->" : ""));
}

function headOf(type: CommentType, status: Status | null) {
  if (!COMMENT_TYPES.includes(type)) throw new AnnotateError(`Unknown comment type: ${type}`);
  return `@${type}${status ? `#${status}` : ""}`;
}

/** Adds a comment to a block, after the comments it already has. */
export function insertComment(src: string, block: BlockRef, type: CommentType, text: string): string {
  const { lines, tokens, bodyStart } = parse(src);
  const idx = tokens.findIndex((t) => t.map?.[0] === block.line && t.type === block.type);
  const tok = tokens[idx];
  if (idx < 0 || !ANNOTATABLE.has(tok.type) || isAnyComment(tok) || block.line < bodyStart) {
    throw new AnnotateError(`No block to comment at line ${block.line + 1}`);
  }
  let anc = ancestors(tokens, idx);
  let at = block.line;
  if (tok.type === "list_item_open") {
    // Into the item, before its first block (after its comments): the item's marker stays first.
    let j = idx + 1;
    while (isAnyComment(tokens[j])) j++;
    if (!tokens[j]?.map || tokens[j].nesting === -1) throw new AnnotateError(`Line ${at + 1}: an empty list item`);
    anc = [...anc, tok];
    at = tokens[j].map![0];
  }
  const segs = segments(lines.text, at, anc);
  const { first, cont } = prefixes(lines.text, at, segs);
  const comment = commentLines(headOf(type, null), text);
  const added = comment.map((s, i) => (i ? cont : first) + s);
  if (segs.some((s) => s.opensItem)) {
    // "- Text" becomes "- <!-- … -->" and "  Text": the marker moves to the comment.
    splice(lines, at, at + 1, [...added, cont + lines.text[at].slice(first.length)]);
  } else {
    const blankBefore = at === bodyStart || blankish(lines.text[at - 1]) || segs.some((s) => s.opens);
    splice(lines, at, at, blankBefore ? [...added, cont.trimEnd()] : added);
  }
  return checked(src, join(lines));
}

/** The comment that starts at `line`. */
function find(p: Parsed, line: number) {
  const idx = p.tokens.findIndex((t) => t.map?.[0] === line && asComment(t));
  if (idx < 0 || line < p.bodyStart) throw new AnnotateError(`No comment at line ${line + 1}`);
  const tok = p.tokens[idx];
  return { idx, tok, comment: asComment(tok)!, from: tok.map![0], to: tok.map![1] };
}

/** Removes the comment that starts at `line`, and the blank line it leaves doubled. */
export function deleteComment(src: string, line: number): string {
  const p = parse(src);
  const { lines, tokens } = p;
  const { idx, from, to } = find(p, line);
  const anc = ancestors(tokens, idx);
  const segs = segments(lines.text, from, anc);
  if (segs.some((s) => s.opensItem)) {
    // The comment carries the item's marker: it moves to the next line of the item.
    const item = [...anc].reverse().find((a) => a.type === "list_item_open" && a.map![0] === from)!;
    const itemEnd = item.map![1];
    const { first } = prefixes(lines.text, from, segs);
    let next = to;
    if (next < itemEnd && blankish(lines.text[next]) && next + 1 < itemEnd) next++;
    if (next < itemEnd && !blankish(lines.text[next])) {
      const { first: nextPrefix } = prefixes(lines.text, next, segments(lines.text, next, anc));
      splice(lines, from, next + 1, [first + lines.text[next].slice(nextPrefix.length)]);
    } else {
      splice(lines, from, to, [first.trimEnd()]);
    }
  } else {
    const blankBefore = from === p.bodyStart || blankish(lines.text[from - 1]) || segs.some((s) => s.opens);
    if (blankBefore && blankish(lines.text[to])) splice(lines, from, to + 1, []);
    else if (to >= lines.text.length && from > 0 && blankish(lines.text[from - 1])) splice(lines, from - 1, to, []);
    else splice(lines, from, to, []);
  }
  return checked(src, join(lines));
}

/** Changes the text of the comment that starts at `line`; type and status stay. */
export function editComment(src: string, line: number, text: string): string {
  const p = parse(src);
  const { lines, tokens } = p;
  const { idx, from, to, comment } = find(p, line);
  const segs = segments(lines.text, from, ancestors(tokens, idx));
  const { first, cont } = prefixes(lines.text, from, segs);
  const start = lines.text[from].indexOf("<!--");
  const lead = lines.text[from].slice(0, start); // the prefix and any indentation before "<!--"
  const indent = cont + lead.slice(first.length);
  const added = commentLines(comment.head, text).map((s, i) => (i ? indent : lead) + s);
  splice(lines, from, to, added);
  return checked(src, join(lines));
}

/** Ticks (done) or reopens the comment that starts at `line`. Only its head changes. */
export function setDone(src: string, line: number, done: boolean): string {
  const p = parse(src);
  const { from, comment } = find(p, line);
  if ((comment.status === "erledigt") === done) return src;
  const s = p.lines.text[from];
  p.lines.text[from] = s.replace(HEAD_RE, (_, open: string, type: string) => open + type + (done ? "#erledigt" : ""));
  return checked(src, join(p.lines));
}

// ---- The promise: the rendering stays the same ----------------------------------------------

/** The page a text gives, without its HTML comments. */
function rendering(src: string): string {
  return parser.render(split(src).text.join("\n")).replace(/<!--[\s\S]*?-->\n?/g, "");
}

/**
 * Whether two texts give the same page, comments aside (Z1). In a tight list a comment adds or
 * removes a line break after `<li>` or before a block inside the item; a browser shows neither,
 * and that is the only difference allowed.
 */
export function sameRendering(a: string, b: string): boolean {
  const ra = rendering(a);
  const rb = rendering(b);
  if (ra === rb) return true;
  const loose = (h: string) =>
    h.replace(/(<li[^>]*>)\n/g, "$1").replace(/\n(?=<(?:ul|ol|li|blockquote|pre|table|h[1-6]|p|div|hr)[\s>])/g, "");
  return loose(ra) === loose(rb);
}

function checked(before: string, after: string): string {
  if (!sameRendering(before, after)) throw new AnnotateError("The change would alter how the document looks; nothing written");
  return after;
}
