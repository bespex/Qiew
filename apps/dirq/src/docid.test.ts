import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff";
import { docKey } from "./docid";

const patch = (subject: string | null, files: string[]) =>
  parsePatch(
    [
      ...(subject ? [`From 0123456789abcdef0123456789abcdef01234567 Mon Sep 17 00:00:00 2001`, `Subject: ${subject}`, ``, `---`] : []),
      ...files.flatMap((f) => [`diff --git a/${f} b/${f}`, `--- a/${f}`, `+++ b/${f}`, `@@ -1 +1 @@`, `-a`, `+b`]),
      ``,
    ].join("\n"),
  )!;

describe("docKey", () => {
  const stdin = (pid: number) => `/run/user/1000/dirq/stdin-${pid}.patch`;
  it("an id names the document, whatever the path", () => {
    const p = patch("x", ["a.rs"]);
    expect(docKey(stdin(1), p, "Round 7")).toBe(docKey(stdin(2), patch("other", ["b.rs"]), "Round 7"));
    expect(docKey(stdin(1), p, "Round 7")).not.toBe(docKey(stdin(1), p, "Round 8"));
  });
  it("a real file is its path", () => {
    expect(docKey("/p/a.patch", null, null)).toBe(docKey("/p/a.patch", patch("x", ["a.rs"]), null));
    expect(docKey("/p/a.patch", null, null)).not.toBe(docKey("/p/b.patch", null, null));
  });
  it("an empty id counts as none", () => expect(docKey("/p/a.patch", null, "")).toBe("file:/p/a.patch"));
  it("standard input: the same subject is the same document, although the name changes", () => {
    expect(docKey(stdin(1), patch("Round 7", ["a.rs"]), null)).toBe(docKey(stdin(2), patch("Round 7", ["b.rs"]), null));
    expect(docKey(stdin(1), patch("Round 7", ["a.rs"]), null)).not.toBe(docKey(stdin(1), patch("Round 8", ["a.rs"]), null));
  });
  it("standard input without a header: the set of files, in any order", () => {
    expect(docKey(stdin(1), patch(null, ["a.rs", "b.rs"]), null)).toBe(docKey(stdin(2), patch(null, ["b.rs", "a.rs"]), null));
    expect(docKey(stdin(1), patch(null, ["a.rs"]), null)).not.toBe(docKey(stdin(2), patch(null, ["a.rs", "b.rs"]), null));
  });
  it("standard input that is no patch falls back to the path", () => expect(docKey(stdin(1), null, null)).toBe(`file:${stdin(1)}`));
});
