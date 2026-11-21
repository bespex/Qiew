/*
 * Writing a comment into the file shown – only for a file opened with --annotate (the backend checks
 * that again, Z7). Each change is made on the file as it is now, not on the text rendered a while
 * ago: read it afresh, find the block or comment again (Z6), change, and save only if the file still
 * is what the change was made from. If it changed in between (an editor saved), try once more.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  AnnotateError,
  deleteComment,
  editComment,
  insertComment,
  relocateBlock,
  relocateComment,
  setDone,
  type BlockRef,
  type CommentType,
} from "./annotate";

/** A change of the file as it is now; throws AnnotateError if it cannot be made safely. */
type Change = (now: string) => string;

/** The backend's answer when the file changed between reading and saving (annotate.rs). */
const CHANGED = "geändert";

/** Makes `change` on the file at `path` and saves it. Returns the new text. */
async function write(path: string, change: Change): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const now = await invoke<string>("read_document", { path });
    const next = change(now);
    if (next === now) return now;
    try {
      await invoke("save_annotated", { path, base: now, content: next });
      return next;
    } catch (err) {
      if (attempt === 0 && String(err).includes(CHANGED)) continue;
      throw err;
    }
  }
}

const lost = () => new AnnotateError("Die Stelle ist in der Datei nicht mehr eindeutig zu finden; nichts geschrieben");

function block(seen: string, now: string, b: BlockRef): BlockRef {
  return relocateBlock(seen, now, b) ?? (() => { throw lost(); })();
}

function comment(seen: string, now: string, line: number): number {
  return relocateComment(seen, now, line) ?? (() => { throw lost(); })();
}

/*
 * The changes. `seen` is the text the page was rendered from; block and line refer to it.
 */

export const addComment = (path: string, seen: string, b: BlockRef, type: CommentType, text: string) =>
  write(path, (now) => insertComment(now, block(seen, now, b), type, text));

export const changeComment = (path: string, seen: string, line: number, text: string) =>
  write(path, (now) => editComment(now, comment(seen, now, line), text));

export const tickComment = (path: string, seen: string, line: number, done: boolean) =>
  write(path, (now) => setDone(now, comment(seen, now, line), done));

export const removeComment = (path: string, seen: string, line: number) =>
  write(path, (now) => deleteComment(now, comment(seen, now, line)));
