/**
 * Comments on single lines (only with --annotate, Qiew docs/ANNOTATE.md): which line a comment
 * points at, what goes to the program that started Dirq, how a comment finds its line again in a
 * new version of the patch, and the list to copy when there is nowhere to send them. No DOM in here.
 */
import type { DiffLine, FileDiff, Hunk } from "./diff";

/** What CodeDeck reads in front of the text of a removed line (fixed by the specification). */
export const DELETED_PREFIX = "(gelöschte Zeile) ";

/** The line a comment points at. */
export interface Target {
  /** The file as the patch names it (the new path; the old one for a deleted file). */
  file: string;
  /** A removed line belongs to the old side; context and added lines to the new one. */
  deleted: boolean;
  /** The line's text, without the sign. */
  text: string;
  /** Its number on its own side: the old side for a removed line, else the new side. */
  at: number;
  /** The line of the new side that is sent: for a removed line the next one after it. */
  line: number;
  /** A line shown from the repository around the patch (--repo), not one of the patch's own. */
  extra?: boolean;
}

export const fileOf = (f: FileDiff) => f.newPath || f.oldPath;

/**
 * The line of the new side that stands for a removed line: the next line of the new side after it
 * in the hunk; at the end of a hunk (only at the end of the file, else context follows) the last
 * line of the hunk's new side.
 */
export function lineForDeleted(hunk: Hunk, index: number): number {
  for (let i = index + 1; i < hunk.lines.length; i++) {
    const n = hunk.lines[i].newNo;
    if (n !== undefined) return n;
  }
  return Math.max(1, hunk.newStart + hunk.newCount - 1);
}

/** The target of a line of a hunk; `hunk` null for a line shown from the repository. */
export function targetOf(f: FileDiff, line: DiffLine, hunk: Hunk | null): Target {
  const file = fileOf(f);
  if (line.type === "-") {
    const index = hunk ? hunk.lines.indexOf(line) : -1;
    return { file, deleted: true, text: line.text, at: line.oldNo!, line: hunk && index >= 0 ? lineForDeleted(hunk, index) : Math.max(1, line.oldNo!) };
  }
  return { file, deleted: false, text: line.text, at: line.newNo!, line: line.newNo!, ...(hunk ? {} : { extra: true }) };
}

/** The `code` sent along: the line's text, a removed line marked as such. */
export const codeOf = (t: Target) => (t.deleted ? DELETED_PREFIX : "") + t.text;

/** The same line, by side and number. */
export const sameLine = (a: Target, b: Target) => a.file === b.file && a.deleted === b.deleted && a.at === b.at;

/**
 * Where the line a comment points at is in a new version of the patch: the line of the same side
 * with the same text, the nearest to where it was. Null if the file or the text is gone.
 */
export function relocate(t: Target, files: readonly FileDiff[]): Target | null {
  const f = files.find((x) => fileOf(x) === t.file);
  if (!f) return null;
  let best: { line: DiffLine; hunk: Hunk; distance: number } | null = null;
  for (const hunk of f.hunks) {
    for (const line of hunk.lines) {
      if ((line.type === "-") !== t.deleted || line.text !== t.text) continue;
      const at = t.deleted ? line.oldNo! : line.newNo!;
      const distance = Math.abs(at - t.at);
      if (!best || distance < best.distance) best = { line, hunk, distance };
    }
  }
  return best && targetOf(f, best.line, best.hunk);
}

/** A comment in the window. Dirq keeps none of them beyond the document shown. */
export interface Comment {
  /** Chosen by Dirq, at least 8 characters; the same id sent again replaces the comment. */
  id: string;
  target: Target;
  text: string;
  /** sent: the receiver has it; unsent: it has not (no connection, or it failed). */
  state: "sending" | "sent" | "unsent";
  /** Why the last attempt to send (or to remove) failed. */
  error?: string;
  /** Its line is not in the new version of the patch: shown dimmed, "line changed". */
  lost?: boolean;
}

/** A new id: random, 12 characters. */
export function newId(random: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 12 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

/** What the backend makes the message of (`send_comment`): one line of JSON from these fields. */
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

export function addMessage(c: Comment, session?: string, doc?: string | null): Outgoing {
  return { action: "line_comment", id: c.id, file: c.target.file, line: c.target.line, code: codeOf(c.target), text: c.text, session, doc: doc ?? undefined };
}

export function removeMessage(c: Comment, session?: string, doc?: string | null): Outgoing {
  return { action: "line_comment_remove", id: c.id, session, doc: doc ?? undefined };
}

/** The comments as Markdown, by file: the way out where nothing receives them. */
export function markdownList(comments: readonly Comment[]): string {
  const byFile = new Map<string, Comment[]>();
  for (const c of comments) byFile.set(c.target.file, [...(byFile.get(c.target.file) ?? []), c]);
  const parts: string[] = [];
  for (const [file, list] of byFile) {
    const lines = [...list]
      .sort((a, b) => a.target.line - b.target.line)
      .map((c) => {
        const code = codeOf(c.target).trim().replace(/`/g, "'").slice(0, 160);
        return `- Line ${c.target.line}${code ? `: \`${code}\`` : ""} – ${c.text.trim().replace(/\n/g, "\n  ")}`;
      });
    parts.push(`## ${file}\n\n${lines.join("\n")}`);
  }
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}
