import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff";
import { anchorOf, comparePatches, findAnchor, freshKey, updateFresh } from "./live";

type H = { at: number; section?: string; del?: string[]; add?: string[]; ctx?: string[] };
/** A patch of files made of hunks; line numbers follow `at`. */
const make = (files: Record<string, H[]>) =>
  parsePatch(
    Object.entries(files)
      .flatMap(([f, hunks]) => [
        `diff --git a/${f} b/${f}`,
        `--- a/${f}`,
        `+++ b/${f}`,
        ...hunks.flatMap((h) => {
          const ctx = h.ctx ?? ["keep"];
          const del = h.del ?? [];
          const add = h.add ?? [];
          return [
            `@@ -${h.at},${ctx.length + del.length} +${h.at},${ctx.length + add.length} @@${h.section ? " " + h.section : ""}`,
            ...ctx.map((c) => " " + c),
            ...del.map((c) => "-" + c),
            ...add.map((c) => "+" + c),
          ];
        }),
      ])
      .concat("")
      .join("\n"),
  )!;

describe("comparePatches", () => {
  const base = () => make({ "a.rs": [{ at: 1, del: ["x"], add: ["y"] }, { at: 40, del: ["p"], add: ["q"] }], "b.rs": [{ at: 5, add: ["z"] }] });

  it("finds nothing in the same patch", () => {
    const c = comparePatches(base(), base());
    expect(c.fresh).toEqual([]);
    expect(c.removed).toEqual([]);
  });
  it("a shift of line numbers is no change", () => {
    const moved = make({ "a.rs": [{ at: 11, del: ["x"], add: ["y"] }, { at: 50, del: ["p"], add: ["q"] }], "b.rs": [{ at: 5, add: ["z"] }] });
    expect(comparePatches(base(), moved).fresh).toEqual([]);
  });
  it("a hunk with nothing like it before is new", () => {
    const next = make({ "a.rs": [{ at: 1, del: ["x"], add: ["y"] }, { at: 40, del: ["p"], add: ["q"] }, { at: 90, add: ["brand new"] }], "b.rs": [{ at: 5, add: ["z"] }] });
    expect(comparePatches(base(), next).fresh).toEqual([{ file: "a.rs", hunk: 2, kind: "new" }]);
  });
  it("an edited hunk is changed", () => {
    const next = make({ "a.rs": [{ at: 1, del: ["x"], add: ["y", "and more"] }, { at: 40, del: ["p"], add: ["q"] }], "b.rs": [{ at: 5, add: ["z"] }] });
    expect(comparePatches(base(), next).fresh).toEqual([{ file: "a.rs", hunk: 0, kind: "changed" }]);
  });
  it("a hunk that is gone is counted as removed, and shows nothing", () => {
    const next = make({ "a.rs": [{ at: 1, del: ["x"], add: ["y"] }], "b.rs": [{ at: 5, add: ["z"] }] });
    const c = comparePatches(base(), next);
    expect(c.fresh).toEqual([]);
    expect(c.removed).toEqual([{ file: "a.rs", count: 1 }]);
  });
  it("a new file is all new; a file that dropped out is removed", () => {
    const next = make({ "a.rs": [{ at: 1, del: ["x"], add: ["y"] }, { at: 40, del: ["p"], add: ["q"] }], "c.rs": [{ at: 1, add: ["1"] }, { at: 9, add: ["2"] }] });
    const c = comparePatches(base(), next);
    expect(c.fresh).toEqual([
      { file: "c.rs", hunk: 0, kind: "new" },
      { file: "c.rs", hunk: 1, kind: "new" },
    ]);
    expect(c.removed).toEqual([{ file: "b.rs", count: 1 }]);
  });
  it("two equal hunks are matched one by one", () => {
    const two = make({ "a.rs": [{ at: 1, add: ["same"] }, { at: 20, add: ["same"] }] });
    const three = make({ "a.rs": [{ at: 1, add: ["same"] }, { at: 20, add: ["same"] }, { at: 40, add: ["same"] }] });
    expect(comparePatches(two, three).fresh).toHaveLength(1);
  });
});

describe("updateFresh", () => {
  it("keeps marks still in the patch, drops the others, flashes what is new now", () => {
    const v1 = make({ "a.rs": [{ at: 1, add: ["one"] }] });
    const v2 = make({ "a.rs": [{ at: 1, add: ["one"] }, { at: 9, add: ["two"] }] });
    const first = updateFresh(new Set(), v1, v2);
    expect(first.keys.size).toBe(1);
    expect(first.now).toEqual(first.keys);
    // a third version changes nothing: the mark stays, but does not flash again
    const second = updateFresh(first.keys, v2, v2);
    expect(second.keys).toEqual(first.keys);
    expect(second.now.size).toBe(0);
    // the new hunk goes away: its mark goes with it
    expect(updateFresh(second.keys, v2, v1).keys.size).toBe(0);
  });
  it("marks nothing without an earlier version", () => {
    expect(updateFresh(new Set(["x"]), null, make({ "a.rs": [{ at: 1, add: ["one"] }] })).keys.size).toBe(0);
  });
  it("freshKey names a file or a hunk", () => {
    const p = make({ "a.rs": [{ at: 1, add: ["one"] }] });
    expect(freshKey("a.rs", null)).not.toBe(freshKey("a.rs", p.files[0].hunks[0]));
  });
});

describe("anchors", () => {
  const v1 = make({
    "a.rs": [
      { at: 1, add: ["alpha"] },
      { at: 30, add: ["beta"] },
      { at: 60, add: ["beta"] },
    ],
  });
  it("finds the hunk again after something is inserted before it", () => {
    const a = anchorOf(v1.files[0], 1, 12);
    const v2 = make({ "a.rs": [{ at: 1, add: ["new first"] }, { at: 5, add: ["alpha"] }, { at: 40, add: ["beta"] }, { at: 70, add: ["beta"] }] });
    expect(findAnchor(v2, a)).toEqual({ file: 0, hunk: 2 });
    expect(a.offset).toBe(12);
  });
  it("tells equal first lines apart by their order", () => {
    const a = anchorOf(v1.files[0], 2, 0);
    expect(a.nth).toBe(1);
    expect(findAnchor(v1, a)).toEqual({ file: 0, hunk: 2 });
  });
  it("falls back to the same position when the line is gone, and to nothing when the file is", () => {
    const a = anchorOf(v1.files[0], 1, 0);
    const v2 = make({ "a.rs": [{ at: 1, add: ["x"] }, { at: 9, add: ["y"] }] });
    expect(findAnchor(v2, a)).toEqual({ file: 0, hunk: 1 });
    expect(findAnchor(make({ "z.rs": [{ at: 1, add: ["x"] }] }), a)).toBeNull();
  });
  it("uses the first changed line, not the context", () => {
    const p = make({ "a.rs": [{ at: 1, ctx: ["same", "same"], add: ["real"] }, { at: 9, ctx: ["same", "same"], add: ["other"] }] });
    expect(anchorOf(p.files[0], 1, 0).line).toBe("+other");
  });
});
