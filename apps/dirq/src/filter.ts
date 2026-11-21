/** Which files the list shows, and in which order. No DOM in here. */
import type { FileDiff, Status } from "./diff";

export type Sort = "folder" | "size" | "status";
export type Chip = "added" | "modified" | "deleted" | "renamed";

export interface FileFilter {
  query: string;
  /** Empty means all. */
  chips: ReadonlySet<Chip>;
  sort: Sort;
}

export const CHIPS: { id: Chip; label: string }[] = [
  { id: "added", label: "new" },
  { id: "modified", label: "changed" },
  { id: "deleted", label: "deleted" },
  { id: "renamed", label: "renamed" },
];

const chipOf = (s: Status): Chip => (s === "copied" ? "renamed" : s);
const RANK: Record<Chip, number> = { added: 0, modified: 1, renamed: 2, deleted: 3 };

/** Indices into `files`, filtered and sorted; "folder" keeps the order of the patch. */
export function visibleFiles(files: readonly FileDiff[], f: FileFilter): number[] {
  const q = f.query.trim().toLowerCase();
  const out: number[] = [];
  files.forEach((file, i) => {
    if (f.chips.size > 0 && !f.chips.has(chipOf(file.status))) return;
    if (q && !`${file.oldPath}\n${file.newPath}`.toLowerCase().includes(q)) return;
    out.push(i);
  });
  if (f.sort === "size") out.sort((a, b) => files[b].added + files[b].deleted - (files[a].added + files[a].deleted) || a - b);
  else if (f.sort === "status") out.sort((a, b) => RANK[chipOf(files[a].status)] - RANK[chipOf(files[b].status)] || a - b);
  return out;
}
