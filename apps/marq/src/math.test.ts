import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import { installMath } from "./math";

const md = new MarkdownIt({ html: true });
installMath(md);
const r = (src: string) => md.render(src);

describe("formulas", () => {
  it("finds $…$ in the text", () => {
    expect(r("Volumen $Q_{\\text{ist}}$ und $p$.")).toBe(
      '<p>Volumen <span class="math-inline">Q_{\\text{ist}}</span> und <span class="math-inline">p</span>.</p>\n',
    );
  });

  it("leaves prices and lone dollars alone", () => {
    expect(r("costs $5 and $10")).toBe("<p>costs $5 and $10</p>\n");
    expect(r("a $ b $ c")).toBe("<p>a $ b $ c</p>\n");
    expect(r("just $ one")).toBe("<p>just $ one</p>\n");
    expect(r("\\$x\\$")).toBe("<p>$x$</p>\n");
  });

  it("keeps markdown out of a formula", () => {
    expect(r("$a_1 * b_2 * c$")).toContain('<span class="math-inline">a_1 * b_2 * c</span>');
  });

  it("knows a $$ block on one line and over several", () => {
    expect(r("Text\n\n$$S(t) = \\sum_i Q_i$$\n\nWeiter")).toBe(
      '<p>Text</p>\n<div class="math-block">S(t) = \\sum_i Q_i</div>\n<p>Weiter</p>\n',
    );
    expect(r("$$\na = b\n+ c\n$$\n")).toBe('<div class="math-block">a = b\n+ c</div>\n');
    expect(r("$$ a\n= b $$\n")).toBe('<div class="math-block"> a\n= b </div>\n');
  });

  it("lets a $$ block end a paragraph", () => {
    expect(r("Formel:\n$$x$$")).toBe('<p>Formel:</p>\n<div class="math-block">x</div>\n');
  });

  it("leaves an unclosed $$ as text", () => {
    expect(r("$$\na = b\n")).toBe("<p>$$\na = b</p>\n");
  });

  it("knows ```math and $$…$$ inside a paragraph", () => {
    expect(r("```math\nE = mc^2\n```\n")).toBe('<div class="math-block">E = mc^2\n</div>\n');
    expect(r("so $$x^2$$ hier")).toBe('<p>so <span class="math-display">x^2</span> hier</p>\n');
  });

  it("escapes the source", () => {
    expect(r("$a<b$")).toContain('<span class="math-inline">a&lt;b</span>');
  });
});
