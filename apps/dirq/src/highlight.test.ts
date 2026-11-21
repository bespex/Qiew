import { highlightLines, languageOf, markRanges, splitLines } from "@qiew/frame/highlight";
import { describe, expect, it } from "vitest";

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
/** Every line opens as many spans as it closes, never closing one it did not open. */
const balanced = (html: string) => {
  let depth = 0;
  for (const m of html.matchAll(/<(\/?)span/g)) {
    depth += m[1] ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

describe("languageOf", () => {
  it.each([
    ["src/main.rs", "rust"],
    ["a/b.ts", "typescript"],
    ["a/b.tsx", "typescript"],
    ["Foo.java", "java"],
    ["pom.xml", "xml"],
    ["build.gradle", "groovy"],
    ["Dockerfile", "dockerfile"],
    ["docker/app.Dockerfile", "dockerfile"],
    ["Makefile", "makefile"],
    ["conf/nginx.conf", "nginx"],
    ["app.properties", "properties"],
    ["api.proto", "protobuf"],
    ["Cargo.toml", "ini"],
    ["x.yml", "yaml"],
  ])("%s → %s", (path, lang) => expect(languageOf(path)).toBe(lang));
  it.each(["README", "notes.txt", "data.unknownext", "a.diff", "a.patch"])("%s → none", (path) => expect(languageOf(path)).toBeUndefined());
});

describe("splitLines", () => {
  it("closes spans at the line end and reopens them", () => {
    expect(splitLines('a<span class="c">/* x\ny */</span>b')).toEqual(['a<span class="c">/* x</span>', '<span class="c">y */</span>b']);
  });
  it("keeps nesting across lines", () => {
    const lines = splitLines('<span class="s">"a<span class="e">\\n\n</span>b"</span>\nc');
    expect(lines).toEqual(['<span class="s">"a<span class="e">\\n</span></span>', '<span class="s"><span class="e"></span>b"</span>', "c"]);
    expect(lines.every(balanced)).toBe(true);
  });
  it("keeps empty lines", () => expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]));
});

describe("highlightLines", () => {
  it("colours a comment over several lines on every line", () => {
    const src = ["let a = 1; /* start", "still comment", "end */ let b = 2;"];
    const out = highlightLines(src, "rust")!;
    expect(out).toHaveLength(3);
    expect(out.map(plain)).toEqual(src);
    expect(out.every(balanced)).toBe(true);
    expect(out[1]).toMatch(/^<span class="hljs-comment">still comment<\/span>$/);
    expect(out[2]).toMatch(/^<span class="hljs-comment">end \*\/<\/span>/);
  });
  it("colours a string over several lines on every line", () => {
    const src = ["const s = `one", "two & <three>", "four`;"];
    const out = highlightLines(src, "typescript")!;
    expect(out.map(plain)).toEqual(src);
    expect(out[1]).toContain("hljs-string");
    expect(out[1]).toContain("&amp; &lt;three&gt;");
  });
  it("escapes what it does not colour", () => expect(highlightLines(["a < b && c"], "rust")!.map(plain)).toEqual(["a < b && c"]));
  it("gives up on unknown languages and huge lines", () => {
    expect(highlightLines(["x"], undefined)).toBeNull();
    expect(highlightLines(["x".repeat(6000)], "rust")).toBeNull();
  });
});

describe("markRanges", () => {
  it("wraps plain text ranges", () => expect(markRanges("abcdef", [{ from: 1, to: 3 }], "w")).toBe('a<span class="w">bc</span>def'));
  it("closes the mark around tags so nesting stays valid", () => {
    const html = 'let <span class="k">fn</span> x';
    const out = markRanges(html, [{ from: 2, to: 6 }], "w");
    expect(out).toBe('le<span class="w">t </span><span class="k"><span class="w">fn</span></span> x');
    expect(plain(out)).toBe("let fn x");
    expect(balanced(out)).toBe(true);
  });
  it("counts an entity as one character", () => expect(markRanges("a&lt;b", [{ from: 1, to: 2 }], "w")).toBe('a<span class="w">&lt;</span>b'));
  it("handles several ranges", () => expect(markRanges("abcdef", [{ from: 0, to: 1 }, { from: 4, to: 6 }], "w")).toBe('<span class="w">a</span>bcd<span class="w">ef</span>'));
});
