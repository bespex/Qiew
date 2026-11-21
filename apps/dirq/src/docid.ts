/**
 * Which document a patch belongs to: the same key means "a new version of what was shown", so
 * the view keeps its state and shows what changed; another key starts afresh. No DOM in here.
 *
 *  1. `--id` of the call that opened it: the caller knows (CodeDeck: "Round 7 · Project").
 *  2. The path, for a real file.
 *  3. Standard input is kept under a new name each time (`stdin-<pid>.patch`), so there the
 *     subject of the patch header, or without a header the set of file paths.
 *
 * 3 is a stand-in for `git diff | dirq -` by hand. When in doubt it says "the same", which is
 * the harmless mistake: a little too much flashes, a comment card is dimmed.
 */
import type { Patch } from "./diff";

const STDIN = /(^|\/)stdin-\d+\.[^/]*$/;

export function docKey(path: string, patch: Patch | null, id: string | null | undefined): string {
  if (id) return `id:${id}`;
  if (!STDIN.test(path)) return `file:${path}`;
  const subject = patch?.meta.subject?.trim();
  if (subject) return `subject:${subject}`;
  if (patch) return `files:${patch.files.map((f) => f.newPath || f.oldPath).sort().join("\n")}`;
  return `file:${path}`;
}
