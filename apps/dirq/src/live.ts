/**
 * Live review: what changed between two versions of the same patch, and how the view finds its
 * place again after a reload. No DOM in here.
 */
import type { FileDiff, Hunk, Patch } from "./diff";

const fileKey = (f: FileDiff) => f.newPath || f.oldPath;

/** A hunk by what it says: its lines, not where it sits, so a shift of line numbers is no change. */
export function hunkKey(h: Hunk): string {
  return h.lines.map((l) => l.type + l.text).join("\n");
}

/** The first line that was added or removed, else the first line: what the view anchors to. */
function firstChange(h: Hunk): string {
  const l = h.lines.find((x) => x.type !== " ") ?? h.lines[0];
  return l ? l.type + l.text : "";
}

export interface Fresh {
  file: string;
  /** Index of the hunk in the new patch; -1 for a file without hunks (renamed, binary). */
  hunk: number;
  /** "new": nothing like it before; "changed": a hunk that was there and is not the same any more. */
  kind: "new" | "changed";
}

export interface Comparison {
  fresh: Fresh[];
  /** Hunks that were in the old version and are gone, per file (also whole files). */
  removed: { file: string; count: number }[];
}

const changedLines = (h: Hunk) => new Set(h.lines.filter((l) => l.type !== " ").map((l) => l.type + l.text));

/** What the new version of a patch has that the old one had not, and what it lost. */
export function comparePatches(prev: Patch, next: Patch): Comparison {
  const fresh: Fresh[] = [];
  const removed: Comparison["removed"] = [];
  const before = new Map(prev.files.map((f) => [fileKey(f), f]));

  for (const f of next.files) {
    const key = fileKey(f);
    const old = before.get(key);
    before.delete(key);
    if (!old) {
      if (f.hunks.length === 0) fresh.push({ file: key, hunk: -1, kind: "new" });
      f.hunks.forEach((_, hunk) => fresh.push({ file: key, hunk, kind: "new" }));
      continue;
    }
    // Same text on both sides: unchanged, wherever it is now.
    const left = new Map<string, number>();
    old.hunks.forEach((h) => left.set(hunkKey(h), (left.get(hunkKey(h)) ?? 0) + 1));
    const unmatched: number[] = [];
    f.hunks.forEach((h, i) => {
      const k = hunkKey(h);
      const n = left.get(k) ?? 0;
      if (n > 0) left.set(k, n - 1);
      else unmatched.push(i);
    });
    // What is left over of the old: a hunk that shares a changed line (or its section) with a
    // new one was edited; the rest is new.
    const leftover = old.hunks.filter((h) => {
      const n = left.get(hunkKey(h)) ?? 0;
      if (n <= 0) return false;
      left.set(hunkKey(h), n - 1);
      return true;
    });
    for (const i of unmatched) {
      const h = f.hunks[i];
      const mine = changedLines(h);
      const at = leftover.findIndex((o) => [...changedLines(o)].some((l) => mine.has(l)) || (o.section !== "" && o.section === h.section));
      if (at >= 0) leftover.splice(at, 1);
      fresh.push({ file: key, hunk: i, kind: at >= 0 ? "changed" : "new" });
    }
    if (leftover.length) removed.push({ file: key, count: leftover.length });
  }
  for (const [file, f] of before) removed.push({ file, count: Math.max(1, f.hunks.length) });
  return { fresh, removed };
}

/** The key under which a fresh hunk is remembered across reloads. */
export const freshKey = (file: string, h: Hunk | null) => `${file}\0${h ? hunkKey(h) : ""}`;

/**
 * The marks to keep after a reload: those still in the patch, plus what is new now. `now` holds
 * what is new in this very reload (it flashes).
 */
export function updateFresh(kept: ReadonlySet<string>, prev: Patch | null, next: Patch): { keys: Set<string>; now: Set<string> } {
  const exists = new Set<string>();
  for (const f of next.files) {
    exists.add(freshKey(fileKey(f), null));
    for (const h of f.hunks) exists.add(freshKey(fileKey(f), h));
  }
  const keys = new Set([...kept].filter((k) => exists.has(k)));
  const now = new Set<string>();
  if (prev) {
    for (const c of comparePatches(prev, next).fresh) {
      const f = next.files.find((x) => fileKey(x) === c.file)!;
      const k = freshKey(c.file, c.hunk >= 0 ? f.hunks[c.hunk] : null);
      keys.add(k);
      now.add(k);
    }
  }
  return { keys, now };
}

// ---- finding the place again ---------------------------------------------------------------

/** A place in the patch that survives a reload: a hunk, found by its first changed line. */
export interface Anchor {
  file: string;
  line: string;
  /** Among the hunks of the file that start with the same line, the how-manieth. */
  nth: number;
  /** Fallback: its index. */
  index: number;
  /** Where its header sits below the edge of the view, in pixels (negative: scrolled past it). */
  offset: number;
}

export function anchorOf(f: FileDiff, hunk: number, offset: number): Anchor {
  const line = firstChange(f.hunks[hunk]);
  const nth = f.hunks.slice(0, hunk).filter((h) => firstChange(h) === line).length;
  return { file: fileKey(f), line, nth, index: hunk, offset };
}

/** Where the anchor is in the new patch; null if its file is gone. */
export function findAnchor(next: Patch, a: Anchor): { file: number; hunk: number } | null {
  const file = next.files.findIndex((f) => fileKey(f) === a.file);
  if (file < 0) return null;
  const hunks = next.files[file].hunks;
  if (hunks.length === 0) return null;
  const same = hunks.map((h, i) => [i, firstChange(h) === a.line] as const).filter(([, ok]) => ok).map(([i]) => i);
  const hunk = same.length ? (same[a.nth] ?? same[same.length - 1]) : Math.min(a.index, hunks.length - 1);
  return { file, hunk };
}
