import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff";
import { blobLines, contextLines, gapsOf, hiddenIn, oldTotalOf, openMore, shownIn } from "./context";

const PATCH = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -10,3 +10,4 @@
 l10
+new
 l11
 l12
@@ -30,2 +30,0 @@
-l30
-l31
`;
const f = parsePatch(PATCH)!.files[0];
const OLD = Array.from({ length: 40 }, (_, i) => `l${i + 1}`);

describe("unchanged stretches", () => {
  it("before, between and after the hunks, with the shift of the numbers", () => {
    expect(gapsOf(f)).toEqual([
      { index: 0, from: 1, to: 9, delta: 0 },
      { index: 1, from: 13, to: 29, delta: 1 },
      { index: 2, from: 32, to: null, delta: -1 },
    ]);
    expect(gapsOf(f, 40)[2]).toEqual({ index: 2, from: 32, to: 40, delta: -1 });
    expect(gapsOf(f, 31)).toHaveLength(2);
  });

  it("opens step by step from either side, and all at once", () => {
    const gap = gapsOf(f)[1];
    let open = openMore(gap, { top: 0, bottom: 0 }, "top", 5);
    open = openMore(gap, open, "bottom", 5);
    expect(open).toEqual({ top: 5, bottom: 5 });
    expect(hiddenIn(gap, open)).toBe(7);
    expect(shownIn(gap, open)).toEqual({ top: [13, 17], bottom: [25, 29] });
    open = openMore(gap, open, "top", 20);
    expect(hiddenIn(gap, open)).toBe(0);
    expect(openMore(gap, { top: 0, bottom: 0 }, "all")).toEqual({ top: 17, bottom: 0 });
  });

  it("takes the lines from the blob of either side, numbered on both", () => {
    const gap = gapsOf(f)[1];
    expect(contextLines(OLD, "old", gap, 13, 14)).toEqual([
      { type: " ", text: "l13", oldNo: 13, newNo: 14, src: 0 },
      { type: " ", text: "l14", oldNo: 14, newNo: 15, src: 0 },
    ]);
    const NEW = [...OLD.slice(0, 10), "new", ...OLD.slice(10, 29), ...OLD.slice(31)];
    expect(contextLines(NEW, "new", gap, 13, 13)[0]).toMatchObject({ text: "l13", oldNo: 13, newNo: 14 });
    expect(oldTotalOf(f, NEW, "new")).toBe(40);
    expect(oldTotalOf(f, OLD, "old")).toBe(40);
    // Past the end of the blob: nothing
    expect(contextLines(OLD, "old", gapsOf(f)[2], 39, 45)).toHaveLength(2);
  });

  it("splits a blob into lines", () => {
    expect(blobLines("a\nb\n")).toEqual(["a", "b"]);
    expect(blobLines("a\r\nb")).toEqual(["a", "b"]);
  });
});
