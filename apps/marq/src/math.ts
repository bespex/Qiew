/**
 * Formulas in LaTeX notation, drawn with KaTeX:
 *
 * - `$…$` in the text, `$$…$$` in the text (shown set off);
 * - a block that starts with `$$` and ends with `$$` (on one line or over several);
 * - a fenced block ```math (as on GitHub).
 *
 * Rendering leaves the source in a placeholder; drawMath() draws the formulas afterwards. KaTeX is
 * loaded only for documents that have formulas, as Mermaid is for diagrams. A formula that cannot
 * be set is shown as its source in red, with KaTeX's message as its tooltip.
 *
 * Which `$` count (as in Pandoc): the opening `$` is not followed by a space, the closing one not
 * preceded by one nor followed by a digit, so "costs $5 and $10" stays text. `\$` is a dollar sign.
 */
import type { default as MarkdownIt, StateBlock, StateInline } from "markdown-it";

const DOLLAR = 0x24;

function inlineMath(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== DOLLAR) return false;

  // $$…$$ inside a paragraph: shown set off.
  if (src.charCodeAt(start + 1) === DOLLAR) {
    const end = src.indexOf("$$", start + 2);
    if (end < 0 || end === start + 2) return false;
    if (!silent) {
      const tok = state.push("math_inline_display", "math", 0);
      tok.content = src.slice(start + 2, end);
      tok.markup = "$$";
    }
    state.pos = end + 2;
    return true;
  }

  const first = src[start + 1];
  if (first === undefined || /\s/.test(first)) return false;
  for (let i = start + 1; i < state.posMax; i++) {
    const c = src[i];
    if (c === "\\") {
      i++; // \$ and \\ belong to the formula
      continue;
    }
    if (c !== "$") continue;
    if (/\s/.test(src[i - 1]) || /\d/.test(src[i + 1] ?? "")) return false;
    if (!silent) {
      const tok = state.push("math_inline", "math", 0);
      tok.content = src.slice(start + 1, i);
      tok.markup = "$";
    }
    state.pos = i + 1;
    return true;
  }
  return false;
}

function blockMath(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false; // indented code
  if (!state.src.startsWith("$$", pos)) return false;
  pos += 2;

  let first = state.src.slice(pos, max);
  let last = "";
  let line = startLine;
  let closed = false;
  if (first.trimEnd().endsWith("$$")) {
    // $$ … $$ on one line
    first = first.trimEnd().slice(0, -2);
    closed = true;
  } else {
    for (line = startLine + 1; line < endLine; line++) {
      pos = state.bMarks[line] + state.tShift[line];
      max = state.eMarks[line];
      if (pos < max && state.sCount[line] < state.blkIndent) break; // the enclosing block ends
      const text = state.src.slice(pos, max).trimEnd();
      if (text.endsWith("$$")) {
        last = text.slice(0, -2);
        closed = true;
        break;
      }
    }
  }
  if (!closed) return false;
  if (silent) return true;

  const inner = line > startLine + 1 ? state.getLines(startLine + 1, line, state.tShift[startLine], false) : "";
  const tok = state.push("math_block", "math", 0);
  tok.block = true;
  tok.content = [first, inner, last].filter((s) => s.trim()).join("\n");
  tok.markup = "$$";
  tok.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

const lineAttr = (line: string | number | null) => (line ? ` data-line="${line}"` : "");

export function installMath(md: InstanceType<typeof MarkdownIt>) {
  const esc = md.utils.escapeHtml;
  md.inline.ruler.before("escape", "math_inline", inlineMath);
  md.block.ruler.before("fence", "math_block", blockMath, { alt: ["paragraph", "reference", "blockquote", "list"] });

  md.renderer.rules.math_inline = (tokens, idx) => `<span class="math-inline">${esc(tokens[idx].content)}</span>`;
  md.renderer.rules.math_inline_display = (tokens, idx) => `<span class="math-display">${esc(tokens[idx].content)}</span>`;
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block"${lineAttr(tokens[idx].attrGet("data-line"))}>${esc(tokens[idx].content)}</div>\n`;

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const tok = tokens[idx];
    if (tok.info.trim().split(/\s+/)[0].toLowerCase() !== "math") return fence(tokens, idx, options, env, self);
    return `<div class="math-block"${lineAttr(tok.attrGet("data-line"))}>${esc(tok.content)}</div>\n`;
  };
}

type Katex = typeof import("katex").default;
let loading: Promise<Katex> | null = null;
const load = () =>
  (loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([k]) => k.default));

const PENDING = ".math-inline:not(.drawn), .math-display:not(.drawn), .math-block:not(.drawn)";

/** Draws the formulas in `root`. Resolves to whether there were any. */
export async function drawMath(root: HTMLElement): Promise<boolean> {
  if (!root.querySelector(PENDING)) return false;
  const katex = await load();
  for (const el of root.querySelectorAll<HTMLElement>(PENDING)) {
    const tex = el.textContent ?? "";
    // Nothing in a formula is run or fetched: KaTeX's `trust` stays off (\href, \includegraphics, …).
    el.innerHTML = katex.renderToString(tex, {
      displayMode: !el.classList.contains("math-inline"),
      throwOnError: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
    el.classList.add("drawn");
  }
  return true;
}

/**
 * For the HTML export: every formula becomes the MathML KaTeX made alongside it, which browsers
 * show themselves. The drawing needs KaTeX's fonts, which belong to the app.
 */
export function mathForExport(copy: HTMLElement) {
  copy.querySelectorAll(".katex").forEach((k) => {
    const math = k.querySelector("math");
    if (math) k.replaceWith(math);
  });
}
