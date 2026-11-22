/**
 * More lines around a change (only with --repo): the unchanged stretches between the hunks of a
 * file, and the lines of them taken from a blob of the repository. No DOM in here.
 *
 * A stretch is unchanged, so it reads the same on both sides; only the numbers differ by a fixed
 * amount. The old blob is used where the repository has it (for uncommitted changes the new side
 * often is not stored yet); otherwise the new one.
 */
import type { DiffLine, FileDiff } from "./diff";

/** An unchanged stretch of a file: before the first hunk, between two, or after the last. */
export interface Gap {
  /** 0 before the first hunk, i before hunk i, hunks.length after the last. */
  index: number;
  /** First and last line of the stretch on the old side (to: unknown after the last hunk, until the file is known). */
  from: number;
  to: number | null;
  /** New line number minus old line number, in this stretch. */
  delta: number;
}

/** How much of a gap is open: lines next to the change above it, and next to the change below it. */
export interface Opened {
  top: number;
  bottom: number;
}

/** The unchanged stretches of a file, in order; `oldTotal`: the number of lines of the old side, if known. */
export function gapsOf(f: FileDiff, oldTotal?: number): Gap[] {
  const gaps: Gap[] = [];
  let next = 1; // first old line after the previous hunk
  let delta = 0;
  f.hunks.forEach((h, i) => {
    // A hunk that only adds lines names the line before it ("-5,0"): it starts one later
    const start = h.oldCount === 0 ? h.oldStart + 1 : h.oldStart;
    delta = (h.newCount === 0 ? h.newStart + 1 : h.newStart) - start;
    if (start > next) gaps.push({ index: i, from: next, to: start - 1, delta });
    next = start + h.oldCount;
    delta = (h.newCount === 0 ? h.newStart + 1 : h.newStart) + h.newCount - next;
  });
  if (f.hunks.length) {
    const to = oldTotal === undefined ? null : oldTotal;
    if (to === null || to >= next) gaps.push({ index: f.hunks.length, from: next, to, delta });
  }
  return gaps;
}

/** Lines of a gap still closed. Null while the end of the file is unknown. */
export function hiddenIn(gap: Gap, open: Opened): number | null {
  if (gap.to === null) return null;
  return Math.max(0, gap.to - gap.from + 1 - open.top - open.bottom);
}

/** The old line numbers shown above and below the closed part of a gap. */
export function shownIn(gap: Gap, open: Opened): { top: [number, number] | null; bottom: [number, number] | null } {
  const end = gap.to ?? gap.from + open.top - 1;
  const size = end - gap.from + 1;
  const top = Math.min(open.top, size);
  const bottom = Math.min(open.bottom, size - top);
  return {
    top: top > 0 ? [gap.from, gap.from + top - 1] : null,
    bottom: bottom > 0 ? [end - bottom + 1, end] : null,
  };
}

/** One step: `more` lines more next to the change above (`top`) or below (`bottom`), or all of it. */
export function openMore(gap: Gap, open: Opened, where: "top" | "bottom" | "all", more = 20): Opened {
  const size = gap.to === null ? Infinity : gap.to - gap.from + 1;
  if (where === "all") return { top: size === Infinity ? open.top + more : size, bottom: 0 };
  const left = size - open.top - open.bottom;
  const step = Math.max(0, Math.min(more, left));
  return where === "top" ? { ...open, top: open.top + step } : { ...open, bottom: open.bottom + step };
}

/** Lines of the blob as context lines of the diff; `side`: which side the blob is of. `src` 0: not in the patch file. */
export function contextLines(blob: readonly string[], side: "old" | "new", gap: Gap, from: number, to: number): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let oldNo = from; oldNo <= to; oldNo++) {
    const newNo = oldNo + gap.delta;
    const text = blob[(side === "old" ? oldNo : newNo) - 1];
    if (text === undefined) break;
    lines.push({ type: " ", text, oldNo, newNo, src: 0 });
  }
  return lines;
}

/** A blob's text as lines, without the empty one after a final line break. */
export function blobLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The number of lines of the old side, from a blob of either side and the last gap's delta. */
export function oldTotalOf(f: FileDiff, blob: readonly string[], side: "old" | "new"): number {
  if (side === "old") return blob.length;
  const gaps = gapsOf(f);
  const last = gaps[gaps.length - 1];
  return blob.length - (last?.delta ?? 0);
}
