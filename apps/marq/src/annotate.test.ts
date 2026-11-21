/*
 * The promises of annotate.ts (apps/marq/IDEEN.md, "Zusicherungen"). Every test file is tried in
 * several forms: as written, with CRLF, with a BOM, and without the last line ending (Z8).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AnnotateError,
  annotatableBlocks,
  deleteComment,
  editComment,
  insertComment,
  readComments,
  sameRendering,
  setDone,
} from "./annotate";

const DIR = new URL("../test/fixtures/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
const read = (f: string) => readFileSync(new URL(f, DIR), "utf8");

const forms: Record<string, (s: string) => string> = {
  lf: (s) => s,
  crlf: (s) => s.replace(/\n/g, "\r\n"),
  bom: (s) => "﻿" + s,
  "no final newline": (s) => s.replace(/\n$/, ""),
};

const TEXTS = [
  "Diesen Absatz kürzen.",
  "Pfeil --> im Text und -- doppelt",
  "Erste Zeile\nZweite Zeile\n\nnach Leerzeile",
  "Umlaute äöüß und Zeichen <b>&amp;</b> *nicht fett*",
  "lang ".repeat(200).trim(),
];

/** The lines with a known comment, and the blank lines, removed (Z4). */
function withoutComments(src: string): string[] {
  const out: string[] = [];
  let inComment = false;
  for (const line of src.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    if (!inComment && /<!--[ \t]*@(ai|me|you)\b/.test(line)) {
      inComment = !line.includes("-->");
      continue;
    }
    if (inComment) {
      inComment = !line.includes("-->");
      continue;
    }
    if (/^[ \t>]*$/.test(line)) continue;
    out.push(line);
  }
  return out;
}

/** List markers that moved to or from a comment leave spaces of the same width (Z4). */
function unmarked(s: string): string {
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/^([ >]*)([-*+]|\d{1,9}[.)])( +)/, (_, p, m, sp) => p + " ".repeat(m.length + sp.length));
  }
  return s;
}

/** Z4: apart from comment lines and blank lines, every line is still there and unchanged. */
function expectOnlyCommentsChanged(before: string, after: string) {
  const a = withoutComments(before);
  const b = withoutComments(after);
  expect(b.length).toBe(a.length);
  a.forEach((line, i) => {
    if (b[i] !== line) expect(unmarked(b[i])).toBe(unmarked(line));
  });
}

/** Lines with foreign comments, in order (Z5). */
const foreignLines = (src: string) =>
  src.split(/\r\n|\r|\n/).filter((l) => l.includes("<!--") && !/<!--[ \t]*@(ai|me|you)(?=[\s:#]|-->)/.test(l));

for (const file of files) {
  for (const [form, make] of Object.entries(forms)) {
    describe(`${file} (${form})`, () => {
      const src = make(read(file));
      const blocks = annotatableBlocks(src);

      it("has blocks to comment", () => expect(blocks.length).toBeGreaterThan(0));

      it.each(blocks.map((b) => [`${b.type} at line ${b.line + 1}`, b] as const))("%s", (_, block) => {
        for (const text of ["Neuer Testkommentar.", "Neuer Testkommentar\nüber zwei Zeilen"]) {
          // Z1: the page looks the same (insertComment checks it, and so do we).
          const added = insertComment(src, block, "ai", text);
          expect(added).not.toBe(src);
          expect(sameRendering(src, added)).toBe(true);

          // The new comment is there, belongs to the block, and is the last one before it.
          const mine = readComments(added).filter((c) => c.text === text);
          expect(mine).toHaveLength(1);
          expect(readComments(added)).toHaveLength(readComments(src).length + 1);
          const c = mine[0];
          expect(c.type).toBe("ai");
          expect(c.status).toBeNull();
          expect(c.target).not.toBeNull();

          // Z4, Z5, Z8
          expectOnlyCommentsChanged(src, added);
          expect(foreignLines(added)).toEqual(foreignLines(src));
          if (form === "crlf") expect(added.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
          if (form === "bom") expect(added.startsWith("﻿")).toBe(true);
          expect(/\n$/.test(added)).toBe(/\n$/.test(src));

          // Z3: tick and reopen give back the same bytes.
          const done = setDone(added, c.line, true);
          expect(readComments(done).find((x) => x.line === c.line)?.status).toBe("erledigt");
          expectOnlyCommentsChanged(src, done);
          expect(setDone(done, c.line, false)).toBe(added);

          // Z2: add and delete give back the same bytes.
          expect(deleteComment(added, c.line)).toBe(src);
        }
      });

      it("deletes, ticks and edits the comments it has without touching anything else", () => {
        for (const c of readComments(src)) {
          for (const result of [deleteComment(src, c.line), setDone(src, c.line, c.status === null), editComment(src, c.line, TEXTS[1])]) {
            expect(sameRendering(src, result)).toBe(true);
            expectOnlyCommentsChanged(src, result);
            expect(foreignLines(result)).toEqual(foreignLines(src));
          }
          expect(setDone(setDone(src, c.line, c.status === null), c.line, c.status !== null)).toBe(
            c.head.includes("#") && c.status === null ? setDone(setDone(src, c.line, true), c.line, false) : src,
          );
        }
      });
    });
  }
}

describe("comment texts", () => {
  const src = "# T\n\nAbsatz.\n";
  const block = { line: 2, type: "paragraph_open" };

  it.each(TEXTS)("keeps %s", (text) => {
    const added = insertComment(src, block, "me", text);
    const [c] = readComments(added);
    expect(c.type).toBe("me");
    expect(c.text).toBe(
      text
        .replace(/--(!?)>/g, "--$1 >")
        .split("\n")
        .filter((s) => s.trim())
        .join("\n"),
    );
    expect(deleteComment(added, c.line)).toBe(src);
  });

  it("writes the exact form", () => {
    expect(insertComment(src, block, "ai", "kürzen")).toBe("# T\n\n<!-- @ai: kürzen -->\n\nAbsatz.\n");
    expect(insertComment(src, block, "you", "a\nb")).toBe("# T\n\n<!-- @you: a\n     b -->\n\nAbsatz.\n");
  });

  it("puts a new comment after the ones there", () => {
    let s = insertComment(src, block, "ai", "eins");
    s = insertComment(s, { line: 4, type: "paragraph_open" }, "me", "zwei");
    expect(s).toBe("# T\n\n<!-- @ai: eins -->\n\n<!-- @me: zwei -->\n\nAbsatz.\n");
    expect(readComments(s).map((c) => [c.text, c.target?.line])).toEqual([
      ["eins", 6],
      ["zwei", 6],
    ]);
    expect(deleteComment(s, 2)).toBe("# T\n\n<!-- @me: zwei -->\n\nAbsatz.\n");
  });

  it("puts a comment for a list item into the item", () => {
    const list = "- eins\n- zwei\n";
    const s = insertComment(list, { line: 1, type: "list_item_open" }, "ai", "x");
    expect(s).toBe("- eins\n- <!-- @ai: x -->\n  zwei\n");
    const t = insertComment(s, { line: 1, type: "list_item_open" }, "me", "y");
    expect(t).toBe("- eins\n- <!-- @ai: x -->\n  <!-- @me: y -->\n  zwei\n");
    expect(readComments(t).map((c) => c.target)).toEqual([
      { line: 1, type: "list_item_open" },
      { line: 1, type: "list_item_open" },
    ]);
    expect(deleteComment(t, 1)).toBe("- eins\n- <!-- @me: y -->\n  zwei\n");
  });

  it("puts a comment in a quote behind the quote marker", () => {
    const q = "> a\n>\n> b\n";
    expect(insertComment(q, { line: 2, type: "paragraph_open" }, "ai", "x")).toBe("> a\n>\n> <!-- @ai: x -->\n>\n> b\n");
    expect(insertComment(q, { line: 0, type: "blockquote_open" }, "ai", "x")).toBe("<!-- @ai: x -->\n\n> a\n>\n> b\n");
  });
});

describe("reading", () => {
  const src = read("existing.md");
  const all = readComments(src);

  it("finds the known comments and nothing else", () => {
    expect(all.map((c) => c.head)).toEqual(["@ai", "@me#erledigt", "@you", "@ai#foo", "@ai", "@ai", "@me"]);
    expect(readComments(read("foreign.md"))).toEqual([]);
    expect(readComments(read("blocks.md"))).toEqual([]);
  });

  it("is tolerant about the colon and unknown status words", () => {
    expect(all[2]).toMatchObject({ type: "you", status: null, text: "bitte gegenlesen" });
    expect(all[1]).toMatchObject({ type: "me", status: "erledigt", text: "Quelle prüfen" });
    expect(all[3]).toMatchObject({ type: "ai", status: null, text: "unbekannter Status" });
    expect(all[4].text).toBe("Mehrzeiliger\nKommentar");
  });

  it("gives every comment its block, or its container when nothing follows", () => {
    expect(all[1].target).toEqual(all[2].target);
    expect(all[5].target?.type).toBe("list_item_open");
    expect(all[6].target).toBeNull();
    expect(all[6].container?.type).toBe("blockquote_open");
  });

  it("leaves the head alone when reopening an unknown status", () => {
    expect(setDone(src, all[3].line, false)).toBe(src);
    expect(setDone(src, all[3].line, true)).toContain("<!-- @ai#erledigt: unbekannter Status -->");
  });
});

describe("refusals", () => {
  it("does not comment inside the front matter", () => {
    const src = read("frontmatter.md");
    expect(annotatableBlocks(src).every((b) => b.line >= 4)).toBe(true);
    expect(() => insertComment(src, { line: 1, type: "paragraph_open" }, "ai", "x")).toThrow(AnnotateError);
  });

  it("does not comment a comment, or a line that starts no block", () => {
    const src = read("existing.md");
    expect(() => insertComment(src, { line: 2, type: "html_block" }, "ai", "x")).toThrow(AnnotateError);
    expect(() => insertComment("a\nb\n", { line: 1, type: "paragraph_open" }, "ai", "x")).toThrow(AnnotateError);
  });

  it("knows only its types", () => {
    expect(() => insertComment("a\n", { line: 0, type: "paragraph_open" }, "foo" as never, "x")).toThrow(AnnotateError);
  });
});
