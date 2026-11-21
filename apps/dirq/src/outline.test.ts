import { describe, expect, it } from "vitest";
import { outline, parsePatch } from "./diff";

const patch = (sections: string[]) =>
  [
    "diff --git a/x.rs b/x.rs",
    "--- a/x.rs",
    "+++ b/x.rs",
    ...sections.flatMap((s, i) => [`@@ -${i * 10 + 1},1 +${i * 10 + 1},1 @@${s ? " " + s : ""}`, "-a", "+b"]),
    "",
  ].join("\n");

describe("outline", () => {
  const names = (sections: string[]) => outline(parsePatch(patch(sections))!.files[0]).map((o) => o.section);
  it("lists what the hunk headers name, in order", () => expect(names(["fn one()", "fn two()"])).toEqual(["fn one()", "fn two()"]));
  it("skips hunks without context", () => expect(names(["", "fn one()", ""])).toEqual(["fn one()"]));
  it("names each only once", () => expect(names(["fn a()", "fn a()", "fn b()", "fn a()"])).toEqual(["fn a()", "fn b()"]));
  it("points at the first hunk that names it", () => {
    const f = parsePatch(patch(["fn a()", "fn a()", "fn b()"]))!.files[0];
    expect(outline(f).map((o) => o.hunk.oldStart)).toEqual([1, 21]);
  });
  it("is empty without any", () => expect(names(["", ""])).toEqual([]));
});
