import { describe, expect, it } from "vitest";
import { parsePatch } from "./diff";
import { DELETED_PREFIX, addMessage, codeOf, markdownList, newId, relocate, removeMessage, targetOf, type Comment } from "./comments";

const PATCH = `From 1234567 Mon Sep 17 00:00:00 2001
From: Config defaults (C) <codedeck@localhost>
Subject: Turn 6 · Config defaults · orbit-api
X-CodeDeck-Session: s-7f95

You asked: rename it
---
diff --git a/src/limit.rs b/src/limit.rs
index 3b18e51..a2f3c4d 100644
--- a/src/limit.rs
+++ b/src/limit.rs
@@ -40,6 +40,6 @@ fn rate_limit(
 let a = 1;
 let b = 2;
-let max = 10;
+let burst = cfg.burst;
 let c = 3;
 let d = 4;
 let e = 5;
@@ -98,3 +98,2 @@ fn tail(
 x();
 y();
-z();
`;

const patch = parsePatch(PATCH)!;
const f = patch.files[0];
const [h1, h2] = f.hunks;

describe("the line a comment points at", () => {
  it("reads the session and the blobs, and hides the session from the reader", () => {
    expect(patch.meta.session).toBe("s-7f95");
    expect(patch.meta.other.some((l) => l.includes("X-CodeDeck"))).toBe(false);
    expect([f.oldBlob, f.newBlob]).toEqual(["3b18e51", "a2f3c4d"]);
    expect([h1.oldCount, h1.newCount, h2.oldCount, h2.newCount]).toEqual([6, 6, 3, 2]);
  });

  it("an added line and a context line are sent with their own number", () => {
    const added = targetOf(f, h1.lines[3], h1);
    expect(added).toMatchObject({ file: "src/limit.rs", deleted: false, line: 42, at: 42 });
    expect(codeOf(added)).toBe("let burst = cfg.burst;");
    expect(targetOf(f, h1.lines[0], h1).line).toBe(40);
  });

  it("a removed line is sent with the next line of the new side and marked in the code", () => {
    const removed = targetOf(f, h1.lines[2], h1);
    expect(removed).toMatchObject({ deleted: true, at: 42, line: 42 });
    expect(codeOf(removed)).toBe(`${DELETED_PREFIX}let max = 10;`);
  });

  it("a removed line at the end of the file is sent with the last line", () => {
    expect(targetOf(f, h2.lines[2], h2)).toMatchObject({ deleted: true, at: 100, line: 99 });
  });

  it("finds the line again when it moved, and not when it is gone", () => {
    const t = targetOf(f, h1.lines[3], h1);
    const moved = parsePatch(PATCH.replace("@@ -40,6 +40,6 @@", "@@ -40,6 +45,6 @@"))!;
    expect(relocate(t, moved.files)).toMatchObject({ at: 47, line: 47 });
    const changed = parsePatch(PATCH.replace("+let burst = cfg.burst;", "+let burst = cfg.burst_size;"))!;
    expect(relocate(t, changed.files)).toBeNull();
    expect(relocate(t, [])).toBeNull();
    // Of two lines with the same text, the nearer one
    const ctx = targetOf(f, h2.lines[0], h2);
    expect(relocate(ctx, patch.files)).toMatchObject({ at: 98 });
  });
});

describe("what is sent", () => {
  const c: Comment = { id: "abcdefgh1234", target: targetOf(f, h1.lines[2], h1), text: "Warum entfällt das?", state: "sent" };

  it("carries file, line, code, text, session and the document", () => {
    expect(addMessage(c, "s-7f95", "Turn 6")).toEqual({
      action: "line_comment",
      id: "abcdefgh1234",
      file: "src/limit.rs",
      line: 42,
      code: "(gelöschte Zeile) let max = 10;",
      text: "Warum entfällt das?",
      session: "s-7f95",
      doc: "Turn 6",
    });
    expect(removeMessage(c)).toEqual({ action: "line_comment_remove", id: "abcdefgh1234", session: undefined, doc: undefined });
  });

  it("ids are long enough and differ", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    expect([...ids].every((id) => /^[a-z0-9]{12}$/.test(id))).toBe(true);
  });

  it("copies the comments as Markdown, by file and line", () => {
    const other: Comment = { ...c, id: "x".repeat(12), target: targetOf(f, h1.lines[3], h1), text: "Two\nlines" };
    expect(markdownList([c, other])).toBe(
      "## src/limit.rs\n\n- Line 42: `(gelöschte Zeile) let max = 10;` – Warum entfällt das?\n- Line 42: `let burst = cfg.burst;` – Two\n  lines\n",
    );
    expect(markdownList([])).toBe("");
  });
});
