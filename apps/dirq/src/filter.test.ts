import { describe, expect, it } from "vitest";
import type { FileDiff, Status } from "./diff";
import { type FileFilter, visibleFiles } from "./filter";

const file = (path: string, status: Status, added = 0, deleted = 0, oldPath = path): FileDiff => ({
  oldPath,
  newPath: path,
  status,
  binary: false,
  hunks: [],
  added,
  deleted,
  src: 1,
  srcEnd: 1,
});
const files = [
  file("src/b.ts", "modified", 3, 1),
  file("src/a.ts", "added", 40, 0),
  file("docs/old.md", "deleted", 0, 9),
  file("src/new-name.ts", "renamed", 1, 1, "src/old-name.ts"),
  file("lib/c.ts", "copied", 0, 0),
];
const base: FileFilter = { query: "", chips: new Set(), sort: "folder" };

describe("visibleFiles", () => {
  it("shows everything in patch order by default", () => expect(visibleFiles(files, base)).toEqual([0, 1, 2, 3, 4]));
  it("filters by status; copied counts as renamed", () => {
    expect(visibleFiles(files, { ...base, chips: new Set(["modified"]) })).toEqual([0]);
    expect(visibleFiles(files, { ...base, chips: new Set(["added", "deleted"]) })).toEqual([1, 2]);
    expect(visibleFiles(files, { ...base, chips: new Set(["renamed"]) })).toEqual([3, 4]);
  });
  it("matches the query on the new and the old path, ignoring case", () => {
    expect(visibleFiles(files, { ...base, query: "SRC/" })).toEqual([0, 1, 3]);
    expect(visibleFiles(files, { ...base, query: "old-name" })).toEqual([3]);
    expect(visibleFiles(files, { ...base, query: "  " })).toEqual([0, 1, 2, 3, 4]);
  });
  it("sorts by size, biggest first, stable on ties", () => expect(visibleFiles(files, { ...base, sort: "size" })).toEqual([1, 2, 0, 3, 4]));
  it("sorts by status: new, changed, renamed, deleted", () => expect(visibleFiles(files, { ...base, sort: "status" })).toEqual([1, 0, 3, 4, 2]));
  it("combines the filters", () => expect(visibleFiles(files, { query: "src", chips: new Set(["added", "modified"]), sort: "size" })).toEqual([1, 0]));
});
