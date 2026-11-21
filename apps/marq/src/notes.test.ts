/* The marks for comments: made from known comments only, and the page stays as it was. */
import { readdirSync, readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { installNotes } from "./notes";

const DIR = new URL("../test/fixtures/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, DIR), "utf8");

const plain = new MarkdownIt({ html: true });
const md = new MarkdownIt({ html: true });
installNotes(md);

const groups = (html: string) =>
  [...html.matchAll(/<button type="button" class="notes( orphan)?" aria-label="([^"]*)" data-notes="([^"]*)">/g)].map((m) => ({
    orphan: !!m[1],
    label: m[2],
    notes: JSON.parse(m[3].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")),
  }));

describe("marks", () => {
  it("groups the comments before a block, in the order of the file", () => {
    const g = groups(md.render(read("existing.md")));
    expect(g.map((x) => x.notes.map((n: { type: string }) => n.type))).toEqual([["ai"], ["me", "you"], ["ai"], ["ai"], ["ai"], ["me"]]);
    expect(g[1].notes[0]).toEqual({ type: "me", status: "erledigt", text: "Quelle prüfen" });
    expect(g[1].label).toBe("2 Kommentare, 1 offen");
    expect(g[5].orphan).toBe(true);
    expect(g.slice(0, 5).every((x) => !x.orphan)).toBe(true);
  });

  it("makes nothing of foreign comments, code and front matter", () => {
    for (const f of ["foreign.md", "blocks.md", "frontmatter.md"]) expect(groups(md.render(read(f)))).toEqual([]);
    expect(groups(md.render("---\n<!-- @ai: im Front Matter -->\n---\n\nText\n"))).toEqual([]);
  });

  it("escapes the text", () => {
    const [g] = groups(md.render('<!-- @ai: <script>"x" & y</script> -->\n\nText\n'));
    expect(g.notes[0].text).toBe('<script>"x" & y</script>');
    expect(md.render('<!-- @ai: <b>x</b> -->\n\nText\n')).not.toContain("<b>");
  });

  it.each(readdirSync(DIR).filter((f) => f.endsWith(".md")))("leaves the page of %s as it was", (f) => {
    const src = read(f);
    const strip = (h: string) =>
      h.replace(/<button type="button" class="notes[^>]*>.*?<\/button>\n/g, "").replace(/<!--[\s\S]*?-->\n?/g, "");
    const loose = (h: string) => h.replace(/(<li[^>]*>)\n/g, "$1");
    expect(loose(strip(md.render(src)))).toBe(loose(strip(plain.render(src))));
  });
});
